# Deployment Profiles

> 代码源头：`packages/next-config/src/index.ts`、`Dockerfile`、`compose.yaml`、`apps/web/server/model-bootstrap.ts`、`apps/web/server/provider-credential-vault.ts`
> 状态：Vercel 原生构建、Docker standalone image、显式 migration、Compose、Better Auth、聊天 HTTP composition、单模型环境 bootstrap 与用户 BYOK 加密配置已实现。

## 共同原则

- 本地 Node.js 最低版本为 20.18.1；共享 pinned transport 的 Undici 7 要求此下限，Docker 固定使用 Node 22。
- 根 package override 将所有传递依赖统一到已修复的 Undici 7.29.0 与 Lodash 4.18.1；依赖升级必须重跑 High 级审计。
- Vercel 与 Docker 共享一份源码、PostgreSQL schema 和追加式 migration 历史。
- Web 进程和 Function 启动时不自动迁移。migration 是部署阶段的显式、可观察步骤。
- 本地根命令 `bun run dev` 与 `bun run db:migrate` 显式加载被 Git 忽略的根 `.env`；Turbo 只负责白名单传递，不承担 dotenv 发现。
- 不把 `.env`、Vercel token、数据库凭证或 provider key 烘焙进镜像。
- Core chat 不依赖 Redis、Trigger.dev 或 worker；这些基础设施按后续能力 profile 增加。

## Vercel Core

仓库的一键部署按钮把 Root Directory 设为 `apps/web`。Vercel 提供 `VERCEL=1` 时，`@repo/next-config` 保留平台原生 Next.js 输出，避免把自托管 `standalone` 追踪产物交给平台构建器。

静态首页构建无需环境变量；认证 API 首次请求要求 `DATABASE_URL`、`BETTER_AUTH_SECRET`、`RESEND_API_KEY` 和 `AUTH_EMAIL_FROM`。用户保存供应商 API Key 还要求独立的 `PROVIDER_CREDENTIAL_ENCRYPTION_KEY`；它必须是 `openssl rand -base64 32` 生成的 32-byte base64，不能复用 Better Auth secret。首个真实聊天模型仍可提供 `CHAT_MODEL_PROVIDER`、`CHAT_MODEL_NAME` 和 `CHAT_MODEL_API_KEY`。Vercel Production/Preview 可从平台系统变量推导精确 Better Auth URL，显式 `BETTER_AUTH_URL` 优先。Deploy Button 要求这些不可推导值，但仍不能自动安全执行未知数据库 migration；数据库建议通过 Marketplace/Neon 创建，migration 由受控发布任务执行，不能由每个 Function 冷启动竞争。

Resend 可通过 Vercel Marketplace 安装以自动提供 `RESEND_API_KEY`，也可手工配置；`AUTH_EMAIL_FROM` 必须属于已验证域名。认证 callback 把发送 Promise 注册给 Next.js `after()`，因此在 Vercel 与 Docker 都能响应后续命。认证限流使用 PostgreSQL `rate_limit` 表，在多 Function/多实例间一致且不强制 Redis。`CHAT_MODEL_API_KEY` 与 `PROVIDER_CREDENTIAL_ENCRYPTION_KEY` 都是无 `NEXT_PUBLIC_` 前缀的 server-only secret，建议在 Dashboard 标为 Sensitive 并分别限定 Production/Preview；Vercel profile 不允许私网上游。

数据库连接池按实例限制：Vercel 默认 `max=1`，Docker/本地默认 `max=5`；`DATABASE_POOL_MAX` 可在 1–20 之间显式覆盖。使用 Neon 时优先填 pooled connection URL，避免 Function 扩容时把直连数乘上实例数。

本地等价构建检查：

```bash
VERCEL=1 bun run build
```

## Docker

`Dockerfile` 使用 Node 22 builder，从官方固定版本 Bun image 只复制 Bun 二进制作为 package manager；Next.js CLI 由 Node 直接执行，避免 Bun runtime 与 Next.js/Turbopack 的 Linux 构建兼容问题。它有两个发布 target：

- `runner`：仅包含 Next.js standalone server 和静态产物，以非 root `node` 用户运行。
- `migrate`：保留 Bun、Drizzle Kit、schema 和 migration，仅用于显式执行 `db:migrate`。

最简认证可用启动：

```bash
POSTGRES_PASSWORD='replace-with-a-strong-secret' \
BETTER_AUTH_SECRET="$(openssl rand -base64 32)" \
PROVIDER_CREDENTIAL_ENCRYPTION_KEY="$(openssl rand -base64 32)" \
BETTER_AUTH_URL='http://localhost:3000' \
RESEND_API_KEY='replace-me' \
AUTH_EMAIL_FROM='Chat <auth@example.com>' \
CHAT_MODEL_PROVIDER='openai' \
CHAT_MODEL_NAME='your-model-id' \
CHAT_MODEL_API_KEY='replace-me' \
docker compose up --build
```

Compose 的 PostgreSQL 不暴露宿主端口；`migrate` 等待数据库健康、成功应用 migration 后退出；`web` 只在 migration 成功后启动，默认监听 `http://localhost:3000`。`CHAT_PORT` 可改宿主端口。未设置 `POSTGRES_PASSWORD` 时的 fallback 只适合本机试用，公网部署必须覆盖。

单独验证 image：

```bash
docker build --target runner -t chat:local .
docker run --rm -p 3000:3000 chat:local
```

`.github/workflows/ci.yml` 在 Linux 上重放全仓检查与 Vercel profile build，并用 BuildKit 矩阵真正构建 `runner`、`migrate` 两个发布 target；不登录 registry，也不 push image。它是 Dockerfile 变更的必需合并门禁。

## 当前能力矩阵

| 能力 | Vercel Core | Docker Compose |
| --- | --- | --- |
| Next.js 页面 | 已构建 | 已构建 |
| PostgreSQL schema | 外部数据库 + 显式 migration | Compose PostgreSQL + migrate service |
| Chat repository | 已接入 Web | 已接入 Web |
| Chat HTTP/SSE/cancel | 已实现 | 已实现 |
| 单文本模型 bootstrap | `CHAT_MODEL_*`，公网目标 | `CHAT_MODEL_*`，可显式允许私网目标 |
| Better Auth API | 外部 PostgreSQL + Resend | Compose PostgreSQL + Resend |
| Auth rate limit | PostgreSQL | PostgreSQL |
| 用户供应商配置 | AES-GCM 密文 + 公网连通性检查 | AES-GCM 密文 + 公网连通性检查 |
| Redis/实时 replay | 未实现 | 未实现 |
| Trigger/worker | 不要求 | 不要求 |
| 对象存储 | 未实现 | 未实现 |

## 变更协议

构建命令、Root Directory、standalone 布局、基础镜像、migration 策略、环境变量或 profile 能力变化时，必须同步 `Dockerfile`/`compose.yaml`、本文件、`design.md`、根 README 和相关构建验收。
