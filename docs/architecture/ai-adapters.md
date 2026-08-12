# AI Provider Adapters

> 代码源头：`packages/ai/src/text-model-adapter.ts`、`packages/ai/src/guarded-fetch.ts`、`packages/ai/src/stream-chat-text.ts`
> 状态：Goal 2.4 已实现首批文本 adapter、精确 endpoint contract、运行时网络防线、零隐式重试与 usage 归一化；Goal 2.5 已由 `@repo/chat-engine` 接入稳定执行事件与安全错误，debug/failover 仍属 Goal 3。

## 边界

`@repo/ai` 使用 AI SDK 7，但不把 AI SDK 当作模型目录、路由器、聊天数据库或账单事实源。composition root 负责：

1. 从 `@repo/model-router` 获取单一 `ResolvedModelRoute`。
2. 根据 `credentialRef` 从 server environment 解析 secret value。
3. 把稳定 route 字段、secret value 和共享 `NetworkTargetPolicy` 注入 adapter。
4. 由 `@repo/chat-engine` 消费完整 AI SDK stream，转换为稳定 generation event、持久 checkpoint 和 normalized failure。

adapter 不读取环境，不访问数据库，也不返回 credential。model name 由目录配置提供；代码不维护会过期的厂商模型 ID allowlist。

## 已实现协议矩阵

| Provider family | ProtocolId | AI SDK adapter | Endpoint contract |
| --- | --- | --- | --- |
| `openai` | `openai_responses` | `@ai-sdk/openai.responses()` | `POST {base}/responses` |
| `openai` | `openai_chat_completions` | `@ai-sdk/openai.chat()` | `POST {base}/chat/completions` |
| `openai-compatible` | `openai_chat_completions` | `@ai-sdk/openai-compatible` | `POST {base}/chat/completions` |
| `openrouter` | `openrouter_chat_completions` | OpenAI-compatible + usage stream option | `POST {base}/chat/completions` |
| `anthropic` | `anthropic_messages` | `@ai-sdk/anthropic.messages()` | `POST {base}/messages` |
| `google` | `google_generate_content` | `@ai-sdk/google.chat()` | `POST .../{model}:streamGenerateContent?alt=sse` |
| `xai` | `xai_responses` | `@ai-sdk/xai.responses()` | `POST {base}/responses` |

矩阵以 provider family + protocol 的组合精确匹配。`openrouter_responses`、Gemini Interactions、Vercel AI Gateway 和媒体协议虽然已是稳定目录标识，但当前明确返回 `unsupported_protocol`，绝不静默改走 Chat Completions 或其他相似 endpoint。OpenAI-compatible 可显式配置为无 credential 的可信本地服务；官方厂商和 OpenRouter 必须注入非空 credential。

## 流、重试与停止

`streamChatText()` 接收 prompt 或 AI SDK `ModelMessage[]`、system prompt 与 `AbortSignal`，并固定 `maxRetries: 0`。一次 provider attempt 只发起一次调用；未来 route failover、attempt 上限、accepted/visible/side-effect barrier 与 429 backoff 由 Goal 3 的 Run Engine 统一决定，不能同时叠加 SDK 内部重试。

函数返回 AI SDK `StreamTextResult` 给执行层，不直接作为浏览器协议。`@repo/chat-engine` 已持续消费 AI SDK `stream`，转换为有限的 text/reasoning/finish/abort 事件并写持久 checkpoint；Next.js HTTP event transport 将从聊天事实读取，不透传 provider stream。

`normalizeTextUsage()` 只输出 `@repo/contracts` 的稳定 token 字段，故意丢弃 provider raw payload。完整 raw usage、provider metadata、sanitized request/response debug 与错误分类会在 Goal 3 设计独立受控 snapshot，不能混入聊天消息或公开错误。

## 网络与 secret

provider fetch 每次请求都要求共享 target policy 复验，限定到配置 base URL 的同 origin 与 base path，并固定 manual redirect。生产默认 transport 在 socket lookup 内再次校验并 pin DNS 地址；完整规则见 [`network-security.md`](./network-security.md)。

credential value 仅存在于创建 provider client 的调用栈。`AiAdapterError` 只暴露稳定 code 与固定安全 message，不携带 provider body、URL、headers 或原始 cause。AI SDK/provider 原始异常由 `@repo/chat-engine` 收敛为固定失败后才能进入聊天事实；受控 debug snapshot 仍待 Goal 3。

## 验证

contract tests 不访问真实厂商，也不硬编码当前模型名；它们使用配置占位 model，经真实 provider adapter 发包到 injected fetch，验证七种组合的 endpoint、request model/stream 语义和 manual redirect。另有 AI SDK mock 测试覆盖流式文本、messages/system/abort 传递和单 attempt 零重试，usage tests 覆盖稳定归一化。
