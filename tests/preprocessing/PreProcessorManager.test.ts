import { PreProcessorManager } from "../../src/preprocessing/PreProcessorManager";
import { PreProcessor, ProcessResult } from "../../src/preprocessing/types";
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

/**
 * Helper to create a mock pre-processor
 */
function createMockProcessor(
  name: string,
  priority: number,
  options: {
    shouldProcess?: boolean;
    result?: Partial<ProcessResult>;
    throwError?: boolean;
    throwInShouldProcess?: boolean;
    enabled?: boolean;
    hasCleanup?: boolean;
    cleanupError?: boolean;
  } = {}
): PreProcessor {
  const {
    shouldProcess = true,
    result = { modified: true },
    throwError = false,
    throwInShouldProcess = false,
    enabled = true,
    hasCleanup = false,
    cleanupError = false,
  } = options;

  const processor: PreProcessor = {
    name,
    priority,
    enabled,
    description: `Mock processor ${name}`,

    shouldProcess: async (req, context) => {
      if (throwInShouldProcess) {
        throw new Error(`shouldProcess error in ${name}`);
      }
      return shouldProcess;
    },

    process: async (req, context) => {
      if (throwError) {
        throw new Error(`Process error in ${name}`);
      }
      return {
        modified: false,
        ...result,
      };
    },
  };

  if (hasCleanup) {
    processor.cleanup = async (req, context, error) => {
      if (cleanupError) {
        throw new Error(`Cleanup error in ${name}`);
      }
      // Track cleanup calls in metadata
      context.metadata[`${name}_cleanup`] = true;
      if (error) {
        context.metadata[`${name}_cleanup_error`] = error.message;
      }
    };
  }

  return processor;
}

describe("PreProcessorManager", () => {
  describe("Registration", () => {
    it("should register a pre-processor", () => {
      const manager = new PreProcessorManager();
      const processor = createMockProcessor("test", 100);

      manager.register(processor);

      expect(manager.get("test")).toBe(processor);
      expect(manager.getAll()).toHaveLength(1);
    });

    it("should unregister a pre-processor", () => {
      const manager = new PreProcessorManager();
      const processor = createMockProcessor("test", 100);

      manager.register(processor);
      const removed = manager.unregister("test");

      expect(removed).toBe(true);
      expect(manager.get("test")).toBeUndefined();
      expect(manager.getAll()).toHaveLength(0);
    });

    it("should return false when unregistering non-existent processor", () => {
      const manager = new PreProcessorManager();
      const removed = manager.unregister("nonexistent");

      expect(removed).toBe(false);
    });

    it("should enable/disable processors", () => {
      const manager = new PreProcessorManager();
      const processor = createMockProcessor("test", 100);

      manager.register(processor);
      manager.disable("test");

      expect(processor.enabled).toBe(false);

      manager.enable("test");
      expect(processor.enabled).toBe(true);
    });

    it("should clear all processors", () => {
      const manager = new PreProcessorManager();
      manager.register(createMockProcessor("test1", 100));
      manager.register(createMockProcessor("test2", 200));

      manager.clear();

      expect(manager.getAll()).toHaveLength(0);
    });
  });

  describe("Priority-based Execution", () => {
    it("should execute processors in priority order (highest first)", async () => {
      const manager = new PreProcessorManager();
      const executionOrder: string[] = [];

      const p1: PreProcessor = {
        name: "low-priority",
        priority: 100,
        shouldProcess: async () => true,
        process: async () => {
          executionOrder.push("low");
          return { modified: true };
        },
      };

      const p2: PreProcessor = {
        name: "high-priority",
        priority: 1000,
        shouldProcess: async () => true,
        process: async () => {
          executionOrder.push("high");
          return { modified: true };
        },
      };

      const p3: PreProcessor = {
        name: "medium-priority",
        priority: 500,
        shouldProcess: async () => true,
        process: async () => {
          executionOrder.push("medium");
          return { modified: true };
        },
      };

      manager.register(p1);
      manager.register(p2);
      manager.register(p3);

      const req = createMockRequest({});
      const context = createMockContext();

      await manager.process(req, context);

      // Should execute in order: high (1000), medium (500), low (100)
      expect(executionOrder).toEqual(["high", "medium", "low"]);
    });

    it("should skip disabled processors", async () => {
      const manager = new PreProcessorManager();
      const executionOrder: string[] = [];

      const p1: PreProcessor = {
        name: "enabled",
        priority: 100,
        shouldProcess: async () => true,
        process: async () => {
          executionOrder.push("enabled");
          return { modified: true };
        },
      };

      const p2: PreProcessor = {
        name: "disabled",
        priority: 200,
        enabled: false,
        shouldProcess: async () => true,
        process: async () => {
          executionOrder.push("disabled");
          return { modified: true };
        },
      };

      manager.register(p1);
      manager.register(p2);

      const req = createMockRequest({});
      const context = createMockContext();

      await manager.process(req, context);

      expect(executionOrder).toEqual(["enabled"]);
    });

    it("should skip processors where shouldProcess returns false", async () => {
      const manager = new PreProcessorManager();
      const executionOrder: string[] = [];

      const p1: PreProcessor = {
        name: "should-run",
        priority: 100,
        shouldProcess: async () => true,
        process: async () => {
          executionOrder.push("ran");
          return { modified: true };
        },
      };

      const p2: PreProcessor = {
        name: "should-not-run",
        priority: 200,
        shouldProcess: async () => false,
        process: async () => {
          executionOrder.push("skipped");
          return { modified: true };
        },
      };

      manager.register(p1);
      manager.register(p2);

      const req = createMockRequest({});
      const context = createMockContext();

      await manager.process(req, context);

      expect(executionOrder).toEqual(["ran"]);
    });
  });

  describe("Result Aggregation", () => {
    it("should aggregate results from all processors", async () => {
      const manager = new PreProcessorManager();

      manager.register(
        createMockProcessor("p1", 100, {
          result: {
            modified: true,
            metadata: { key1: "value1" },
          },
        })
      );

      manager.register(
        createMockProcessor("p2", 200, {
          result: {
            modified: true,
            metadata: { key2: "value2" },
          },
        })
      );

      const req = createMockRequest({});
      const context = createMockContext();

      const result = await manager.process(req, context);

      expect(result.modified).toBe(true);
      expect(result.results).toHaveLength(2);
      expect(result.results[0].processor).toBe("p2"); // Higher priority first
      expect(result.results[1].processor).toBe("p1");
    });

    it("should merge metadata into context", async () => {
      const manager = new PreProcessorManager();

      manager.register(
        createMockProcessor("p1", 100, {
          result: {
            modified: true,
            metadata: { key1: "value1" },
          },
        })
      );

      manager.register(
        createMockProcessor("p2", 200, {
          result: {
            modified: true,
            metadata: { key2: "value2" },
          },
        })
      );

      const req = createMockRequest({});
      const context = createMockContext();

      await manager.process(req, context);

      expect(context.metadata.key1).toBe("value1");
      expect(context.metadata.key2).toBe("value2");
    });

    it("should track route override from highest priority processor", async () => {
      const manager = new PreProcessorManager();

      manager.register(
        createMockProcessor("p1", 100, {
          result: {
            modified: true,
            routeOverride: "route-low",
          },
        })
      );

      manager.register(
        createMockProcessor("p2", 200, {
          result: {
            modified: true,
            routeOverride: "route-high",
          },
        })
      );

      const req = createMockRequest({});
      const context = createMockContext();

      const result = await manager.process(req, context);

      // Last override wins (p1 runs after p2)
      expect(result.routeOverride).toBe("route-low");
    });

    it("should track provider/model override", async () => {
      const manager = new PreProcessorManager();

      manager.register(
        createMockProcessor("p1", 100, {
          result: {
            modified: true,
            providerModelOverride: "provider,model",
          },
        })
      );

      const req = createMockRequest({});
      const context = createMockContext();

      const result = await manager.process(req, context);

      expect(result.providerModelOverride).toBe("provider,model");
    });
  });

  describe("Blocking Behavior", () => {
    it("should stop processing when a processor blocks", async () => {
      const manager = new PreProcessorManager();
      const executionOrder: string[] = [];

      const p1: PreProcessor = {
        name: "after-block",
        priority: 100,
        shouldProcess: async () => true,
        process: async () => {
          executionOrder.push("after");
          return { modified: true };
        },
      };

      const p2: PreProcessor = {
        name: "blocking",
        priority: 500,
        shouldProcess: async () => true,
        process: async () => {
          executionOrder.push("blocking");
          return {
            modified: true,
            block: true,
            blockResponse: { error: "Blocked" },
            message: "Request blocked",
          };
        },
      };

      const p3: PreProcessor = {
        name: "before-block",
        priority: 1000,
        shouldProcess: async () => true,
        process: async () => {
          executionOrder.push("before");
          return { modified: true };
        },
      };

      manager.register(p1);
      manager.register(p2);
      manager.register(p3);

      const req = createMockRequest({});
      const context = createMockContext();

      const result = await manager.process(req, context);

      // Should stop after blocking processor
      expect(executionOrder).toEqual(["before", "blocking"]);
      expect(result.blocked).toBe(true);
      expect(result.blockResponse).toEqual({ error: "Blocked" });
      expect(result.blockMessage).toBe("Request blocked");
      expect(result.blockProcessor).toBe("blocking");
    });
  });

  describe("Error Handling", () => {
    it("should continue processing after processor error", async () => {
      const manager = new PreProcessorManager();
      const executionOrder: string[] = [];

      const p1: PreProcessor = {
        name: "p1",
        priority: 100,
        shouldProcess: async () => true,
        process: async () => {
          executionOrder.push("p1");
          return { modified: true };
        },
      };

      const p2: PreProcessor = {
        name: "error",
        priority: 200,
        shouldProcess: async () => true,
        process: async () => {
          throw new Error("Process error");
        },
      };

      const p3: PreProcessor = {
        name: "p3",
        priority: 300,
        shouldProcess: async () => true,
        process: async () => {
          executionOrder.push("p3");
          return { modified: true };
        },
      };

      manager.register(p1);
      manager.register(p2);
      manager.register(p3);

      const req = createMockRequest({});
      const context = createMockContext();

      const result = await manager.process(req, context);

      // Should continue after error
      expect(executionOrder).toEqual(["p3", "p1"]);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].processor).toBe("error");
      expect(result.errors[0].phase).toBe("process");
    });

    it("should track shouldProcess errors", async () => {
      const manager = new PreProcessorManager();

      manager.register(
        createMockProcessor("error", 100, {
          throwInShouldProcess: true,
        })
      );

      const req = createMockRequest({});
      const context = createMockContext();

      const result = await manager.process(req, context);

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].processor).toBe("error");
      expect(result.errors[0].phase).toBe("shouldProcess");
    });

    it("should track cleanup errors", async () => {
      const manager = new PreProcessorManager();

      manager.register(
        createMockProcessor("cleanup-error", 100, {
          hasCleanup: true,
          cleanupError: true,
        })
      );

      const req = createMockRequest({});
      const context = createMockContext();

      const result = await manager.process(req, context);

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].processor).toBe("cleanup-error");
      expect(result.errors[0].phase).toBe("cleanup");
    });
  });

  describe("Cleanup Lifecycle", () => {
    it("should call cleanup for executed processors", async () => {
      const manager = new PreProcessorManager();

      manager.register(
        createMockProcessor("p1", 100, {
          hasCleanup: true,
        })
      );

      manager.register(
        createMockProcessor("p2", 200, {
          hasCleanup: true,
        })
      );

      const req = createMockRequest({});
      const context = createMockContext();

      await manager.process(req, context);

      expect(context.metadata.p1_cleanup).toBe(true);
      expect(context.metadata.p2_cleanup).toBe(true);
    });

    it("should call cleanup in reverse order", async () => {
      const manager = new PreProcessorManager();
      const cleanupOrder: string[] = [];

      const p1: PreProcessor = {
        name: "p1",
        priority: 100,
        shouldProcess: async () => true,
        process: async () => ({ modified: false }),
        cleanup: async () => {
          cleanupOrder.push("p1");
        },
      };

      const p2: PreProcessor = {
        name: "p2",
        priority: 200,
        shouldProcess: async () => true,
        process: async () => ({ modified: false }),
        cleanup: async () => {
          cleanupOrder.push("p2");
        },
      };

      manager.register(p1);
      manager.register(p2);

      const req = createMockRequest({});
      const context = createMockContext();

      await manager.process(req, context);

      // Cleanup should be in reverse order: p1, p2 (p2 executed first)
      expect(cleanupOrder).toEqual(["p1", "p2"]);
    });

    it("should pass error to cleanup when processor throws", async () => {
      const manager = new PreProcessorManager();

      manager.register(
        createMockProcessor("error", 100, {
          throwError: true,
          hasCleanup: true,
        })
      );

      const req = createMockRequest({});
      const context = createMockContext();

      await manager.process(req, context);

      expect(context.metadata.error_cleanup).toBe(true);
      expect(context.metadata.error_cleanup_error).toBe("Process error in error");
    });

    it("should call cleanup even when blocking", async () => {
      const manager = new PreProcessorManager();

      manager.register(
        createMockProcessor("after", 100, {
          hasCleanup: true,
        })
      );

      manager.register(
        createMockProcessor("blocking", 200, {
          result: { block: true },
          hasCleanup: true,
        })
      );

      manager.register(
        createMockProcessor("before", 300, {
          hasCleanup: true,
        })
      );

      const req = createMockRequest({});
      const context = createMockContext();

      await manager.process(req, context);

      // Should cleanup processors that ran
      expect(context.metadata.before_cleanup).toBe(true);
      expect(context.metadata.blocking_cleanup).toBe(true);
      // Should not cleanup processors that didn't run
      expect(context.metadata.after_cleanup).toBeUndefined();
    });
  });

  describe("Statistics", () => {
    it("should return correct statistics", () => {
      const manager = new PreProcessorManager();

      manager.register(createMockProcessor("p1", 100, { enabled: true }));
      manager.register(createMockProcessor("p2", 200, { enabled: false }));
      manager.register(createMockProcessor("p3", 300, { enabled: true }));

      const stats = manager.getStats();

      expect(stats.total).toBe(3);
      expect(stats.enabled).toBe(2);
      expect(stats.disabled).toBe(1);
      expect(stats.processors).toHaveLength(3);
      expect(stats.processors[0].name).toBe("p1");
    });
  });
});