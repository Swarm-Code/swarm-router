/**
 * Pre-processor exports
 *
 * This module provides all built-in pre-processors and the PreProcessorManager.
 * Pre-processors run before routing to enrich context, detect patterns, and
 * transform requests.
 */

export { PreProcessorManager, AggregatedProcessResult, PreProcessorStats } from "./PreProcessorManager";
export { PreProcessor, ProcessResult } from "./types";
export { createCommandDetectorPreProcessor, CommandDetectorOptions } from "./command-detector";
export { createContextEnricherPreProcessor, ContextEnricherOptions } from "./context-enricher";
export { createCompactCommandPreProcessor, CompactCommandOptions } from "./command-compact";
export { createThinkCommandPreProcessor, ThinkCommandOptions } from "./command-think";

/**
 * Register all built-in pre-processors to a manager
 *
 * @param manager - The PreProcessorManager instance
 * @param config - Configuration object for pre-processors
 * @param options - Additional options (e.g., logsDir)
 */
export function registerBuiltInPreProcessors(
  manager: any,
  config: any,
  options: { logsDir?: string } = {}
): void {
  const { logsDir } = options;

  // Register in priority order (highest first)
  // 1000: Command detector (runs first to detect commands)
  manager.register(
    require("./command-detector").createCommandDetectorPreProcessor({
      priority: 1000,
    })
  );

  // 900: Context enricher (enriches with token counts, session info)
  manager.register(
    require("./context-enricher").createContextEnricherPreProcessor({
      priority: 900,
    })
  );

  // 800: Compact command handler (processes /compact commands)
  if (config?.Router?.compact) {
    manager.register(
      require("./command-compact").createCompactCommandPreProcessor({
        priority: 800,
        config,
        logsDir,
      })
    );
  }

  // 750: Think command handler (processes think/ultrathink keywords)
  if (config?.Router?.ultrathink) {
    manager.register(
      require("./command-think").createThinkCommandPreProcessor({
        priority: 750,
        config,
        logsDir,
      })
    );
  }
}