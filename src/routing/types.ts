import { FastifyRequest } from "fastify";
import { MessageCreateParamsBase } from "@anthropic-ai/sdk/resources/messages";
import { Usage } from "../utils/cache";

/**
 * Context information passed through the routing pipeline.
 * This context is enriched by pre-processors and used by route matchers.
 */
export interface RouteContext {
  /**
   * The session ID extracted from metadata.user_id
   */
  sessionId?: string;

  /**
   * Total token count for the request (messages + system + tools)
   */
  tokenCount: number;

  /**
   * Usage information from previous request in this session
   */
  lastUsage?: Usage;

  /**
   * Detected commands from message content (e.g., ['/compact', '/model'])
   */
  detectedCommands?: string[];

  /**
   * Message patterns detected (e.g., 'thinking', 'code analysis', 'image')
   */
  patterns?: string[];

  /**
   * Custom metadata added by pre-processors or agents
   */
  metadata: Record<string, any>;

  /**
   * Reference to the configuration object
   */
  config: any;

  /**
   * Logger instance for this request
   */
  log?: any;

  /**
   * Timestamp when request entered the pipeline
   */
  startTime: number;
}

/**
 * A route matcher evaluates whether a route should be used for a given request.
 * Multiple matchers can be chained together (ALL must pass for route to match).
 */
export interface RouteMatcher {
  /**
   * Unique type identifier for this matcher (e.g., 'command', 'token_count', 'pattern')
   */
  type: string;

  /**
   * Human-readable description of what this matcher does
   */
  description?: string;

  /**
   * Configuration for this matcher (type-specific)
   */
  condition: any;

  /**
   * Evaluate whether this matcher passes for the given request and context
   * @param req - The Fastify request object
   * @param context - The routing context with enriched metadata
   * @returns true if the matcher passes, false otherwise
   */
  evaluate(req: FastifyRequest, context: RouteContext): boolean | Promise<boolean>;
}

/**
 * A transformation modifies the request before it's sent to the provider.
 * Transformations are applied in the order they are defined.
 */
export interface Transformation {
  /**
   * Unique type identifier for this transformation (e.g., 'message', 'system_prompt', 'params')
   */
  type: string;

  /**
   * Human-readable description of what this transformation does
   */
  description?: string;

  /**
   * Configuration for this transformation (type-specific)
   */
  config?: any;

  /**
   * Apply this transformation to the request
   * @param req - The Fastify request object (will be modified in place)
   * @param context - The routing context
   */
  apply(req: FastifyRequest, context: RouteContext): void | Promise<void>;
}

/**
 * A route defines how to handle a request: which provider/model to use
 * and what transformations to apply.
 */
export interface Route {
  /**
   * Unique identifier for this route
   */
  id: string;

  /**
   * Priority for route evaluation (higher = evaluated first)
   * Routes are evaluated in descending priority order until one matches.
   */
  priority: number;

  /**
   * Human-readable description of this route
   */
  description: string;

  /**
   * Tags for categorizing and filtering routes (e.g., ['command', 'compact'])
   */
  tags?: string[];

  /**
   * Matchers that must ALL pass for this route to be selected.
   * If empty, the route always matches (useful for fallback routes).
   */
  matchers: RouteMatcher[];

  /**
   * The provider name from config.Providers
   */
  provider: string;

  /**
   * The model name from the provider's models array
   */
  model: string;

  /**
   * Transformations to apply to the request when this route is selected.
   * Applied in the order they are defined.
   */
  transformations?: Transformation[];

  /**
   * Whether this route is enabled (default: true)
   */
  enabled?: boolean;

  /**
   * Metadata for this route (can be used by telemetry or extensions)
   */
  metadata?: Record<string, any>;
}

/**
 * Result of route selection
 */
export interface RouteSelectionResult {
  /**
   * The selected route (or undefined if no route matched)
   */
  route?: Route;

  /**
   * The final provider,model string (e.g., "openrouter-gemini,google/gemini-2.5-flash")
   */
  providerModel: string;

  /**
   * All routes that were evaluated (for debugging/telemetry)
   */
  evaluatedRoutes: Array<{
    route: Route;
    matched: boolean;
    reason?: string;
  }>;

  /**
   * Whether a fallback route was used
   */
  usedFallback: boolean;

  /**
   * Time taken for route selection (milliseconds)
   */
  selectionTimeMs: number;
}

/**
 * Configuration for a route matcher factory
 */
export interface RouteMatcherConfig {
  type: string;
  condition: any;
  description?: string;
}

/**
 * Configuration for a transformation factory
 */
export interface TransformationConfig {
  type: string;
  config?: any;
  description?: string;
}

/**
 * Factory function for creating route matchers
 */
export type RouteMatcherFactory = (config: RouteMatcherConfig) => RouteMatcher;

/**
 * Factory function for creating transformations
 */
export type TransformationFactory = (config: TransformationConfig) => Transformation;

/**
 * Registry for route matcher factories
 */
export interface RouteMatcherRegistry {
  register(type: string, factory: RouteMatcherFactory): void;
  get(type: string): RouteMatcherFactory | undefined;
  has(type: string): boolean;
  list(): string[];
}

/**
 * Registry for transformation factories
 */
export interface TransformationRegistry {
  register(type: string, factory: TransformationFactory): void;
  get(type: string): TransformationFactory | undefined;
  has(type: string): boolean;
  list(): string[];
}