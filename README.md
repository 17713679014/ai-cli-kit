# ai-cli-kit

一套用于统一 **LiteLLM + Codex CLI + Claude Code + Azure GPT-5.4** 的可迁移工具包。

## 最推荐的方式

换电脑后，直接执行：

```bash
AZURE_OPENAI_BASE='https://your-resource.openai.azure.com/openai/v1' \
AZURE_OPENAI_KEY='your-key' \
node bin/ai-cli-kit.mjs bootstrap
```

这条命令会自动：

- 写入 `~/litellm_config.yaml`
- 写入 `~/.claude/settings.json`
- 生成 `.claude/mcp-gpt54.json`
- 生成 `llm` / `codex_new` / `Claude_new`
- 检查依赖
- 检查 `localhost` 解析是否异常
- 检查 LiteLLM 的 `uvloop` / Python 3.14 兼容性
- 尝试安装缺失依赖：
  - `pipx`
  - `litellm`
  - `claude`
  - `codex`
- 自动修复 LiteLLM 的 `uvloop` 问题

## LiteLLM 兼容修复

当前工具会自动处理这个已知问题：

- Python 3.14
- `uvloop` 与 `uvicorn` 不兼容
- LiteLLM 启动时报：
  - `ImportError: cannot import name 'BaseDefaultEventLoopPolicy'`

如果你想单独修复，也可以执行：

```bash
node bin/ai-cli-kit.mjs fix-litellm
```

## 启动兼容修复

生成的 `start-litellm.sh` 会默认使用：

```bash
litellm --host 127.0.0.1 --config ~/litellm_config.yaml --port 4000
```

如果 `doctor` 检查到 `localhost` 解析异常，会提示你：

- 修复 `/etc/hosts`
- 或继续依赖 `127.0.0.1` fallback

## 其他命令

### 只初始化配置

```bash
AZURE_OPENAI_BASE='https://your-resource.openai.azure.com/openai/v1' \
AZURE_OPENAI_KEY='your-key' \
node bin/ai-cli-kit.mjs init
```

### 依赖与环境自检

```bash
node bin/ai-cli-kit.mjs doctor
```

## 启动

```bash
llm
Claude_new
```

或：

```bash
llm
codex_new
```

## 博客复盘

完整实践复盘见：

- `docs/blog.md`
