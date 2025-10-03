import { FastifyRequest } from "fastify";
import { RouteContext } from "../routing/types";

/**
 * Result of a pre-processor execution.
 * Pre-processors can modify the request, add metadata to context, suggest routes,
 * or even block the request entirely.
 */
export interface ProcessResult {
  /**
   * Whether the pre-processor modified the request
   */
  modified: boolean;

  /**
   * Suggested route ID to use (takes precedence over route matching)
   */
  routeOverride?: string;

  /**
   * Provider,model string override (e.g., "openrouter-gemini,google/gemini-2.5-flash")
   * This bypasses route selection entirely.
   */
  providerModelOverride?: string;

  /**
   * Metadata to add to the routing context for use by other pre-processors or matchers
   */
  metadata?: Record<string, any>;

  /**
   * Whether to block the request from continuing through the pipeline
   */
  block?: boolean;

  /**
   * If blocked, this response will be returned directly to the client
   */
  blockResponse?: any;

  /**
   * Optional message explaining what this pre-processor did (for logging/debugging)
   */
  message?: string;

  /**
   * Any errors encountered during processing
   */
  error?: Error;
}

/**
 * A pre-processor runs before route selection to analyze, enrich, or modify the request.
 * Pre-processors run in priority order (highest first).
 *
 * Examples:
 * - Command detection pre-processor (extracts /compact, /model commands)
 * - Context enrichment pre-processor (calculates token counts, extracts session info)
 * - Authentication/validation pre-processor
 * - Rate limiting pre-processor
 */
export interface PreProcessor {
  /**
   * Unique name for this pre-processor
   */
  name: string;

  /**
   * Priority for execution order (higher = runs first)
   * Typical priorities:
   * - 100-150: Critical pre-processors (auth, validation)
   * - 50-99: Command detection, context enrichment
   * - 0-49: Optional enrichments, analytics
   */
  priority: number;

  /**
   * Human-readable description of what this pre-processor does
   */
  description?: string;

  /**
   * Whether this pre-processor is enabled (default: true)
   */
  enabled?: boolean;

  /**
   * Determine if this pre-processor should run for the given request.
   * If false, process() will not be called.
   *
   * @param req - The Fastify request object
   * @param context - The current routing context (may be partially filled)
   * @returns true if this pre-processor should run
   */
  shouldProcess(req: FastifyRequest, context: RouteContext): boolean | Promise<boolean>;

  /**
   * Process the request and optionally modify it or the context.
   *
   * @param req - The Fastify request object (can be modified in place)
   * @param context - The routing context (can be modified in place)
   * @returns ProcessResult indicating what changes were made
   */
  process(req: FastifyRequest, context: RouteContext): Promise<ProcessResult>;

  /**
   * Optional cleanup function called if an error occurs or the request is terminated
   *
   * @param req - The Fastify request object
   * @param context - The routing context
   * @param error - The error that occurred (if any)
   */
  cleanup?(req: FastifyRequest, context: RouteContext, error?: Error): void | Promise<void>;
}

/**
 * Aggregated result from all pre-processors
 */
export interface PreProcessingResult {
  /**
   * Whether any pre-processor modified the request
   */
  modified: boolean;

  /**
   * The final route override (if any pre-processor suggested one)
   * The last pre-processor with highest priority wins
   */
  routeOverride?: string;

  /**
   * The final provider,model override (if any)
   */
  providerModelOverride?: string;

  /**
   * Whether the request was blocked by any pre-processor
   */
  blocked: boolean;

  /**
   * If blocked, the response to return to the client
   */
  blockResponse?: any;

  /**
   * Results from each pre-processor that ran
   */
  results: Array<{
    processor: string;
    result: ProcessResult;
    timeMs: number;
  }>;

  /**
   * Total time spent in pre-processing (milliseconds)
   */
  totalTimeMs: number;

  /**
   * Any errors that occurred during pre-processing
   */
  errors: Array<{
    processor: string;
    error: Error;
  }>;
}

/**
 * Configuration for the pre-processor manager
 */
export interface PreProcessorManagerConfig {
  /**
   * Maximum time to spend in pre-processing before timing out (milliseconds)
   * Default: 5000 (5 seconds)
   */
  timeout?: number;

  /**
   * Whether to continue processing if a pre-processor throws an error
   * Default: true (log error and continue)
   */
  continueOnError?: boolean;

  /**
   * Whether to run pre-processors in parallel (when possible)
   * Default: false (run in priority order)
   */
  parallel?: boolean;
}

/**
 * Manager interface for pre-processors
 */
export interface IPreProcessorManager {
  /**
   * Register a pre-processor
   */
  register(processor: PreProcessor): void;

  /**
   * Unregister a pre-processor by name
   */
  unregister(name: string): boolean;

  /**
   * Get a pre-processor by name
   */
  get(name: string): PreProcessor | undefined;

  /**
   * List all registered pre-processors (sorted by priority)
   */
  list(): PreProcessor[];

  /**
   * Process a request through all registered pre-processors
   */
  processRequest(req: FastifyRequest, context: RouteContext): Promise<PreProcessingResult>;

  /**
   * Enable/disable a pre-processor by name
   */
  setEnabled(name: string, enabled: boolean): void;
}