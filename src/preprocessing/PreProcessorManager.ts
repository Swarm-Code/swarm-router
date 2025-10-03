import { FastifyRequest } from "fastify";
import { PreProcessor, ProcessResult } from "./types";
import { RouteContext } from "../routing/types";

/**
 * PreProcessorManager
 *
 * Manages the execution of pre-processors in a priority-based order.
 * Pre-processors enrich the request context, detect patterns, and can
 * block requests or override routing decisions.
 *
 * @example
 * ```typescript
 * const manager = new PreProcessorManager();
 * manager.register(commandDetector);
 * manager.register(contextEnricher);
 *
 * const results = await manager.process(req, context);
 * if (results.blocked) {
 *   // Handle blocked request
 * }
 * ```
 */
export class PreProcessorManager {
  private processors: PreProcessor[] = [];
  private sortedProcessors: PreProcessor[] = [];
  private needsSort = false;

  /**
   * Register a pre-processor
   * @param processor - The pre-processor to register
   */
  register(processor: PreProcessor): void {
    this.processors.push(processor);
    this.needsSort = true;
  }

  /**
   * Unregister a pre-processor by name
   * @param name - The name of the pre-processor to remove
   * @returns True if the processor was found and removed
   */
  unregister(name: string): boolean {
    const index = this.processors.findIndex(p => p.name === name);
    if (index >= 0) {
      this.processors.splice(index, 1);
      this.needsSort = true;
      return true;
    }
    return false;
  }

  /**
   * Get a pre-processor by name
   * @param name - The name of the pre-processor
   * @returns The pre-processor or undefined if not found
   */
  get(name: string): PreProcessor | undefined {
    return this.processors.find(p => p.name === name);
  }

  /**
   * Get all registered pre-processors
   * @returns Array of all pre-processors
   */
  getAll(): PreProcessor[] {
    return [...this.processors];
  }

  /**
   * Enable a pre-processor by name
   * @param name - The name of the pre-processor to enable
   * @returns True if the processor was found
   */
  enable(name: string): boolean {
    const processor = this.get(name);
    if (processor) {
      processor.enabled = true;
      return true;
    }
    return false;
  }

  /**
   * Disable a pre-processor by name
   * @param name - The name of the pre-processor to disable
   * @returns True if the processor was found
   */
  disable(name: string): boolean {
    const processor = this.get(name);
    if (processor) {
      processor.enabled = false;
      return true;
    }
    return false;
  }

  /**
   * Sort processors by priority (highest first)
   */
  private sortProcessors(): void {
    if (!this.needsSort) return;

    this.sortedProcessors = [...this.processors].sort((a, b) => {
      // Higher priority first
      return b.priority - a.priority;
    });

    this.needsSort = false;
  }

  /**
   * Process a request through all registered pre-processors
   *
   * Executes pre-processors in priority order (highest first).
   * If any processor returns block=true, processing stops immediately.
   * Results are aggregated and metadata is merged into the context.
   *
   * @param req - The Fastify request
   * @param context - The route context to enrich
   * @returns Aggregated process results
   */
  async process(
    req: FastifyRequest,
    context: RouteContext
  ): Promise<AggregatedProcessResult> {
    this.sortProcessors();

    const result: AggregatedProcessResult = {
      modified: false,
      blocked: false,
      results: [],
      errors: [],
    };

    const executedProcessors: Array<{ processor: PreProcessor; error?: Error }> = [];

    try {
      for (const processor of this.sortedProcessors) {
        // Skip disabled processors
        if (processor.enabled === false) {
          continue;
        }

        // Check if processor should run
        try {
          const shouldProcess = await processor.shouldProcess(req, context);
          if (!shouldProcess) {
            continue;
          }
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          result.errors.push({
            processor: processor.name,
            error: err,
            phase: "shouldProcess",
          });
          executedProcessors.push({ processor, error: err });
          continue;
        }

        // Execute processor
        try {
          const processorResult = await processor.process(req, context);
          executedProcessors.push({ processor });

          // Track result
          result.results.push({
            processor: processor.name,
            result: processorResult,
          });

          // Merge modifications
          if (processorResult.modified) {
            result.modified = true;
          }

          // Merge metadata into context
          if (processorResult.metadata) {
            context.metadata = {
              ...context.metadata,
              ...processorResult.metadata,
            };
          }

          // Handle route override
          if (processorResult.routeOverride) {
            result.routeOverride = processorResult.routeOverride;
          }

          // Handle provider/model override
          if (processorResult.providerModelOverride) {
            result.providerModelOverride = processorResult.providerModelOverride;
          }

          // Handle blocking
          if (processorResult.block) {
            result.blocked = true;
            result.blockResponse = processorResult.blockResponse;
            result.blockMessage = processorResult.message;
            result.blockProcessor = processor.name;

            // Stop processing immediately when blocked
            break;
          }

          // Track error if present
          if (processorResult.error) {
            result.errors.push({
              processor: processor.name,
              error: processorResult.error,
              phase: "process",
            });
          }
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          result.errors.push({
            processor: processor.name,
            error: err,
            phase: "process",
          });
          executedProcessors.push({ processor, error: err });

          // Continue with next processor on error (don't fail entire pipeline)
          continue;
        }
      }
    } finally {
      // Always run cleanup for executed processors (in reverse order)
      for (let i = executedProcessors.length - 1; i >= 0; i--) {
        const { processor, error } = executedProcessors[i];
        if (processor.cleanup) {
          try {
            await processor.cleanup(req, context, error);
          } catch (cleanupError) {
            // Log cleanup errors but don't fail the pipeline
            const err = cleanupError instanceof Error ? cleanupError : new Error(String(cleanupError));
            result.errors.push({
              processor: processor.name,
              error: err,
              phase: "cleanup",
            });
          }
        }
      }
    }

    return result;
  }

  /**
   * Clear all registered pre-processors
   */
  clear(): void {
    this.processors = [];
    this.sortedProcessors = [];
    this.needsSort = false;
  }

  /**
   * Get statistics about registered pre-processors
   */
  getStats(): PreProcessorStats {
    return {
      total: this.processors.length,
      enabled: this.processors.filter(p => p.enabled !== false).length,
      disabled: this.processors.filter(p => p.enabled === false).length,
      processors: this.processors.map(p => ({
        name: p.name,
        priority: p.priority,
        enabled: p.enabled !== false,
        description: p.description,
      })),
    };
  }
}

/**
 * Aggregated result from processing all pre-processors
 */
export interface AggregatedProcessResult {
  /** Whether any processor modified the request */
  modified: boolean;

  /** Whether the request was blocked by a processor */
  blocked: boolean;

  /** Response to send if blocked */
  blockResponse?: any;

  /** Message explaining why blocked */
  blockMessage?: string;

  /** Name of processor that blocked the request */
  blockProcessor?: string;

  /** Route override from highest priority processor */
  routeOverride?: string;

  /** Provider/model override from highest priority processor */
  providerModelOverride?: string;

  /** Individual results from each processor */
  results: Array<{
    processor: string;
    result: ProcessResult;
  }>;

  /** Errors that occurred during processing */
  errors: Array<{
    processor: string;
    error: Error;
    phase: "shouldProcess" | "process" | "cleanup";
  }>;
}

/**
 * Statistics about registered pre-processors
 */
export interface PreProcessorStats {
  total: number;
  enabled: number;
  disabled: number;
  processors: Array<{
    name: string;
    priority: number;
    enabled: boolean;
    description?: string;
  }>;
}