#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
MCP_CONFIG_PATH="${CLAUDE_GPT54_MCP_CONFIG:-$ROOT_DIR/.claude/mcp-gpt54.json}"
TOOLS_DEFAULT='Bash,Edit,Read,Write,Glob,Grep,LS,MultiEdit,NotebookRead,NotebookEdit,WebFetch,WebSearch'

export ANTHROPIC_BASE_URL="${ANTHROPIC_BASE_URL:-http://127.0.0.1:4000}"
export ANTHROPIC_AUTH_TOKEN="${ANTHROPIC_AUTH_TOKEN:-sk-proxy}"
export ANTHROPIC_MODEL="${ANTHROPIC_MODEL:-gpt54}"

exec claude \
  --model "${ANTHROPIC_MODEL}" \
  --tools "${CLAUDE_GPT54_TOOLS:-$TOOLS_DEFAULT}" \
  --strict-mcp-config \
  --mcp-config "$MCP_CONFIG_PATH" \
  --permission-mode bypassPermissions \
  "$@"
