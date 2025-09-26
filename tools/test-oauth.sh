#!/bin/bash

# Test OAuth with exact Claude Code headers
TOKEN=$(jq -r '.claudeAiOauth.accessToken' ~/.claude/.credentials.json)

echo "Testing with full Claude Code headers..."

curl -X POST https://api.anthropic.com/v1/messages \
  -H "Accept: application/json" \
  -H "X-Stainless-Retry-Count: 0" \
  -H "X-Stainless-Timeout: 600" \
  -H "X-Stainless-Lang: js" \
  -H "X-Stainless-Package-Version: 0.60.0" \
  -H "X-Stainless-OS: Linux" \
  -H "X-Stainless-Arch: x64" \
  -H "X-Stainless-Runtime: node" \
  -H "X-Stainless-Runtime-Version: v24.8.0" \
  -H "anthropic-dangerous-direct-browser-access: true" \
  -H "anthropic-version: 2023-06-01" \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-app: cli" \
  -H "User-Agent: claude-cli/1.0.120 (external, cli)" \
  -H "Content-Type: application/json" \
  -H "anthropic-beta: claude-code-20250219,oauth-2025-04-20,interleaved-thinking-2025-05-14,fine-grained-tool-streaming-2025-05-14" \
  -H "x-stainless-helper-method: stream" \
  -d '{
    "model": "claude-sonnet-4-20250514",
    "messages": [
      {
        "role": "user",
        "content": "What is 2+2? Just the number."
      }
    ],
    "max_tokens": 50,
    "temperature": 0,
    "stream": false
  }' | jq '.'