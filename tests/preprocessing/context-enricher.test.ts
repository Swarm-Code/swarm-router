import { createContextEnricherPreProcessor } from "../../src/preprocessing/context-enricher";
import { RouteContext } from "../../src/routing/types";
import { sessionUsageCache } from "../../src/utils/cache";

/**
 * Helper to create a mock Fastify request
 */
function createMockRequest(body: any, headers: any = {}): any {
  return {
    body,
    headers,
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

describe("ContextEnricherPreProcessor", () => {
  beforeEach(() => {
    // Clear cache before each test
    sessionUsageCache.clear();
  });

  describe("shouldProcess", () => {
    it("should always return true", async () => {
      const enricher = createContextEnricherPreProcessor();
      const req = createMockRequest({});
      const context = createMockContext();

      const result = await enricher.shouldProcess(req, context);

      expect(result).toBe(true);
    });
  });

  describe("Token Counting", () => {
    it("should calculate token count for string messages", async () => {
      const enricher = createContextEnricherPreProcessor();
      const req = createMockRequest({
        messages: [
          { role: "user", content: "Hello, how are you?" },
          { role: "assistant", content: "I'm doing well, thank you!" },
        ],
      });
      const context = createMockContext();

      const result = await enricher.process(req, context);

      expect(result.modified).toBe(true);
      expect(context.tokenCount).toBeGreaterThan(0);
      expect(result.metadata?.tokenCount).toBe(context.tokenCount);
    });

    it("should calculate token count for array messages", async () => {
      const enricher = createContextEnricherPreProcessor();
      const req = createMockRequest({
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "First part" },
              { type: "text", text: "Second part" },
            ],
          },
        ],
      });
      const context = createMockContext();

      const result = await enricher.process(req, context);

      expect(result.modified).toBe(true);
      expect(context.tokenCount).toBeGreaterThan(0);
    });

    it("should count system prompt tokens (string)", async () => {
      const enricher = createContextEnricherPreProcessor();
      const req = createMockRequest({
        messages: [{ role: "user", content: "Hello" }],
        system: "You are a helpful assistant",
      });
      const context = createMockContext();

      const result = await enricher.process(req, context);

      expect(result.modified).toBe(true);
      expect(context.tokenCount).toBeGreaterThan(0);
    });

    it("should count system prompt tokens (array)", async () => {
      const enricher = createContextEnricherPreProcessor();
      const req = createMockRequest({
        messages: [{ role: "user", content: "Hello" }],
        system: [
          { type: "text", text: "You are a helpful assistant" },
          { type: "text", text: "Be concise" },
        ],
      });
      const context = createMockContext();

      const result = await enricher.process(req, context);

      expect(result.modified).toBe(true);
      expect(context.tokenCount).toBeGreaterThan(0);
    });

    it("should count tool tokens", async () => {
      const enricher = createContextEnricherPreProcessor();
      const req = createMockRequest({
        messages: [{ role: "user", content: "Hello" }],
        tools: [
          {
            name: "get_weather",
            description: "Get the weather",
            input_schema: {
              type: "object",
              properties: {
                location: { type: "string" },
              },
            },
          },
        ],
      });
      const context = createMockContext();

      const result = await enricher.process(req, context);

      expect(result.modified).toBe(true);
      expect(context.tokenCount).toBeGreaterThan(0);
    });

    it("should count tool_use and tool_result content", async () => {
      const enricher = createContextEnricherPreProcessor();
      const req = createMockRequest({
        messages: [
          {
            role: "assistant",
            content: [
              {
                type: "tool_use",
                id: "1",
                name: "get_weather",
                input: { location: "San Francisco" },
              },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: "1",
                content: "It's sunny and 72°F",
              },
            ],
          },
        ],
      });
      const context = createMockContext();

      const result = await enricher.process(req, context);

      expect(result.modified).toBe(true);
      expect(context.tokenCount).toBeGreaterThan(0);
    });

    it("should handle empty messages", async () => {
      const enricher = createContextEnricherPreProcessor();
      const req = createMockRequest({ messages: [] });
      const context = createMockContext();

      const result = await enricher.process(req, context);

      expect(result.modified).toBe(true);
      expect(context.tokenCount).toBe(0);
    });
  });

  describe("Session Extraction", () => {
    it("should extract session ID from x-session-id header", async () => {
      const enricher = createContextEnricherPreProcessor();
      const req = createMockRequest(
        { messages: [{ role: "user", content: "Hello" }] },
        { "x-session-id": "session-123" }
      );
      const context = createMockContext();

      const result = await enricher.process(req, context);

      expect(result.modified).toBe(true);
      expect(context.sessionId).toBe("session-123");
      expect(result.metadata?.sessionId).toBe("session-123");
    });

    it("should extract session ID from x-claude-session-id header", async () => {
      const enricher = createContextEnricherPreProcessor();
      const req = createMockRequest(
        { messages: [{ role: "user", content: "Hello" }] },
        { "x-claude-session-id": "claude-session-456" }
      );
      const context = createMockContext();

      const result = await enricher.process(req, context);

      expect(result.modified).toBe(true);
      expect(context.sessionId).toBe("claude-session-456");
    });

    it("should not set sessionId when no header present", async () => {
      const enricher = createContextEnricherPreProcessor();
      const req = createMockRequest({ messages: [{ role: "user", content: "Hello" }] });
      const context = createMockContext();

      const result = await enricher.process(req, context);

      expect(result.modified).toBe(true);
      expect(context.sessionId).toBeUndefined();
      expect(result.metadata?.sessionId).toBeUndefined();
    });
  });

  describe("Last Usage Retrieval", () => {
    it("should retrieve last usage from cache", async () => {
      const enricher = createContextEnricherPreProcessor();

      // Set up cache
      const mockUsage = {
        input_tokens: 100,
        output_tokens: 50,
      };
      sessionUsageCache.set("session-123", mockUsage);

      const req = createMockRequest(
        { messages: [{ role: "user", content: "Hello" }] },
        { "x-session-id": "session-123" }
      );
      const context = createMockContext();

      const result = await enricher.process(req, context);

      expect(result.modified).toBe(true);
      expect(context.lastUsage).toEqual(mockUsage);
      expect(result.metadata?.lastUsage).toEqual(mockUsage);
    });

    it("should not set lastUsage when not in cache", async () => {
      const enricher = createContextEnricherPreProcessor();
      const req = createMockRequest(
        { messages: [{ role: "user", content: "Hello" }] },
        { "x-session-id": "nonexistent" }
      );
      const context = createMockContext();

      const result = await enricher.process(req, context);

      expect(result.modified).toBe(true);
      expect(context.lastUsage).toBeUndefined();
      expect(result.metadata?.lastUsage).toBeUndefined();
    });

    it("should not set lastUsage when no session ID", async () => {
      const enricher = createContextEnricherPreProcessor();
      const req = createMockRequest({ messages: [{ role: "user", content: "Hello" }] });
      const context = createMockContext();

      const result = await enricher.process(req, context);

      expect(result.modified).toBe(true);
      expect(context.lastUsage).toBeUndefined();
    });
  });

  describe("Model Info Extraction", () => {
    it("should extract requested model", async () => {
      const enricher = createContextEnricherPreProcessor();
      const req = createMockRequest({
        model: "claude-3-5-sonnet",
        messages: [{ role: "user", content: "Hello" }],
      });
      const context = createMockContext();

      const result = await enricher.process(req, context);

      expect(result.modified).toBe(true);
      expect(result.metadata?.requestedModel).toBe("claude-3-5-sonnet");
    });
  });

  describe("Tool Detection", () => {
    it("should detect presence of tools", async () => {
      const enricher = createContextEnricherPreProcessor();
      const req = createMockRequest({
        messages: [{ role: "user", content: "Hello" }],
        tools: [
          { name: "tool1", type: "function" },
          { name: "tool2", type: "function" },
        ],
      });
      const context = createMockContext();

      const result = await enricher.process(req, context);

      expect(result.modified).toBe(true);
      expect(result.metadata?.hasTools).toBe(true);
      expect(result.metadata?.toolCount).toBe(2);
      expect(result.metadata?.toolTypes).toEqual(["function", "function"]);
    });

    it("should not set tool flags when no tools", async () => {
      const enricher = createContextEnricherPreProcessor();
      const req = createMockRequest({
        messages: [{ role: "user", content: "Hello" }],
      });
      const context = createMockContext();

      const result = await enricher.process(req, context);

      expect(result.modified).toBe(true);
      expect(result.metadata?.hasTools).toBeUndefined();
    });
  });

  describe("Thinking/Reasoning Detection", () => {
    it("should detect thinking flag", async () => {
      const enricher = createContextEnricherPreProcessor();
      const req = createMockRequest({
        messages: [{ role: "user", content: "Hello" }],
        thinking: true,
      });
      const context = createMockContext();

      const result = await enricher.process(req, context);

      expect(result.modified).toBe(true);
      expect(result.metadata?.hasThinking).toBe(true);
      expect(result.metadata?.thinking).toBe(true);
    });

    it("should detect reasoning flag", async () => {
      const enricher = createContextEnricherPreProcessor();
      const req = createMockRequest({
        messages: [{ role: "user", content: "Hello" }],
        reasoning: true,
      });
      const context = createMockContext();

      const result = await enricher.process(req, context);

      expect(result.modified).toBe(true);
      expect(result.metadata?.hasThinking).toBe(true);
      expect(result.metadata?.reasoning).toBe(true);
    });

    it("should detect reasoning_effort", async () => {
      const enricher = createContextEnricherPreProcessor();
      const req = createMockRequest({
        messages: [{ role: "user", content: "Hello" }],
        reasoning_effort: "high",
      });
      const context = createMockContext();

      const result = await enricher.process(req, context);

      expect(result.modified).toBe(true);
      expect(result.metadata?.hasThinking).toBe(true);
      expect(result.metadata?.reasoningEffort).toBe("high");
    });
  });

  describe("Message Count", () => {
    it("should count messages", async () => {
      const enricher = createContextEnricherPreProcessor();
      const req = createMockRequest({
        messages: [
          { role: "user", content: "Hello" },
          { role: "assistant", content: "Hi" },
          { role: "user", content: "How are you?" },
        ],
      });
      const context = createMockContext();

      const result = await enricher.process(req, context);

      expect(result.modified).toBe(true);
      expect(result.metadata?.messageCount).toBe(3);
    });
  });

  describe("Configuration", () => {
    it("should use default priority", () => {
      const enricher = createContextEnricherPreProcessor();
      expect(enricher.priority).toBe(900);
    });

    it("should use custom priority", () => {
      const enricher = createContextEnricherPreProcessor({ priority: 500 });
      expect(enricher.priority).toBe(500);
    });

    it("should be enabled by default", () => {
      const enricher = createContextEnricherPreProcessor();
      expect(enricher.enabled).toBe(true);
    });

    it("should respect enabled flag", () => {
      const enricher = createContextEnricherPreProcessor({ enabled: false });
      expect(enricher.enabled).toBe(false);
    });
  });
});