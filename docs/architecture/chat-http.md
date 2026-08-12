# Chat HTTP

> 代码源头：`packages/contracts/src/chat-api.ts`、`apps/web/server/chat-http.ts`、`apps/web/server/chat-runtime.ts`、`apps/web/app/api/chat/`
> 状态：conversation、公开模型、run 创建/snapshot、有限 SSE checkpoint 与显式取消 API 已实现；认证/聊天 UI 尚未实现。

## Composition

`getAuthRuntime()` 在首次请求时创建一份 PostgreSQL handle，Better Auth、ChatRepository 和 ModelCatalogRepository 共用该连接池。`getChatRuntime()` 在此之上惰性装配 ChatService、ModelCatalogService、共享 DNS/网络策略、AI SDK generation、chat run executor 和进程内 run manager；可选模型 bootstrap 只在模型列表或 run 创建时执行，不会阻断已有会话 snapshot。模块 import 与 `next build` 都不会解析环境、连接数据库或执行 migration。

Vercel Route Handler 通过 Next.js `after()` 托管新/pending run 的 execution promise；Docker standalone 复用相同路径和 schema。`maxDuration=300` 是当前交互 run 的部署预算，不意味着无限长任务；需要超过 Web function 预算的工作以后进入 JobDriver。

## API

| Method | Path | 语义 |
| --- | --- | --- |
| POST | `/api/chat/conversations` | 创建 owner-scoped conversation |
| GET | `/api/chat/conversations/:id` | 返回 conversation 与 active root-to-leaf branch |
| GET | `/api/chat/models` | 返回 public/enabled/route-available chat 平台模型 |
| POST | `/api/chat/runs` | 原子创建 user/assistant/run；重复 `clientRunId` 返回原事实；pending 可重触发领取 |
| GET | `/api/chat/runs/:id` | 返回最新公开 run + assistant checkpoint |
| GET | `/api/chat/runs/:id/events?after=N` | 从 sequence cursor 获取 snapshot/event，并有限 long-poll |
| POST | `/api/chat/runs/:id/cancel` | 幂等持久取消，再做同进程 Abort 加速 |

所有聊天资源先从 Better Auth 权威数据库 session 映射 OwnerId；不存在与其他 owner 的 ID 使用相同 404。公开模型列表不含 topology/system prompt/credential reference。conversation 不返回 ownerId；run 不返回 ownerId、route snapshot/base URL/credential reference；消息不返回 hidden reasoning。

## Write security

写请求在业务调用前执行三项检查：session 身份、精确 trusted Origin、128 KiB 流式 body 上限。JSON 再经过 strict Zod schema，故请求不能 mass assign owner/status/route。Content-Length 只作提前拒绝，真正上限由逐 chunk 计数保证；未知错误只映射固定安全响应，不返回 SQL、密钥、provider body 或堆栈。

## Idempotency and execution ownership

`POST /runs` 以 `(ownerId, clientRunId)` 的数据库唯一键为幂等事实。首次请求返回 201；重复请求返回原 user/assistant/run 与 200。只有仍 pending 的 run 会再次交给进程 manager；同进程 manager 去重，跨实例由 pending→running CAS 决定唯一执行者，所以网络重试不会造成两次上游调用。manager 不是持久队列；其职责只是局部复用 promise 和加快 Abort。

## Event transport and refresh

SSE 事件固定为：

- `snapshot`：公开 run、assistant checkpoint、`after` 之后的重要 events 和新 cursor。
- `heartbeat`：长时间无 checkpoint 时维持连接。
- `reconnect`：20 秒窗口结束，客户端使用 cursor 重连。

订阅每 250ms 查询 PostgreSQL，终态立即关闭。页面刷新可以先 GET conversation/run snapshot，再以持久 cursor 重订阅。浏览器断开只 abort SSE polling，从不把 request signal 传给 executor；只有 cancel endpoint 会写 `cancel_requested` 并调用局部 manager Abort。Redis/Upstash 以后可降低查询和延迟，但 PostgreSQL snapshot/cursor 仍是可靠恢复底线。

## Current limits

- 可通过 `CHAT_MODEL_*` 自动补齐一个文本模型；多模型仍需要后续管理 HTTP/UI。
- PostgreSQL polling 没有 Redis pub/sub 的逐 token 延迟；只发送持久 checkpoint。
- `after()` 不是 durable queue。实例硬终止时已有 checkpoint 可恢复，但自动把僵尸 running 标为 interrupted/重新领取尚未实现。
- tool/file/multimodal 输入、共享/公开 conversation、列表/归档/编辑/retry UI 与完整 API 均在后续功能。
