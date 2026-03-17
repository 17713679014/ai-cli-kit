#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const homeDir = os.homedir()
const cwd = process.cwd()
const args = process.argv.slice(2)
const command = args[0]

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true })
}

function writeFile(filePath, content, mode) {
  ensureDir(path.dirname(filePath))
  fs.writeFileSync(filePath, content)
  if (mode) {
    fs.chmodSync(filePath, mode)
  }
  console.log(`written: ${filePath}`)
}

function renderLiteLLMConfig({ azureBase, azureKey, geminiKey = '' }) {
  return `general_settings:\n  master_key: sk-proxy\n\nlitellm_settings:\n  drop_params: true\n\nmodel_list:\n  - model_name: gpt54\n    litellm_params:\n      model: openai/gpt-5.4\n      api_base: ${azureBase}\n      api_key: ${azureKey}\n${geminiKey ? `\n  - model_name: gemini\n    litellm_params:\n      model: gemini/gemini-3.1-pro-preview\n      api_key: ${geminiKey}\n` : ''}`
}

function renderClaudeSettings() {
  return JSON.stringify({
    env: {
      ANTHROPIC_BASE_URL: 'http://127.0.0.1:4000',
      ANTHROPIC_AUTH_TOKEN: 'sk-proxy',
      ANTHROPIC_MODEL: 'gpt54'
    },
    model: 'gpt54'
  }, null, 2) + '\n'
}

function renderMcpConfig() {
  return JSON.stringify({
    mcpServers: {
      playwright: {
        command: 'npx',
        args: ['-y', '@playwright/mcp']
      }
    }
  }, null, 2) + '\n'
}

function renderStartLiteLLM() {
  return `#!/bin/zsh\nset -euo pipefail\n\nexport LITELLM_API_KEY="\${LITELLM_API_KEY:-sk-proxy}"\nexec ~/.local/bin/litellm --config ~/litellm_config.yaml --port 4000\n`
}

function renderClaudeLauncher(projectRoot) {
  return `#!/bin/zsh\nset -euo pipefail\n\nexport ANTHROPIC_BASE_URL="\${ANTHROPIC_BASE_URL:-http://127.0.0.1:4000}"\nexport ANTHROPIC_AUTH_TOKEN="\${ANTHROPIC_AUTH_TOKEN:-sk-proxy}"\nexport ANTHROPIC_MODEL="\${ANTHROPIC_MODEL:-gpt54}"\n\nexec claude --model "\${ANTHROPIC_MODEL}" --tools 'Bash,Edit,Read,Write,Glob,Grep,LS,MultiEdit,NotebookRead,NotebookEdit,WebFetch,WebSearch' --strict-mcp-config --mcp-config '${projectRoot}/.claude/mcp-gpt54.json' --permission-mode bypassPermissions "$@"\n`
}

function renderCodexLauncher() {
  return `#!/bin/zsh\nset -euo pipefail\n\nexec codex "$@"\n`
}

if (command === 'init') {
  const azureBase = process.env.AZURE_OPENAI_BASE || ''
  const azureKey = process.env.AZURE_OPENAI_KEY || ''
  const geminiKey = process.env.GEMINI_API_KEY || ''

  if (!azureBase || !azureKey) {
    console.error('Missing AZURE_OPENAI_BASE or AZURE_OPENAI_KEY')
    process.exit(1)
  }

  writeFile(path.join(homeDir, 'litellm_config.yaml'), renderLiteLLMConfig({ azureBase, azureKey, geminiKey }))
  writeFile(path.join(homeDir, '.claude', 'settings.json'), renderClaudeSettings())
  writeFile(path.join(cwd, '.claude', 'mcp-gpt54.json'), renderMcpConfig())
  writeFile(path.join(cwd, 'scripts', 'start-litellm.sh'), renderStartLiteLLM(), 0o755)
  writeFile(path.join(cwd, 'Claude_new'), renderClaudeLauncher(cwd), 0o755)
  writeFile(path.join(cwd, 'codex_new'), renderCodexLauncher(), 0o755)
  console.log('ai-cli-kit init completed')
} else {
  console.log('Usage: ai-cli-kit init')
}
