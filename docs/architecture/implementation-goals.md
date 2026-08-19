# Implementation Goals

> 代码源头：`packages/chat/src/service.ts`、`packages/chat/src/run-state-machine.ts`
> 状态：Goal 1、Goal 2 已完成；Goal 3.2 用户供应商连接和 Goal 3.3 的最小设置界面已实现，聊天模型接入与会话记录管理仍在后续。
> 工作协议：每个可独立验收的功能通过对应检查后立即做原子提交；不跨功能堆积半成品。

## 当前路线

当前路线服务于一个学习型个人 Chatbot，不再追求 DEEIX 或 LobeHub 的功能等价。已有聊天事实层、认证、模型目录、adapter 和 durable stream 会继续复用；下一阶段暂停扩展完整模型网关，只补齐用户能直接理解和使用的产品流程。

Goal 3 的固定范围是：

`注册或登录 → 配置个人供应商 → 检查连接 → 启用并选择模型 → 持久对话 → 管理历史会话`

Skill、MCP/连接器、工具、文件/RAG、媒体、计费、使用量面板、团队和管理后台不属于 Goal 3。

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
- Goal 2.4：AI SDK 7 首批文本 adapter（OpenAI Responses/Chat、OpenRouter Chat、Anthropic Messages、Google Generate Content、xAI Responses、generic OpenAI-compatible），精确 endpoint contract、稳定 usage、零 SDK 隐式重试，以及共享 SSRF/DNS rebinding/pinned transport；稳定执行事件和安全错误已由 Goal 2.5 接入，完整 debug/failover 延后且不属于 v1。
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

## Goal 3：Learning Chatbot v1（部分实现）

### Goal 3.1：会话记录管理

- `/chat` 左侧显示当前 owner 的最近会话，并提供新建入口。
- 支持打开稳定 conversation URL、重命名、归档和删除；危险操作需要确认。
- 新会话使用第一条用户消息生成确定性标题，避免为了标题额外调用一次模型；用户随后可以修改。
- 保持现有 owner 隔离、持久消息、停止生成和刷新恢复语义。
- 搜索、文件夹、标签、分享和导出不在本功能内。

退出条件：两个用户看不到彼此会话；新建、重命名、归档、删除和重新打开均有自动测试；刷新后的消息与 active run 不重复。

### Goal 3.2：用户供应商连接与密钥边界（已实现）

- 定义 owner-scoped `ProviderConnection`、密文持久化记录、启用状态、连通性结果和默认模型 contract。
- 首批 preset 固定为 Anthropic-compatible、OpenAI-compatible、Gemini-compatible、Grok-compatible 与 DeepSeek-compatible。
- API Key 在服务端加密后持久化；数据库普通查询、日志、route snapshot、错误响应和浏览器状态都不能出现明文。
- 五个兼容入口均允许填写 Base URL，并复用 `@repo/network-security` 的 SSRF、DNS rebinding、base-path 和 redirect 约束。
- 增加「检查连接」命令，返回归一化状态，不把上游原始响应或密钥带回浏览器。
- 环境级 `CHAT_MODEL_*` bootstrap 暂时保留，作为部署初始模型和迁移期间的兼容入口。

退出条件（已满足）：追加 migration 可从零执行；跨 owner 读写失败；密钥以独立主密钥 AES-256-GCM 加密，只在服务端检查调用栈解密；公开资源和安全错误不包含明文/密文；恶意 Base URL 被拒绝。未知部署数据库仍只允许通过显式发布步骤迁移。

### Goal 3.3：供应商设置与模型选择（部分实现）

- `/settings/providers` 只展示五个 v1 入口，不复制 LobeHub 的完整供应商市场。
- 每个供应商页已提供启用开关、API Key、兼容 Base URL、默认模型 ID、连通性检查和确认删除。
- 当前不拉取供应商模型列表；用户填写真实模型 ID，检查结果收敛为认证、模型不存在、限流、超时、网络或供应商失败。
- `/chat` 模型选择器只展示当前用户已启用且连接可用的模型（尚未实现，当前聊天继续使用环境 bootstrap 目录）。
- 浏览器始终调用本项目服务端，不提供「客户端直连供应商」模式。

已完成的局部退出条件：新用户可以从空配置完成「保存密钥 → 检查连接 → 保存启用状态」，并可安全更新或删除配置。完整退出条件仍要求把配置接入 chat run；在此之前禁用/删除对新 run 的约束尚未实现。

### Goal 3.4：最小产品界面与验收

- `/chat` 同时承担新对话空状态和已有会话页面，不单独复制任务/资源型首页。
- 桌面端采用会话侧栏、消息主区和底部 composer；窄屏下侧栏可收起。
- 设置导航只保留账户所需入口和供应商配置，不展示尚未实现的空菜单。
- 为初学者补充一条从 UI 到数据库和 AI adapter 的阅读路径，说明每一步的数据与安全边界。

Goal 3 总退出条件：部署者完成数据库和凭证加密主密钥等一次性环境配置后，一个全新账号无需再为每个供应商修改服务器环境变量，即可配置自己的供应商、选择模型、完成流式对话，并在退出登录后重新登录、找到和管理历史会话。格式、类型、测试、Vercel build 和自托管 standalone build 全部通过。

## Goal 3 明确不做

- 完整 provider registry、动态价格目录和几十种供应商入口。
- priority、weight、key picker、多 route failover、circuit、429 backoff 与管理员路由策略。
- 计费、点数、订阅、使用量统计和运营报表。
- Skill、MCP/连接器、工具调用、OAuth 应用和 Trigger.dev 工作流。
- 文件、RAG、知识库、记忆、图片、视频和 Artifact。
- 团队、Organization 和管理员产品后台。

## v1 之后

v1 完成后不预先承诺一条大而全的 Goal 4–6 路线。下一项能力应从实际学习目标中单独选择，例如「一个文件上传流程」或「一个工具调用」，重新定义范围、安全约束和退出条件。DEEIX 与 LobeHub 研究文档可以继续提供局部方案，但不再产生功能清单式的完成压力。
