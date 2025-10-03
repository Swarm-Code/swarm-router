import { FastifyRequest } from "fastify";
import { PreProcessor, ProcessResult } from "./types";
import { RouteContext } from "../routing/types";
import * as fs from "fs";
import * as path from "path";

/**
 * ThinkCommandPreProcessor
 *
 * Handles think/ultrathink routing by:
 * 1. Detecting "think" or "ultrathink" keywords in messages
 * 2. Overriding the model to use the configured ultrathink route
 * 3. Logging the routing decision to audit logs
 *
 * Unlike the compact command, this processor does NOT transform the message content.
 * It simply routes to a more powerful thinking model when thinking-related keywords
 * are detected.
 *
 * This pre-processor maintains backward compatibility with the existing MITM
 * think/ultrathink logic from src/index.ts lines 360-404.
 *
 * @example
 * ```typescript
 * const processor = createThinkCommandPreProcessor({
 *   config: {
 *     Router: {
 *       ultrathink: "anthropic,claude-opus-4-20250514"
 *     }
 *   }
 * });
 * ```
 */
export function createThinkCommandPreProcessor(options: ThinkCommandOptions): PreProcessor {
  const {
    priority = 750,
    enabled = true,
    config,
    logsDir,
    keywords = ["think", "ultrathink", "reasoning", "reason"],
  } = options;

  return {
    name: "think-command",
    priority,
    enabled,
    description: "Handles think/ultrathink command for routing to thinking models",

    shouldProcess: async (req: FastifyRequest, context: RouteContext): Promise<boolean> => {
      const body = req.body as any;

      // Check if any thinking keywords are present in messages
      if (!body.messages || !Array.isArray(body.messages)) {
        return false;
      }

      for (const message of body.messages) {
        let content = "";
        if (typeof message.content === "string") {
          content = message.content;
        } else if (Array.isArray(message.content)) {
          const textBlock = message.content.find((item: any) => item.type === "text");
          if (textBlock) {
            content = textBlock.text || "";
          }
        }

        const lowerContent = content.toLowerCase();
        for (const keyword of keywords) {
          if (lowerContent.includes(keyword.toLowerCase())) {
            return true;
          }
        }
      }

      return false;
    },

    process: async (req: FastifyRequest, context: RouteContext): Promise<ProcessResult> => {
      const body = req.body as any;

      // Check if ultrathink route is configured
      if (!config?.Router?.ultrathink) {
        return {
          modified: false,
          message: "No ultrathink route configured in config.Router.ultrathink",
        };
      }

      // Override model to use ultrathink route
      const originalModel = body.model;
      body.model = config.Router.ultrathink;

      // Log the routing decision
      if (logsDir) {
        try {
          if (!fs.existsSync(logsDir)) {
            fs.mkdirSync(logsDir, { recursive: true });
          }

          const sessionId = context.sessionId || (req as any).sessionId || "unknown-session";
          const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
          const logFileName = `claudemitm-THINK-ROUTED-${sessionId}-${timestamp}.log`;
          const logFilePath = path.join(logsDir, logFileName);

          fs.writeFileSync(
            logFilePath,
            JSON.stringify(
              {
                routed: true,
                reason: "/think command detected",
                routedTo: config.Router.ultrathink,
                originalModel,
                timestamp: new Date().toISOString(),
                sessionId,
              },
              null,
              2
            )
          );
        } catch (error) {
          // Log error but don't fail the request
          console.error("[ThinkCommandPreProcessor] Failed to write audit log:", error);
        }
      }

      return {
        modified: true,
        providerModelOverride: config.Router.ultrathink,
        message: `/think command processed, routed to ${config.Router.ultrathink}`,
        metadata: {
          thinkCommand: true,
          originalModel,
          routedTo: config.Router.ultrathink,
        },
      };
    },
  };
}

/**
 * Options for ThinkCommandPreProcessor
 */
export interface ThinkCommandOptions {
  /** Priority for execution order (default: 750) */
  priority?: number;

  /** Whether this processor is enabled (default: true) */
  enabled?: boolean;

  /** Configuration object containing Router.ultrathink */
  config: {
    Router?: {
      ultrathink?: string;
      [key: string]: any;
    };
    [key: string]: any;
  };

  /** Directory for audit logs (optional) */
  logsDir?: string;

  /** Keywords to detect for think routing (default: ["think", "ultrathink", "reasoning", "reason"]) */
  keywords?: string[];
}