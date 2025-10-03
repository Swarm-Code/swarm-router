import { FastifyRequest } from "fastify";
import { PreProcessor, ProcessResult } from "./types";
import { RouteContext } from "../routing/types";
import { get_encoding } from "tiktoken";
import { sessionUsageCache, Usage } from "../utils/cache";
import {
  MessageParam,
  Tool,
} from "@anthropic-ai/sdk/resources/messages";

const enc = get_encoding("cl100k_base");

/**
 * ContextEnricherPreProcessor
 *
 * Enriches the route context with metadata needed for routing decisions:
 * - Calculates token count from messages, system prompts, and tools
 * - Extracts session ID from request headers
 * - Retrieves last usage from session cache
 * - Adds enriched metadata to context
 *
 * This processor should run early in the pipeline (high priority) to ensure
 * all downstream processors and routers have access to this metadata.
 *
 * @example
 * ```typescript
 * const enricher = createContextEnricherPreProcessor({
 *   priority: 900, // Run early, but after command detection
 * });
 * ```
 */
export function createContextEnricherPreProcessor(options: ContextEnricherOptions = {}): PreProcessor {
  const {
    priority = 900,
    enabled = true,
  } = options;

  return {
    name: "context-enricher",
    priority,
    enabled,
    description: "Enriches context with token counts, session info, and usage data",

    shouldProcess: async (req: FastifyRequest, context: RouteContext): Promise<boolean> => {
      // Always run to enrich context
      return true;
    },

    process: async (req: FastifyRequest, context: RouteContext): Promise<ProcessResult> => {
      const body = req.body as any;
      const metadata: Record<string, any> = {};

      // 1. Calculate token count
      const tokenCount = calculateTokenCount(
        body.messages || [],
        body.system,
        body.tools || []
      );
      context.tokenCount = tokenCount;
      metadata.tokenCount = tokenCount;

      // 2. Extract session ID from headers
      const headers = req.headers as any;
      const sessionId = headers["x-session-id"] || headers["x-claude-session-id"];
      if (sessionId) {
        context.sessionId = sessionId;
        metadata.sessionId = sessionId;
      }

      // 3. Retrieve last usage from cache
      if (sessionId) {
        const lastUsage = sessionUsageCache.get(sessionId);
        if (lastUsage) {
          context.lastUsage = lastUsage;
          metadata.lastUsage = lastUsage;
        }
      }

      // 4. Extract model info
      if (body.model) {
        metadata.requestedModel = body.model;
      }

      // 5. Detect tool usage
      if (body.tools && Array.isArray(body.tools) && body.tools.length > 0) {
        metadata.hasTools = true;
        metadata.toolCount = body.tools.length;
        metadata.toolTypes = body.tools.map((tool: any) => tool.type || tool.name);
      }

      // 6. Detect thinking/reasoning flags
      if (body.thinking || body.reasoning || body.reasoning_effort) {
        metadata.hasThinking = true;
        if (body.thinking) metadata.thinking = body.thinking;
        if (body.reasoning) metadata.reasoning = body.reasoning;
        if (body.reasoning_effort) metadata.reasoningEffort = body.reasoning_effort;
      }

      // 7. Extract message count
      if (body.messages && Array.isArray(body.messages)) {
        metadata.messageCount = body.messages.length;
      }

      return {
        modified: true,
        metadata,
      };
    },
  };
}

/**
 * Calculate token count from messages, system prompts, and tools
 * (Extracted from src/utils/router.ts)
 */
function calculateTokenCount(
  messages: MessageParam[],
  system: any,
  tools: Tool[]
): number {
  let tokenCount = 0;

  // Count message tokens
  if (Array.isArray(messages)) {
    messages.forEach((message) => {
      if (typeof message.content === "string") {
        tokenCount += enc.encode(message.content).length;
      } else if (Array.isArray(message.content)) {
        message.content.forEach((contentPart: any) => {
          if (contentPart.type === "text") {
            tokenCount += enc.encode(contentPart.text).length;
          } else if (contentPart.type === "tool_use") {
            tokenCount += enc.encode(JSON.stringify(contentPart.input)).length;
          } else if (contentPart.type === "tool_result") {
            tokenCount += enc.encode(
              typeof contentPart.content === "string"
                ? contentPart.content
                : JSON.stringify(contentPart.content)
            ).length;
          }
        });
      }
    });
  }

  // Count system prompt tokens
  if (typeof system === "string") {
    tokenCount += enc.encode(system).length;
  } else if (Array.isArray(system)) {
    system.forEach((item: any) => {
      if (item.type !== "text") {
        return;
      }
      if (typeof item.text === "string") {
        tokenCount += enc.encode(item.text).length;
      } else if (Array.isArray(item.text)) {
        item.text.forEach((textPart: any) => {
          tokenCount += enc.encode(textPart || "").length;
        });
      }
    });
  }

  // Count tool tokens
  if (Array.isArray(tools)) {
    tools.forEach((tool: any) => {
      tokenCount += enc.encode(JSON.stringify(tool)).length;
    });
  }

  return tokenCount;
}

/**
 * Options for ContextEnricherPreProcessor
 */
export interface ContextEnricherOptions {
  /** Priority for execution order (default: 900) */
  priority?: number;

  /** Whether this processor is enabled (default: true) */
  enabled?: boolean;
}