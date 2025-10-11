import fastifyStatic from "@fastify/static";
import Server from "@musistudio/llms";
import { spawn } from "child_process";
import { readdirSync, statSync, readFileSync, writeFileSync, existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import packageJson from "../package.json";
import { readConfigFile, writeConfigFile, backupConfigFile } from "./utils";
import { checkForUpdates, performUpdate } from "./utils";

export const createServer = (config: any): Server => {
  const server = new Server(config);

  // Add comprehensive tracing to track the transformer pipeline
  server.app.addHook('preHandler', async (request, reply) => {
    if (request.url.startsWith('/v1/messages') || request.url.startsWith('/v1/chat/completions')) {
      console.log('[TRANSFORMER TRACE] === PRE-TRANSFORMATION ===');
      console.log('[TRANSFORMER TRACE] URL:', request.url);
      console.log('[TRANSFORMER TRACE] Request body keys:', Object.keys(request.body || {}));
      console.log('[TRANSFORMER TRACE] Model:', (request.body)?.model);
      console.log('[TRANSFORMER TRACE] reasoning_effort:', (request.body)?.reasoning_effort);
      console.log('[TRANSFORMER TRACE] verbosity:', (request.body)?.verbosity);
      console.log('[TRANSFORMER TRACE] reasoning:', (request.body)?.reasoning);
      console.log('[TRANSFORMER TRACE] temperature:', (request.body)?.temperature);
      console.log('[TRANSFORMER TRACE] max_tokens:', (request.body)?.max_tokens);
      console.log('[TRANSFORMER TRACE] max_completion_tokens:', (request.body)?.max_completion_tokens);
    }
  });

  server.app.addHook('onSend', async (request, reply, payload) => {
    if (request.url.startsWith('/v1/messages') || request.url.startsWith('/v1/chat/completions')) {
      console.log('[TRANSFORMER TRACE] === POST-TRANSFORMATION ===');
      console.log('[TRANSFORMER TRACE] Final request body keys:', Object.keys(request.body || {}));
      console.log('[TRANSFORMER TRACE] Final model:', (request.body)?.model);
      console.log('[TRANSFORMER TRACE] Final reasoning_effort:', (request.body)?.reasoning_effort);
      console.log('[TRANSFORMER TRACE] Final verbosity:', (request.body)?.verbosity);
      console.log('[TRANSFORMER TRACE] Final reasoning:', (request.body)?.reasoning);
      console.log('[TRANSFORMER TRACE] Final temperature:', (request.body)?.temperature);
      console.log('[TRANSFORMER TRACE] Final max_tokens:', (request.body)?.max_tokens);
      console.log('[TRANSFORMER TRACE] Final max_completion_tokens:', (request.body)?.max_completion_tokens);

      // CRITICAL: Trace the actual JSON that gets serialized
      console.log('[HTTP TRACE] === ACTUAL REQUEST JSON SENT TO API ===');
      const bodyClone = { ...(request.body || {}) };
      console.log('[HTTP TRACE] JSON.stringify preview:', `${JSON.stringify(bodyClone).substring(0, 200)  }...`);
      console.log('[HTTP TRACE] Has reasoning property:', 'reasoning' in bodyClone);
      console.log('[HTTP TRACE] Has reasoning_effort property:', 'reasoning_effort' in bodyClone);
      console.log('[HTTP TRACE] Has verbosity property:', 'verbosity' in bodyClone);

      // Check for any properties with 'reason' in the name
      const reasoningProps = Object.keys(bodyClone).filter((key) => key.toLowerCase().includes('reason'));
      console.log('[HTTP TRACE] All reasoning-related properties:', reasoningProps);
      reasoningProps.forEach((prop) => {
        console.log(`[HTTP TRACE] ${prop}:`, bodyClone[prop]);
      });

      console.log('[TRANSFORMER TRACE] Response status:', reply.statusCode);
      if (reply.statusCode >= 400) {
        console.log('[TRANSFORMER TRACE] Error payload:', typeof payload === 'string' ? payload.substring(0, 500) : 'non-string payload');
      }
      console.log('='.repeat(100));
    }
  });

  // Add endpoint to read config.json with access control
  server.app.get("/api/config", async (req, reply) => await readConfigFile());

  server.app.get("/api/transformers", async () => {
    const transformers =
      server.app._server!.transformerService.getAllTransformers();
    const transformerList = Array.from(transformers.entries()).map(
      ([name, transformer]: any) => ({
        name,
        endpoint: transformer.endPoint || null,
      })
    );
    return { transformers: transformerList };
  });

  // Add endpoint to save config.json with access control
  server.app.post("/api/config", async (req, reply) => {
    const newConfig = req.body;

    // Backup existing config file if it exists
    const backupPath = await backupConfigFile();
    if (backupPath) {
      console.log(`Backed up existing configuration file to ${backupPath}`);
    }

    await writeConfigFile(newConfig);
    return { success: true, message: "Config saved successfully" };
  });

  // SDK Routes API - Get all routes
  server.app.get("/api/sdk/routes", async (req, reply) => {
    try {
      const { loadRoutesConfig, DEFAULT_ROUTES_PATH, PROJECT_ROUTES_PATH } = await import("./routing/loader");
      const routesConfig = await loadRoutesConfig(PROJECT_ROUTES_PATH);
      return routesConfig;
    } catch (error: any) {
      reply.status(500).send({ error: `Failed to load routes: ${error.message}` });
    }
  });

  // SDK Routes API - Save routes
  server.app.post("/api/sdk/routes", async (req, reply) => {
    try {
      const { saveRoutesConfig, PROJECT_ROUTES_PATH } = await import("./routing/loader");
      const routesConfig = req.body;

      // Validate basic structure
      if (!routesConfig.routes || !Array.isArray(routesConfig.routes)) {
        reply.status(400).send({ error: "Invalid routes config: 'routes' array is required" });
        return;
      }

      await saveRoutesConfig(routesConfig, PROJECT_ROUTES_PATH);
      return { success: true, message: "Routes saved successfully" };
    } catch (error: any) {
      reply.status(500).send({ error: `Failed to save routes: ${error.message}` });
    }
  });

  // SDK Routes API - Get single route by ID
  server.app.get("/api/sdk/routes/:id", async (req, reply) => {
    try {
      const { loadRoutesConfig, PROJECT_ROUTES_PATH } = await import("./routing/loader");
      const routesConfig = await loadRoutesConfig(PROJECT_ROUTES_PATH);
      const routeId = (req.params as any).id;
      const route = routesConfig.routes.find((r) => r.id === routeId);

      if (!route) {
        reply.status(404).send({ error: `Route not found: ${routeId}` });
        return;
      }

      return route;
    } catch (error: any) {
      reply.status(500).send({ error: `Failed to load route: ${error.message}` });
    }
  });

  // SDK Routes API - Update single route
  server.app.put("/api/sdk/routes/:id", async (req, reply) => {
    try {
      const { loadRoutesConfig, saveRoutesConfig, PROJECT_ROUTES_PATH } = await import("./routing/loader");
      const routesConfig = await loadRoutesConfig(PROJECT_ROUTES_PATH);
      const routeId = (req.params as any).id;
      const updatedRoute = req.body;

      const routeIndex = routesConfig.routes.findIndex((r) => r.id === routeId);
      if (routeIndex === -1) {
        reply.status(404).send({ error: `Route not found: ${routeId}` });
        return;
      }

      routesConfig.routes[routeIndex] = { ...routesConfig.routes[routeIndex], ...updatedRoute };
      await saveRoutesConfig(routesConfig, PROJECT_ROUTES_PATH);

      return { success: true, message: "Route updated successfully", route: routesConfig.routes[routeIndex] };
    } catch (error: any) {
      reply.status(500).send({ error: `Failed to update route: ${error.message}` });
    }
  });

  // SDK Routes API - Delete route
  server.app.delete("/api/sdk/routes/:id", async (req, reply) => {
    try {
      const { loadRoutesConfig, saveRoutesConfig, PROJECT_ROUTES_PATH } = await import("./routing/loader");
      const routesConfig = await loadRoutesConfig(PROJECT_ROUTES_PATH);
      const routeId = (req.params as any).id;

      const routeIndex = routesConfig.routes.findIndex((r) => r.id === routeId);
      if (routeIndex === -1) {
        reply.status(404).send({ error: `Route not found: ${routeId}` });
        return;
      }

      routesConfig.routes.splice(routeIndex, 1);
      await saveRoutesConfig(routesConfig, PROJECT_ROUTES_PATH);

      return { success: true, message: "Route deleted successfully" };
    } catch (error: any) {
      reply.status(500).send({ error: `Failed to delete route: ${error.message}` });
    }
  });

  // Add endpoint to restart the service with access control
  server.app.post("/api/restart", async (req, reply) => {
    reply.send({ success: true, message: "Service restart initiated" });

    // Restart the service after a short delay to allow response to be sent
    setTimeout(() => {
      spawn(process.execPath, [process.argv[1], "restart"], {
        detached: true,
        stdio: "ignore",
      });
    }, 1000);
  });

  // Register static file serving with caching
  server.app.register(fastifyStatic, {
    root: join(__dirname, "..", "dist"),
    prefix: "/ui/",
    maxAge: "1h",
  });

  // Redirect /ui to /ui/ for proper static file serving
  server.app.get("/ui", async (_, reply) => reply.redirect("/ui/"));

  // 版本检查端点
  server.app.get("/api/update/check", async (req, reply) => {
    try {
      // 获取当前版本
      const currentVersion = packageJson.version;
      const { hasUpdate, latestVersion, changelog } = await checkForUpdates(currentVersion);

      return {
        hasUpdate,
        latestVersion: hasUpdate ? latestVersion : undefined,
        changelog: hasUpdate ? changelog : undefined,
      };
    } catch (error) {
      console.error("Failed to check for updates:", error);
      reply.status(500).send({ error: "Failed to check for updates" });
    }
  });

  // 执行更新端点
  server.app.post("/api/update/perform", async (req, reply) => {
    try {
      // 只允许完全访问权限的用户执行更新
      const accessLevel = (req).accessLevel || "restricted";
      if (accessLevel !== "full") {
        reply.status(403).send("Full access required to perform updates");
        return;
      }

      // 执行更新逻辑
      const result = await performUpdate();

      return result;
    } catch (error) {
      console.error("Failed to perform update:", error);
      reply.status(500).send({ error: "Failed to perform update" });
    }
  });

  // 获取日志文件列表端点
  server.app.get("/api/logs/files", async (req, reply) => {
    try {
      const logDir = join(homedir(), ".claude-code-router", "logs");
      const logFiles: Array<{ name: string; path: string; size: number; lastModified: string }> = [];

      if (existsSync(logDir)) {
        const files = readdirSync(logDir);

        for (const file of files) {
          if (file.endsWith('.log')) {
            const filePath = join(logDir, file);
            const stats = statSync(filePath);

            logFiles.push({
              name: file,
              path: filePath,
              size: stats.size,
              lastModified: stats.mtime.toISOString(),
            });
          }
        }

        // 按修改时间倒序排列
        logFiles.sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime());
      }

      return logFiles;
    } catch (error) {
      console.error("Failed to get log files:", error);
      reply.status(500).send({ error: "Failed to get log files" });
    }
  });

  // 获取日志内容端点 - returns structured, parsed log entries
  server.app.get("/api/logs", async (req, reply) => {
    try {
      const filePath = (req.query).file as string;
      const limit = parseInt((req.query).limit as string) || 500;
      let logFilePath: string;

      if (filePath) {
        // 如果指定了文件路径，使用指定的路径
        logFilePath = filePath;
      } else {
        // 如果没有指定文件路径，使用默认的日志文件路径
        logFilePath = join(homedir(), ".claude-code-router", "logs", "app.log");
      }

      if (!existsSync(logFilePath)) {
        return [];
      }

      const logContent = readFileSync(logFilePath, 'utf8');
      const logLines = logContent.split('\n').filter((line) => line.trim());

      // Parse logs into structured format
      const parsedLogs = logLines
        .map((line) => {
          try {
            // Try parsing as Pino JSON log
            const json = JSON.parse(line);

            // Map Pino log levels to human-readable strings
            // Pino levels: 10=trace, 20=debug, 30=info, 40=warn, 50=error, 60=fatal
            const levelMap: Record<number, string> = {
              10: 'debug',
              20: 'debug',
              30: 'info',
              40: 'warn',
              50: 'error',
              60: 'error'
            };

            return {
              timestamp: json.time ? new Date(json.time).toISOString() : new Date().toISOString(),
              level: levelMap[json.level] || 'info',
              session: json.sessionId || json.session || json.reqId || 'system',
              message: json.msg || json.message || line,
              raw: line
            };
          } catch {
            // Not JSON, try to parse plain text logs
            const timestampMatch = line.match(/^\[?(\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}[^\]]*)\]?/);
            const levelMatch = line.match(/\[(INFO|WARN|ERROR|DEBUG)\]/i);
            const sessionMatch = line.match(/\[session[:-]([^\]]+)\]/i) || line.match(/\[([a-f0-9-]{8,36})\]/);

            return {
              timestamp: timestampMatch ? timestampMatch[1] : new Date().toISOString(),
              level: (levelMatch ? levelMatch[1].toLowerCase() : 'info'),
              session: sessionMatch ? sessionMatch[1] : 'system',
              message: line.replace(/^\[.*?\]\s*/, '').replace(/\[.*?\]\s*/g, '').trim() || line,
              raw: line
            };
          }
        })
        .slice(-limit); // Return last N logs

      return parsedLogs;
    } catch (error) {
      console.error("Failed to get logs:", error);
      reply.status(500).send({ error: "Failed to get logs" });
    }
  });

  // 清除日志内容端点
  server.app.delete("/api/logs", async (req, reply) => {
    try {
      const filePath = (req.query).file as string;
      let logFilePath: string;

      if (filePath) {
        // 如果指定了文件路径，使用指定的路径
        logFilePath = filePath;
      } else {
        // 如果没有指定文件路径，使用默认的日志文件路径
        logFilePath = join(homedir(), ".claude-code-router", "logs", "app.log");
      }

      if (existsSync(logFilePath)) {
        writeFileSync(logFilePath, '', 'utf8');
      }

      return { success: true, message: "Logs cleared successfully" };
    } catch (error) {
      console.error("Failed to clear logs:", error);
      reply.status(500).send({ error: "Failed to clear logs" });
    }
  });

  return server;
};
