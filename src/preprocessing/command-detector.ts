import { FastifyRequest } from "fastify";
import { PreProcessor, ProcessResult } from "./types";
import { RouteContext } from "../routing/types";

/**
 * CommandDetectorPreProcessor
 *
 * Detects slash commands in messages and adds them to context for routing.
 * Supports multiple command formats:
 * - Direct: "/compact Please summarize"
 * - XML-wrapped: "<command-name>/compact</command-name><command-args>...</command-args>"
 * - Array content: [{ type: "text", text: "/compact ..." }]
 *
 * Detected commands are added to context.detectedCommands array.
 * Command arguments are extracted and added to context.metadata.commandArgs.
 *
 * @example
 * ```typescript
 * const detector = createCommandDetectorPreProcessor({
 *   priority: 1000, // Run early
 *   commands: ["/compact", "/model", "/think"]
 * });
 * ```
 */
export function createCommandDetectorPreProcessor(options: CommandDetectorOptions = {}): PreProcessor {
  const {
    priority = 1000,
    enabled = true,
    commands = ["/compact", "/model", "/think", "/ultrathink"],
    caseSensitive = false,
  } = options;

  return {
    name: "command-detector",
    priority,
    enabled,
    description: "Detects slash commands in messages and enriches context",

    shouldProcess: async (req: FastifyRequest, context: RouteContext): Promise<boolean> => {
      const body = req.body as any;
      return !!(body?.messages && Array.isArray(body.messages) && body.messages.length > 0);
    },

    process: async (req: FastifyRequest, context: RouteContext): Promise<ProcessResult> => {
      const body = req.body as any;
      const detectedCommands: string[] = [];
      const commandArgs: Record<string, string> = {};

      // Check context.detectedCommands first (might be set by agent system)
      if (context.detectedCommands && Array.isArray(context.detectedCommands)) {
        detectedCommands.push(...context.detectedCommands);
      }

      // Get last message
      const lastMessage = body.messages[body.messages.length - 1];
      if (!lastMessage) {
        return { modified: false };
      }

      // Extract content as string
      let content = "";
      if (typeof lastMessage.content === "string") {
        content = lastMessage.content;
      } else if (Array.isArray(lastMessage.content)) {
        // Find first text block
        const textBlock = lastMessage.content.find((item: any) => item.type === "text");
        if (textBlock) {
          content = textBlock.text || "";
        }
      }

      if (!content) {
        return { modified: false };
      }

      // 1. Check for XML-formatted commands
      const xmlMatch = content.match(/<command-name>([^<]+)<\/command-name>(?:<command-args>([^<]*)<\/command-args>)?/);
      if (xmlMatch) {
        const command = xmlMatch[1];
        const args = xmlMatch[2] || "";

        const matchedCmd = findMatchingCommand(command, commands, caseSensitive);
        if (matchedCmd) {
          if (!detectedCommands.includes(matchedCmd)) {
            detectedCommands.push(matchedCmd);
          }
          if (args) {
            commandArgs[matchedCmd] = args;
          }
        }
      }

      // 2. Check for direct slash commands at start of message
      const directMatch = content.match(/^(\/\w+)(?:\s+(.*))?/);
      if (directMatch) {
        const command = directMatch[1];
        const args = directMatch[2] || "";

        const matchedCmd = findMatchingCommand(command, commands, caseSensitive);
        if (matchedCmd) {
          if (!detectedCommands.includes(matchedCmd)) {
            detectedCommands.push(matchedCmd);
          }
          if (args) {
            commandArgs[matchedCmd] = args;
          }
        }
      }

      // 3. Check all messages for commands anywhere in text
      for (const message of body.messages) {
        let messageContent = "";
        if (typeof message.content === "string") {
          messageContent = message.content;
        } else if (Array.isArray(message.content)) {
          const textBlock = message.content.find((item: any) => item.type === "text");
          if (textBlock) {
            messageContent = textBlock.text || "";
          }
        }

        for (const cmd of commands) {
          const needle = caseSensitive ? cmd : cmd.toLowerCase();
          const haystack = caseSensitive ? messageContent : messageContent.toLowerCase();

          if (haystack.includes(needle)) {
            if (!detectedCommands.includes(cmd)) {
              detectedCommands.push(cmd);
            }
          }
        }
      }

      // Update context
      if (detectedCommands.length > 0) {
        context.detectedCommands = detectedCommands;
        context.metadata.commandArgs = commandArgs;

        return {
          modified: true,
          metadata: {
            detectedCommands,
            commandArgs,
          },
        };
      }

      return { modified: false };
    },
  };
}

/**
 * Find the matching command from the expected list (returns the normalized version)
 * Returns the normalized command from the expected list, or undefined if no match
 */
function findMatchingCommand(command: string, expected: string[], caseSensitive: boolean): string | undefined {
  const needle = caseSensitive ? command : command.toLowerCase();
  return expected.find(cmd => {
    const expectedCmd = caseSensitive ? cmd : cmd.toLowerCase();
    return needle === expectedCmd;
  });
}

/**
 * Check if a command matches any of the expected commands
 */
function matchesCommand(command: string, expected: string[], caseSensitive: boolean): boolean {
  return findMatchingCommand(command, expected, caseSensitive) !== undefined;
}

/**
 * Options for CommandDetectorPreProcessor
 */
export interface CommandDetectorOptions {
  /** Priority for execution order (default: 1000) */
  priority?: number;

  /** Whether this processor is enabled (default: true) */
  enabled?: boolean;

  /** List of commands to detect (default: ["/compact", "/model", "/think", "/ultrathink"]) */
  commands?: string[];

  /** Whether command matching is case sensitive (default: false) */
  caseSensitive?: boolean;
}