import {
  createCommandMatcher,
  createTokenCountMatcher,
  createMessagePatternMatcher,
  createModelMatcher,
  createToolMatcher,
  createThinkingMatcher,
  createAlwaysMatcher,
} from "../../src/routing/matchers";
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

describe("Route Matchers", () => {
  describe("CommandMatcher", () => {
    it("should match /compact command from context.detectedCommands", () => {
      const matcher = createCommandMatcher({
        type: "command",
        condition: { commands: ["/compact", "/model"] },
      });

      const req = createMockRequest({});
      const context = createMockContext({ detectedCommands: ["/compact"] });

      expect(matcher.evaluate(req, context)).toBe(true);
    });

    it("should match XML-formatted command in message", () => {
      const matcher = createCommandMatcher({
        type: "command",
        condition: { commands: ["/compact"] },
      });

      const req = createMockRequest({
        messages: [
          {
            role: "user",
            content: "<command-name>/compact</command-name><command-args></command-args>",
          },
        ],
      });
      const context = createMockContext();

      expect(matcher.evaluate(req, context)).toBe(true);
    });

    it("should match direct slash command at start of message", () => {
      const matcher = createCommandMatcher({
        type: "command",
        condition: { commands: ["/compact"] },
      });

      const req = createMockRequest({
        messages: [
          {
            role: "user",
            content: "/compact Please summarize this conversation",
          },
        ],
      });
      const context = createMockContext();

      expect(matcher.evaluate(req, context)).toBe(true);
    });

    it("should not match when command is not present", () => {
      const matcher = createCommandMatcher({
        type: "command",
        condition: { commands: ["/compact"] },
      });

      const req = createMockRequest({
        messages: [
          {
            role: "user",
            content: "Hello, please help me with this code",
          },
        ],
      });
      const context = createMockContext();

      expect(matcher.evaluate(req, context)).toBe(false);
    });

    it("should match when message content is array with text type", () => {
      const matcher = createCommandMatcher({
        type: "command",
        condition: { commands: ["/model"] },
      });

      const req = createMockRequest({
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "/model openai,gpt-4" },
              { type: "text", text: "Additional context" },
            ],
          },
        ],
      });
      const context = createMockContext();

      expect(matcher.evaluate(req, context)).toBe(true);
    });
  });

  describe("TokenCountMatcher", () => {
    it("should match when token count > threshold (gt)", () => {
      const matcher = createTokenCountMatcher({
        type: "token_count",
        condition: { threshold: 60000, operator: "gt" },
      });

      const req = createMockRequest({});
      const context = createMockContext({ tokenCount: 65000 });

      expect(matcher.evaluate(req, context)).toBe(true);
    });

    it("should not match when token count <= threshold (gt)", () => {
      const matcher = createTokenCountMatcher({
        type: "token_count",
        condition: { threshold: 60000, operator: "gt" },
      });

      const req = createMockRequest({});
      const context = createMockContext({ tokenCount: 50000 });

      expect(matcher.evaluate(req, context)).toBe(false);
    });

    it("should match with gte operator", () => {
      const matcher = createTokenCountMatcher({
        type: "token_count",
        condition: { threshold: 60000, operator: "gte" },
      });

      const req = createMockRequest({});
      const context = createMockContext({ tokenCount: 60000 });

      expect(matcher.evaluate(req, context)).toBe(true);
    });

    it("should match with lt operator", () => {
      const matcher = createTokenCountMatcher({
        type: "token_count",
        condition: { threshold: 60000, operator: "lt" },
      });

      const req = createMockRequest({});
      const context = createMockContext({ tokenCount: 50000 });

      expect(matcher.evaluate(req, context)).toBe(true);
    });

    it("should match with eq operator", () => {
      const matcher = createTokenCountMatcher({
        type: "token_count",
        condition: { threshold: 60000, operator: "eq" },
      });

      const req = createMockRequest({});
      const context = createMockContext({ tokenCount: 60000 });

      expect(matcher.evaluate(req, context)).toBe(true);
    });
  });

  describe("MessagePatternMatcher", () => {
    it("should match pattern in context.patterns with 'any' mode", () => {
      const matcher = createMessagePatternMatcher({
        type: "message_pattern",
        condition: { patterns: ["think", "reasoning"], matchMode: "any" },
      });

      const req = createMockRequest({});
      const context = createMockContext({ patterns: ["think", "code"] });

      expect(matcher.evaluate(req, context)).toBe(true);
    });

    it("should not match when no patterns match in 'all' mode", () => {
      const matcher = createMessagePatternMatcher({
        type: "message_pattern",
        condition: { patterns: ["think", "reasoning"], matchMode: "all" },
      });

      const req = createMockRequest({});
      const context = createMockContext({ patterns: ["think"] });

      expect(matcher.evaluate(req, context)).toBe(false);
    });

    it("should match pattern in message content (case insensitive)", () => {
      const matcher = createMessagePatternMatcher({
        type: "message_pattern",
        condition: { patterns: ["think"], caseSensitive: false },
      });

      const req = createMockRequest({
        messages: [
          {
            role: "user",
            content: "Please THINK carefully about this problem",
          },
        ],
      });
      const context = createMockContext();

      expect(matcher.evaluate(req, context)).toBe(true);
    });

    it("should respect case sensitivity", () => {
      const matcher = createMessagePatternMatcher({
        type: "message_pattern",
        condition: { patterns: ["Think"], caseSensitive: true },
      });

      const req = createMockRequest({
        messages: [
          {
            role: "user",
            content: "Please think carefully about this",
          },
        ],
      });
      const context = createMockContext();

      expect(matcher.evaluate(req, context)).toBe(false);
    });
  });

  describe("ModelMatcher", () => {
    it("should match exact model", () => {
      const matcher = createModelMatcher({
        type: "model",
        condition: { models: ["claude-3-5-haiku"], matchMode: "exact" },
      });

      const req = createMockRequest({ model: "claude-3-5-haiku" });
      const context = createMockContext();

      expect(matcher.evaluate(req, context)).toBe(true);
    });

    it("should match model prefix", () => {
      const matcher = createModelMatcher({
        type: "model",
        condition: { models: ["claude-3-5"], matchMode: "prefix" },
      });

      const req = createMockRequest({ model: "claude-3-5-haiku-20250101" });
      const context = createMockContext();

      expect(matcher.evaluate(req, context)).toBe(true);
    });

    it("should match model contains", () => {
      const matcher = createModelMatcher({
        type: "model",
        condition: { models: ["haiku"], matchMode: "contains" },
      });

      const req = createMockRequest({ model: "claude-3-5-haiku" });
      const context = createMockContext();

      expect(matcher.evaluate(req, context)).toBe(true);
    });

    it("should not match different model", () => {
      const matcher = createModelMatcher({
        type: "model",
        condition: { models: ["gpt-4"], matchMode: "exact" },
      });

      const req = createMockRequest({ model: "claude-3-5-sonnet" });
      const context = createMockContext();

      expect(matcher.evaluate(req, context)).toBe(false);
    });
  });

  describe("ToolMatcher", () => {
    it("should match tool type with 'any' mode", () => {
      const matcher = createToolMatcher({
        type: "tool",
        condition: { toolTypes: ["web_search"], matchMode: "any" },
      });

      const req = createMockRequest({
        tools: [
          { type: "web_search_google", name: "search_web" },
          { type: "file_read", name: "read_file" },
        ],
      });
      const context = createMockContext();

      expect(matcher.evaluate(req, context)).toBe(true);
    });

    it("should match tool name with 'any' mode", () => {
      const matcher = createToolMatcher({
        type: "tool",
        condition: { toolTypes: ["web_search"], matchMode: "any" },
      });

      const req = createMockRequest({
        tools: [{ type: "custom", name: "web_search_google" }],
      });
      const context = createMockContext();

      expect(matcher.evaluate(req, context)).toBe(true);
    });

    it("should match all required tools with 'all' mode", () => {
      const matcher = createToolMatcher({
        type: "tool",
        condition: { toolTypes: ["web_search", "file_read"], matchMode: "all" },
      });

      const req = createMockRequest({
        tools: [
          { type: "web_search_google" },
          { type: "file_read_tool" },
          { type: "other_tool" },
        ],
      });
      const context = createMockContext();

      expect(matcher.evaluate(req, context)).toBe(true);
    });

    it("should not match when tools are missing", () => {
      const matcher = createToolMatcher({
        type: "tool",
        condition: { toolTypes: ["web_search"], matchMode: "any" },
      });

      const req = createMockRequest({ tools: [] });
      const context = createMockContext();

      expect(matcher.evaluate(req, context)).toBe(false);
    });
  });

  describe("ThinkingMatcher", () => {
    it("should match when thinking is enabled", () => {
      const matcher = createThinkingMatcher({
        type: "thinking",
        condition: {},
      });

      const req = createMockRequest({ thinking: true });
      const context = createMockContext();

      expect(matcher.evaluate(req, context)).toBe(true);
    });

    it("should match when reasoning is enabled", () => {
      const matcher = createThinkingMatcher({
        type: "thinking",
        condition: {},
      });

      const req = createMockRequest({ reasoning: true });
      const context = createMockContext();

      expect(matcher.evaluate(req, context)).toBe(true);
    });

    it("should match when reasoning_effort is set", () => {
      const matcher = createThinkingMatcher({
        type: "thinking",
        condition: {},
      });

      const req = createMockRequest({ reasoning_effort: "high" });
      const context = createMockContext();

      expect(matcher.evaluate(req, context)).toBe(true);
    });

    it("should not match when no thinking flags are set", () => {
      const matcher = createThinkingMatcher({
        type: "thinking",
        condition: {},
      });

      const req = createMockRequest({ model: "claude-3-5-sonnet" });
      const context = createMockContext();

      expect(matcher.evaluate(req, context)).toBe(false);
    });
  });

  describe("AlwaysMatcher", () => {
    it("should always match", () => {
      const matcher = createAlwaysMatcher({
        type: "always",
        condition: {},
      });

      const req = createMockRequest({});
      const context = createMockContext();

      expect(matcher.evaluate(req, context)).toBe(true);
    });

    it("should match even with empty request", () => {
      const matcher = createAlwaysMatcher({
        type: "always",
        condition: {},
      });

      const req = createMockRequest({});
      const context = createMockContext();

      expect(matcher.evaluate(req, context)).toBe(true);
    });
  });
});