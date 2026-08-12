# Chat

Chat 是一个从简开始、面向自托管与 Vercel 的多模型聊天平台。仓库已完成 **Goal 1 后端核心与数据事实层**，正在实施 Goal 2；生产认证、四层模型目录、首批 AI SDK 文本 adapter、可替换 chat run 执行器、HTTP/刷新恢复及单模型环境 bootstrap 已落地，最薄前端仍在继续。

## 一键部署

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FLoosand%2Fchat&project-name=chat&repository-name=chat&root-directory=apps%2Fweb&env=DATABASE_URL,BETTER_AUTH_SECRET,RESEND_API_KEY,AUTH_EMAIL_FROM,CHAT_MODEL_PROVIDER,CHAT_MODEL_NAME,CHAT_MODEL_API_KEY&envDescription=PostgreSQL%E3%80%81Better+Auth%E3%80%81Resend+%E4%B8%8E%E9%A6%96%E4%B8%AA%E6%96%87%E6%9C%AC%E6%A8%A1%E5%9E%8B%E3%80%82BETTER_AUTH_SECRET+%E8%AF%B7%E7%94%A8+openssl+rand+-base64+32+%E7%94%9F%E6%88%90%EF%BC%9BCHAT_MODEL_PROVIDER+%E5%8F%AF%E5%A1%AB+openai%2Fanthropic%2Fgoogle%2Fxai%2Fopenrouter%E3%80%82%E9%83%A8%E7%BD%B2%E5%90%8E%E4%BB%8D%E9%9C%80%E6%98%BE%E5%BC%8F%E8%BF%90%E8%A1%8C%E6%95%B0%E6%8D%AE%E5%BA%93+migration%E3%80%82&envLink=https%3A%2F%2Fgithub.com%2FLoosand%2Fchat%23%E7%8E%AF%E5%A2%83%E5%8F%98%E9%87%8F)

按钮已预设 Monorepo Root Directory 为 `apps/web`，并要求填写认证运行与首个文本模型所需的 PostgreSQL、Better Auth、Resend 和 `CHAT_MODEL_*` 配置。Vercel 使用 Next.js 原生部署产物，非 Vercel 构建保留 Docker 所需的 standalone 输出。数据库 migration 仍需在受控发布步骤显式执行，不在 Function 冷启动时自动运行。

## 核心同步协议（Mandatory）

1. **原子更新**：代码变更完成后，立即同步对应文件 Header 和最近的 `.folder.md`。
2. **递归上浮**：文件变化 → Header → 目录地图 → 影响全局时更新本 README、`design.md` 或架构文档。
3. **分形自洽**：进入任何重要目录，都能通过最近的 `.folder.md` 恢复局部职责、成员和约束。
4. **双向锚点**：深度文档引用核心源码时，文档声明“代码源头”，源码 Header 使用 `[DOC]` 反向指回。
5. **状态诚实**：始终区分已实现、部分实现和规划。

完整规则见 [分形文档结构指南](./docs/architecture/fractal-documentation-guide.md)，执行流程见项目 Skill [`fractal-document`](./.agents/skills/fractal-document/SKILL.md)。

## 当前状态

已实现：

- Bun workspaces + Turborepo 基础任务图。
- Next.js 16 + React 19 的 `apps/web` 最小页面。
- TypeScript strict、Biome、Vitest 基础配置。
- contracts、AI、database、cache、storage、jobs、logger、design-system 和共享配置 package 骨架。
- `@repo/chat` 领域模型、repository ports、应用服务与显式 run 状态机。
- PostgreSQL/Drizzle 四张聊天事实表、版本化 migration、事务化 repository、幂等/CAS/owner 隔离与真实 PostgreSQL 语义集成测试。
- Better Auth 1.6 + Drizzle/Admin 邮箱密码/验证/session/重置/封禁能力、Next.js Route Handler、Resend 邮件 adapter、数据库限流、生成式 auth schema/migration 与稳定 OwnerId 映射。
- `@repo/model-router` 四层目录实体/管理用例、网络目标策略、公开目录和 fail-closed 单 route 解析；Drizzle CRUD/CAS/引用保护、schema/migration 与环境 secret reference。
- `@repo/ai` 的 OpenAI Responses/Chat、OpenRouter Chat、Anthropic Messages、Google Generate Content、xAI Responses 与 generic OpenAI-compatible 文本 adapter；精确 endpoint contract、零隐式重试和稳定 usage 归一化。
- `@repo/chat-engine` 的单 route 执行编排、无密钥 route snapshot、历史转换、AI SDK event 消费、周期 checkpoint、数据库取消监察与安全终态。
- `apps/web` 的 owner-scoped conversation/model/run API、可信 Origin/有限 body、防 mass assignment、`after()` 调度、PostgreSQL checkpoint SSE、刷新 snapshot 与显式取消。
- `CHAT_MODEL_*` 的单文本模型 bootstrap：并发可恢复地补齐四层目录，只持久化环境 secret reference，既有配置冲突时不自动覆盖。
- `@repo/network-security` 的共享 URL/DNS policy 与 Node 连接时 pinned lookup；provider 请求限定同源/base-path 并禁止自动 redirect。
- shadcn/ui Base Rhea + Base UI Chat primitives 与最小 Streamdown 渲染基线；尚未接入真实聊天流。
- 分形文档协议及两份 DEEIX 研究基线。
- 指向 `apps/web` 的 Vercel 一键部署入口。
- Next.js standalone 多阶段 Docker image、显式 migrate target 与 PostgreSQL Compose profile。

尚未实现：

- 认证/聊天 UI、模型管理入口和端到端真实 provider 验收。
- 模型管理 HTTP/UI、剩余文本/媒体协议、加权/failover、熔断和上游调试。
- Trigger.dev/BullMQ worker。
- 文件、RAG、MCP、媒体、计费和管理后台。
- Redis/对象存储/worker 等完整部署 profile 与生产运维自动化。

## 技术栈

| 层级 | 当前选择 |
| --- | --- |
| Monorepo | Bun 1.3、Turborepo |
| Web | Next.js 16 App Router、React 19、Node.js runtime |
| AI | AI SDK 7；首批七种 family/protocol 文本 adapter、guarded transport、usage normalization 与单 route chat run 执行器已实现；多 route/failover 待实现 |
| Data | Drizzle/PostgreSQL 聊天、认证与四层模型目录 schema/migration；PGlite 负责 PostgreSQL 语义集成测试 |
| Jobs | 可插拔 JobDriver；Trigger.dev 可选，当前只有 contract |
| UI | Tailwind CSS v4、shadcn/ui Base Rhea、Base UI、`@shadcn/react`、Streamdown |
| Quality | TypeScript strict、Biome、Vitest |

## 项目地图

```text
apps/
└── web/                    # Next.js 产品入口

packages/
├── contracts/             # 无框架公共 contract
├── chat/                  # 聊天领域、状态机、ports 与应用服务
├── ai/                    # AI SDK 边界
├── auth/                  # Better Auth 配置、身份映射和 server/client factory
├── chat-engine/           # route、AI stream 与聊天事实的执行编排
├── model-router/          # 四层模型目录、管理规则与 route 解析
├── network-security/      # SSRF、DNS rebinding 与 pinned fetch
├── database/              # PostgreSQL schema、migration 与 repository
├── cache/                 # 缓存/事件 primitive contract
├── storage/               # 对象存储 contract
├── jobs/                  # 后台任务 driver contract
├── logger/                # 结构化日志 contract
├── design-system/         # Base Rhea、Chat primitives、Streamdown 与语义主题
├── next-config/           # Next.js 共享配置
└── typescript-config/     # TypeScript 共享配置

docs/
├── architecture/          # 身份、聊天、部署、前端与文档架构规则
├── DEEIX_FEATURE_INVENTORY.zh-CN.md
└── DEEIX_REIMPLEMENTATION_ARCHITECTURE.zh-CN.md

.agents/
└── skills/                # 项目级 Agent Skills 与工程工作流
```

目录职责和成员以各目录 `.folder.md` 为准。

## 开始开发

环境要求：Bun 1.3+、Node.js 20.18.1+（Docker 使用 Node 22）。

根依赖通过 lockfile 与安全 override 固定已修复的 Undici/Lodash 版本；升级依赖后应重新运行 `bun audit --audit-level=high`。

```bash
cp .env.example .env
bun install
bun run dev
```

## 环境变量

当前认证 API 在首次请求时要求：

| 变量 | 必需 | 说明 |
| --- | --- | --- |
| `DATABASE_URL` | 是 | PostgreSQL 连接；Vercel 可使用 Neon，Docker Compose 自动注入内部地址 |
| `DATABASE_POOL_MAX` | 否 | 每实例连接池上限；默认 Vercel 1、Docker/本地 5，可设 1–20 |
| `BETTER_AUTH_SECRET` | 是 | 至少 32 字符，使用 `openssl rand -base64 32` 生成 |
| `BETTER_AUTH_URL` | Docker/本地是 | 公开 origin；Vercel Production/Preview 可从平台精确 URL 推导，也可显式覆盖 |
| `RESEND_API_KEY` | 是 | Resend server-side API key |
| `AUTH_EMAIL_FROM` | 是 | 已验证发件人，例如 `Chat <auth@example.com>` |
| `BETTER_AUTH_TRUSTED_ORIGINS` | 否 | 额外精确 origin，逗号分隔；不接受 wildcard |
| `BETTER_AUTH_ADMIN_USER_IDS` | 否 | 预置管理员 UUID，逗号分隔；也可在数据库受控赋予 `admin` role |
| `CHAT_MODEL_PROVIDER` | 真实聊天是 | 首模型 provider：`openai`、`anthropic`、`google`、`xai`、`openrouter` 或 `openai-compatible` |
| `CHAT_MODEL_NAME` | 真实聊天是 | 上游模型 ID；不在仓库维护会过期的模型名枚举 |
| `CHAT_MODEL_API_KEY` | 官方 provider 是 | server-only API key；数据库只保存变量名引用，OpenAI-compatible 可不填 |
| `CHAT_MODEL_BASE_URL` | 自定义上游是 | 覆盖 preset；OpenAI-compatible 必填 |
| 其他 `CHAT_MODEL_*` | 否 | protocol、平台 key/展示名/system prompt 和 Docker 私网开关，见模型 bootstrap 文档 |

复制 `.env.example` 后填值。schema 不会在 Web 进程启动时自动迁移：本地/受控发布使用 `bun run --cwd packages/database db:migrate`，Compose 由独立 `migrate` service 执行。

提交前运行：

```bash
bun run format
bun run typecheck
bun run test
bun run build
```

Docker 本地 profile：

```bash
POSTGRES_PASSWORD='replace-with-a-url-safe-secret' docker compose up --build
```

## 设计与研究入口

- [当前设计基线](./design.md)
- [长期实施 Goal](./docs/architecture/implementation-goals.md)
- [聊天核心架构](./docs/architecture/chat-core.md)
- [聊天执行架构](./docs/architecture/chat-execution.md)
- [聊天 HTTP 与恢复](./docs/architecture/chat-http.md)
- [模型目录架构](./docs/architecture/model-catalog.md)
- [首模型部署 Bootstrap](./docs/architecture/model-bootstrap.md)
- [Vercel 与 Docker 部署](./docs/architecture/deployment.md)
- [前端技术基线](./docs/architecture/frontend-stack.md)
- [DEEIX 功能全量清单](./docs/DEEIX_FEATURE_INVENTORY.zh-CN.md)
- [DEEIX 等价复刻与目标技术方案](./docs/DEEIX_REIMPLEMENTATION_ARCHITECTURE.zh-CN.md)
- [分形文档结构指南](./docs/architecture/fractal-documentation-guide.md)
- [Agent 工程约束](./AGENTS.md)
