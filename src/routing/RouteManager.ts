import { FastifyRequest } from "fastify";
import {
  Route,
  RouteMatcher,
  Transformation,
  RouteContext,
  RouteSelectionResult,
  RouteMatcherRegistry,
  TransformationRegistry,
  RouteMatcherFactory,
  TransformationFactory,
  RouteMatcherConfig,
  TransformationConfig,
} from "./types";

/**
 * RouteManager handles route registration, evaluation, and selection.
 * It maintains a priority-ordered list of routes and evaluates them
 * against incoming requests to determine which provider/model to use.
 */
export class RouteManager {
  private routes: Map<string, Route> = new Map();
  private sortedRoutes: Route[] = [];
  private matcherRegistry: RouteMatcherRegistry;
  private transformationRegistry: TransformationRegistry;
  private logger?: any;

  constructor(
    matcherRegistry?: RouteMatcherRegistry,
    transformationRegistry?: TransformationRegistry,
    logger?: any
  ) {
    this.matcherRegistry = matcherRegistry || new DefaultRouteMatcherRegistry();
    this.transformationRegistry = transformationRegistry || new DefaultTransformationRegistry();
    this.logger = logger;
  }

  /**
   * Register a new route
   */
  registerRoute(route: Route): void {
    if (this.routes.has(route.id)) {
      this.logger?.warn(`Route with ID ${route.id} already exists. Replacing.`);
    }

    this.routes.set(route.id, route);
    this.rebuildSortedRoutes();

    this.logger?.debug(`Registered route: ${route.id} (priority: ${route.priority})`);
  }

  /**
   * Register multiple routes at once
   */
  registerRoutes(routes: Route[]): void {
    for (const route of routes) {
      this.routes.set(route.id, route);
    }
    this.rebuildSortedRoutes();

    this.logger?.debug(`Registered ${routes.length} routes`);
  }

  /**
   * Unregister a route by ID
   */
  unregisterRoute(routeId: string): boolean {
    const removed = this.routes.delete(routeId);
    if (removed) {
      this.rebuildSortedRoutes();
      this.logger?.debug(`Unregistered route: ${routeId}`);
    }
    return removed;
  }

  /**
   * Get a route by ID
   */
  getRoute(routeId: string): Route | undefined {
    return this.routes.get(routeId);
  }

  /**
   * Get all routes (sorted by priority)
   */
  getAllRoutes(): Route[] {
    return [...this.sortedRoutes];
  }

  /**
   * Enable or disable a route
   */
  setRouteEnabled(routeId: string, enabled: boolean): boolean {
    const route = this.routes.get(routeId);
    if (!route) {
      return false;
    }

    route.enabled = enabled;
    this.logger?.debug(`Route ${routeId} ${enabled ? 'enabled' : 'disabled'}`);
    return true;
  }

  /**
   * Select the best route for a given request and context.
   * Returns the selected route and provider,model string.
   */
  async selectRoute(req: FastifyRequest, context: RouteContext): Promise<RouteSelectionResult> {
    const startTime = Date.now();
    const evaluatedRoutes: Array<{ route: Route; matched: boolean; reason?: string }> = [];

    // Try each route in priority order
    for (const route of this.sortedRoutes) {
      // Skip disabled routes
      if (route.enabled === false) {
        evaluatedRoutes.push({
          route,
          matched: false,
          reason: 'Route is disabled',
        });
        continue;
      }

      try {
        // Evaluate all matchers for this route
        const matched = await this.evaluateRoute(route, req, context);

        evaluatedRoutes.push({
          route,
          matched,
          reason: matched ? 'All matchers passed' : 'One or more matchers failed',
        });

        if (matched) {
          // Apply transformations for this route
          await this.applyTransformations(route, req, context);

          const providerModel = `${route.provider},${route.model}`;
          const selectionTimeMs = Date.now() - startTime;

          this.logger?.info(`Selected route: ${route.id} -> ${providerModel} (${selectionTimeMs}ms)`);

          return {
            route,
            providerModel,
            evaluatedRoutes,
            usedFallback: false,
            selectionTimeMs,
          };
        }
      } catch (error: any) {
        this.logger?.error(`Error evaluating route ${route.id}:`, error);
        evaluatedRoutes.push({
          route,
          matched: false,
          reason: `Error: ${error.message}`,
        });
      }
    }

    // No route matched - use fallback (default route with lowest priority)
    const fallbackRoute = this.sortedRoutes[this.sortedRoutes.length - 1];
    if (fallbackRoute) {
      const providerModel = `${fallbackRoute.provider},${fallbackRoute.model}`;
      const selectionTimeMs = Date.now() - startTime;

      this.logger?.warn(`No route matched. Using fallback: ${fallbackRoute.id} -> ${providerModel}`);

      return {
        route: fallbackRoute,
        providerModel,
        evaluatedRoutes,
        usedFallback: true,
        selectionTimeMs,
      };
    }

    // No routes at all - this shouldn't happen
    const selectionTimeMs = Date.now() - startTime;
    this.logger?.error('No routes registered! Cannot select a route.');

    return {
      providerModel: 'claude-3-5-sonnet-latest', // Emergency fallback
      evaluatedRoutes,
      usedFallback: true,
      selectionTimeMs,
    };
  }

  /**
   * Evaluate whether a route matches the request
   */
  private async evaluateRoute(route: Route, req: FastifyRequest, context: RouteContext): Promise<boolean> {
    // If route has no matchers, it always matches (useful for fallback)
    if (!route.matchers || route.matchers.length === 0) {
      return true;
    }

    // ALL matchers must pass for the route to match
    for (const matcher of route.matchers) {
      try {
        const result = await matcher.evaluate(req, context);
        if (!result) {
          this.logger?.debug(`Route ${route.id}: Matcher ${matcher.type} failed`);
          return false;
        }
      } catch (error: any) {
        this.logger?.error(`Route ${route.id}: Matcher ${matcher.type} threw error:`, error);
        return false;
      }
    }

    return true;
  }

  /**
   * Apply transformations from a route to the request
   */
  private async applyTransformations(route: Route, req: FastifyRequest, context: RouteContext): Promise<void> {
    if (!route.transformations || route.transformations.length === 0) {
      return;
    }

    for (const transformation of route.transformations) {
      try {
        this.logger?.debug(`Applying transformation: ${transformation.type} for route ${route.id}`);
        await transformation.apply(req, context);
      } catch (error: any) {
        this.logger?.error(`Error applying transformation ${transformation.type} for route ${route.id}:`, error);
        // Continue with other transformations even if one fails
      }
    }
  }

  /**
   * Rebuild the sorted routes array (called after route changes)
   */
  private rebuildSortedRoutes(): void {
    this.sortedRoutes = Array.from(this.routes.values())
      .sort((a, b) => b.priority - a.priority); // Higher priority first
  }

  /**
   * Get the matcher registry
   */
  getMatcherRegistry(): RouteMatcherRegistry {
    return this.matcherRegistry;
  }

  /**
   * Get the transformation registry
   */
  getTransformationRegistry(): TransformationRegistry {
    return this.transformationRegistry;
  }

  /**
   * Create a route from a configuration object
   * This is useful for loading routes from JSON config
   */
  createRouteFromConfig(config: any): Route {
    const matchers: RouteMatcher[] = [];
    if (config.matchers) {
      for (const matcherConfig of config.matchers) {
        const factory = this.matcherRegistry.get(matcherConfig.type);
        if (factory) {
          matchers.push(factory(matcherConfig));
        } else {
          this.logger?.warn(`Unknown matcher type: ${matcherConfig.type}`);
        }
      }
    }

    const transformations: Transformation[] = [];
    if (config.transformations) {
      for (const transformConfig of config.transformations) {
        const factory = this.transformationRegistry.get(transformConfig.type);
        if (factory) {
          transformations.push(factory(transformConfig));
        } else {
          this.logger?.warn(`Unknown transformation type: ${transformConfig.type}`);
        }
      }
    }

    return {
      id: config.id,
      priority: config.priority ?? 0,
      description: config.description ?? '',
      tags: config.tags ?? [],
      matchers,
      provider: config.provider,
      model: config.model,
      transformations,
      enabled: config.enabled ?? true,
      metadata: config.metadata ?? {},
    };
  }
}

/**
 * Default implementation of RouteMatcherRegistry
 */
class DefaultRouteMatcherRegistry implements RouteMatcherRegistry {
  private factories: Map<string, RouteMatcherFactory> = new Map();

  register(type: string, factory: RouteMatcherFactory): void {
    this.factories.set(type, factory);
  }

  get(type: string): RouteMatcherFactory | undefined {
    return this.factories.get(type);
  }

  has(type: string): boolean {
    return this.factories.has(type);
  }

  list(): string[] {
    return Array.from(this.factories.keys());
  }
}

/**
 * Default implementation of TransformationRegistry
 */
class DefaultTransformationRegistry implements TransformationRegistry {
  private factories: Map<string, TransformationFactory> = new Map();

  register(type: string, factory: TransformationFactory): void {
    this.factories.set(type, factory);
  }

  get(type: string): TransformationFactory | undefined {
    return this.factories.get(type);
  }

  has(type: string): boolean {
    return this.factories.has(type);
  }

  list(): string[] {
    return Array.from(this.factories.keys());
  }
}

/**
 * Singleton instance of RouteManager
 */
let routeManagerInstance: RouteManager | null = null;

/**
 * Get the singleton RouteManager instance
 */
export function getRouteManager(): RouteManager {
  if (!routeManagerInstance) {
    routeManagerInstance = new RouteManager();
  }
  return routeManagerInstance;
}

/**
 * Initialize the RouteManager with custom registries
 */
export function initializeRouteManager(
  matcherRegistry?: RouteMatcherRegistry,
  transformationRegistry?: TransformationRegistry,
  logger?: any
): RouteManager {
  routeManagerInstance = new RouteManager(matcherRegistry, transformationRegistry, logger);
  return routeManagerInstance;
}