# Implementation Goals

> 代码源头：`packages/chat/src/service.ts`、`packages/chat/src/run-state-machine.ts`
> 状态：Goal 1、Goal 2 已完成；Goal 3 为下一阶段，后续 Goal 均为规划。
> 工作协议：每个可独立验收的功能通过对应检查后立即做原子提交；不跨功能堆积半成品。

## Goal 1：后端核心与数据事实层（已完成）

范围：

- 无基础设施聊天 contract、领域模型、repository ports 与 run 状态机。
- PostgreSQL/Drizzle schema、版本化 migration 与 repository adapter。
- 原子创建 user message、assistant placeholder 和 run。
- `clientRunId` 幂等、消息分支、checkpoint、乐观并发和重要 run event。
- 领域与真实 PostgreSQL 兼容集成测试。

退出条件：领域不变量、migration、repository contract、格式、类型、测试以及 Vercel/Docker 两类构建全部通过。Goal 1 不包含身份、模型调用、Route Handler、Redis 或 Trigger。

完成证据（2026-08-12）：纯领域测试 10 项，migration/repository/service-database 集成测试 14 项；全仓格式、类型与测试通过；Vercel profile 原生 build 通过；自托管 standalone build 与 HTTP 200 smoke test 通过。GitHub Actions [CI #31606054899](https://github.com/Loosand/chat/actions/runs/31606054899) 在 Linux 上通过 quality/Vercel job，并真实 BuildKit 构建 `runner`、`migrate` 两个 Docker 发布 target。当前开发机没有 Docker CLI，因此本地未重复 image build，不能把 standalone smoke 误写成容器实机验证。首次 CI 暴露 Bun runtime 执行 Next.js Linux 构建的兼容失败；第二次 CI 证实 Corepack 不管理 Bun；最终 builder 由固定官方 image 复制 Bun 二进制做安装，并用 Node 22 直接执行 Next.js CLI。

## Goal 2：身份、最小模型目录与聊天竖切（已完成）

- Better Auth 与 owner/tenant 事实接入；首批实现邮箱/密码、邮箱验证、session 管理与 admin plugin，Organization、多因素、Passkey、SSO/OIDC 等插件按产品和 threat model 分期启用。
- 最小 Upstream、Platform Model、Binding、Route 管理模型。
- 首批文本协议 adapter 与 AI SDK `streamText()`。
- Next.js Route Handler、自定义事件传输、显式 cancel、刷新读取与最薄 shadcn/ui 聊天页面。

已完成的独立功能：

- Goal 2.1：Better Auth 1.6/Drizzle/Admin 首期配置、可复现 schema generation、追加 migration、server/client factory 与唯一 `OwnerId` 映射；认证 migration 通过 PGlite 集成测试。
- Goal 2.2：邮箱密码/验证/重置/session/Admin 封禁纵向流程、PostgreSQL 限流、Next.js catch-all Route Handler、Resend + `after()` adapter 与 Vercel/Docker 环境边界。
- Goal 2.3：稳定 protocol/task/provider/capability/secret reference contract，`@repo/model-router` 四层管理用例、SSRF 第一层策略、公开模型列表与 fail-closed 单 route 解析，Drizzle CRUD/CAS/引用删除和追加 migration；管理 HTTP/UI 与完整多 route 引擎不在本阶段。
- Goal 2.4：AI SDK 7 首批文本 adapter（OpenAI Responses/Chat、OpenRouter Chat、Anthropic Messages、Google Generate Content、xAI Responses、generic OpenAI-compatible），精确 endpoint contract、稳定 usage、零 SDK 隐式重试，以及共享 SSRF/DNS rebinding/pinned transport；Canonical 事件、错误分类与 failover 留待执行纵切/Goal 3。
- Goal 2.5a：owner-scoped conversation/message/run 读取与幂等取消命令；取消以 PostgreSQL run 状态为权威，重复请求/终态竞态不重复写事件。
- Goal 2.5b：`@repo/chat-engine` 单 route 文本执行器；环境 secret 仅在运行时解析，route snapshot 不含密钥，AI SDK stream 周期 checkpoint，显式 Abort 与数据库取消监察收敛到安全终态。Next.js 调度和 HTTP event transport 是下一独立功能。
- Goal 2.5c：Next.js 惰性 production composition、owner-scoped conversation/model/run API、strict Origin/body 边界、`after()` 执行注册、PostgreSQL checkpoint SSE cursor、刷新 snapshot 与显式 cancel；模型 bootstrap/管理和 UI 是后续独立功能。
- Goal 2.6a：`CHAT_MODEL_*` 单文本模型 bootstrap；Vercel/Docker 复用四层目录管理用例与 secret reference，并发初始化可恢复，既有配置冲突时不自动覆盖。
- Goal 2.6b：最薄 Better Auth 用户界面；公开登录/注册、邮箱验证反馈、防枚举密码恢复、受保护 `/chat` session gate 与当前 session 退出，使用仓库自有 shadcn/ui Base Rhea + Base UI primitive。
- Goal 2.6c：最薄持久聊天界面；Server Component 首屏加载、AI SDK `useChat` + 自定义 durable transport、conversation 稳定 URL、Streamdown assistant、模型选择、显式 cancel、Zod response 校验、终态错误边界和 active run 刷新续接。

退出条件：用户可以真实对话；刷新读取持久消息；重复 `clientRunId` 不重复执行；显式停止不依赖 Trigger。

完成证据（2026-08-12）：浏览器通过真实 Better Auth session 和 OpenAI-compatible 本地流式上游完成 conversation/run 创建、checkpoint 流、URL 持久化、刷新历史恢复、运行中取消，以及 active run 刷新重订阅；刷新后的 checkpoint 文本不重复。隔离 PostgreSQL 事实核对得到 completed、cancelled、failed 三类 run/message 一致终态；临时测试数据库已在验收后删除。协议与 UI 自动测试、全仓格式/类型/测试、Vercel 原生 build 和 Docker standalone build 均作为本 Goal 提交门禁。

Better Auth 的 user id 作为稳定字符串映射到聊天 `OwnerId`；`@repo/chat` 不依赖 Better Auth 类型。Vercel 与 Docker 使用同一套 auth schema，Cookie、trusted origins、base URL 和邮件通道由部署 profile 提供。

完整边界、plugin 分期、migration 和部署安全规则见 [`auth.md`](./auth.md)。
模型目录的已实现事实、安全边界和后续路由分期见 [`model-catalog.md`](./model-catalog.md)。
聊天执行器的 route/secret/checkpoint/cancel 边界见 [`chat-execution.md`](./chat-execution.md)。

## Goal 3：完整模型网关（规划）

- 全协议 registry、provider fixture 和标准错误/usage/debug。
- priority、weight、key picker、最多三 route failover。
- binding/upstream 两级 circuit、429 backoff、manual open/reset。
- capability、option policy、probe、Vendor、Display Group 和权限规则。

退出条件：故障注入覆盖 429、5xx、超时、断流、accepted、可见输出和 side-effect barrier。

## Goal 4：文件、RAG、工具与 JobDriver（规划）

- ObjectStore adapters、上传、配额、文件库和安全 ingest。
- JobDriver、Trigger.dev Cloud 与 Docker worker adapter。
- extraction、OCR、Embedding、pgvector/hybrid RAG 与 context record。
- MCP、应用工具、provider-native tool 和可见 trace。

退出条件：Vercel Full 与 Docker Full 都能完成 PDF 上传、后台提取和带证据对话。

## Goal 5：计费与运营（规划）

- 价格版本、权限倍率、reservation、usage ledger 与 reconciliation。
- 账户、余额、计划、订阅、支付 webhook 与兑换码。
- 管理统计、audit log、system event 和全 provider usage fixture。

退出条件：并发预授权、failover 共用预算、webhook 重放和崩溃对账均保持账本守恒。

## Goal 6：媒体、安全与等价补齐（规划）

- 图片生成/编辑、视频提交/轮询/取消和 artifact ingest。
- moderation、SSRF、secret encryption、retention 与高风险审计。
- 分享、导出、项目、Prompt/Skill/Memory、PWA 和剩余用户/后台功能。
- Docker Lite 的 SQLite/Memory/Local adapters，以及部署、灾备和升级说明。

退出条件：DEEIX 功能清单每一项都有实现、自动测试或明确豁免；Vercel 与 Docker 能力差异对用户可见。
