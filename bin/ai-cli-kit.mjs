#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const homeDir = os.homedir()
const cwd = process.cwd()
const args = process.argv.slice(2)
const command = args[0]
const isMac = process.platform === 'darwin'

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

function commandExists(name) {
  const result = spawnSync('bash', ['-lc', `command -v ${name}`], { encoding: 'utf8' })
  return result.status === 0 && result.stdout.trim().length > 0
}

function detectDeps() {
  return {
    node: commandExists('node'),
    npm: commandExists('npm'),
    pipx: commandExists('pipx'),
    litellm: commandExists('litellm') || commandExists(path.join(homeDir, '.local', 'bin', 'litellm')),
    claude: commandExists('claude'),
    codex: commandExists('codex')
  }
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

function renderGlobalLiteLLMLauncher(projectRoot) {
  return `#!/bin/zsh\nset -euo pipefail\n\nexec '${projectRoot}/scripts/start-litellm.sh'\n`
}

function renderGlobalClaudeLauncher(projectRoot) {
  return `#!/bin/zsh\nset -euo pipefail\n\nexec '${projectRoot}/Claude_new' "$@"\n`
}

function renderGlobalCodexLauncher(projectRoot) {
  return `#!/bin/zsh\nset -euo pipefail\n\nexec '${projectRoot}/codex_new' "$@"\n`
}

function renderInstallDepsScript() {
  const brewLine = isMac ? `if ! command -v brew >/dev/null 2>&1; then\n  echo 'Please install Homebrew first: https://brew.sh'\n  exit 1\nfi\n\nif ! command -v pipx >/dev/null 2>&1; then\n  brew install pipx\n  pipx ensurepath\nfi\n` : ''
  return `#!/bin/zsh\nset -euo pipefail\n\n${brewLine}if ! command -v litellm >/dev/null 2>&1 && [ ! -x \"$HOME/.local/bin/litellm\" ]; then\n  pipx install \"litellm[proxy]\"\nfi\n\nif ! command -v claude >/dev/null 2>&1; then\n  npm install -g @anthropic-ai/claude-code\nfi\n\nif ! command -v codex >/dev/null 2>&1; then\n  npm install -g @openai/codex\nfi\n\necho 'Dependency bootstrap finished.'\n`
}

function installGlobalLaunchers(projectRoot) {
  const binDir = path.join(homeDir, '.local', 'bin')
  ensureDir(binDir)
  writeFile(path.join(binDir, 'llm'), renderGlobalLiteLLMLauncher(projectRoot), 0o755)
  writeFile(path.join(binDir, 'Claude_new'), renderGlobalClaudeLauncher(projectRoot), 0o755)
  writeFile(path.join(binDir, 'codex_new'), renderGlobalCodexLauncher(projectRoot), 0o755)
}

function printDepsStatus(deps) {
  console.log('dependency status:')
  for (const [name, ok] of Object.entries(deps)) {
    console.log(`- ${name}: ${ok ? 'ok' : 'missing'}`)
  }
}

if (command === 'doctor') {
  printDepsStatus(detectDeps())
  process.exit(0)
}

if (command === 'init') {
  const azureBase = process.env.AZURE_OPENAI_BASE || ''
  const azureKey = process.env.AZURE_OPENAI_KEY || ''
  const geminiKey = process.env.GEMINI_API_KEY || ''

  if (!azureBase || !azureKey) {
    console.error('Missing AZURE_OPENAI_BASE or AZURE_OPENAI_KEY')
    process.exit(1)
  }

  const deps = detectDeps()
  printDepsStatus(deps)

  writeFile(path.join(homeDir, 'litellm_config.yaml'), renderLiteLLMConfig({ azureBase, azureKey, geminiKey }))
  writeFile(path.join(homeDir, '.claude', 'settings.json'), renderClaudeSettings())
  writeFile(path.join(cwd, '.claude', 'mcp-gpt54.json'), renderMcpConfig())
  writeFile(path.join(cwd, 'scripts', 'start-litellm.sh'), renderStartLiteLLM(), 0o755)
  writeFile(path.join(cwd, 'scripts', 'install-deps.sh'), renderInstallDepsScript(), 0o755)
  writeFile(path.join(cwd, 'Claude_new'), renderClaudeLauncher(cwd), 0o755)
  writeFile(path.join(cwd, 'codex_new'), renderCodexLauncher(), 0o755)
  installGlobalLaunchers(cwd)

  console.log('\nai-cli-kit init completed')
  console.log('next steps:')
  if (!deps.litellm || !deps.claude || !deps.codex || !deps.pipx) {
    console.log('- run ./scripts/install-deps.sh')
  }
  console.log('- run llm')
  console.log('- run Claude_new or codex_new')
  process.exit(0)
}

console.log('Usage: ai-cli-kit init | doctor')
