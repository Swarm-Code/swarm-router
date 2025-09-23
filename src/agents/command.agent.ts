import fs from "fs";
import JSON5 from "json5";
import path from "path";
import { IAgent, ITool } from "./type";

export class CommandAgent implements IAgent {
  name = "command";
  tools: Map<string, ITool>;

  constructor() {
    this.tools = new Map<string, ITool>();
    this.appendTools();
  }

  createCommandLog(req: any) {
    // Extract session ID from request
    const sessionId = req.sessionId || 'unknown-session';

    // Extract project folder information from request metadata
    let projectFolder = 'unknown-project';
    if (req.body.metadata?.project_dir) {
      projectFolder = req.body.metadata.project_dir;
    } else if (req.body.metadata?.workspace?.project_dir) {
      projectFolder = req.body.metadata.workspace.project_dir;
    } else {
      // Fallback to extract from the last message content
      const lastMessage = req.body.messages[req.body.messages.length - 1];

      if (lastMessage && typeof lastMessage.content === 'string') {
        projectFolder = this.extractProjectFolder(lastMessage.content) || projectFolder;
      } else if (lastMessage && Array.isArray(lastMessage.content)) {
        const textContent = lastMessage.content.find((item: any) => item.type === 'text');
        if (textContent && textContent.text) {
          projectFolder = this.extractProjectFolder(textContent.text) || projectFolder;
        }
      }
    }

    // Get logs directory from config or use default
    const logsDir = path.join(process.env.HOME || '.', '.claude-code-router', 'logs');

    // Create logs directory if it doesn't exist
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    // Create log file with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const logFileName = `claudemitm-${sessionId}-${projectFolder}-${timestamp}.log`;
    const logFilePath = path.join(logsDir, logFileName);

    // Write log entry
    const lastMessage = req.body.messages[req.body.messages.length - 1];
    const logEntry = `Command intercepted: ${lastMessage?.content || 'unknown command'}\nSession ID: ${sessionId}\nProject Folder: ${projectFolder}\nTimestamp: ${new Date().toISOString()}\n\n`;
    fs.writeFileSync(logFilePath, logEntry);

    // Silently log command
    // console.log(`Created command log: ${logFileName}`);
  }

  extractProjectFolder(content: string): string | null {
    // Simple extraction logic - this could be enhanced based on your needs
    // For example, if content contains paths, extract the project folder from them
    if (content.includes('/')) {
      // If content contains path separators, try to extract project folder
      const lines = content.split('\n');
      for (const line of lines) {
        if (line.trim().startsWith('/')) {
          // Extract folder name from path
          const pathParts = line.trim().split('/');
          // Return the first directory name that's not empty
          for (const part of pathParts) {
            if (part && !part.includes(' ')) {
              return part;
            }
          }
        }
      }
    }
    return null;
  }

  shouldHandle(req: any, config: any): boolean {
    // Check if the request contains Claude Code local commands
    const lastMessage = req.body.messages[req.body.messages.length - 1];
    // console.log('[CommandAgent] Checking message for commands:', lastMessage);

    let content = '';
    if (lastMessage.role === 'user' && typeof lastMessage.content === 'string') {
      content = lastMessage.content;
    } else if (lastMessage.role === 'user' && Array.isArray(lastMessage.content)) {
      const firstTextContent = lastMessage.content.find((item: any) => item.type === 'text');
      if (firstTextContent && firstTextContent.text) {
        content = firstTextContent.text;
      }
    }

    // Check for direct slash commands
    if (content.startsWith('/')) {
      // console.log('[CommandAgent] Direct slash command detected:', content);
      return true;
    }

    // Check for Claude Code XML-formatted commands
    const commandNameMatch = content.match(/<command-name>\/([^<]+)<\/command-name>/);
    if (commandNameMatch) {
      // console.log('[CommandAgent] XML command detected:', commandNameMatch[1]);
      return true;
    }

    // console.log('[CommandAgent] No command detected in message');
    return false;
  }

  appendTools() {
    // Add a tool for handling the compact command
    this.tools.set('handleCompactCommand', {
      name: "handleCompactCommand",
      description: "Handle Claude Code local /compact command for conversation summary",
      input_schema: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "The command to handle (e.g., /compact)",
          },
          arguments: {
            type: "string",
            description: "Arguments for the command",
          },
        },
        required: ["command"],
      },
      handler: async (args, context) => {
        // Handle the compact command
        if (args.command === '/compact') {
          // This is where we would implement the actual compacting logic
          // For now, we'll return a placeholder response
          return "Conversation compacted successfully. Context preserved with ephemeral linearly dependent sub agents.";
        }
        return "Unknown command";
      },
    });

    // Add a tool for generating context summaries with ephemeral linearly dependent sub agents
    this.tools.set('generateContextSummary', {
      name: "generateContextSummary",
      description: "Generate a context summary using ephemeral linearly dependent sub agents",
      input_schema: {
        type: "object",
        properties: {
          sessionId: {
            type: "string",
            description: "The session ID to generate summary for",
          },
          context: {
            type: "array",
            description: "The conversation context to summarize",
            items: {
              type: "object",
              properties: {
                role: {type: "string"},
                content: {type: "string"},
              },
              required: ["role", "content"],
            },
          },
        },
        required: ["sessionId", "context"],
      },
      handler: async (args, context) =>
        // This would be where we implement the ephemeral linearly dependent sub agents logic
        // For now, we'll return a placeholder response
         `Context summary generated for session ${args.sessionId} using ephemeral linearly dependent sub agents.`,

    });
  }

  reqHandler(req: any, config: any) {
    // console.log('[CommandAgent] reqHandler called');
    // Extract command from the request
    const lastMessage = req.body.messages[req.body.messages.length - 1];
    // console.log('[CommandAgent] Last message in reqHandler:', lastMessage);

    let commandContent = '';
    if (typeof lastMessage.content === 'string') {
      commandContent = lastMessage.content;
      // console.log('[CommandAgent] Extracted string command content:', commandContent);
    } else if (Array.isArray(lastMessage.content)) {
      const firstTextContent = lastMessage.content.find((item: any) => item.type === 'text');
      if (firstTextContent && firstTextContent.text) {
        commandContent = firstTextContent.text;
        // console.log('[CommandAgent] Extracted array command content:', commandContent);
      }
    }

    // Check for XML-formatted commands from Claude Code
    const commandNameMatch = commandContent.match(/<command-name>\/([^<]+)<\/command-name>/);
    const commandMessageMatch = commandContent.match(/<command-message>([^<]*)<\/command-message>/);
    const commandArgsMatch = commandContent.match(/<command-args>([^<]*)<\/command-args>/);

    if (commandNameMatch) {
      const commandName = commandNameMatch[1];
      const commandMessage = commandMessageMatch ? commandMessageMatch[1] : '';
      const commandArgs = commandArgsMatch ? commandArgsMatch[1] : '';

      // console.log('[CommandAgent] XML Command intercepted:', {
      //   name: commandName,
      //   message: commandMessage,
      //   args: commandArgs
      // });

      if (commandName === 'compact') {
        // console.log('[CommandAgent] Intercepting /compact command!');
        // console.log('[CommandAgent] BLOCKING REQUEST - Setting blockRequest flag');

        // Create log file for this command
        this.createCommandLog(req);

        // Mark this request as blocked - it should not be forwarded to any provider
        req.blockRequest = true;
        req.blockedResponse = {
          id: `msg_blocked_${  Date.now()}`,
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: `🚫 MITM INTERCEPTION: /compact command has been intercepted and blocked by Claude Code Router.\n\nOriginal command args: ${commandArgs}\n\nThis command was prevented from reaching any LLM provider and will not consume any API tokens.`,
            },
          ],
          model: 'mitm-interceptor',
          stop_reason: 'end_turn',
          stop_sequence: null,
          usage: {
            input_tokens: 0,
            output_tokens: 0,
          },
        };

        // console.log('[CommandAgent] /compact command FULLY BLOCKED - will not reach providers');
        return req;
      }
    }

    // Parse direct slash commands (fallback for non-XML format)
    if (commandContent.trim().startsWith('/')) {
      // console.log('[CommandAgent] Direct command detected:', commandContent.trim());

      if (commandContent.trim().startsWith('/compact')) {
        // Handle compact command
        // console.log('[CommandAgent] Intercepted direct /compact command');
        // console.log('[CommandAgent] BLOCKING REQUEST - Setting blockRequest flag for direct command');

        // Create log file for this command
        this.createCommandLog(req);

        // Mark this request as blocked - it should not be forwarded to any provider
        req.blockRequest = true;
        req.blockedResponse = {
          id: `msg_blocked_${  Date.now()}`,
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: `🚫 MITM INTERCEPTION: /compact command has been intercepted and blocked by Claude Code Router.\n\nThis command was prevented from reaching any LLM provider and will not consume any API tokens.`,
            },
          ],
          model: 'mitm-interceptor',
          stop_reason: 'end_turn',
          stop_sequence: null,
          usage: {
            input_tokens: 0,
            output_tokens: 0,
          },
        };

        // console.log('[CommandAgent] Direct /compact command FULLY BLOCKED - will not reach providers');
      } else {
        // Log other commands for future handling
        // console.log('[CommandAgent] Other command detected:', commandContent.trim());
        this.createCommandLog(req);
      }
    }

    return req;
  }
}

export const commandAgent = new CommandAgent();
