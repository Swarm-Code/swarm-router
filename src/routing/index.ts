/**
 * Routing module exports
 *
 * This module provides the complete routing system including:
 * - RouteManager for managing and evaluating routes
 * - Built-in matchers for route selection
 * - Built-in transformations for request modification
 * - Default route configurations
 */

export { RouteManager, RouteSelectionResult } from "./RouteManager";
export { Route, RouteMatcher, Transformation, RouteContext } from "./types";
export {
  createCommandMatcher,
  createTokenCountMatcher,
  createMessagePatternMatcher,
  createModelMatcher,
  createToolMatcher,
  createThinkingMatcher,
  createAlwaysMatcher,
} from "./matchers";
export {
  createMessageTransformation,
  createSystemPromptTransformation,
  createParamsTransformation,
  createCompactTransformation,
  createThinkingTransformation,
  createCleanupTransformation,
  createModelOverrideTransformation,
  registerBuiltInTransformations,
} from "./transformations";
export {
  createDefaultRoutes,
  createCompactRoute,
  createUltrathinkRoute,
  registerConfigRoutes,
} from "./routes";