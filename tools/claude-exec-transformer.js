/**
 * Claude Exec Transformer - Executes requests through actual Claude Code CLI
 */

const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

// Cache for Claude process (keep it running)
let claudeProcess = null;
let outputBuffer = '';

async function ensureClaudeRunning() {
  if (!claudeProcess) {
    console.log('[SWARM] Starting Claude Code process...');

    claudeProcess = spawn('claude', [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        NO_COLOR: '1',
        CLAUDE_QUIET: 'true'
      }
    });

    claudeProcess.stdout.on('data', (data) => {
      outputBuffer += data.toString();
    });

    claudeProcess.stderr.on('data', (data) => {
      console.error('[SWARM] Claude error:', data.toString());
    });

    claudeProcess.on('close', () => {
      claudeProcess = null;
      outputBuffer = '';
    });

    // Wait for ready
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}

module.exports = {
  /**
   * Transform request to execute through Claude CLI
   */
  swarmExecRequest: async (request) => {
    console.log('[SWARM] Routing through Claude Code CLI...');

    // Ensure Claude is running
    await ensureClaudeRunning();

    // Get the last user message
    const messages = request.body.messages || [];
    const lastMessage = messages[messages.length - 1];
    const prompt = lastMessage?.content || '';

    // Clear output buffer
    outputBuffer = '';

    // Send to Claude
    claudeProcess.stdin.write(prompt + '\n');

    // Wait for response
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Return modified request that just passes through
    // The actual response will come from Claude
    return request;
  },

  /**
   * Transform response from Claude CLI
   */
  swarmExecResponse: async (response, request) => {
    console.log('[SWARM] Processing Claude CLI response...');

    // Get the output from Claude
    const cleanOutput = outputBuffer
      .replace(/^[>❯]\s*/gm, '')
      .replace(/\[.*?\]/g, '')
      .trim();

    return {
      ...response,
      body: {
        id: `swarm-${Date.now()}`,
        type: 'message',
        role: 'assistant',
        model: request.body.model || 'claude-sonnet-4-20250514',
        content: [
          {
            type: 'text',
            text: cleanOutput || 'No response from Claude'
          }
        ],
        usage: {
          input_tokens: 0,
          output_tokens: 0
        }
      }
    };
  }
};