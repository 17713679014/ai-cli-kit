# ai-cli-kit

一套用于统一 **LiteLLM + Codex CLI + Claude Code + Azure GPT-5.4** 的可迁移工具包。

## 目标

换电脑后，你只需要准备自己的 Key：

- `AZURE_OPENAI_BASE`
- `AZURE_OPENAI_KEY`
- 可选 `GEMINI_API_KEY`

然后运行初始化，即可恢复：

- `~/litellm_config.yaml`
- `~/.claude/settings.json`
- `.claude/mcp-gpt54.json`
- 启动脚本与极简命令

## 初始化

```bash
AZURE_OPENAI_BASE='https://your-resource.openai.azure.com/openai/v1' \
AZURE_OPENAI_KEY='your-key' \
node bin/ai-cli-kit.mjs init
```

## 生成内容

- LiteLLM 配置
- Claude Code 配置
- GPT-5.4 工具白名单 MCP 配置
- 启动脚本模板

## 博客复盘

完整实践复盘见：

- `docs/blog.md`
