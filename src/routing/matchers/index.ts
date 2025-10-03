import { FastifyRequest } from "fastify";
import { RouteMatcher, RouteContext, RouteMatcherConfig } from "../types";

/**
 * CommandMatcher - Matches requests that contain specific slash commands
 *
 * Configuration:
 * {
 *   type: "command",
 *   condition: {
 *     commands: ["/compact", "/model", "/think"]
 *   }
 * }
 */
export function createCommandMatcher(config: RouteMatcherConfig): RouteMatcher {
  const commands: string[] = config.condition.commands || [];

  return {
    type: "command",
    description: `Matches if request contains any of: ${commands.join(", ")}`,
    condition: config.condition,
    evaluate: (req: FastifyRequest, context: RouteContext): boolean => {
      // Check if any detected commands match our list
      if (context.detectedCommands && context.detectedCommands.length > 0) {
        return context.detectedCommands.some(cmd => commands.includes(cmd));
      }

      // Fallback: check message content directly
      const lastMessage = (req.body as any)?.messages?.[(req.body as any).messages.length - 1];
      if (!lastMessage) {
        return false;
      }

      let content = '';
      if (typeof lastMessage.content === 'string') {
        content = lastMessage.content;
      } else if (Array.isArray(lastMessage.content)) {
        const textContent = lastMessage.content.find((item: any) => item.type === 'text');
        if (textContent) {
          content = textContent.text || '';
        }
      }

      // Check for XML-formatted commands or direct slash commands
      for (const cmd of commands) {
        const cmdWithoutSlash = cmd.startsWith('/') ? cmd.slice(1) : cmd;
        if (
          content.includes(`<command-name>/${cmdWithoutSlash}</command-name>`) ||
          content.includes(`<command-name>${cmd}</command-name>`) ||
          content.trim().startsWith(cmd)
        ) {
          return true;
        }
      }

      return false;
    }
  };
}

/**
 * TokenCountMatcher - Matches requests based on token count thresholds
 *
 * Configuration:
 * {
 *   type: "token_count",
 *   condition: {
 *     threshold: 60000,
 *     operator: "gt" | "lt" | "gte" | "lte" | "eq"
 *   }
 * }
 */
export function createTokenCountMatcher(config: RouteMatcherConfig): RouteMatcher {
  const threshold = config.condition.threshold || 60000;
  const operator = config.condition.operator || "gt";

  return {
    type: "token_count",
    description: `Matches if token count ${operator} ${threshold}`,
    condition: config.condition,
    evaluate: (req: FastifyRequest, context: RouteContext): boolean => {
      const tokenCount = context.tokenCount || 0;

      switch (operator) {
        case "gt":
          return tokenCount > threshold;
        case "lt":
          return tokenCount < threshold;
        case "gte":
          return tokenCount >= threshold;
        case "lte":
          return tokenCount <= threshold;
        case "eq":
          return tokenCount === threshold;
        default:
          return false;
      }
    }
  };
}

/**
 * MessagePatternMatcher - Matches requests based on text patterns in messages
 *
 * Configuration:
 * {
 *   type: "message_pattern",
 *   condition: {
 *     patterns: ["think", "ultrathink", "reasoning"],
 *     matchMode: "any" | "all",
 *     caseSensitive: false
 *   }
 * }
 */
export function createMessagePatternMatcher(config: RouteMatcherConfig): RouteMatcher {
  const patterns: string[] = config.condition.patterns || [];
  const matchMode = config.condition.matchMode || "any";
  const caseSensitive = config.condition.caseSensitive || false;

  return {
    type: "message_pattern",
    description: `Matches if message contains ${matchMode} of: ${patterns.join(", ")}`,
    condition: config.condition,
    evaluate: (req: FastifyRequest, context: RouteContext): boolean => {
      // Check context patterns first
      if (context.patterns && context.patterns.length > 0) {
        if (matchMode === "any") {
          return patterns.some(pattern =>
            context.patterns!.some(ctxPattern =>
              caseSensitive
                ? ctxPattern === pattern
                : ctxPattern.toLowerCase() === pattern.toLowerCase()
            )
          );
        } else {
          return patterns.every(pattern =>
            context.patterns!.some(ctxPattern =>
              caseSensitive
                ? ctxPattern === pattern
                : ctxPattern.toLowerCase() === pattern.toLowerCase()
            )
          );
        }
      }

      // Fallback: check message content
      const lastMessage = (req.body as any)?.messages?.[(req.body as any).messages.length - 1];
      if (!lastMessage) {
        return false;
      }

      let content = '';
      if (typeof lastMessage.content === 'string') {
        content = lastMessage.content;
      } else if (Array.isArray(lastMessage.content)) {
        const textContent = lastMessage.content.find((item: any) => item.type === 'text');
        if (textContent) {
          content = textContent.text || '';
        }
      }

      if (!caseSensitive) {
        content = content.toLowerCase();
      }

      if (matchMode === "any") {
        return patterns.some(pattern => {
          const searchPattern = caseSensitive ? pattern : pattern.toLowerCase();
          return content.includes(searchPattern);
        });
      } else {
        return patterns.every(pattern => {
          const searchPattern = caseSensitive ? pattern : pattern.toLowerCase();
          return content.includes(searchPattern);
        });
      }
    }
  };
}

/**
 * ModelMatcher - Matches requests based on the requested model
 *
 * Configuration:
 * {
 *   type: "model",
 *   condition: {
 *     models: ["claude-3-5-haiku"],
 *     matchMode: "exact" | "prefix" | "contains"
 *   }
 * }
 */
export function createModelMatcher(config: RouteMatcherConfig): RouteMatcher {
  const models: string[] = config.condition.models || [];
  const matchMode = config.condition.matchMode || "exact";

  return {
    type: "model",
    description: `Matches if model ${matchMode} matches: ${models.join(", ")}`,
    condition: config.condition,
    evaluate: (req: FastifyRequest, context: RouteContext): boolean => {
      const requestedModel = (req.body as any)?.model;
      if (!requestedModel) {
        return false;
      }

      switch (matchMode) {
        case "exact":
          return models.includes(requestedModel);
        case "prefix":
          return models.some(model => requestedModel.startsWith(model));
        case "contains":
          return models.some(model => requestedModel.includes(model));
        default:
          return false;
      }
    }
  };
}

/**
 * ToolMatcher - Matches requests that contain specific tool types
 *
 * Configuration:
 * {
 *   type: "tool",
 *   condition: {
 *     toolTypes: ["web_search", "image_analysis"],
 *     matchMode: "any" | "all"
 *   }
 * }
 */
export function createToolMatcher(config: RouteMatcherConfig): RouteMatcher {
  const toolTypes: string[] = config.condition.toolTypes || [];
  const matchMode = config.condition.matchMode || "any";

  return {
    type: "tool",
    description: `Matches if request contains ${matchMode} of tools: ${toolTypes.join(", ")}`,
    condition: config.condition,
    evaluate: (req: FastifyRequest, context: RouteContext): boolean => {
      const tools = (req.body as any)?.tools;
      if (!tools || !Array.isArray(tools) || tools.length === 0) {
        return false;
      }

      if (matchMode === "any") {
        return tools.some((tool: any) =>
          toolTypes.some(type => tool.type?.startsWith(type) || tool.name?.startsWith(type))
        );
      } else {
        return toolTypes.every(type =>
          tools.some((tool: any) => tool.type?.startsWith(type) || tool.name?.startsWith(type))
        );
      }
    }
  };
}

/**
 * ThinkingMatcher - Matches requests that have thinking/reasoning enabled
 *
 * Configuration:
 * {
 *   type: "thinking",
 *   condition: {}
 * }
 */
export function createThinkingMatcher(config: RouteMatcherConfig): RouteMatcher {
  return {
    type: "thinking",
    description: "Matches if request has thinking/reasoning enabled",
    condition: config.condition,
    evaluate: (req: FastifyRequest, context: RouteContext): boolean => {
      const body = req.body as any;
      return !!(body?.thinking || body?.reasoning || body?.reasoning_effort);
    }
  };
}

/**
 * AlwaysMatcher - Always matches (useful for fallback routes)
 *
 * Configuration:
 * {
 *   type: "always",
 *   condition: {}
 * }
 */
export function createAlwaysMatcher(config: RouteMatcherConfig): RouteMatcher {
  return {
    type: "always",
    description: "Always matches",
    condition: config.condition,
    evaluate: (): boolean => true
  };
}

/**
 * Register all built-in matchers to a registry
 */
export function registerBuiltInMatchers(registry: any): void {
  registry.register("command", createCommandMatcher);
  registry.register("token_count", createTokenCountMatcher);
  registry.register("message_pattern", createMessagePatternMatcher);
  registry.register("model", createModelMatcher);
  registry.register("tool", createToolMatcher);
  registry.register("thinking", createThinkingMatcher);
  registry.register("always", createAlwaysMatcher);
}