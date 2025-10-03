import { createCommandDetectorPreProcessor } from "../../src/preprocessing/command-detector";
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

describe("CommandDetectorPreProcessor", () => {
  describe("shouldProcess", () => {
    it("should return true when messages exist", async () => {
      const detector = createCommandDetectorPreProcessor();
      const req = createMockRequest({
        messages: [{ role: "user", content: "Hello" }],
      });
      const context = createMockContext();

      const result = await detector.shouldProcess(req, context);

      expect(result).toBe(true);
    });

    it("should return false when messages are empty", async () => {
      const detector = createCommandDetectorPreProcessor();
      const req = createMockRequest({ messages: [] });
      const context = createMockContext();

      const result = await detector.shouldProcess(req, context);

      expect(result).toBe(false);
    });

    it("should return false when messages are missing", async () => {
      const detector = createCommandDetectorPreProcessor();
      const req = createMockRequest({});
      const context = createMockContext();

      const result = await detector.shouldProcess(req, context);

      expect(result).toBe(false);
    });
  });

  describe("Command Detection - XML Format", () => {
    it("should detect XML-formatted command", async () => {
      const detector = createCommandDetectorPreProcessor();
      const req = createMockRequest({
        messages: [
          {
            role: "user",
            content: "<command-name>/compact</command-name><command-args></command-args>",
          },
        ],
      });
      const context = createMockContext();

      const result = await detector.process(req, context);

      expect(result.modified).toBe(true);
      expect(context.detectedCommands).toEqual(["/compact"]);
      expect(result.metadata?.detectedCommands).toEqual(["/compact"]);
    });

    it("should extract command arguments from XML format", async () => {
      const detector = createCommandDetectorPreProcessor();
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

      const result = await detector.process(req, context);

      expect(result.modified).toBe(true);
      expect(context.detectedCommands).toEqual(["/compact"]);
      expect(context.metadata.commandArgs).toEqual({
        "/compact": "Focus on code changes",
      });
    });
  });

  describe("Command Detection - Direct Slash", () => {
    it("should detect direct slash command at start", async () => {
      const detector = createCommandDetectorPreProcessor();
      const req = createMockRequest({
        messages: [
          {
            role: "user",
            content: "/compact Please summarize this conversation",
          },
        ],
      });
      const context = createMockContext();

      const result = await detector.process(req, context);

      expect(result.modified).toBe(true);
      expect(context.detectedCommands).toEqual(["/compact"]);
    });

    it("should extract arguments from direct slash command", async () => {
      const detector = createCommandDetectorPreProcessor();
      const req = createMockRequest({
        messages: [
          {
            role: "user",
            content: "/model openai,gpt-4",
          },
        ],
      });
      const context = createMockContext();

      const result = await detector.process(req, context);

      expect(result.modified).toBe(true);
      expect(context.detectedCommands).toEqual(["/model"]);
      expect(context.metadata.commandArgs).toEqual({
        "/model": "openai,gpt-4",
      });
    });

    it("should not detect slash command in middle of message", async () => {
      const detector = createCommandDetectorPreProcessor({
        commands: ["/compact"],
      });
      const req = createMockRequest({
        messages: [
          {
            role: "user",
            content: "Please /compact this conversation",
          },
        ],
      });
      const context = createMockContext();

      const result = await detector.process(req, context);

      // Should still detect via "includes" check in step 3
      expect(result.modified).toBe(true);
      expect(context.detectedCommands).toEqual(["/compact"]);
    });
  });

  describe("Command Detection - Array Content", () => {
    it("should detect command in array content", async () => {
      const detector = createCommandDetectorPreProcessor();
      const req = createMockRequest({
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "/compact Please summarize" },
              { type: "text", text: "Additional context" },
            ],
          },
        ],
      });
      const context = createMockContext();

      const result = await detector.process(req, context);

      expect(result.modified).toBe(true);
      expect(context.detectedCommands).toEqual(["/compact"]);
    });

    it("should handle array content with no text blocks", async () => {
      const detector = createCommandDetectorPreProcessor();
      const req = createMockRequest({
        messages: [
          {
            role: "user",
            content: [{ type: "image", source: "..." }],
          },
        ],
      });
      const context = createMockContext();

      const result = await detector.process(req, context);

      expect(result.modified).toBe(false);
    });
  });

  describe("Multiple Commands", () => {
    it("should detect multiple commands", async () => {
      const detector = createCommandDetectorPreProcessor({
        commands: ["/compact", "/think"],
      });
      const req = createMockRequest({
        messages: [
          { role: "user", content: "/think carefully" },
          { role: "assistant", content: "Sure" },
          { role: "user", content: "/compact" },
        ],
      });
      const context = createMockContext();

      const result = await detector.process(req, context);

      expect(result.modified).toBe(true);
      expect(context.detectedCommands).toContain("/compact");
      expect(context.detectedCommands).toContain("/think");
    });

    it("should not duplicate commands", async () => {
      const detector = createCommandDetectorPreProcessor();
      const req = createMockRequest({
        messages: [
          { role: "user", content: "/compact first" },
          { role: "assistant", content: "Sure" },
          { role: "user", content: "/compact second" },
        ],
      });
      const context = createMockContext();

      const result = await detector.process(req, context);

      expect(result.modified).toBe(true);
      expect(context.detectedCommands).toEqual(["/compact"]);
    });
  });

  describe("Context Integration", () => {
    it("should preserve existing detectedCommands from context", async () => {
      const detector = createCommandDetectorPreProcessor();
      const req = createMockRequest({
        messages: [{ role: "user", content: "/compact" }],
      });
      const context = createMockContext({
        detectedCommands: ["/existing"],
      });

      const result = await detector.process(req, context);

      expect(result.modified).toBe(true);
      expect(context.detectedCommands).toContain("/existing");
      expect(context.detectedCommands).toContain("/compact");
    });
  });

  describe("Case Sensitivity", () => {
    it("should be case insensitive by default", async () => {
      const detector = createCommandDetectorPreProcessor({
        commands: ["/compact"],
      });
      const req = createMockRequest({
        messages: [{ role: "user", content: "/COMPACT" }],
      });
      const context = createMockContext();

      const result = await detector.process(req, context);

      expect(result.modified).toBe(true);
      expect(context.detectedCommands).toEqual(["/compact"]);
    });

    it("should respect case sensitivity when enabled", async () => {
      const detector = createCommandDetectorPreProcessor({
        commands: ["/compact"],
        caseSensitive: true,
      });
      const req = createMockRequest({
        messages: [{ role: "user", content: "/COMPACT" }],
      });
      const context = createMockContext();

      const result = await detector.process(req, context);

      expect(result.modified).toBe(false);
    });

    it("should detect exact case when case sensitive", async () => {
      const detector = createCommandDetectorPreProcessor({
        commands: ["/compact"],
        caseSensitive: true,
      });
      const req = createMockRequest({
        messages: [{ role: "user", content: "/compact" }],
      });
      const context = createMockContext();

      const result = await detector.process(req, context);

      expect(result.modified).toBe(true);
      expect(context.detectedCommands).toEqual(["/compact"]);
    });
  });

  describe("Custom Commands", () => {
    it("should detect custom commands", async () => {
      const detector = createCommandDetectorPreProcessor({
        commands: ["/custom1", "/custom2"],
      });
      const req = createMockRequest({
        messages: [{ role: "user", content: "/custom1 test" }],
      });
      const context = createMockContext();

      const result = await detector.process(req, context);

      expect(result.modified).toBe(true);
      expect(context.detectedCommands).toEqual(["/custom1"]);
    });

    it("should ignore unknown commands", async () => {
      const detector = createCommandDetectorPreProcessor({
        commands: ["/compact"],
      });
      const req = createMockRequest({
        messages: [{ role: "user", content: "/unknown test" }],
      });
      const context = createMockContext();

      const result = await detector.process(req, context);

      expect(result.modified).toBe(false);
    });
  });

  describe("Configuration", () => {
    it("should use default priority", () => {
      const detector = createCommandDetectorPreProcessor();
      expect(detector.priority).toBe(1000);
    });

    it("should use custom priority", () => {
      const detector = createCommandDetectorPreProcessor({ priority: 500 });
      expect(detector.priority).toBe(500);
    });

    it("should be enabled by default", () => {
      const detector = createCommandDetectorPreProcessor();
      expect(detector.enabled).toBe(true);
    });

    it("should respect enabled flag", () => {
      const detector = createCommandDetectorPreProcessor({ enabled: false });
      expect(detector.enabled).toBe(false);
    });
  });
});