import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { createServer } from 'http';
import { createProxyServer } from 'http-proxy';
import { join } from 'path';

const MITM_PORT = 3458; // Different port for pure MITM
const ANTHROPIC_API = 'https://api.anthropic.com';
const LOG_DIR = join(process.env.HOME!, '.claude-code-router', 'mitm-logs');

// Ensure log directory exists
if (!existsSync(LOG_DIR)) {
  mkdirSync(LOG_DIR, { recursive: true });
}

// Create proxy
const proxy = createProxyServer({
  target: ANTHROPIC_API,
  changeOrigin: true,
  secure: true,
});

// Create MITM server
const server = createServer((req, res) => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  let requestBody = '';
  let responseBody = '';

  // Capture request body
  req.on('data', (chunk) => {
    requestBody += chunk.toString();
  });

  req.on('end', () => {
    // Log the request
    const requestLog = {
      timestamp: new Date().toISOString(),
      direction: 'REQUEST_TO_ANTHROPIC',
      method: req.method,
      url: req.url,
      headers: req.headers,
      body: requestBody ? JSON.parse(requestBody) : null,
    };

    const requestFile = join(LOG_DIR, `request-${timestamp}.json`);
    writeFileSync(requestFile, JSON.stringify(requestLog, null, 2));

    console.log(`[MITM] Request captured: ${req.method} ${req.url}`);
    console.log(`[MITM] Logged to: ${requestFile}`);
  });

  // Capture response
  const originalWrite = res.write.bind(res);
  const originalEnd = res.end.bind(res);

  res.write = function(chunk: any) {
    responseBody += chunk.toString();
    return originalWrite(chunk);
  };

  res.end = function(chunk?: any) {
    if (chunk) {
      responseBody += chunk.toString();
    }

    // Log the response
    const responseLog = {
      timestamp: new Date().toISOString(),
      direction: 'RESPONSE_FROM_ANTHROPIC',
      statusCode: res.statusCode,
      headers: res.getHeaders(),
      body: responseBody,
    };

    const responseFile = join(LOG_DIR, `response-${timestamp}.json`);
    writeFileSync(responseFile, JSON.stringify(responseLog, null, 2));

    console.log(`[MITM] Response captured: ${res.statusCode}`);
    console.log(`[MITM] Logged to: ${responseFile}`);

    return originalEnd(chunk);
  };

  // Forward to Anthropic
  proxy.web(req, res);
});

proxy.on('error', (err: Error, req: any, res: any) => {
  console.error('[MITM] Proxy error:', err);
  if (res && res.writeHead && !res.headersSent) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Proxy error');
  }
});

server.listen(MITM_PORT, () => {
  console.log('='.repeat(60));
  console.log('MITM Logger Running');
  console.log('='.repeat(60));
  console.log(`Listening on: http://localhost:${MITM_PORT}`);
  console.log(`Forwarding to: ${ANTHROPIC_API}`);
  console.log(`Logs directory: ${LOG_DIR}`);
  console.log('='.repeat(60));
  console.log('To use with Claude:');
  console.log(`export ANTHROPIC_BASE_URL=http://localhost:${MITM_PORT}`);
  console.log('claude "your prompt"');
  console.log('='.repeat(60));
});
