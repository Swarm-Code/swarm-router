#!/usr/bin/env node

/**
 * Claude Proxy - Forwards requests to Claude Code instance
 * Acts as a bridge between CCR and Claude Code with OAuth
 */

const express = require('express');
const { spawn } = require('child_process');

const app = express();
app.use(express.json({ limit: '50mb' }));

const PORT = 9876;

// Keep Claude process running
let claudeProcess = null;
let outputBuffer = '';
let isProcessing = false;

function startClaude() {
  if (!claudeProcess) {
    console.log('🚀 Starting Claude Code process...');

    claudeProcess = spawn('claude', [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        NO_COLOR: '1'
      }
    });

    claudeProcess.stdout.on('data', (data) => {
      const output = data.toString();
      outputBuffer += output;
      process.stdout.write(output); // Show Claude output
    });

    claudeProcess.stderr.on('data', (data) => {
      console.error('Claude error:', data.toString());
    });

    claudeProcess.on('close', (code) => {
      console.log(`Claude process exited with code ${code}`);
      claudeProcess = null;
    });
  }
}

// Start Claude on startup
startClaude();

// Main endpoint - forward to Claude
app.post('/v1/messages', async (req, res) => {
  console.log('\n📨 Received request');
  console.log('  Model:', req.body.model);

  if (!claudeProcess) {
    startClaude();
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  // Extract prompt from messages
  const messages = req.body.messages || [];
  const lastMessage = messages[messages.length - 1];
  const prompt = lastMessage?.content?.[0]?.text || lastMessage?.content || '';

  console.log('  Prompt:', prompt.substring(0, 50) + '...');

  // Clear buffer and send prompt
  outputBuffer = '';
  isProcessing = true;

  // Send to Claude
  claudeProcess.stdin.write(prompt + '\n');

  // Wait for response
  const startTime = Date.now();
  const maxWait = 30000; // 30 seconds max

  while (isProcessing && (Date.now() - startTime < maxWait)) {
    await new Promise(resolve => setTimeout(resolve, 100));

    // Check if we have a complete response
    if (outputBuffer.includes('\n>') || outputBuffer.length > 100) {
      isProcessing = false;
    }
  }

  // Clean the output
  const cleanOutput = outputBuffer
    .replace(/^[>❯]\s*/gm, '')
    .replace(/\[.*?\]/g, '')
    .replace(/^Type.*$/gm, '')
    .trim();

  console.log('  Response length:', cleanOutput.length);

  // Return in Claude API format
  res.json({
    id: `msg_${Date.now()}`,
    type: 'message',
    role: 'assistant',
    model: req.body.model || 'claude-sonnet-4-20250514',
    content: [
      {
        type: 'text',
        text: cleanOutput || 'No response'
      }
    ],
    stop_reason: 'end_turn',
    usage: {
      input_tokens: prompt.length,
      output_tokens: cleanOutput.length
    }
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    claude: claudeProcess ? 'running' : 'stopped'
  });
});

app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║     🌉 CLAUDE PROXY - Bridge to Claude Code                  ║
╚═══════════════════════════════════════════════════════════════╝

Proxy running on: http://localhost:${PORT}
Endpoint: POST http://localhost:${PORT}/v1/messages

This proxy forwards requests to Claude Code using your subscription.
Configure CCR to use: http://localhost:${PORT} as the baseUrl
`);
});