import { readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { RouteManager } from "./RouteManager";
import { Route } from "./types";

/**
 * Configuration file for SDK routes
 */
export interface RoutesConfig {
  version: string;
  description?: string;
  routes: Route[];
  fallbackChains?: {
    description?: string;
    [key: string]: string[] | string | undefined;
  };
}

/**
 * Default path for routes configuration
 */
export const DEFAULT_ROUTES_PATH = join(homedir(), ".claude-code-router", "routes.json");
export const PROJECT_ROUTES_PATH = join(process.cwd(), "routes.json");

/**
 * Load routes from JSON configuration file
 *
 * Priority:
 * 1. User's home directory (~/.claude-code-router/routes.json)
 * 2. Project directory (./routes.json)
 *
 * @param customPath - Optional custom path to routes file
 * @returns RoutesConfig object
 */
export async function loadRoutesConfig(customPath?: string): Promise<RoutesConfig> {
  // Determine which file to load
  let routesPath: string;

  if (customPath && existsSync(customPath)) {
    routesPath = customPath;
  } else if (existsSync(DEFAULT_ROUTES_PATH)) {
    routesPath = DEFAULT_ROUTES_PATH;
  } else if (existsSync(PROJECT_ROUTES_PATH)) {
    routesPath = PROJECT_ROUTES_PATH;
  } else {
    throw new Error(
      `No routes configuration found. Checked:\n` +
      `  1. ${customPath || "(no custom path provided)"}\n` +
      `  2. ${DEFAULT_ROUTES_PATH}\n` +
      `  3. ${PROJECT_ROUTES_PATH}\n\n` +
      `Please create a routes.json file in one of these locations.`
    );
  }

  console.log(`[ROUTES LOADER] Loading routes from: ${routesPath}`);

  try {
    const content = await readFile(routesPath, "utf-8");
    const config: RoutesConfig = JSON.parse(content);

    // Validate basic structure
    if (!config.routes || !Array.isArray(config.routes)) {
      throw new Error("Invalid routes config: 'routes' array is required");
    }

    console.log(`[ROUTES LOADER] Loaded ${config.routes.length} routes from ${routesPath}`);
    return config;
  } catch (error: any) {
    if (error.code === "ENOENT") {
      throw new Error(`Routes file not found: ${routesPath}`);
    }
    throw new Error(`Failed to load routes config: ${error.message}`);
  }
}

/**
 * Save routes configuration to file
 *
 * @param config - Routes configuration to save
 * @param path - Path to save to (defaults to DEFAULT_ROUTES_PATH)
 */
export async function saveRoutesConfig(config: RoutesConfig, path?: string): Promise<void> {
  const routesPath = path || DEFAULT_ROUTES_PATH;

  try {
    const content = JSON.stringify(config, null, 2);
    await writeFile(routesPath, content, "utf-8");
    console.log(`[ROUTES LOADER] Saved routes configuration to ${routesPath}`);
  } catch (error: any) {
    throw new Error(`Failed to save routes config: ${error.message}`);
  }
}

/**
 * Initialize RouteManager from routes configuration file
 *
 * This is a convenience function that:
 * 1. Loads routes from file
 * 2. Creates matchers from config
 * 3. Registers routes with RouteManager
 *
 * @param manager - RouteManager instance
 * @param customPath - Optional custom path to routes file
 * @returns Number of routes registered
 */
export async function loadRoutesIntoManager(
  manager: RouteManager,
  customPath?: string
): Promise<number> {
  const config = await loadRoutesConfig(customPath);

  // Create routes using the manager's factory method
  const routes: Route[] = [];
  for (const routeConfig of config.routes) {
    try {
      const route = manager.createRouteFromConfig(routeConfig);
      routes.push(route);
    } catch (error: any) {
      console.error(`[ROUTES LOADER] Failed to create route ${routeConfig.id}:`, error.message);
    }
  }

  // Register all routes
  manager.registerRoutes(routes);

  console.log(`[ROUTES LOADER] Registered ${routes.length} routes with RouteManager`);
  return routes.length;
}

/**
 * Export current routes from RouteManager to file
 *
 * @param manager - RouteManager instance
 * @param path - Path to save to (defaults to DEFAULT_ROUTES_PATH)
 */
export async function exportRoutesFromManager(
  manager: RouteManager,
  path?: string
): Promise<void> {
  const routes = manager.getAllRoutes();

  const config: RoutesConfig = {
    version: "1.0.0",
    description: "Exported routes from RouteManager",
    routes,
  };

  await saveRoutesConfig(config, path);
  console.log(`[ROUTES LOADER] Exported ${routes.length} routes to ${path || DEFAULT_ROUTES_PATH}`);
}

/**
 * Migrate from old config.Router format to new SDK routes format
 *
 * @param oldConfig - Old config object with Router section
 * @returns New RoutesConfig object
 */
export function migrateFromLegacyConfig(oldConfig: any): RoutesConfig {
  const routes: Route[] = [];
  const router = oldConfig.Router || {};

  // Long Context route
  if (router.longContext) {
    const [provider, model] = router.longContext.split(",");
    routes.push({
      id: "long-context",
      priority: 800,
      description: "Route to long context model when token count exceeds threshold",
      tags: ["long-context", "migrated"],
      enabled: true,
      matchers: [
        {
          type: "token_count",
          description: "High token count",
          condition: {
            threshold: router.longContextThreshold || 120000,
            operator: "gt",
          },
          evaluate: () => false, // Will be created by factory
        },
      ],
      provider,
      model,
      transformations: [],
      metadata: { migratedFrom: "config.Router.longContext" },
    });
  }

  // Background route
  if (router.background) {
    const [provider, model] = router.background.split(",");
    routes.push({
      id: "background-haiku",
      priority: 700,
      description: "Route claude-3-5-haiku to high-performance model",
      tags: ["background", "migrated"],
      enabled: true,
      matchers: [
        {
          type: "model",
          description: "Haiku model",
          condition: {
            models: ["claude-3-5-haiku"],
            matchMode: "prefix",
          },
          evaluate: () => false,
        },
      ],
      provider,
      model,
      transformations: [],
      metadata: { migratedFrom: "config.Router.background" },
    });
  }

  // Think route
  if (router.think) {
    const [provider, model] = router.think.split(",");
    routes.push({
      id: "thinking",
      priority: 600,
      description: "Route to thinking model",
      tags: ["thinking", "migrated"],
      enabled: true,
      matchers: [
        {
          type: "thinking",
          description: "Thinking enabled",
          condition: {},
          evaluate: () => false,
        },
      ],
      provider,
      model,
      transformations: [],
      metadata: { migratedFrom: "config.Router.think" },
    });
  }

  // Web Search route
  if (router.webSearch) {
    const [provider, model] = router.webSearch.split(",");
    routes.push({
      id: "web-search",
      priority: 500,
      description: "Route with web search tools",
      tags: ["web-search", "migrated"],
      enabled: true,
      matchers: [
        {
          type: "tool",
          description: "Web search tools",
          condition: {
            toolTypes: ["web_search"],
            matchMode: "any",
          },
          evaluate: () => false,
        },
      ],
      provider,
      model,
      transformations: [],
      metadata: { migratedFrom: "config.Router.webSearch" },
    });
  }

  // Default route
  if (router.default) {
    const [provider, model] = router.default.includes(",")
      ? router.default.split(",")
      : ["anthropic", router.default];

    routes.push({
      id: "default",
      priority: 100,
      description: "Default fallback route",
      tags: ["default", "fallback", "migrated"],
      enabled: true,
      matchers: [
        {
          type: "always",
          description: "Always matches",
          condition: {},
          evaluate: () => true,
        },
      ],
      provider,
      model,
      transformations: [],
      metadata: { migratedFrom: "config.Router.default" },
    });
  }

  return {
    version: "1.0.0",
    description: "Migrated from legacy config.Router format",
    routes,
  };
}
