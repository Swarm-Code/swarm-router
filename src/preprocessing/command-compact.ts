import { FastifyRequest } from "fastify";
import { PreProcessor, ProcessResult } from "./types";
import { RouteContext } from "../routing/types";
import * as fs from "fs";
import * as path from "path";

/**
 * CompactCommandPreProcessor
 *
 * Handles the /compact command by:
 * 1. Detecting /compact command in messages
 * 2. Transforming the last message with comprehensive summarization instructions
 * 3. Adding a system prompt for detailed conversation summarization
 * 4. Setting high max_tokens (65536) for comprehensive output
 * 5. Overriding the model to use the configured compact route
 * 6. Logging the routing decision to audit logs
 *
 * This pre-processor maintains backward compatibility with the existing MITM
 * /compact logic from src/index.ts lines 253-358.
 *
 * @example
 * ```typescript
 * const processor = createCompactCommandPreProcessor({
 *   config: {
 *     Router: {
 *       compact: "openrouter-gemini,google/gemini-2.5-flash"
 *     }
 *   }
 * });
 * ```
 */
export function createCompactCommandPreProcessor(options: CompactCommandOptions): PreProcessor {
  const {
    priority = 800,
    enabled = true,
    config,
    logsDir,
  } = options;

  const defaultInstruction = `IMPORTANT: You MUST use deterministic context and provide TOO MUCH context rather than too little. It is ALWAYS better to include excessive detail to ensure nothing is forgotten.

Please provide a SEQUENTIAL and COMPREHENSIVE summary of this conversation. DO NOT be concise - include ALL important details, code snippets, file paths, errors, solutions, and context.

REQUIREMENTS:
1. Use DETERMINISTIC CONTEXT - be explicit and exact about everything
2. Include TOO MUCH CONTEXT - it's better to have excessive detail than to miss anything
3. Process everything SEQUENTIALLY - maintain the chronological order of events
4. Include ALL file paths, function names, variable names, and code snippets
5. Document ALL errors and their solutions
6. Preserve ALL technical details and implementation specifics
7. Keep ALL todo items and tasks with their full context
8. Maintain ALL user requirements and instructions exactly as stated`;

  const systemPrompt = 'You are a conversation summarizer that MUST provide EXCESSIVE detail and context. NEVER be concise. Always include TOO MUCH information rather than too little. Process everything SEQUENTIALLY and maintain DETERMINISTIC CONTEXT. Include ALL technical details, code snippets, file paths, errors, solutions, and implementation specifics. It is CRITICAL that you preserve everything with excessive detail to ensure nothing is forgotten.';

  return {
    name: "compact-command",
    priority,
    enabled,
    description: "Handles /compact command for conversation summarization",

    shouldProcess: async (req: FastifyRequest, context: RouteContext): Promise<boolean> => {
      // Check if /compact command was detected
      return !!(
        context.detectedCommands &&
        context.detectedCommands.includes("/compact")
      );
    },

    process: async (req: FastifyRequest, context: RouteContext): Promise<ProcessResult> => {
      const body = req.body as any;

      // Check if compact route is configured
      if (!config?.Router?.compact) {
        return {
          modified: false,
          message: "No compact route configured in config.Router.compact",
        };
      }

      // Extract command arguments if present
      let compactArgs = "";
      if (context.metadata?.commandArgs && context.metadata.commandArgs["/compact"]) {
        compactArgs = context.metadata.commandArgs["/compact"];
      }

      // Build compact instruction
      const compactInstruction = compactArgs
        ? `${defaultInstruction}\n\nAdditional instructions: ${compactArgs}`
        : defaultInstruction;

      // Transform the last message
      if (body.messages && body.messages.length > 0) {
        body.messages[body.messages.length - 1] = {
          role: "user",
          content: compactInstruction,
        };
      }

      // Add system prompt for compact operation
      if (!body.system) {
        body.system = [];
      } else if (typeof body.system === "string") {
        body.system = [{ type: "text", text: body.system }];
      }

      body.system.push({
        type: "text",
        text: systemPrompt,
        cache_control: { type: "ephemeral" },
      });

      // Set high max_tokens for comprehensive output
      body.max_tokens = 65536;

      // Override model to use compact route
      const originalModel = body.model;
      body.model = config.Router.compact;

      // Log the routing decision
      if (logsDir) {
        try {
          if (!fs.existsSync(logsDir)) {
            fs.mkdirSync(logsDir, { recursive: true });
          }

          const sessionId = context.sessionId || (req as any).sessionId || "unknown-session";
          const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
          const logFileName = `claudemitm-ROUTED-${sessionId}-${timestamp}.log`;
          const logFilePath = path.join(logsDir, logFileName);

          fs.writeFileSync(
            logFilePath,
            JSON.stringify(
              {
                routed: true,
                reason: "/compact command detected",
                routedTo: config.Router.compact,
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
          console.error("[CompactCommandPreProcessor] Failed to write audit log:", error);
        }
      }

      return {
        modified: true,
        providerModelOverride: config.Router.compact,
        message: `/compact command processed, routed to ${config.Router.compact}`,
        metadata: {
          compactCommand: true,
          originalModel,
          routedTo: config.Router.compact,
        },
      };
    },
  };
}

/**
 * Options for CompactCommandPreProcessor
 */
export interface CompactCommandOptions {
  /** Priority for execution order (default: 800) */
  priority?: number;

  /** Whether this processor is enabled (default: true) */
  enabled?: boolean;

  /** Configuration object containing Router.compact */
  config: {
    Router?: {
      compact?: string;
      [key: string]: any;
    };
    [key: string]: any;
  };

  /** Directory for audit logs (optional) */
  logsDir?: string;
}