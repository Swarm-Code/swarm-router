import { existsSync } from "fs";
import { writeFile } from "fs/promises";
import JSON5 from "json5";
import { EventEmitter } from "node:events";
import { homedir } from "os";
import path, { join } from "path";
import { createStream } from 'rotating-file-stream';
import agentsManager from "./agents";
import { IAgent } from "./agents/type";
import { CONFIG_FILE } from "./constants";
import { HOME_DIR } from "./constants";
import { apiKeyAuth } from "./middleware/auth";
import { createServer } from "./server";
import { initConfig, initDir, cleanupLogFiles } from "./utils";

// DEEP HTTP TRACING: Intercept all fetch requests to OpenAI
const originalFetch = global.fetch;
global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

  if (url.includes('api.openai.com') || url.includes('openai')) {
    console.log('[DEEP HTTP TRACE] === INTERCEPTED OPENAI REQUEST ===');
    console.log('[DEEP HTTP TRACE] URL:', url);
    console.log('[DEEP HTTP TRACE] Method:', init?.method || 'GET');

    if (init?.body) {
      console.log('[DEEP HTTP TRACE] Raw body type:', typeof init.body);
      try {
        let bodyContent = '';
        if (typeof init.body === 'string') {
          bodyContent = init.body;
        } else if (init.body instanceof FormData) {
          bodyContent = '[FormData]';
        } else if (init.body instanceof URLSearchParams) {
          bodyContent = init.body.toString();
        } else {
          bodyContent = init.body.toString();
        }

        console.log('[DEEP HTTP TRACE] Raw body content preview:', `${bodyContent.substring(0, 300)  }...`);

        // Try to parse as JSON if it looks like JSON
        if (bodyContent.startsWith('{')) {
          try {
            const parsed = JSON.parse(bodyContent);
            console.log('[DEEP HTTP TRACE] Parsed JSON keys:', Object.keys(parsed));
            console.log('[DEEP HTTP TRACE] Has reasoning property:', 'reasoning' in parsed);
            console.log('[DEEP HTTP TRACE] Reasoning value:', parsed.reasoning);
            console.log('[DEEP HTTP TRACE] Has reasoning_effort property:', 'reasoning_effort' in parsed);
            console.log('[DEEP HTTP TRACE] reasoning_effort value:', parsed.reasoning_effort);
            console.log('[DEEP HTTP TRACE] Has verbosity property:', 'verbosity' in parsed);
            console.log('[DEEP HTTP TRACE] verbosity value:', parsed.verbosity);

            // Find all properties with 'reason' in name
            const reasonProps = Object.keys(parsed).filter((k) => k.toLowerCase().includes('reason'));
            console.log('[DEEP HTTP TRACE] All reason-related props:', reasonProps);
          } catch (e: any) {
            console.log('[DEEP HTTP TRACE] Could not parse body as JSON:', e.message);
          }
        }
      } catch (e: any) {
        console.log('[DEEP HTTP TRACE] Could not process body:', e.message);
      }
    }

    console.log('[DEEP HTTP TRACE] Headers:', JSON.stringify(init?.headers || {}, null, 2));
    console.log('='.repeat(100));
  }

  return originalFetch(input, init);
};
import { sessionUsageCache } from "./utils/cache";
import {
  cleanupPidFile,
  isServiceRunning,
  savePid,
} from "./utils/processCheck";
import { rewriteStream } from "./utils/rewriteStream";
import { router } from "./utils/router";
import { SSEParserTransform } from "./utils/SSEParser.transform";
import { SSESerializerTransform } from "./utils/SSESerializer.transform";
import { RouteManager, initializeRouteManager } from "./routing/RouteManager";
import { registerBuiltInMatchers } from "./routing/matchers";
import { loadRoutesIntoManager, PROJECT_ROUTES_PATH } from "./routing/loader";
import { RouteContext } from "./routing/types";
import { get_encoding } from "tiktoken";

const event = new EventEmitter()

async function initializeClaudeConfig() {
  const homeDir = homedir();
  const configPath = join(homeDir, ".claude.json");
  if (!existsSync(configPath)) {
    const userID = Array.from(
      { length: 64 },
      () => Math.random().toString(16)[2]
    ).join("");
    const configContent = {
      numStartups: 184,
      autoUpdaterStatus: "enabled",
      userID,
      hasCompletedOnboarding: true,
      lastOnboardingVersion: "1.0.17",
      projects: {},
    };
    await writeFile(configPath, JSON.stringify(configContent, null, 2));
  }
}


interface RunOptions {
  port?: number;
}

async function run(options: RunOptions = {}) {
  // Check if service is already running
  const isRunning = await isServiceRunning()
  if (isRunning) {
    console.log("✅ Service is already running in the background.");
    return;
  }

  await initializeClaudeConfig();
  await initDir();
  // Clean up old log files, keeping only the 10 most recent ones
  await cleanupLogFiles();
  const config = await initConfig();


  let HOST = config.HOST || "127.0.0.1";

  if (config.HOST && !config.APIKEY) {
    HOST = "127.0.0.1";
    console.warn("⚠️ API key is not set. HOST is forced to 127.0.0.1.");
  }

  const port = config.PORT || 3456;

  // Save the PID of the background process
  savePid(process.pid);

  // Handle SIGINT (Ctrl+C) to clean up PID file
  process.on("SIGINT", () => {
    console.log("Received SIGINT, cleaning up...");
    cleanupPidFile();
    process.exit(0);
  });

  // Handle SIGTERM to clean up PID file
  process.on("SIGTERM", () => {
    cleanupPidFile();
    process.exit(0);
  });

  // Use port from environment variable if set (for background process)
  const servicePort = process.env.SERVICE_PORT
    ? parseInt(process.env.SERVICE_PORT, 10)
    : port;

  // Configure logger based on config settings
  const pad = (num: number) => (num > 9 ? "" : "0") + num;
  const generator = (time?: Date, index?: number) => {
    if (!time) {
      time = new Date()
    }

    const month = `${time.getFullYear()  }${  pad(time.getMonth() + 1)}`;
    const day = pad(time.getDate());
    const hour = pad(time.getHours());
    const minute = pad(time.getMinutes());

    return `./logs/ccr-${month}${day}${hour}${minute}${pad(time.getSeconds())}${index ? `_${index}` : ''}.log`;
  };
  const loggerConfig =
    config.LOG !== false
      ? {
          level: config.LOG_LEVEL || "debug",
          stream: createStream(generator, {
            path: HOME_DIR,
            maxFiles: 3,
            interval: "1d",
            compress: false,
            maxSize: "50M",
          }),
        }
      : false;

  const server = createServer({
    jsonPath: CONFIG_FILE,
    initialConfig: {
      // ...config,
      providers: config.Providers || config.providers,
      HOST,
      PORT: servicePort,
      LOG_FILE: join(
        homedir(),
        ".claude-code-router",
        "claude-code-router.log"
      ),
    },
    logger: loggerConfig,
  });

  // Initialize SDK RouteManager
  console.log('[SDK INIT] Initializing RouteManager with SDK routing...');
  const routeManager = initializeRouteManager(undefined, undefined, server.log);

  // Register built-in matchers
  const matcherRegistry = routeManager.getMatcherRegistry();
  registerBuiltInMatchers(matcherRegistry);
  console.log('[SDK INIT] Registered built-in matchers:', matcherRegistry.list());

  // Load routes from routes.json (SDK format)
  try {
    const routesLoaded = await loadRoutesIntoManager(routeManager, PROJECT_ROUTES_PATH);
    console.log(`[SDK INIT] Loaded ${routesLoaded} routes from routes.json`);

    const allRoutes = routeManager.getAllRoutes();
    allRoutes.forEach((route) => {
      console.log(`[SDK INIT] - ${route.id} (priority: ${route.priority}) -> ${route.provider},${route.model}`);
    });
  } catch (error: any) {
    console.error('[SDK INIT] Failed to load routes.json:', error.message);
    console.error('[SDK INIT] Please create a routes.json file in the project root or ~/.claude-code-router/');
    process.exit(1);
  }

  // Add RouteManager to request context via hook
  server.app.addHook('preHandler', async (request, reply) => {
    (request as any).routeManager = routeManager;
  });

  // Add global error handlers to prevent the service from crashing
  process.on("uncaughtException", (err) => {
    server.log.error("Uncaught exception:", err);
  });

  process.on("unhandledRejection", (reason, promise) => {
    server.log.error("Unhandled rejection at:", promise, "reason:", reason);
  });
  // Add async preHandler hook for authentication
  server.addHook("preHandler", async (req, reply) => new Promise((resolve, reject) => {
      const done = (err?: Error) => {
        if (err) {
reject(err);
} else {
resolve();
}
      };
      // Call the async auth function
      apiKeyAuth(config)(req, reply, done).catch(reject);
    }));
  server.addHook("preHandler", async (req, reply) => {
    if (req.url.startsWith("/v1/messages")) {
      console.log('='.repeat(100));
      console.log('[MITM TRACE] === REQUEST INTERCEPTED ===');
      console.log('[MITM TRACE] URL:', req.url);
      console.log('[MITM TRACE] Method:', req.method);
      console.log('[MITM TRACE] Original Model:', req.body.model);
      console.log('[MITM TRACE] Session ID:', req.sessionId || 'unknown');

      // AGGRESSIVE MITM INTERCEPTION - Check EVERY request for /compact command
      const lastMessage = req.body.messages[req.body.messages.length - 1];
      let messageContent = '';

      // Extract ALL content to check for /compact
      if (typeof lastMessage.content === 'string') {
        messageContent = lastMessage.content;
        console.log('[MITM TRACE] Message content (string):', messageContent);
      } else if (Array.isArray(lastMessage.content)) {
        // Combine all text content parts
        messageContent = lastMessage.content
          .filter((item: any) => item.type === 'text')
          .map((item: any) => item.text || '')
          .join(' ');
        console.log('[MITM TRACE] Message content (array):', messageContent);
      }

      console.log('[MITM TRACE] Full request body keys:', Object.keys(req.body));
      console.log('[MITM TRACE] Request body model:', req.body.model);
      console.log('[MITM TRACE] Request body max_tokens:', req.body.max_tokens);
      console.log('[MITM TRACE] Request body reasoning_effort:', req.body.reasoning_effort);
      console.log('[MITM TRACE] Request body verbosity:', req.body.verbosity);
      console.log('[MITM TRACE] Request body reasoning:', req.body.reasoning);

      // AGGRESSIVE CHECK: Look for /compact in multiple formats
      const hasCompactCommand =
        messageContent.includes('<command-name>/compact</command-name>') ||
        messageContent.includes('/compact') ||
        messageContent.toLowerCase().includes('compact') && messageContent.includes('command');

      // AGGRESSIVE CHECK: Look for "think" or "ultrathink" words in message content
      const hasThinkCommand =
        messageContent.toLowerCase().includes('think') ||
        messageContent.toLowerCase().includes('ultrathink');

      console.log('[MITM TRACE] Compact command detected:', hasCompactCommand);
      console.log('[MITM TRACE] Think command detected:', hasThinkCommand);

      if (hasCompactCommand) {
        console.log('[MITM TRACE] === PROCESSING COMPACT COMMAND ===');
        // Silently handle compact command routing
        // console.log('=' .repeat(80));
        // console.log('[MITM ROUTING] /compact DETECTED - ROUTING TO COMPACT MODEL');
        // console.log('[MITM ROUTING] Original model:', req.body.model);

        // Check if compact route is configured
        if (config.Router?.compact) {
          const [provider, model] = config.Router.compact.split(',');
          // console.log('[MITM ROUTING] Routing to:', config.Router.compact);

          // Override the model to use the compact route
          req.body.model = config.Router.compact;

          // Transform the message to be more suitable for compacting
          const lastMsg = req.body.messages[req.body.messages.length - 1];
          if (typeof lastMsg.content === 'string' || Array.isArray(lastMsg.content)) {
            // Extract the actual compact command arguments
            let compactArgs = '';
            const argsMatch = messageContent.match(/<command-args>([^<]*)<\/command-args>/);
            if (argsMatch) {
              compactArgs = argsMatch[1];
            }

            // Replace the command with a clear instruction for the compact model
            const compactInstruction = `IMPORTANT: You MUST use deterministic context and provide TOO MUCH context rather than too little. It is ALWAYS better to include excessive detail to ensure nothing is forgotten.

Please provide a SEQUENTIAL and COMPREHENSIVE summary of this conversation. DO NOT be concise - include ALL important details, code snippets, file paths, errors, solutions, and context.

REQUIREMENTS:
1. Use DETERMINISTIC CONTEXT - be explicit and exact about everything
2. Include TOO MUCH CONTEXT - it's better to have excessive detail than to miss anything
3. Process everything SEQUENTIALLY - maintain the chronological order of events
4. Include ALL file paths, function names, variable names, and code snippets
5. Document ALL errors and their solutions
6. Preserve ALL technical details and implementation specifics
7. Keep ALL todo items and tasks with their full context
8. Maintain ALL user requirements and instructions exactly as stated

${compactArgs ? `Additional instructions: ${  compactArgs}` : ''}`;

            // Add system message for compact operation
            if (!req.body.system) {
              req.body.system = [];
            }
            req.body.system.push({
              type: 'text',
              text: 'You are a conversation summarizer that MUST provide EXCESSIVE detail and context. NEVER be concise. Always include TOO MUCH information rather than too little. Process everything SEQUENTIALLY and maintain DETERMINISTIC CONTEXT. Include ALL technical details, code snippets, file paths, errors, solutions, and implementation specifics. It is CRITICAL that you preserve everything with excessive detail to ensure nothing is forgotten.',
              cache_control: { type: 'ephemeral' },
            });

            // Replace the last message with the compact instruction
            req.body.messages[req.body.messages.length - 1] = {
              role: 'user',
              content: compactInstruction,
            };

            // Set high max_tokens for comprehensive output (65k tokens for Gemini 2.5 Flash)
            req.body.max_tokens = 65536;

            // console.log('[MITM ROUTING] Message transformed for compacting');
          }

          // console.log('[MITM ROUTING] Request will be routed to compact model:', config.Router.compact);
          // console.log('=' .repeat(80));

          // Log the routing
          const fs = require('fs');
          const path = require('path');
          const logsDir = path.join(process.env.HOME || '.', '.claude-code-router', 'logs');
          if (!fs.existsSync(logsDir)) {
            fs.mkdirSync(logsDir, { recursive: true });
          }

          const sessionId = req.sessionId || 'unknown-session';
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const logFileName = `claudemitm-ROUTED-${sessionId}-${timestamp}.log`;
          const logFilePath = path.join(logsDir, logFileName);

          fs.writeFileSync(logFilePath, JSON.stringify({
            routed: true,
            reason: '/compact command detected',
            routedTo: config.Router.compact,
            originalModel: req.body.model,
            timestamp: new Date().toISOString(),
            sessionId,
          }, null, 2));

        } else {
          server.log.warn('[MITM ROUTING] No compact route configured in config.Router.compact');
        }
      }

      // Handle think command routing
      if (hasThinkCommand) {
        console.log('[MITM TRACE] === PROCESSING THINK COMMAND ===');
        console.log('[MITM TRACE] Original model before think routing:', req.body.model);

        // Check if ultrathink route is configured
        if (config.Router?.ultrathink) {
          const [provider, model] = config.Router.ultrathink.split(',');
          console.log('[MITM TRACE] Ultrathink route configured:', config.Router.ultrathink);
          console.log('[MITM TRACE] Provider:', provider, 'Model:', model);

          // Override the model to use the ultrathink route
          req.body.model = config.Router.ultrathink;
          console.log('[MITM TRACE] Model overridden to:', req.body.model);

          // Don't transform the message - just route to thinking model
          // The message already contains "think" or "ultrathink" which triggers this

          // Log the routing
          const fs = require('fs');
          const path = require('path');
          const logsDir = path.join(process.env.HOME || '.', '.claude-code-router', 'logs');
          if (!fs.existsSync(logsDir)) {
            fs.mkdirSync(logsDir, { recursive: true });
          }

          const sessionId = req.sessionId || 'unknown-session';
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const logFileName = `claudemitm-THINK-ROUTED-${sessionId}-${timestamp}.log`;
          const logFilePath = path.join(logsDir, logFileName);

          fs.writeFileSync(logFilePath, JSON.stringify({
            routed: true,
            reason: '/think command detected',
            routedTo: config.Router.ultrathink,
            originalModel: req.body.model,
            timestamp: new Date().toISOString(),
            sessionId,
          }, null, 2));

        } else {
          console.log('[MITM TRACE] WARNING: No ultrathink route configured!');
          req.log.warn('[MITM ROUTING] No ultrathink route configured in config.Router.ultrathink');
        }
      }

      console.log('[MITM TRACE] === FINAL REQUEST STATE BEFORE AGENTS ===');
      console.log('[MITM TRACE] Final model:', req.body.model);
      console.log('[MITM TRACE] Final reasoning_effort:', req.body.reasoning_effort);
      console.log('[MITM TRACE] Final verbosity:', req.body.verbosity);
      console.log('[MITM TRACE] Final reasoning:', req.body.reasoning);
      console.log('[MITM TRACE] Final request body keys:', Object.keys(req.body));

      const useAgents = []

      // console.log('[Main] Checking agents for request');
      for (const agent of agentsManager.getAllAgents()) {
        // console.log('[Main] Checking agent:', agent.name);
        if (agent.shouldHandle(req, config)) {
          // console.log('[Main] Agent', agent.name, 'will handle request');
          // 设置agent标识
          useAgents.push(agent.name)

          // change request body
          agent.reqHandler(req, config);

          // append agent tools
          if (agent.tools.size) {
            if (!req.body?.tools?.length) {
              req.body.tools = []
            }
            req.body.tools.unshift(...Array.from(agent.tools.values()).map((item) => ({
                name: item.name,
                description: item.description,
                input_schema: item.input_schema,
              })))
            // console.log('[Main] Added', agent.tools.size, 'tools from agent', agent.name);
          }
        } else {
          // console.log('[Main] Agent', agent.name, 'will not handle request');
        }
      }

      if (useAgents.length) {
        req.agents = useAgents;
        console.log('[MITM TRACE] === AGENTS PROCESSED ===');
        console.log('[MITM TRACE] Used agents:', useAgents);
        console.log('[MITM TRACE] Model after agents:', req.body.model);
        console.log('[MITM TRACE] reasoning_effort after agents:', req.body.reasoning_effort);
        console.log('[MITM TRACE] verbosity after agents:', req.body.verbosity);
        console.log('[MITM TRACE] reasoning after agents:', req.body.reasoning);
      }

      // Check if the request has been blocked by an agent
      if (req.blockRequest && req.blockedResponse) {
        console.log('=' .repeat(80));
        console.log('[MITM BLOCKING] REQUEST FULLY BLOCKED - NOT FORWARDING TO PROVIDERS');
        console.log('[MITM BLOCKING] Session ID:', req.sessionId || 'unknown');
        console.log('[MITM BLOCKING] Blocked by agents:', req.agents || []);
        console.log('[MITM BLOCKING] Response ID:', req.blockedResponse.id);
        console.log('[MITM BLOCKING] Returning intercepted response directly to client');
        console.log('=' .repeat(80));

        // Log to file for audit
        server.log.info({
          event: 'COMMAND_BLOCKED',
          sessionId: req.sessionId,
          agents: req.agents,
          responseId: req.blockedResponse.id,
          message: 'Command intercepted and blocked from reaching providers',
        });

        // Return the blocked response immediately without forwarding to any provider
        reply.code(200);
        reply.header('content-type', 'application/json');
        reply.send(req.blockedResponse);
        return; // Exit early - do not forward to router/providers
      }

      console.log('[MITM TRACE] === BEFORE SDK ROUTER ===');
      console.log('[MITM TRACE] Model before router:', req.body.model);
      console.log('[MITM TRACE] reasoning_effort before router:', req.body.reasoning_effort);
      console.log('[MITM TRACE] verbosity before router:', req.body.verbosity);
      console.log('[MITM TRACE] reasoning before router:', req.body.reasoning);
      console.log('[MITM TRACE] All request body params before router:', Object.keys(req.body));

      // SDK Routing ONLY - Build context
      const enc = get_encoding("cl100k_base");
      let tokenCount = 0;

      // Calculate token count
      if (Array.isArray(req.body.messages)) {
        for (const message of req.body.messages) {
          if (typeof message.content === "string") {
            tokenCount += enc.encode(message.content).length;
          } else if (Array.isArray(message.content)) {
            for (const part of message.content) {
              if (part.type === "text" && part.text) {
                tokenCount += enc.encode(part.text).length;
              }
            }
          }
        }
      }

      // Parse sessionId
      if (req.body.metadata?.user_id) {
        const parts = req.body.metadata.user_id.split("_session_");
        if (parts.length > 1) {
          req.sessionId = parts[1];
        }
      }

      const context: RouteContext = {
        sessionId: req.sessionId,
        tokenCount,
        lastUsage: sessionUsageCache.get(req.sessionId),
        config,
        log: req.log,
        startTime: Date.now(),
        metadata: {},
      };

      console.log('[SDK ROUTER] Token count:', tokenCount);
      console.log('[SDK ROUTER] Session ID:', req.sessionId);

      // Select route using SDK RouteManager
      const routeResult = await (req as any).routeManager.selectRoute(req, context);

      console.log('[SDK ROUTER] Selected route:', routeResult.route?.id);
      console.log('[SDK ROUTER] Provider,Model:', routeResult.providerModel);
      console.log('[SDK ROUTER] Selection time:', routeResult.selectionTimeMs, 'ms');
      console.log('[SDK ROUTER] Used fallback:', routeResult.usedFallback);

      // Set the selected model
      req.body.model = routeResult.providerModel;

      console.log('[MITM TRACE] === AFTER SDK ROUTER ===');
      console.log('[MITM TRACE] Final model:', req.body.model);
      console.log('[MITM TRACE] reasoning_effort:', req.body.reasoning_effort);
      console.log('[MITM TRACE] verbosity:', req.body.verbosity);
      console.log('[MITM TRACE] reasoning:', req.body.reasoning);
      console.log('='.repeat(100));
    }
  });
  server.addHook("onError", async (request, reply, error) => {
    event.emit('onError', request, reply, error);
  })
  server.addHook("onSend", (req, reply, payload, done) => {
    if (req.sessionId && req.url.startsWith("/v1/messages")) {
      if (payload instanceof ReadableStream) {
        if (req.agents) {
          const abortController = new AbortController();
          const eventStream = payload.pipeThrough(new SSEParserTransform())
          let currentAgent: undefined | IAgent;
          let currentToolIndex = -1
          let currentToolName = ''
          let currentToolArgs = ''
          let currentToolId = ''
          const toolMessages: any[] = []
          const assistantMessages: any[] = []
          // 存储Anthropic格式的消息体，区分文本和工具类型
          return done(null, rewriteStream(eventStream, async (data, controller) => {
            try {
              // 检测工具调用开始
              if (data.event === 'content_block_start' && data?.data?.content_block?.name) {
                const agent = req.agents.find((name: string) => agentsManager.getAgent(name)?.tools.get(data.data.content_block.name))
                if (agent) {
                  currentAgent = agentsManager.getAgent(agent)
                  currentToolIndex = data.data.index
                  currentToolName = data.data.content_block.name
                  currentToolId = data.data.content_block.id
                  return undefined;
                }
              }

              // 收集工具参数
              if (currentToolIndex > -1 && data.data.index === currentToolIndex && data.data?.delta?.type === 'input_json_delta') {
                currentToolArgs += data.data?.delta?.partial_json;
                return undefined;
              }

              // 工具调用完成，处理agent调用
              if (currentToolIndex > -1 && data.data.index === currentToolIndex && data.data.type === 'content_block_stop') {
                try {
                  const args = JSON5.parse(currentToolArgs);
                  assistantMessages.push({
                    type: "tool_use",
                    id: currentToolId,
                    name: currentToolName,
                    input: args,
                  })
                  const toolResult = await currentAgent?.tools.get(currentToolName)?.handler(args, {
                    req,
                    config,
                  });
                  toolMessages.push({
                    tool_use_id: currentToolId,
                    type: "tool_result",
                    content: toolResult,
                  })
                  currentAgent = undefined
                  currentToolIndex = -1
                  currentToolName = ''
                  currentToolArgs = ''
                  currentToolId = ''
                } catch (_e) {
                  console.log(_e);
                }
                return undefined;
              }

              if (data.event === 'message_delta' && toolMessages.length) {
                req.body.messages.push({
                  role: 'assistant',
                  content: assistantMessages,
                })
                req.body.messages.push({
                  role: 'user',
                  content: toolMessages,
                })
                const response = await fetch(`http://127.0.0.1:${config.PORT}/v1/messages`, {
                  method: "POST",
                  headers: {
                    'x-api-key': config.APIKEY,
                    'content-type': 'application/json',
                  },
                  body: JSON.stringify(req.body),
                })
                if (!response.ok) {
                  return undefined;
                }
                const stream = response.body!.pipeThrough(new SSEParserTransform())
                const reader = stream.getReader()
                while (true) {
                  try {
                    const {value, done} = await reader.read();
                    if (done) {
                      break;
                    }
                    if (['message_start', 'message_stop'].includes(value.event)) {
                      continue
                    }

                    // 检查流是否仍然可写
                    if (!controller.desiredSize) {
                      break;
                    }

                    controller.enqueue(value)
                  } catch (readError: any) {
                    if (readError.name === 'AbortError' || readError.code === 'ERR_STREAM_PREMATURE_CLOSE') {
                      abortController.abort(); // 中止所有相关操作
                      break;
                    }
                    throw readError;
                  }

                }
                return undefined
              }
              return data
            } catch (error: any) {
              console.error('Unexpected error in stream processing:', error);

              // 处理流提前关闭的错误
              if (error.code === 'ERR_STREAM_PREMATURE_CLOSE') {
                abortController.abort();
                return undefined;
              }

              // 其他错误仍然抛出
              throw error;
            }
          }).pipeThrough(new SSESerializerTransform()))
        }

        const [originalStream, clonedStream] = payload.tee();
        const read = async (stream: ReadableStream) => {
          const reader = stream.getReader();
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) {
break;
}
              // Process the value if needed
              const dataStr = new TextDecoder().decode(value);
              if (!dataStr.startsWith("event: message_delta")) {
                continue;
              }
              const str = dataStr.slice(27);
              try {
                const message = JSON.parse(str);
                sessionUsageCache.put(req.sessionId, message.usage);
              } catch (_e) {}
            }
          } catch (readError: any) {
            if (readError.name === 'AbortError' || readError.code === 'ERR_STREAM_PREMATURE_CLOSE') {
              console.error('Background read stream closed prematurely');
            } else {
              console.error('Error in background stream reading:', readError);
            }
          } finally {
            reader.releaseLock();
          }
        }
        read(clonedStream);
        return done(null, originalStream)
      }
      sessionUsageCache.put(req.sessionId, payload.usage);
      if (typeof payload === 'object') {
        if (payload.error) {
          return done(payload.error, null)
        } else {
          return done(payload, null)
        }
      }
    }
    if (typeof payload === 'object' && payload.error) {
      return done(payload.error, null)
    }
    done(null, payload)
  });
  server.addHook("onSend", async (req, reply, payload) => {
    event.emit('onSend', req, reply, payload);
    return payload;
  })


  server.start();
}

export { run };
// run();
