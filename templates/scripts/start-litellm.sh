#!/bin/zsh
set -euo pipefail

export LITELLM_API_KEY="${LITELLM_API_KEY:-sk-proxy}"

echo "🚀 启动 LiteLLM Proxy on http://127.0.0.1:4000 ..."
exec ~/.local/bin/litellm --config ~/litellm_config.yaml --port 4000
