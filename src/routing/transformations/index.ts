import { FastifyRequest } from "fastify";
import { Transformation, RouteContext, TransformationConfig } from "../types";

/**
 * MessageTransformation - Replaces or modifies message content
 *
 * Configuration:
 * {
 *   type: "message",
 *   config: {
 *     operation: "replace" | "append" | "prepend",
 *     content: "New message content",
 *     role: "user" | "assistant" | "system",
 *     targetIndex: -1 // -1 for last message, 0 for first, etc.
 *   }
 * }
 */
export function createMessageTransformation(config: TransformationConfig): Transformation {
  const operation = config.config?.operation || "replace";
  const content = config.config?.content || "";
  const role = config.config?.role || "user";
  const targetIndex = config.config?.targetIndex ?? -1;

  return {
    type: "message",
    description: `${operation} message content`,
    config: config.config,
    apply: async (req: FastifyRequest, context: RouteContext): Promise<void> => {
      const body = req.body as any;
      if (!body.messages || !Array.isArray(body.messages)) {
        return;
      }

      const actualIndex = targetIndex < 0
        ? body.messages.length + targetIndex
        : targetIndex;

      if (actualIndex < 0 || actualIndex >= body.messages.length) {
        return;
      }

      const targetMessage = body.messages[actualIndex];

      switch (operation) {
        case "replace":
          targetMessage.content = content;
          break;
        case "append":
          if (typeof targetMessage.content === "string") {
            targetMessage.content = targetMessage.content + "\n\n" + content;
          } else if (Array.isArray(targetMessage.content)) {
            targetMessage.content.push({ type: "text", text: content });
          }
          break;
        case "prepend":
          if (typeof targetMessage.content === "string") {
            targetMessage.content = content + "\n\n" + targetMessage.content;
          } else if (Array.isArray(targetMessage.content)) {
            targetMessage.content.unshift({ type: "text", text: content });
          }
          break;
      }
    }
  };
}

/**
 * SystemPromptTransformation - Adds or modifies system prompts
 *
 * Configuration:
 * {
 *   type: "system_prompt",
 *   config: {
 *     operation: "add" | "replace" | "append" | "prepend",
 *     text: "System prompt text",
 *     cacheControl: { type: "ephemeral" }
 *   }
 * }
 */
export function createSystemPromptTransformation(config: TransformationConfig): Transformation {
  const operation = config.config?.operation || "add";
  const text = config.config?.text || "";
  const cacheControl = config.config?.cacheControl;

  return {
    type: "system_prompt",
    description: `${operation} system prompt`,
    config: config.config,
    apply: async (req: FastifyRequest, context: RouteContext): Promise<void> => {
      const body = req.body as any;

      if (!body.system) {
        body.system = [];
      }

      // Ensure system is an array
      if (typeof body.system === "string") {
        body.system = [{ type: "text", text: body.system }];
      }

      const systemBlock: any = {
        type: "text",
        text,
      };

      if (cacheControl) {
        systemBlock.cache_control = cacheControl;
      }

      switch (operation) {
        case "add":
        case "append":
          body.system.push(systemBlock);
          break;
        case "prepend":
          body.system.unshift(systemBlock);
          break;
        case "replace":
          body.system = [systemBlock];
          break;
      }
    }
  };
}

/**
 * ParamsTransformation - Sets or modifies request parameters
 *
 * Configuration:
 * {
 *   type: "params",
 *   config: {
 *     max_tokens: 65536,
 *     temperature: 0.7,
 *     reasoning_effort: "high",
 *     verbosity: 2,
 *     // ... any other parameters
 *   }
 * }
 */
export function createParamsTransformation(config: TransformationConfig): Transformation {
  const params = config.config || {};

  return {
    type: "params",
    description: `Set parameters: ${Object.keys(params).join(", ")}`,
    config: config.config,
    apply: async (req: FastifyRequest, context: RouteContext): Promise<void> => {
      const body = req.body as any;

      // Merge params into request body
      for (const [key, value] of Object.entries(params)) {
        body[key] = value;
      }
    }
  };
}

/**
 * CompactTransformation - Transforms message for conversation summarization
 *
 * Configuration:
 * {
 *   type: "compact",
 *   config: {
 *     instructionTemplate: "Please provide a SEQUENTIAL and COMPREHENSIVE summary...",
 *     maxTokens: 65536,
 *     addSystemPrompt: true
 *   }
 * }
 */
export function createCompactTransformation(config: TransformationConfig): Transformation {
  const instructionTemplate = config.config?.instructionTemplate || `IMPORTANT: You MUST use deterministic context and provide TOO MUCH context rather than too little. It is ALWAYS better to include excessive detail to ensure nothing is forgotten.

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

  const maxTokens = config.config?.maxTokens || 65536;
  const addSystemPrompt = config.config?.addSystemPrompt !== false;

  return {
    type: "compact",
    description: "Transform message for conversation compacting/summarization",
    config: config.config,
    apply: async (req: FastifyRequest, context: RouteContext): Promise<void> => {
      const body = req.body as any;

      // Extract command arguments if present
      const lastMessage = body.messages?.[body.messages.length - 1];
      let compactArgs = '';

      if (lastMessage) {
        let content = '';
        if (typeof lastMessage.content === 'string') {
          content = lastMessage.content;
        } else if (Array.isArray(lastMessage.content)) {
          const textContent = lastMessage.content.find((item: any) => item.type === 'text');
          if (textContent) {
            content = textContent.text || '';
          }
        }

        const argsMatch = content.match(/<command-args>([^<]*)<\/command-args>/);
        if (argsMatch) {
          compactArgs = argsMatch[1];
        }
      }

      // Build compact instruction
      const compactInstruction = instructionTemplate + (compactArgs ? `\n\n${compactArgs}` : '');

      // Add system prompt for compact operation
      if (addSystemPrompt) {
        if (!body.system) {
          body.system = [];
        }
        if (typeof body.system === "string") {
          body.system = [{ type: "text", text: body.system }];
        }

        body.system.push({
          type: 'text',
          text: 'You are a conversation summarizer that MUST provide EXCESSIVE detail and context. NEVER be concise. Always include TOO MUCH information rather than too little. Process everything SEQUENTIALLY and maintain DETERMINISTIC CONTEXT. Include ALL technical details, code snippets, file paths, errors, solutions, and implementation specifics. It is CRITICAL that you preserve everything with excessive detail to ensure nothing is forgotten.',
          cache_control: { type: 'ephemeral' },
        });
      }

      // Replace the last message with the compact instruction
      if (body.messages && body.messages.length > 0) {
        body.messages[body.messages.length - 1] = {
          role: 'user',
          content: compactInstruction,
        };
      }

      // Set high max_tokens for comprehensive output
      body.max_tokens = maxTokens;
    }
  };
}

/**
 * ThinkingTransformation - Configures thinking/reasoning parameters
 *
 * Configuration:
 * {
 *   type: "thinking",
 *   config: {
 *     reasoning_effort: "high" | "medium" | "low",
 *     verbosity: 0 | 1 | 2,
 *     reasoning: true
 *   }
 * }
 */
export function createThinkingTransformation(config: TransformationConfig): Transformation {
  const reasoningEffort = config.config?.reasoning_effort || "high";
  const verbosity = config.config?.verbosity ?? 2;
  const reasoning = config.config?.reasoning !== false;

  return {
    type: "thinking",
    description: "Configure thinking/reasoning parameters",
    config: config.config,
    apply: async (req: FastifyRequest, context: RouteContext): Promise<void> => {
      const body = req.body as any;

      if (reasoning) {
        body.reasoning = true;
      }

      if (reasoningEffort) {
        body.reasoning_effort = reasoningEffort;
      }

      if (verbosity !== undefined) {
        body.verbosity = verbosity;
      }
    }
  };
}

/**
 * CleanupTransformation - Removes specific fields from the request
 *
 * Configuration:
 * {
 *   type: "cleanup",
 *   config: {
 *     fields: ["cache_control", "thinking", "metadata"]
 *   }
 * }
 */
export function createCleanupTransformation(config: TransformationConfig): Transformation {
  const fields = config.config?.fields || [];

  return {
    type: "cleanup",
    description: `Remove fields: ${fields.join(", ")}`,
    config: config.config,
    apply: async (req: FastifyRequest, context: RouteContext): Promise<void> => {
      const body = req.body as any;

      for (const field of fields) {
        delete body[field];
      }

      // Also clean fields from system prompts if requested
      if (fields.includes("cache_control") && body.system && Array.isArray(body.system)) {
        for (const systemBlock of body.system) {
          delete systemBlock.cache_control;
        }
      }
    }
  };
}

/**
 * ModelOverrideTransformation - Overrides the model in the request
 *
 * Configuration:
 * {
 *   type: "model_override",
 *   config: {
 *     model: "provider,model-name"
 *   }
 * }
 */
export function createModelOverrideTransformation(config: TransformationConfig): Transformation {
  const model = config.config?.model || "";

  return {
    type: "model_override",
    description: `Override model to: ${model}`,
    config: config.config,
    apply: async (req: FastifyRequest, context: RouteContext): Promise<void> => {
      const body = req.body as any;
      body.model = model;
    }
  };
}

/**
 * Register all built-in transformations to a registry
 */
export function registerBuiltInTransformations(registry: any): void {
  registry.register("message", createMessageTransformation);
  registry.register("system_prompt", createSystemPromptTransformation);
  registry.register("params", createParamsTransformation);
  registry.register("compact", createCompactTransformation);
  registry.register("thinking", createThinkingTransformation);
  registry.register("cleanup", createCleanupTransformation);
  registry.register("model_override", createModelOverrideTransformation);
}