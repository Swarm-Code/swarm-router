#!/bin/bash

SESSION_NAME="mitm-test"
MITM_PORT=3458
CCR_DIR="$(dirname "$0")"

echo "=============================================================="
echo "       Claude Code Router MITM Testing Environment"
echo "=============================================================="

# Kill existing session if it exists
if tmux has-session -t $SESSION_NAME 2>/dev/null; then
    echo "Killing existing session..."
    tmux kill-session -t $SESSION_NAME
fi

# Kill any processes using the MITM port
pkill -f "mitm-logger" 2>/dev/null || true
lsof -ti:$MITM_PORT 2>/dev/null | xargs kill -9 2>/dev/null || true

# Make sure we're in the right directory
cd "$CCR_DIR"

# Build the MITM logger
echo "Building MITM logger..."
npx tsc src/mitm-logger.ts --outDir dist --esModuleInterop --resolveJsonModule

# Create new tmux session
echo "Creating tmux session: $SESSION_NAME"
tmux new-session -d -s $SESSION_NAME -n "mitm-logger"

# Window 1: MITM Logger
tmux send-keys -t $SESSION_NAME:1 "cd $CCR_DIR" C-m
tmux send-keys -t $SESSION_NAME:1 "echo 'Starting MITM Logger on port $MITM_PORT...'" C-m
tmux send-keys -t $SESSION_NAME:1 "node dist/mitm-logger.js" C-m

# Wait for MITM to start
sleep 2

# Window 2: Claude test
tmux new-window -t $SESSION_NAME:2 -n "claude-test"
tmux send-keys -t $SESSION_NAME:2 "cd $CCR_DIR" C-m
tmux send-keys -t $SESSION_NAME:2 "export ANTHROPIC_BASE_URL=http://localhost:$MITM_PORT" C-m
tmux send-keys -t $SESSION_NAME:2 "echo 'Claude Test Terminal - ANTHROPIC_BASE_URL set to $MITM_PORT'" C-m
tmux send-keys -t $SESSION_NAME:2 "echo 'Test with: claude --print \"What is 2+2?\"'" C-m

# Window 3: Log analysis
tmux new-window -t $SESSION_NAME:3 -n "analysis"
tmux send-keys -t $SESSION_NAME:3 "cd ~/.claude-code-router/mitm-logs" C-m
tmux send-keys -t $SESSION_NAME:3 "echo 'Log Analysis Terminal'" C-m
tmux send-keys -t $SESSION_NAME:3 "echo 'Example: ls -la | head -10'" C-m

# Window 4: Log viewer
tmux new-window -t $SESSION_NAME:4 -n "logs"
tmux send-keys -t $SESSION_NAME:4 "cd ~/.claude-code-router/mitm-logs" C-m
tmux send-keys -t $SESSION_NAME:4 "echo 'Live Log Viewer'" C-m

# Select the test window
tmux select-window -t $SESSION_NAME:2

echo ""
echo "=============================================================="
echo "MITM Testing Environment Ready!"
echo "=============================================================="
echo ""
echo "Windows:"
echo "  1: mitm-logger  - MITM proxy server"
echo "  2: claude-test  - Test Claude with MITM"
echo "  3: analysis     - Analyze captured logs"
echo "  4: logs         - Live log viewer"
echo ""
echo "Attach to session: tmux attach -t $SESSION_NAME"
echo "Kill session: tmux kill-session -t $SESSION_NAME"
echo ""
echo "The MITM is intercepting at: http://localhost:$MITM_PORT"
echo "Logs are saved in: ~/.claude-code-router/mitm-logs/"
echo ""

# Try to attach if we're in a terminal
if [ -t 1 ]; then
    tmux attach -t $SESSION_NAME
else
    echo "Session created but not attaching (not in a terminal)"
fi