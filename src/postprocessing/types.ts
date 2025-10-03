import { FastifyRequest, FastifyReply } from "fastify";
import { RouteContext } from "../routing/types";

/**
 * Result of a post-processor execution.
 * Post-processors can enrich responses, track metrics, or modify payloads.
 */
export interface PostProcessResult {
  /**
   * Whether the post-processor modified the response
   */
  modified: boolean;

  /**
   * Optional message explaining what this post-processor did (for logging/debugging)
   */
  message?: string;

  /**
   * Any errors encountered during processing
   */
  error?: Error;

  /**
   * Metadata collected by this post-processor (e.g., token usage, latency)
   */
  metadata?: Record<string, any>;
}

/**
 * A post-processor runs after the response is received from the provider
 * but before it's sent to the client.
 *
 * Post-processors can:
 * - Track usage and metrics
 * - Add response enrichments
 * - Log telemetry
 * - Handle errors
 * - Modify streaming responses
 *
 * Examples:
 * - Usage tracking post-processor (saves token counts)
 * - Telemetry post-processor (records latency, success/failure)
 * - Response caching post-processor
 * - Agent tool handling post-processor
 */
export interface PostProcessor {
  /**
   * Unique name for this post-processor
   */
  name: string;

  /**
   * Priority for execution order (higher = runs first)
   */
  priority: number;

  /**
   * Human-readable description of what this post-processor does
   */
  description?: string;

  /**
   * Whether this post-processor is enabled (default: true)
   */
  enabled?: boolean;

  /**
   * Determine if this post-processor should run for the given request/response.
   *
   * @param req - The Fastify request object
   * @param reply - The Fastify reply object
   * @param context - The routing context
   * @returns true if this post-processor should run
   */
  shouldProcess(req: FastifyRequest, reply: FastifyReply, context: RouteContext): boolean;

  /**
   * Process the response before it's sent to the client.
   *
   * @param req - The Fastify request object
   * @param reply - The Fastify reply object
   * @param payload - The response payload (may be a stream or JSON)
   * @param context - The routing context
   * @returns PostProcessResult indicating what changes were made
   */
  process(
    req: FastifyRequest,
    reply: FastifyReply,
    payload: any,
    context: RouteContext
  ): Promise<PostProcessResult>;

  /**
   * Optional cleanup function called when the request is finished
   *
   * @param req - The Fastify request object
   * @param reply - The Fastify reply object
   * @param context - The routing context
   * @param error - The error that occurred (if any)
   */
  cleanup?(
    req: FastifyRequest,
    reply: FastifyReply,
    context: RouteContext,
    error?: Error
  ): void | Promise<void>;
}

/**
 * Aggregated result from all post-processors
 */
export interface PostProcessingResult {
  /**
   * Whether any post-processor modified the response
   */
  modified: boolean;

  /**
   * Results from each post-processor that ran
   */
  results: Array<{
    processor: string;
    result: PostProcessResult;
    timeMs: number;
  }>;

  /**
   * Total time spent in post-processing (milliseconds)
   */
  totalTimeMs: number;

  /**
   * Any errors that occurred during post-processing
   */
  errors: Array<{
    processor: string;
    error: Error;
  }>;

  /**
   * Aggregated metadata from all post-processors
   */
  aggregatedMetadata: Record<string, any>;
}

/**
 * Configuration for the post-processor manager
 */
export interface PostProcessorManagerConfig {
  /**
   * Maximum time to spend in post-processing before timing out (milliseconds)
   * Default: 3000 (3 seconds)
   */
  timeout?: number;

  /**
   * Whether to continue processing if a post-processor throws an error
   * Default: true (log error and continue)
   */
  continueOnError?: boolean;
}

/**
 * Manager interface for post-processors
 */
export interface IPostProcessorManager {
  /**
   * Register a post-processor
   */
  register(processor: PostProcessor): void;

  /**
   * Unregister a post-processor by name
   */
  unregister(name: string): boolean;

  /**
   * Get a post-processor by name
   */
  get(name: string): PostProcessor | undefined;

  /**
   * List all registered post-processors (sorted by priority)
   */
  list(): PostProcessor[];

  /**
   * Process a response through all registered post-processors
   */
  processResponse(
    req: FastifyRequest,
    reply: FastifyReply,
    payload: any,
    context: RouteContext
  ): Promise<PostProcessingResult>;

  /**
   * Enable/disable a post-processor by name
   */
  setEnabled(name: string, enabled: boolean): void;
}