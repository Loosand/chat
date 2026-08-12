# Chat

Chat 是一个从简开始、面向自托管与 Vercel 的多模型聊天平台。仓库已完成 **Goal 1 后端核心与数据事实层**：聊天领域、PostgreSQL schema/migration 和事务化 repository 已建立；身份、模型调用和 Web 聊天竖切进入后续 Goal。

## 一键部署

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FLoosand%2Fchat&project-name=chat&repository-name=chat&root-directory=apps%2Fweb)

按钮已预设 Monorepo Root Directory 为 `apps/web`。Vercel 使用 Next.js 原生部署产物，非 Vercel 构建保留 Docker 所需的 standalone 输出。当前薄页面不要求环境变量；Goal 2 接入身份与聊天 API 后需要数据库和 Better Auth 配置。

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
- shadcn/ui Base Rhea + Base UI Chat primitives 与最小 Streamdown 渲染基线；尚未接入真实聊天流。
- 分形文档协议及两份 DEEIX 研究基线。
- 指向 `apps/web` 的 Vercel 一键部署入口。
- Next.js standalone 多阶段 Docker image、显式 migrate target 与 PostgreSQL Compose profile。

尚未实现：

- Better Auth、HTTP/streaming composition 和真实模型聊天流。
- 模型 provider、路由、熔断和上游调试。
- Trigger.dev/BullMQ worker。
- 文件、RAG、MCP、媒体、计费和管理后台。
- Redis/对象存储/worker 等完整部署 profile 与生产运维自动化。

## 技术栈

| 层级 | 当前选择 |
| --- | --- |
| Monorepo | Bun 1.3、Turborepo |
| Web | Next.js 16 App Router、React 19、Node.js runtime |
| AI | AI SDK 7、`@ai-sdk/react` 4 已预备；provider、传输与路由待实现 |
| Data | Drizzle/PostgreSQL schema、migration 与事务化 repository；PGlite 负责 PostgreSQL 语义集成测试 |
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

环境要求：Bun 1.3+、Node.js 20.9+。

```bash
cp .env.example .env
bun install
bun run dev
```

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
- [Vercel 与 Docker 部署](./docs/architecture/deployment.md)
- [前端技术基线](./docs/architecture/frontend-stack.md)
- [DEEIX 功能全量清单](./docs/DEEIX_FEATURE_INVENTORY.zh-CN.md)
- [DEEIX 等价复刻与目标技术方案](./docs/DEEIX_REIMPLEMENTATION_ARCHITECTURE.zh-CN.md)
- [分形文档结构指南](./docs/architecture/fractal-documentation-guide.md)
- [Agent 工程约束](./AGENTS.md)
