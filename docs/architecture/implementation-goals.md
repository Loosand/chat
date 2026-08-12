# Implementation Goals

> 代码源头：`packages/chat/src/service.ts`、`packages/chat/src/run-state-machine.ts`
> 状态：Goal 1 实施中；后续 Goal 均为规划。
> 工作协议：每个可独立验收的功能通过对应检查后立即做原子提交；不跨功能堆积半成品。

## Goal 1：后端核心与数据事实层（实施中）

范围：

- 无基础设施聊天 contract、领域模型、repository ports 与 run 状态机。
- PostgreSQL/Drizzle schema、版本化 migration 与 repository adapter。
- 原子创建 user message、assistant placeholder 和 run。
- `clientRunId` 幂等、消息分支、checkpoint、乐观并发和重要 run event。
- 领域与真实 PostgreSQL 兼容集成测试。

退出条件：领域不变量、migration、repository contract、格式、类型、测试以及 Vercel/Docker 两类构建全部通过。Goal 1 不包含身份、模型调用、Route Handler、Redis 或 Trigger。

## Goal 2：身份、最小模型目录与聊天竖切（规划）

- Better Auth 与 owner/tenant 事实接入；首批实现邮箱/密码、邮箱验证、session 管理与 admin plugin，Organization、多因素、Passkey、SSO/OIDC 等插件按产品和 threat model 分期启用。
- 最小 Upstream、Platform Model、Binding、Route 管理模型。
- 首批文本协议 adapter 与 AI SDK `streamText()`。
- Next.js Route Handler、自定义事件传输、显式 cancel、刷新读取与最薄 shadcn/ui 聊天页面。

退出条件：用户可以真实对话；刷新读取持久消息；重复 `clientRunId` 不重复执行；显式停止不依赖 Trigger。

Better Auth 的 user id 作为稳定字符串映射到聊天 `OwnerId`；`@repo/chat` 不依赖 Better Auth 类型。Vercel 与 Docker 使用同一套 auth schema，Cookie、trusted origins、base URL 和邮件通道由部署 profile 提供。

完整边界、plugin 分期、migration 和部署安全规则见 [`auth.md`](./auth.md)。

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
