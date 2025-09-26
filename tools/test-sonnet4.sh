#!/bin/bash

# Test Claude Sonnet 4 with OAuth token
# Using the captured request format from Claude Code

TOKEN=$(jq -r '.claudeAiOauth.accessToken' ~/.claude/.credentials.json)

curl -X POST https://api.anthropic.com/v1/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -H "anthropic-version: 2023-06-01" \
  -H "anthropic-beta: oauth-2025-04-20,fine-grained-tool-streaming-2025-05-14" \
  -H "x-app: cli" \
  -H "user-agent: claude-cli/1.0.120" \
  -d '{
    "model": "claude-sonnet-4-20250514",
    "messages": [
      {
        "role": "user",
        "content": "What is 2+2? Just give me the number."
      }
    ],
    "max_tokens": 100,
    "temperature": 0,
    "stream": false
  }' | jq '.'