#!/bin/bash

SESSION_NAME="mitm-test"
MITM_PORT=3458
CCR_DIR="$(dirname "$0")"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}==============================================================${NC}"
echo -e "${BLUE}       Claude Code Router MITM Testing Environment${NC}"
echo -e "${BLUE}==============================================================${NC}"

# Kill existing session if it exists
if tmux has-session -t $SESSION_NAME 2>/dev/null; then
    echo -e "${YELLOW}Killing existing session...${NC}"
    tmux kill-session -t $SESSION_NAME
fi

# Make sure we're in the right directory
cd "$CCR_DIR"

# Build the MITM logger
echo -e "${GREEN}Building MITM logger...${NC}"
npx tsc src/mitm-logger.ts --outDir dist --esModuleInterop --resolveJsonModule

# Create new tmux session with first window
echo -e "${GREEN}Creating tmux session: ${SESSION_NAME}${NC}"
tmux new-session -d -s $SESSION_NAME -n "mitm-logger"

# Window 0: MITM Logger (first window is automatically created)
tmux send-keys -t $SESSION_NAME:0 "cd $CCR_DIR" C-m
tmux send-keys -t $SESSION_NAME:0 "echo -e '${GREEN}Starting MITM Logger on port $MITM_PORT...${NC}'" C-m
tmux send-keys -t $SESSION_NAME:0 "node dist/mitm-logger.js" C-m

# Wait for MITM to start
sleep 2

# Create second window for log viewer
tmux new-window -t $SESSION_NAME:1 -n "logs"
tmux send-keys -t $SESSION_NAME:1 "cd ~/.claude-code-router/mitm-logs" C-m
tmux send-keys -t $SESSION_NAME:1 "echo -e '${BLUE}MITM Logs Directory - Use ls to see captured requests/responses${NC}'" C-m
tmux send-keys -t $SESSION_NAME:1 "watch -n 1 'ls -la --sort=time | head -20'" C-m

# Create third window for Claude testing
tmux new-window -t $SESSION_NAME:2 -n "claude-test"
tmux send-keys -t $SESSION_NAME:2 "cd $CCR_DIR" C-m
tmux send-keys -t $SESSION_NAME:2 "export ANTHROPIC_BASE_URL=http://localhost:$MITM_PORT" C-m
tmux send-keys -t $SESSION_NAME:2 "echo -e '${GREEN}Claude Test Terminal${NC}'" C-m
tmux send-keys -t $SESSION_NAME:2 "echo -e '${YELLOW}ANTHROPIC_BASE_URL is set to http://localhost:$MITM_PORT${NC}'" C-m
tmux send-keys -t $SESSION_NAME:2 "echo -e '${BLUE}Try: claude --print \"What is 2+2?\"${NC}'" C-m
tmux send-keys -t $SESSION_NAME:2 "echo -e '${BLUE}Or: claude \"Explain quantum computing\"${NC}'" C-m

# Create fourth window for log analysis
tmux new-window -t $SESSION_NAME:3 -n "analysis"
tmux send-keys -t $SESSION_NAME:3 "cd ~/.claude-code-router/mitm-logs" C-m
tmux send-keys -t $SESSION_NAME:3 "echo -e '${GREEN}Log Analysis Terminal${NC}'" C-m
tmux send-keys -t $SESSION_NAME:3 "echo -e '${YELLOW}Use this to examine captured requests/responses${NC}'" C-m
tmux send-keys -t $SESSION_NAME:3 "echo 'Example: cat request-*.json | jq .body.model | sort | uniq -c'" C-m

# Create fifth window for CCR testing (optional)
tmux new-window -t $SESSION_NAME:4 -n "ccr-test"
tmux send-keys -t $SESSION_NAME:4 "cd $CCR_DIR" C-m
tmux send-keys -t $SESSION_NAME:4 "echo -e '${GREEN}CCR Testing Terminal${NC}'" C-m
tmux send-keys -t $SESSION_NAME:4 "echo -e '${YELLOW}Use this to test CCR routing${NC}'" C-m
tmux send-keys -t $SESSION_NAME:4 "echo 'ccr status'" C-m
tmux send-keys -t $SESSION_NAME:4 "ccr status" C-m

# Select the Claude test window by default
tmux select-window -t $SESSION_NAME:2

echo ""
echo -e "${GREEN}==============================================================${NC}"
echo -e "${GREEN}MITM Testing Environment Ready!${NC}"
echo -e "${GREEN}==============================================================${NC}"
echo ""
echo -e "${BLUE}Windows:${NC}"
echo -e "  ${YELLOW}0: mitm-logger${NC}  - MITM proxy server"
echo -e "  ${YELLOW}1: logs${NC}         - Live log file viewer"
echo -e "  ${YELLOW}2: claude-test${NC}  - Test Claude with MITM"
echo -e "  ${YELLOW}3: analysis${NC}     - Analyze captured logs"
echo -e "  ${YELLOW}4: ccr-test${NC}     - Test CCR routing"
echo ""
echo -e "${GREEN}Attach to session:${NC} tmux attach -t $SESSION_NAME"
echo -e "${GREEN}Kill session:${NC} tmux kill-session -t $SESSION_NAME"
echo ""
echo -e "${YELLOW}The MITM is intercepting at: http://localhost:$MITM_PORT${NC}"
echo -e "${YELLOW}Logs are saved in: ~/.claude-code-router/mitm-logs/${NC}"
echo ""

# Attach to the session
tmux attach -t $SESSION_NAME