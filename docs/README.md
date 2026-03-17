# ai-cli-kit

可复用的 LiteLLM + Codex + Claude Code 启动套件。

## 目标

换电脑后，只需要提供：

- `AZURE_OPENAI_BASE`
- `AZURE_OPENAI_KEY`
- 可选 `GEMINI_API_KEY`

然后执行：

```bash
node packages/ai-cli-kit/bin/ai-cli-kit.mjs init
```

即可生成：

- `~/litellm_config.yaml`
- `~/.claude/settings.json`
- `.claude/mcp-gpt54.json`
- `scripts/start-litellm.sh`
- `Claude_new`
- `codex_new`
