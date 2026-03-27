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
- 尝试安装缺失依赖：
  - `pipx`
  - `litellm`
  - `claude`
  - `codex`

## 其他命令

### 只初始化配置

```bash
AZURE_OPENAI_BASE='https://your-resource.openai.azure.com/openai/v1' \
AZURE_OPENAI_KEY='your-key' \
node bin/ai-cli-kit.mjs init
```

### 依赖自检

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
