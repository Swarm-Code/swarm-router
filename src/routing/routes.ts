import { Route } from "./types";
import {
  createTokenCountMatcher,
  createModelMatcher,
  createThinkingMatcher,
  createToolMatcher,
  createAlwaysMatcher,
} from "./matchers";

/**
 * Create default routes based on Router configuration
 *
 * This function migrates the existing router logic from src/utils/router.ts (lines 68-142)
 * to the new route-based system. Each route corresponds to a specific routing decision
 * in the original getUseModel function.
 *
 * Priority order (highest first):
 * 1. 1000: Direct provider,model specification (handled in router.ts, not here)
 * 2. 900: CCR-SUBAGENT-MODEL tag (handled in router.ts)
 * 3. 800: Long context (high token count or last usage)
 * 4. 700: Background model (claude-3-5-haiku)
 * 5. 600: Thinking model (thinking flag set)
 * 6. 500: Web search model (web_search tools present)
 * 7. 100: Default fallback
 *
 * @param config - Router configuration object
 * @returns Array of Route objects
 */
export function createDefaultRoutes(config: any): Route[] {
  const routes: Route[] = [];
  const longContextThreshold = config.Router?.longContextThreshold || 60000;

  // Route 1: Long Context - High token count
  if (config.Router?.longContext) {
    routes.push({
      id: "long-context",
      priority: 800,
      description: "Route to long context model when token count exceeds threshold",
      tags: ["long-context", "high-token"],
      matchers: [
        createTokenCountMatcher({
          type: "token_count",
          condition: {
            threshold: longContextThreshold,
            operator: "gt",
          },
        }),
      ],
      provider: config.Router.longContext.split(",")[0],
      model: config.Router.longContext.split(",")[1],
      enabled: true,
      metadata: {
        reason: "Token count exceeds threshold",
        originalRoute: "longContext",
      },
    });
  }

  // Route 2: Background Model - Haiku detection
  if (config.Router?.background) {
    routes.push({
      id: "background-haiku",
      priority: 700,
      description: "Route claude-3-5-haiku requests to background model",
      tags: ["background", "haiku"],
      matchers: [
        createModelMatcher({
          type: "model",
          condition: {
            models: ["claude-3-5-haiku"],
            matchMode: "prefix",
          },
        }),
      ],
      provider: config.Router.background.split(",")[0],
      model: config.Router.background.split(",")[1],
      enabled: true,
      metadata: {
        reason: "Haiku model detected",
        originalRoute: "background",
      },
    });
  }

  // Route 3: Thinking Model - reasoning/thinking flag
  if (config.Router?.think) {
    routes.push({
      id: "thinking",
      priority: 600,
      description: "Route to thinking model when reasoning is requested",
      tags: ["thinking", "reasoning"],
      matchers: [
        createThinkingMatcher({
          type: "thinking",
          condition: {},
        }),
      ],
      provider: config.Router.think.split(",")[0],
      model: config.Router.think.split(",")[1],
      enabled: true,
      metadata: {
        reason: "Thinking/reasoning requested",
        originalRoute: "think",
      },
    });
  }

  // Route 4: Web Search - web_search tools present
  if (config.Router?.webSearch) {
    routes.push({
      id: "web-search",
      priority: 500,
      description: "Route to web search model when web_search tools are present",
      tags: ["web-search", "tools"],
      matchers: [
        createToolMatcher({
          type: "tool",
          condition: {
            toolTypes: ["web_search"],
            matchMode: "any",
          },
        }),
      ],
      provider: config.Router.webSearch.split(",")[0],
      model: config.Router.webSearch.split(",")[1],
      enabled: true,
      metadata: {
        reason: "Web search tools detected",
        originalRoute: "webSearch",
      },
    });
  }

  // Route 5: Default Fallback (always matches)
  const defaultModel = config.Router?.default || "claude-3-5-sonnet-latest";
  const [defaultProvider, defaultModelName] = defaultModel.includes(",")
    ? defaultModel.split(",")
    : ["anthropic", defaultModel];

  routes.push({
    id: "default",
    priority: 100,
    description: "Default fallback route for all requests",
    tags: ["default", "fallback"],
    matchers: [
      createAlwaysMatcher({
        type: "always",
        condition: {},
      }),
    ],
    provider: defaultProvider,
    model: defaultModelName,
    enabled: true,
    metadata: {
      reason: "Default fallback",
        originalRoute: "default",
      },
    });

  return routes;
}

/**
 * Create routes from compact command configuration
 *
 * Note: The actual /compact command processing is handled by CompactCommandPreProcessor.
 * This route definition is for informational purposes and route management UI.
 *
 * @param config - Router configuration object
 * @returns Route object for compact command or null
 */
export function createCompactRoute(config: any): Route | null {
  if (!config.Router?.compact) {
    return null;
  }

  const [provider, model] = config.Router.compact.split(",");

  return {
    id: "compact",
    priority: 0, // Not used in route matching (handled by pre-processor)
    description: "/compact command route for conversation summarization",
    tags: ["compact", "command", "preprocessor"],
    matchers: [], // Not used (handled by pre-processor)
    provider,
    model,
    enabled: true,
    metadata: {
      reason: "/compact command detected",
      originalRoute: "compact",
      handledBy: "CompactCommandPreProcessor",
    },
  };
}

/**
 * Create routes from ultrathink configuration
 *
 * Note: The actual think/ultrathink routing is handled by ThinkCommandPreProcessor.
 * This route definition is for informational purposes and route management UI.
 *
 * @param config - Router configuration object
 * @returns Route object for ultrathink or null
 */
export function createUltrathinkRoute(config: any): Route | null {
  if (!config.Router?.ultrathink) {
    return null;
  }

  const [provider, model] = config.Router.ultrathink.split(",");

  return {
    id: "ultrathink",
    priority: 0, // Not used in route matching (handled by pre-processor)
    description: "Think/ultrathink keyword route for advanced reasoning",
    tags: ["ultrathink", "thinking", "preprocessor"],
    matchers: [], // Not used (handled by pre-processor)
    provider,
    model,
    enabled: true,
    metadata: {
      reason: "Think/ultrathink keywords detected",
      originalRoute: "ultrathink",
      handledBy: "ThinkCommandPreProcessor",
    },
  };
}

/**
 * Register all routes from config to a RouteManager
 *
 * @param manager - RouteManager instance
 * @param config - Router configuration object
 */
export function registerConfigRoutes(manager: any, config: any): void {
  // Register default routes (these are used for actual routing)
  const defaultRoutes = createDefaultRoutes(config);
  for (const route of defaultRoutes) {
    manager.registerRoute(route);
  }

  // Register informational routes (for UI and documentation)
  const compactRoute = createCompactRoute(config);
  if (compactRoute) {
    manager.registerRoute(compactRoute);
  }

  const ultrathinkRoute = createUltrathinkRoute(config);
  if (ultrathinkRoute) {
    manager.registerRoute(ultrathinkRoute);
  }
}