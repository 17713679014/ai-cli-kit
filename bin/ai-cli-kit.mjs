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
const litellmVenvPython = path.join(homeDir, '.local', 'pipx', 'venvs', 'litellm', 'bin', 'python')

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true })
}

function writeFile(filePath, content, mode) {
  ensureDir(path.dirname(filePath))
  fs.writeFileSync(filePath, content)
  if (mode) fs.chmodSync(filePath, mode)
  console.log(`written: ${filePath}`)
}

function runShell(commandText, options = {}) {
  return spawnSync('bash', ['-lc', commandText], {
    stdio: options.stdio || 'pipe',
    encoding: 'utf8'
  })
}

function commandExists(name) {
  const result = runShell(`command -v ${name}`)
  return result.status === 0 && result.stdout.trim().length > 0
}

function checkLocalhostResolution() {
  const result = runShell("python3 - <<'PY'\nimport socket\ntry:\n    socket.getaddrinfo('localhost', 4000)\n    print('ok')\nexcept Exception as e:\n    print(f'error:{e}')\n    raise\nPY")
  return {
    ok: result.status === 0,
    output: `${result.stdout || ''}${result.stderr || ''}`.trim()
  }
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

function getLiteLLMRuntimeInfo() {
  if (!fs.existsSync(litellmVenvPython)) {
    return {
      installed: false,
      needsUvloopFix: false,
      detail: 'litellm pipx venv not found'
    }
  }

  const probe = runShell(`'${litellmVenvPython}' - <<'PY'\nimport os, sys\npyver = f\"{sys.version_info.major}.{sys.version_info.minor}\"\nsite = next((p for p in sys.path if 'site-packages' in p), '')\nuvloop_py = os.path.join(site, 'uvicorn', 'loops', 'uvloop.py') if site else ''\nuvloop_pkg = os.path.join(site, 'uvloop', '__init__.py') if site else ''\nprint(pyver)\nprint(uvloop_py)\nprint(os.path.exists(uvloop_py))\nprint(os.path.exists(uvloop_pkg))\nif os.path.exists(uvloop_py):\n    print(open(uvloop_py, 'r', encoding='utf-8').read())\nPY`)

  if (probe.status !== 0) {
    return {
      installed: true,
      needsUvloopFix: false,
      detail: `${probe.stdout || ''}${probe.stderr || ''}`.trim()
    }
  }

  const lines = probe.stdout.split('\n')
  const pythonVersion = (lines[0] || '').trim()
  const uvloopPyPath = (lines[1] || '').trim()
  const uvloopPyExists = (lines[2] || '').trim() === 'True'
  const uvloopPkgExists = (lines[3] || '').trim() === 'True'
  const uvloopPyContent = lines.slice(4).join('\n')
  const needsUvloopFix = pythonVersion.startsWith('3.14') && (uvloopPkgExists || /import uvloop/.test(uvloopPyContent))

  return {
    installed: true,
    pythonVersion,
    uvloopPyPath,
    uvloopPyExists,
    uvloopPkgExists,
    needsUvloopFix,
    detail: needsUvloopFix ? 'Python 3.14 with uvloop import path still active' : 'uvloop compatibility looks ok'
  }
}

function printDepsStatus(deps) {
  console.log('dependency status:')
  for (const [name, ok] of Object.entries(deps)) {
    console.log(`- ${name}: ${ok ? 'ok' : 'missing'}`)
  }
}

function printLocalhostStatus() {
  const localhost = checkLocalhostResolution()
  console.log(`- localhost resolution: ${localhost.ok ? 'ok' : 'broken'}`)
  if (!localhost.ok) {
    console.log('  hint: fix /etc/hosts so localhost resolves, e.g. 127.0.0.1 localhost and ::1 localhost')
    console.log('  fallback: generated LiteLLM launcher already forces --host 127.0.0.1')
    if (localhost.output) console.log(`  detail: ${localhost.output}`)
  }
}

function printLiteLLMFixStatus() {
  const info = getLiteLLMRuntimeInfo()
  if (!info.installed) {
    console.log(`- litellm uvloop fix: skipped (${info.detail})`)
    return info
  }
  console.log(`- litellm python: ${info.pythonVersion || 'unknown'}`)
  console.log(`- litellm uvloop fix needed: ${info.needsUvloopFix ? 'yes' : 'no'}`)
  if (info.detail) console.log(`  detail: ${info.detail}`)
  return info
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
  return `#!/bin/zsh\nset -euo pipefail\n\nexport LITELLM_API_KEY="\${LITELLM_API_KEY:-sk-proxy}"\necho \"🚀 启动 LiteLLM Proxy on http://127.0.0.1:4000 ...\"\nexec ~/.local/bin/litellm --host 127.0.0.1 --config ~/litellm_config.yaml --port 4000\n`
}

function renderInstallDepsScript() {
  const brewLine = isMac ? `if ! command -v brew >/dev/null 2>&1; then\n  echo 'Please install Homebrew first: https://brew.sh'\n  exit 1\nfi\n\nif ! command -v pipx >/dev/null 2>&1; then\n  brew install pipx\n  pipx ensurepath\nfi\n` : ''
  return `#!/bin/zsh\nset -euo pipefail\n\n${brewLine}if ! command -v litellm >/dev/null 2>&1 && [ ! -x \"$HOME/.local/bin/litellm\" ]; then\n  pipx install \"litellm[proxy]\"\nfi\n\nif ! command -v claude >/dev/null 2>&1; then\n  npm install -g @anthropic-ai/claude-code\nfi\n\nif ! command -v codex >/dev/null 2>&1; then\n  npm install -g @openai/codex\nfi\n\necho 'Dependency bootstrap finished.'\n`
}

function renderClaudeLauncher(projectRoot) {
  return `#!/bin/zsh\nset -euo pipefail\n\nexport ANTHROPIC_BASE_URL="\${ANTHROPIC_BASE_URL:-http://127.0.0.1:4000}"\nexport ANTHROPIC_AUTH_TOKEN="\${ANTHROPIC_AUTH_TOKEN:-sk-proxy}"\nexport ANTHROPIC_MODEL="\${ANTHROPIC_MODEL:-gpt54}"\n\nexec claude --model "\${ANTHROPIC_MODEL}" --tools 'Bash,Edit,Read,Write,Glob,Grep,LS,MultiEdit,NotebookRead,NotebookEdit,WebFetch,WebSearch' --strict-mcp-config --mcp-config '${cwd}/.claude/mcp-gpt54.json' --permission-mode bypassPermissions "$@"\n`
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

function installGlobalLaunchers(projectRoot) {
  const binDir = path.join(homeDir, '.local', 'bin')
  ensureDir(binDir)
  writeFile(path.join(binDir, 'llm'), renderGlobalLiteLLMLauncher(projectRoot), 0o755)
  writeFile(path.join(binDir, 'Claude_new'), renderGlobalClaudeLauncher(projectRoot), 0o755)
  writeFile(path.join(binDir, 'codex_new'), renderGlobalCodexLauncher(projectRoot), 0o755)
}

function fixLiteLLM() {
  const info = getLiteLLMRuntimeInfo()
  if (!info.installed) {
    console.log(`litellm fix skipped: ${info.detail}`)
    return true
  }
  if (!info.needsUvloopFix) {
    console.log('litellm uvloop compatibility already ok')
    return true
  }
  if (!info.uvloopPyPath || !info.uvloopPyExists) {
    console.log('litellm fix skipped: uvicorn uvloop.py not found')
    return false
  }

  const uninstall = runShell(`'${litellmVenvPython}' -m pip uninstall uvloop -y`, { stdio: 'inherit' })
  if (uninstall.status !== 0) {
    console.error('failed to uninstall uvloop from litellm venv')
    return false
  }

  const replacement = `from __future__ import annotations\nimport asyncio\nfrom collections.abc import Callable\n\ndef uvloop_loop_factory(use_subprocess: bool = False) -> Callable[[], asyncio.AbstractEventLoop]:\n    return asyncio.new_event_loop\n`
  fs.writeFileSync(info.uvloopPyPath, replacement)
  console.log(`patched: ${info.uvloopPyPath}`)
  return true
}

function doInit() {
  const azureBase = process.env.AZURE_OPENAI_BASE || ''
  const azureKey = process.env.AZURE_OPENAI_KEY || ''
  const geminiKey = process.env.GEMINI_API_KEY || ''

  if (!azureBase || !azureKey) {
    console.error('Missing AZURE_OPENAI_BASE or AZURE_OPENAI_KEY')
    process.exit(1)
  }

  const deps = detectDeps()
  printDepsStatus(deps)
  printLocalhostStatus()
  printLiteLLMFixStatus()

  writeFile(path.join(homeDir, 'litellm_config.yaml'), renderLiteLLMConfig({ azureBase, azureKey, geminiKey }))
  writeFile(path.join(homeDir, '.claude', 'settings.json'), renderClaudeSettings())
  writeFile(path.join(cwd, '.claude', 'mcp-gpt54.json'), renderMcpConfig())
  writeFile(path.join(cwd, 'scripts', 'start-litellm.sh'), renderStartLiteLLM(), 0o755)
  writeFile(path.join(cwd, 'scripts', 'install-deps.sh'), renderInstallDepsScript(), 0o755)
  writeFile(path.join(cwd, 'Claude_new'), renderClaudeLauncher(cwd), 0o755)
  writeFile(path.join(cwd, 'codex_new'), renderCodexLauncher(), 0o755)
  installGlobalLaunchers(cwd)

  console.log('\nai-cli-kit init completed')
  return deps
}

function doBootstrap() {
  const depsBefore = doInit()
  const needInstall = !depsBefore.pipx || !depsBefore.litellm || !depsBefore.claude || !depsBefore.codex

  if (!needInstall) {
    console.log('all dependencies already installed')
  } else {
    console.log('\nrunning dependency bootstrap...')
    const result = runShell('./scripts/install-deps.sh', { stdio: 'inherit' })
    if (result.status !== 0) {
      console.error('dependency bootstrap failed')
      process.exit(result.status || 1)
    }
  }

  console.log('\nchecking litellm runtime compatibility...')
  if (!fixLiteLLM()) {
    console.error('litellm runtime fix failed')
    process.exit(1)
  }

  console.log('\nfinal status:')
  printDepsStatus(detectDeps())
  printLocalhostStatus()
  printLiteLLMFixStatus()
  console.log('\nready: run llm, then Claude_new or codex_new')
}

if (command === 'doctor') {
  printDepsStatus(detectDeps())
  printLocalhostStatus()
  printLiteLLMFixStatus()
  process.exit(0)
}

if (command === 'fix-litellm') {
  const ok = fixLiteLLM()
  process.exit(ok ? 0 : 1)
}

if (command === 'init') {
  doInit()
  console.log('next steps: run ./scripts/install-deps.sh if something is missing, then run node bin/ai-cli-kit.mjs fix-litellm')
  process.exit(0)
}

if (command === 'bootstrap') {
  doBootstrap()
  process.exit(0)
}

console.log('Usage: ai-cli-kit init | bootstrap | doctor | fix-litellm')
