#!/bin/bash

# Test with captured OAuth token
TOKEN="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"

echo "Testing captured OAuth token..."

curl -X POST https://api.anthropic.com/v1/messages?beta=true \
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
  -d '{
    "model": "claude-opus-4-1-20250805",
    "messages": [
      {
        "role": "user",
        "content": [
          {
            "type": "text",
            "text": "What is 2+2? Just answer with the number."
          }
        ]
      }
    ],
    "system": [
      {
        "type": "text",
        "text": "You are Claude Code. Please answer concisely."
      }
    ],
    "temperature": 1,
    "max_tokens": 10
  }' 2>&1