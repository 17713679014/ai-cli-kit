# ai-cli-kit

一套用于统一 **LiteLLM + Codex CLI + Claude Code + Azure GPT-5.4** 的可迁移工具包。

## 目标

换电脑后，你只需要准备自己的 Key：

- `AZURE_OPENAI_BASE`
- `AZURE_OPENAI_KEY`
- 可选 `GEMINI_API_KEY`

然后执行初始化，即可恢复：

- `~/litellm_config.yaml`
- `~/.claude/settings.json`
- `.claude/mcp-gpt54.json`
- `scripts/install-deps.sh`
- `llm`
- `codex_new`
- `Claude_new`

## 一键恢复流程

### 1. 初始化配置

```bash
AZURE_OPENAI_BASE='https://your-resource.openai.azure.com/openai/v1' \
AZURE_OPENAI_KEY='your-key' \
node bin/ai-cli-kit.mjs init
```

### 2. 安装依赖

如果 `init` 输出里有 missing：

```bash
./scripts/install-deps.sh
```

这个脚本会检查并安装：

- `pipx`
- `litellm`
- `claude`
- `codex`

### 3. 启动

```bash
llm
Claude_new
```

或：

```bash
llm
codex_new
```

## 依赖自检

```bash
node bin/ai-cli-kit.mjs doctor
```

## 博客复盘

完整实践复盘见：

- `docs/blog.md`
