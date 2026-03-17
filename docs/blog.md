# 用 LiteLLM 打通 Codex CLI 与 Claude Code(有key即可实现编程自由)

最近我一直在做一件事：既然 **Codex CLI** 已经可以通过 **LiteLLM** 接入 **Azure GPT-5.4**，那能不能进一步把 **Claude Code** 也打通，让两套 CLI 共用同一层代理、同一组模型别名、同一套启动方式？

更重要的是，这个过程不能只做到“能聊”，而是要尽量保留 Claude Code 的工程能力，比如代码读取、编辑、搜索，以及可用的 MCP 工具。

最终结果是：**可以，而且不需要长期维护一层自建的 Anthropic shim。** Claude Code 直接走 LiteLLM 的 Anthropic-compatible `/v1/messages` 即可。真正的难点，不在模型，而在 **工具 schema 的兼容性治理**。

---

## 一、先说结论：最终落地方案是什么？

先把结论放前面，方便只想看结果的同学快速判断这套方案是否值得继续看下去。

最终我们打通的是这样一条链路：

```text
Codex CLI      ─┐
                ├─ LiteLLM Proxy :4000 ──> Azure OpenAI GPT-5.4
Claude Code   ──┘
```

对应关系如下：

- **Codex CLI** 继续走 OpenAI 兼容入口
- **Claude Code** 改为直连 LiteLLM 的 Anthropic-compatible `/v1/messages`
- **统一模型别名为 `gpt54`**
- **Claude Code 不再加载全量 MCP，而是采用工具白名单 + MCP 白名单**

一句话总结就是：

> **Codex 和 Claude 可以共用一个 LiteLLM，GPT-5.4 作为统一模型中枢；Claude Code 的核心内置工具可用，真正需要处理的是少量不兼容的 MCP。**

1. **没必要长期维护一层自建协议网关**
2. **Claude Code 能接 Azure GPT-5.4，重点不是模型兼容，而是工具兼容**
3. **白名单治理比“全量兼容”更适合作为第一阶段落地方案**

---

## 二、为什么要把 Codex CLI 和 Claude Code 放到同一条链路里？

这么做的核心目的，不只是“图省事”，而是为了把日常 AI 开发环境真正统一起来。

统一之后，你能得到几个很现实的收益：

- **模型治理统一**：客户端不再各配各的模型和 Key，统一交给 LiteLLM
- **切换成本更低**：以后想换模型，优先改 LiteLLM 配置，而不是分别改 Codex / Claude
- **启动方式统一**：无论用 Codex 还是 Claude，心智都变成“先起代理，再起客户端”
- **环境可迁移**：换电脑后，只要恢复一套配置，就能把整套链路带回来

这背后其实是在做一件很工程化的事：

> **把“多个 AI CLI + 多个模型供应商 + 多套协议入口”收束成一层统一代理。**

这也是我这次实践里真正觉得有价值的地方。

---

## 三、一开始为什么会走弯路？

最开始最自然的想法，是自己在 Claude Code 和 LiteLLM 中间再加一层 Anthropic-compatible Gateway：

```text
Claude Code
   ↓
自建 Anthropic-compatible Gateway
   ↓
LiteLLM
   ↓
Azure GPT-5.4
```

从直觉上看，这个思路很合理：

- Claude Code 说 Anthropic 风格协议
- LiteLLM 再帮我们转给 Azure
- 中间有不兼容的地方，就自己补一层

而且这条路**短期内确实能跑通**。当时做了一个最小原型：

- `services/claude-gateway.mjs`
- `POST /v1/messages`
- `POST /v1/messages/count_tokens`
- SSE 文本流转发

这个原型用 `curl` 是能打通的，所以一开始很容易让人误以为：方向对了，继续补细节就行。

但问题在于，**“能跑通”不等于“适合长期维护”**。

真正接入 Claude Code CLI 之后，很快就会发现这条路的问题：

1. Claude Code 并不会因为几个猜测性的环境变量，就稳定切换到你自建的 shim
2. 即便短期能用，长期也要自己维护一整套 Anthropic 兼容细节
3. 这些细节不只是普通 HTTP 转发，还包括：
   - headers
   - SSE 事件格式
   - 错误结构
   - `count_tokens`
   - tool use / tool result
4. LiteLLM 本身已经具备多协议代理能力，再叠一层长期 shim，只会让链路越来越复杂

所以回头看，这条路的问题不是“完全走不通”，而是：

> **它更适合技术验证，不适合作为长期方案。**

---

## 四、真正更稳的方案：让 Claude Code 直接连 LiteLLM 的 `/v1/messages`

后面我调整思路，直接对 LiteLLM 发起 Anthropic 风格请求，验证它自己的 `/v1/messages` 能不能承接 Claude 风格消息。

测试命令大致如下：

```bash
curl http://127.0.0.1:4000/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: sk-proxy" \
  -H "anthropic-version: 2023-06-01" \
  -d '{
    "model": "gpt54",
    "max_tokens": 128,
    "messages": [
      {"role": "user", "content": "reply with only: litellm-ok"}
    ]
  }'
```

结果直接返回：

```text
litellm-ok
```

这一步其实就是整个方案的转折点。

它证明了两件事：

1. **LiteLLM 本身已经能暴露 Anthropic-compatible `/v1/messages`**
2. **Claude Code 理论上没必要再经过一层自建长期网关**

也就是说，真正更合理的链路应该是：

```text
Claude Code
   ↓
LiteLLM /v1/messages
   ↓
Azure GPT-5.4
```

从工程角度说，这个调整非常关键。

因为一旦走这条路，后面要解决的问题就从“协议伪装”变成了“协议内的具体兼容项”，复杂度会下降很多。

一句话概括就是：

> **不是再造一层 Anthropic API，而是直接复用 LiteLLM 已有的 Anthropic-compatible 能力。**

---

## 五、统一代理层架构：Codex 走 OpenAI，Claude 走 Anthropic

把思路理顺之后，整个架构就很清晰了：

```text
Codex CLI      --> LiteLLM OpenAI-compatible /v1        --> Azure OpenAI GPT-5.4
Claude Code   --> LiteLLM Anthropic-compatible /v1/messages --> Azure OpenAI GPT-5.4
```

可以把这几层理解成下面这样：


| 层级         | 职责                 | 说明                                                          |
| ------------ | -------------------- | ------------------------------------------------------------- |
| Codex CLI    | OpenAI 风格客户端    | 通过`base_url=http://127.0.0.1:4000/v1` 访问 LiteLLM          |
| Claude Code  | Anthropic 风格客户端 | 通过`ANTHROPIC_BASE_URL=http://127.0.0.1:4000` 访问 LiteLLM   |
| LiteLLM      | 多协议统一代理层     | 同时暴露 OpenAI 兼容入口和 Anthropic-compatible`/v1/messages` |
| Azure OpenAI | 实际推理服务         | 最终执行`gpt-5.4`                                             |

这套架构最大的价值是：

- **客户端协议差异保留在客户端这一层**
- **模型路由和供应商接入收敛到 LiteLLM**
- **后续扩模型时，优先改代理层，不动客户端层**

这会让整套环境越来越稳定，而不是越来越碎片化。

---

## 六、LiteLLM 的模型配置怎么统一？

核心配置我放在 `~/litellm_config.yaml`，通过模型别名把底层供应商细节藏起来。

示例配置如下：

```yaml
general_settings:
  master_key: sk-proxy

litellm_settings:
  drop_params: true

model_list:
  - model_name: gpt54
    litellm_params:
      model: openai/gpt-5.4
      api_base: https://你的azure资源.openai.azure.com/openai/v1
      api_key: 你的Azure_Key

  - model_name: gemini
    litellm_params:
      model: gemini/gemini-3.1-pro-preview
      api_key: 你的Gemini_Key
```

这里有三个关键点：

### 1. 用模型别名统一客户端配置

`gpt54` 是统一模型别名。

这意味着：

- Codex 调的是 `gpt54`
- Claude Code 调的也是 `gpt54`
- 底层到底是 Azure、OpenAI 还是别的供应商，不让客户端关心

### 2. `drop_params: true` 很重要

这项配置的价值，在多客户端接入时非常明显。

因为不同客户端会带上不同参数，而底层模型供应商未必全部支持。开启 `drop_params: true` 后，LiteLLM 会尽量过滤掉后端不支持的字段，减少因为协议差异导致的 4xx。

### 3. LiteLLM 成为真正的“模型路由层”

从这一步开始，模型选择就不再分散在各个客户端里了，而是统一收敛到 LiteLLM。

这对后续扩展很有帮助，比如：

- 增加新的模型供应商
- 调整模型默认值
- 给不同团队做不同模型别名
- 统一统计和治理调用方式

---

## 七、真正的阻塞点：不是模型，而是工具 schema

当 Claude Code 真正通过 LiteLLM 打到 Azure GPT-5.4 之后，我遇到的第一个关键报错是：

```text
Invalid schema for function 'mcp__pencil__get_style_guide_tags'
object schema missing properties
invalid_function_parameters
```

这个错误非常有信息量，因为它说明：

- Claude Code 到 LiteLLM 的链路已经通了
- LiteLLM 到 Azure GPT-5.4 的模型调用也通了
- 真正失败的，不是“模型不行”，而是**工具定义的 schema 在这条函数调用链路上不兼容**

这一点很容易被误判。

很多人看到 Claude Code 调用失败，第一反应会以为：

- 是不是 Claude Code 不能接 Azure？
- 是不是 LiteLLM 的 Anthropic 兼容有问题？
- 是不是消息格式有坑？

但实际排查到这里，结论反而很清楚：

> **主链路已经通了，真正的阻塞点转移到了工具 schema。**

---

## 八、为什么工具 schema 会成为问题？

Claude Code 默认会自动附带两类工具：

1. **内置工具**

   - Bash
   - Edit
   - Read
   - Write
   - Grep
   - Glob
   - 等等
2. **本地 MCP server 暴露出来的工具**

问题就出在第二类。

某些 MCP server 的 JSON Schema，在 Anthropic 原生链路里没有问题，但进入 Azure / OpenAI 这类函数参数校验更严格的链路后，会出现兼容失败。

所以到这里，问题的本质就从：

- “Claude Code 能不能迁移？”

变成了：

- “Claude Code 的哪些工具能迁移？”
- “哪些 MCP server 需要隔离？”
- “哪些高价值 MCP 值得单独做 schema 兼容层？”

这一步很重要，因为它意味着策略要变。

**不是追求一上来全量无损迁移，而是先收敛到稳定可用的最小集合。**

这也是后来白名单策略的出发点。

---

## 九、工具能力的真实边界：哪些能用，哪些要隔离？

为了把问题收敛清楚，我把 Claude Code 的能力拆成三层逐步验证。

### 1. 无工具、纯推理模式：可用

在禁用工具、禁用 MCP 的情况下，Claude Code 可以成功返回：

```text
claude-litellm-ok
```

这一步说明：

- GPT-5.4 作为 Claude Code 的推理模型是成立的
- 主路径没有问题
- 问题并不在“Claude Code 接 Azure GPT-5.4 这件事本身”

### 2. Claude Code 核心内置工具：可用

经过白名单验证，以下内置工具可以稳定使用：

- Bash
- Edit
- Read
- Write
- Glob
- Grep
- LS
- MultiEdit
- NotebookRead
- NotebookEdit
- WebFetch
- WebSearch

这意味着 Claude Code 在这条链路下，并没有退化成一个“只能问答”的工具，而是仍然保留了相当重要的工程能力。

### 3. MCP：部分可用

当前验证结果是：

- **可保留：** `playwright`
- **需要隔离：** `pencil`

所以最终的工程形态，其实可以概括成：

```text
Claude Code + GPT-5.4
+ 内置工具白名单
+ 白名单 MCP（playwright）
- 问题 MCP（pencil）
```

这个结果非常关键。

因为它说明我们拿到的不是一个“残缺版 Claude Code”，而是一个已经能进入真实工程工作流的版本。

---

## 十、最终可落地的运行方式

把协议和工具问题都收敛之后，整个方案就能落到日常使用方式上了。

### 1. LiteLLM 启动脚本

统一脚本：

```bash
scripts/start-litellm.sh
```

我给它做了一个最短命令入口：

```bash
llm
```

### 2. Claude Code 启动脚本

统一脚本：

```bash
scripts/cc-gpt54.sh
```

最短命令：

```bash
Claude_new
```

这个脚本会自动完成几件事：

- 指向 `ANTHROPIC_BASE_URL=http://127.0.0.1:4000`
- 使用 `ANTHROPIC_MODEL=gpt54`
- 保留内置工具白名单
- 严格只加载 `.claude/mcp-gpt54.json`

### 3. Codex 启动方式

Codex 这边保持原有习惯即可：

```bash
codex
codex -m gpt54
codex -m gemini
```

我同样给它做了一个更省事的入口：

```bash
codex_new
```

---

## 十一、统一后的使用心智：真的会顺手很多

这套方案最终最让我满意的，不只是“打通了”，而是它把日常使用方式也统一了。

现在实际操作很简单：

### 终端 1：启动代理

```bash
llm
```

### 终端 2：启动客户端

如果你要用 Codex：

```bash
codex_new
```

如果你要用 Claude Code：

```bash
Claude_new
```

到这一步，整个环境的心智模型已经非常清晰：

- 同一个 LiteLLM
- 同一个模型别名 `gpt54`
- 同一个 Azure GPT-5.4
- 不同的只是你想用 Codex 还是 Claude Code 作为前端 CLI

这种统一感，在日常开发里其实非常重要。

因为当你切客户端时，你不会再有“我是不是还要换一套配置”的负担。

---

## 十二、为什么还要再抽一个 `ai-cli-kit`？

当脚本、配置、白名单文件越来越多之后，我很快意识到一个问题：

**如果这些东西都散落在业务仓库里，下一次换电脑时，还是得重新回忆一遍。**

所以后面我把核心能力抽成了一个更适合复用的目录形态：

```text
packages/ai-cli-kit/
  bin/
  templates/
  docs/
```

这样做的目标很明确：

- 未来可以单独放成一个 GitHub 仓库
- 换电脑后只需要拉这个仓库
- 填入自己的 Azure / Gemini / Anthropic Key
- 一键生成 `llm` / `codex_new` / `Claude_new`
- 一键生成 `~/litellm_config.yaml`、`~/.claude/settings.json` 和白名单 MCP 配置

换句话说，真正想做的不是“这台电脑终于配好了”，而是：

> **把一次人工调试，沉淀成一套可复制、可迁移、可恢复的工具化方案。**

这对长期使用来说，比单次跑通更有价值。

---

## 十三、Phase 1 实际完成了什么？

目前第一阶段已经落地的内容如下：

- [X]  验证 Codex 通过 LiteLLM 使用 Azure GPT-5.4
- [X]  验证 LiteLLM 的 `/v1/messages` Anthropic 兼容入口可用
- [X]  验证 Claude Code 通过 LiteLLM 使用 Azure GPT-5.4
- [X]  验证无工具模式可用
- [X]  验证核心内置工具白名单可用
- [X]  确认 `pencil` MCP 是主要 schema 阻塞项
- [X]  产出 `.claude/mcp-gpt54.json` 白名单配置
- [X]  产出 `llm / codex_new / Claude_new` 三个极简命令
- [X]  抽离 `packages/ai-cli-kit` 作为外部仓库基础骨架

这意味着，第一阶段的目标已经不是“证明可行”，而是进入了“可持续使用”的状态。

---

## 十四、当前边界与下一步怎么做？

当然，这套方案现在也不是完全终态，它还有清晰的边界。

### 当前已经实现的部分

- GPT-5.4 已经成功作为 Codex / Claude 的统一模型中枢
- Claude Code 的核心内置工具已经保留
- Playwright MCP 已经可以继续使用
- 问题被收敛到少数不兼容 MCP，而不是整个平台不可用

### 当前还没完全解决的部分

- 还没有做到“全量 MCP 无损迁移”
- 还没有为每个 MCP server 自动做 schema sanitizer

### 下一步更正确的方向

在我看来，接下来真正值得做的，不是继续堆复杂网关，而是：

1. 逐个审计 MCP server 的 schema
2. 将不兼容的 server 加入隔离名单
3. 对高价值 MCP 单独补兼容层
4. 将 `packages/ai-cli-kit` 独立成外部仓库，支持一键初始化环境

这条路线的好处是：**复杂度是可控增长的**。

你不会因为追求“一次性全兼容”，把系统重新拖回高复杂度状态。

---

## 十五、总结：这次实践真正解决了什么？

这次实践的价值，不只是“又多写了几个脚本”，而是把一个看似很乱的问题，收束成了一套稳定范式：

```text
一个 LiteLLM
一组模型别名
两类 CLI 客户端
一套统一启动方式
一套逐步扩展的工具白名单治理策略
```

对于 Codex 来说，LiteLLM 是 OpenAI 兼容代理。

对于 Claude Code 来说，LiteLLM 是 Anthropic-compatible 网关。

对于 Azure GPT-5.4 来说，它成为了两边共享的统一推理核心。

而从工程管理视角看，最重要的成果其实是这句：

> **这套方案开始摆脱“靠记忆手调”的状态，进化成了一个可迁移、可复制、可在下一台电脑上一键恢复的工具化方案。**

如果你也在折腾多 AI CLI、多模型供应商、多协议入口的统一接入，希望这篇文章能帮你少走一点弯路。

因为很多时候，真正的问题不在于“模型能不能接”，而在于：

- 协议要不要自己维护
- 工具链该不该全量放开
- 哪些问题应该靠治理，而不是靠继续堆中间层

把这几个问题想清楚，方案就会变得简单很多。
