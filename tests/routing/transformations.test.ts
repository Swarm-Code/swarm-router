import {
  createMessageTransformation,
  createSystemPromptTransformation,
  createParamsTransformation,
  createCompactTransformation,
  createThinkingTransformation,
  createCleanupTransformation,
  createModelOverrideTransformation,
} from "../../src/routing/transformations";
import { RouteContext } from "../../src/routing/types";

/**
 * Helper to create a mock Fastify request
 */
function createMockRequest(body: any): any {
  return {
    body,
    headers: {},
    url: "/v1/messages",
    method: "POST",
  };
}

/**
 * Helper to create a basic route context
 */
function createMockContext(overrides?: Partial<RouteContext>): RouteContext {
  return {
    tokenCount: 0,
    metadata: {},
    config: {},
    startTime: Date.now(),
    ...overrides,
  };
}

describe("Route Transformations", () => {
  describe("MessageTransformation", () => {
    it("should replace last message content", async () => {
      const transformation = createMessageTransformation({
        type: "message",
        config: {
          operation: "replace",
          content: "New message content",
          targetIndex: -1,
        },
      });

      const req = createMockRequest({
        messages: [
          { role: "user", content: "Old message" },
          { role: "assistant", content: "Response" },
          { role: "user", content: "Another message" },
        ],
      });
      const context = createMockContext();

      await transformation.apply(req, context);

      expect(req.body.messages[2].content).toBe("New message content");
    });

    it("should append to message content (string)", async () => {
      const transformation = createMessageTransformation({
        type: "message",
        config: {
          operation: "append",
          content: "Additional text",
          targetIndex: 0,
        },
      });

      const req = createMockRequest({
        messages: [{ role: "user", content: "Original text" }],
      });
      const context = createMockContext();

      await transformation.apply(req, context);

      expect(req.body.messages[0].content).toBe("Original text\n\nAdditional text");
    });

    it("should append to message content (array)", async () => {
      const transformation = createMessageTransformation({
        type: "message",
        config: {
          operation: "append",
          content: "Additional text",
          targetIndex: 0,
        },
      });

      const req = createMockRequest({
        messages: [
          {
            role: "user",
            content: [{ type: "text", text: "Original text" }],
          },
        ],
      });
      const context = createMockContext();

      await transformation.apply(req, context);

      expect(req.body.messages[0].content).toHaveLength(2);
      expect(req.body.messages[0].content[1]).toEqual({
        type: "text",
        text: "Additional text",
      });
    });

    it("should prepend to message content", async () => {
      const transformation = createMessageTransformation({
        type: "message",
        config: {
          operation: "prepend",
          content: "Prefix text",
          targetIndex: 0,
        },
      });

      const req = createMockRequest({
        messages: [{ role: "user", content: "Original text" }],
      });
      const context = createMockContext();

      await transformation.apply(req, context);

      expect(req.body.messages[0].content).toBe("Prefix text\n\nOriginal text");
    });
  });

  describe("SystemPromptTransformation", () => {
    it("should add system prompt to empty system", async () => {
      const transformation = createSystemPromptTransformation({
        type: "system_prompt",
        config: {
          operation: "add",
          text: "System prompt text",
        },
      });

      const req = createMockRequest({ messages: [] });
      const context = createMockContext();

      await transformation.apply(req, context);

      expect(req.body.system).toHaveLength(1);
      expect(req.body.system[0]).toEqual({
        type: "text",
        text: "System prompt text",
      });
    });

    it("should append system prompt", async () => {
      const transformation = createSystemPromptTransformation({
        type: "system_prompt",
        config: {
          operation: "append",
          text: "Additional system prompt",
        },
      });

      const req = createMockRequest({
        system: [{ type: "text", text: "Existing prompt" }],
      });
      const context = createMockContext();

      await transformation.apply(req, context);

      expect(req.body.system).toHaveLength(2);
      expect(req.body.system[1].text).toBe("Additional system prompt");
    });

    it("should prepend system prompt", async () => {
      const transformation = createSystemPromptTransformation({
        type: "system_prompt",
        config: {
          operation: "prepend",
          text: "Priority prompt",
        },
      });

      const req = createMockRequest({
        system: [{ type: "text", text: "Existing prompt" }],
      });
      const context = createMockContext();

      await transformation.apply(req, context);

      expect(req.body.system).toHaveLength(2);
      expect(req.body.system[0].text).toBe("Priority prompt");
    });

    it("should replace all system prompts", async () => {
      const transformation = createSystemPromptTransformation({
        type: "system_prompt",
        config: {
          operation: "replace",
          text: "New system prompt",
        },
      });

      const req = createMockRequest({
        system: [
          { type: "text", text: "Old prompt 1" },
          { type: "text", text: "Old prompt 2" },
        ],
      });
      const context = createMockContext();

      await transformation.apply(req, context);

      expect(req.body.system).toHaveLength(1);
      expect(req.body.system[0].text).toBe("New system prompt");
    });

    it("should add cache control when specified", async () => {
      const transformation = createSystemPromptTransformation({
        type: "system_prompt",
        config: {
          operation: "add",
          text: "Cacheable prompt",
          cacheControl: { type: "ephemeral" },
        },
      });

      const req = createMockRequest({ messages: [] });
      const context = createMockContext();

      await transformation.apply(req, context);

      expect(req.body.system[0].cache_control).toEqual({ type: "ephemeral" });
    });

    it("should convert string system to array", async () => {
      const transformation = createSystemPromptTransformation({
        type: "system_prompt",
        config: {
          operation: "append",
          text: "Additional prompt",
        },
      });

      const req = createMockRequest({
        system: "Existing string prompt",
      });
      const context = createMockContext();

      await transformation.apply(req, context);

      expect(Array.isArray(req.body.system)).toBe(true);
      expect(req.body.system).toHaveLength(2);
    });
  });

  describe("ParamsTransformation", () => {
    it("should set request parameters", async () => {
      const transformation = createParamsTransformation({
        type: "params",
        config: {
          max_tokens: 65536,
          temperature: 0.7,
          top_p: 0.9,
        },
      });

      const req = createMockRequest({ model: "claude-3-5-sonnet" });
      const context = createMockContext();

      await transformation.apply(req, context);

      expect(req.body.max_tokens).toBe(65536);
      expect(req.body.temperature).toBe(0.7);
      expect(req.body.top_p).toBe(0.9);
    });

    it("should override existing parameters", async () => {
      const transformation = createParamsTransformation({
        type: "params",
        config: {
          max_tokens: 4096,
        },
      });

      const req = createMockRequest({
        model: "claude-3-5-sonnet",
        max_tokens: 2048,
      });
      const context = createMockContext();

      await transformation.apply(req, context);

      expect(req.body.max_tokens).toBe(4096);
    });
  });

  describe("CompactTransformation", () => {
    it("should transform message for compacting", async () => {
      const transformation = createCompactTransformation({
        type: "compact",
        config: {},
      });

      const req = createMockRequest({
        messages: [
          { role: "user", content: "Message 1" },
          { role: "assistant", content: "Response 1" },
          { role: "user", content: "/compact Please summarize" },
        ],
      });
      const context = createMockContext();

      await transformation.apply(req, context);

      // Should replace last message with compact instruction
      expect(req.body.messages[2].content).toContain("SEQUENTIAL");
      expect(req.body.messages[2].content).toContain("COMPREHENSIVE");

      // Should add system prompt
      expect(req.body.system).toBeDefined();
      expect(req.body.system.length).toBeGreaterThan(0);
      expect(req.body.system[0].text).toContain("EXCESSIVE detail");

      // Should set high max_tokens
      expect(req.body.max_tokens).toBe(65536);
    });

    it("should extract command args from XML format", async () => {
      const transformation = createCompactTransformation({
        type: "compact",
        config: {},
      });

      const req = createMockRequest({
        messages: [
          {
            role: "user",
            content:
              "<command-name>/compact</command-name><command-args>Focus on code changes</command-args>",
          },
        ],
      });
      const context = createMockContext();

      await transformation.apply(req, context);

      expect(req.body.messages[0].content).toContain("Focus on code changes");
    });

    it("should allow custom instruction template", async () => {
      const customTemplate = "Please provide a brief summary.";
      const transformation = createCompactTransformation({
        type: "compact",
        config: {
          instructionTemplate: customTemplate,
        },
      });

      const req = createMockRequest({
        messages: [{ role: "user", content: "/compact" }],
      });
      const context = createMockContext();

      await transformation.apply(req, context);

      expect(req.body.messages[0].content).toContain(customTemplate);
    });

    it("should skip system prompt when addSystemPrompt is false", async () => {
      const transformation = createCompactTransformation({
        type: "compact",
        config: {
          addSystemPrompt: false,
        },
      });

      const req = createMockRequest({
        messages: [{ role: "user", content: "/compact" }],
      });
      const context = createMockContext();

      await transformation.apply(req, context);

      expect(req.body.system).toBeUndefined();
    });
  });

  describe("ThinkingTransformation", () => {
    it("should set thinking parameters", async () => {
      const transformation = createThinkingTransformation({
        type: "thinking",
        config: {
          reasoning_effort: "high",
          verbosity: 2,
          reasoning: true,
        },
      });

      const req = createMockRequest({ model: "claude-3-5-sonnet" });
      const context = createMockContext();

      await transformation.apply(req, context);

      expect(req.body.reasoning).toBe(true);
      expect(req.body.reasoning_effort).toBe("high");
      expect(req.body.verbosity).toBe(2);
    });

    it("should use default values", async () => {
      const transformation = createThinkingTransformation({
        type: "thinking",
        config: {},
      });

      const req = createMockRequest({ model: "claude-3-5-sonnet" });
      const context = createMockContext();

      await transformation.apply(req, context);

      expect(req.body.reasoning).toBe(true);
      expect(req.body.reasoning_effort).toBe("high");
      expect(req.body.verbosity).toBe(2);
    });
  });

  describe("CleanupTransformation", () => {
    it("should remove specified fields", async () => {
      const transformation = createCleanupTransformation({
        type: "cleanup",
        config: {
          fields: ["metadata", "custom_field"],
        },
      });

      const req = createMockRequest({
        model: "claude-3-5-sonnet",
        metadata: { user_id: "123" },
        custom_field: "value",
        max_tokens: 2048,
      });
      const context = createMockContext();

      await transformation.apply(req, context);

      expect(req.body.metadata).toBeUndefined();
      expect(req.body.custom_field).toBeUndefined();
      expect(req.body.max_tokens).toBe(2048); // Should not be removed
    });

    it("should remove cache_control from system prompts", async () => {
      const transformation = createCleanupTransformation({
        type: "cleanup",
        config: {
          fields: ["cache_control"],
        },
      });

      const req = createMockRequest({
        system: [
          { type: "text", text: "Prompt 1", cache_control: { type: "ephemeral" } },
          { type: "text", text: "Prompt 2", cache_control: { type: "ephemeral" } },
        ],
      });
      const context = createMockContext();

      await transformation.apply(req, context);

      expect(req.body.system[0].cache_control).toBeUndefined();
      expect(req.body.system[1].cache_control).toBeUndefined();
    });
  });

  describe("ModelOverrideTransformation", () => {
    it("should override the model", async () => {
      const transformation = createModelOverrideTransformation({
        type: "model_override",
        config: {
          model: "openrouter,anthropic/claude-3.5-sonnet",
        },
      });

      const req = createMockRequest({
        model: "claude-3-5-haiku",
      });
      const context = createMockContext();

      await transformation.apply(req, context);

      expect(req.body.model).toBe("openrouter,anthropic/claude-3.5-sonnet");
    });
  });
});