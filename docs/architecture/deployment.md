# Deployment Profiles

> 代码源头：`packages/next-config/src/index.ts`、`Dockerfile`、`compose.yaml`
> 状态：Goal 1 已实现 Vercel 原生构建、Docker standalone image、显式 migration target 与本地 Compose；聊天 HTTP/API composition 尚属 Goal 2。

## 共同原则

- Vercel 与 Docker 共享一份源码、PostgreSQL schema 和追加式 migration 历史。
- Web 进程和 Function 启动时不自动迁移。migration 是部署阶段的显式、可观察步骤。
- 不把 `.env`、Vercel token、数据库凭证或 provider key 烘焙进镜像。
- Core chat 不依赖 Redis、Trigger.dev 或 worker；这些基础设施按后续能力 profile 增加。

## Vercel Core

仓库的一键部署按钮把 Root Directory 设为 `apps/web`。Vercel 提供 `VERCEL=1` 时，`@repo/next-config` 保留平台原生 Next.js 输出，避免把自托管 `standalone` 追踪产物交给平台构建器。

Goal 1 的薄 Web 页面无需环境变量。Goal 2 接入身份与聊天 API 后至少需要 `DATABASE_URL`、`BETTER_AUTH_SECRET` 和 `BETTER_AUTH_URL`；数据库建议通过 Vercel Marketplace/Neon 创建，但 schema migration 仍在发布流程或受控运维任务中运行，不能由每个 Function 冷启动竞争执行。

本地等价构建检查：

```bash
VERCEL=1 bun run build
```

## Docker

`Dockerfile` 有两个发布 target：

- `runner`：仅包含 Next.js standalone server 和静态产物，以非 root `node` 用户运行。
- `migrate`：保留 Bun、Drizzle Kit、schema 和 migration，仅用于显式执行 `db:migrate`。

最简启动：

```bash
POSTGRES_PASSWORD='replace-with-a-strong-secret' docker compose up --build
```

Compose 的 PostgreSQL 不暴露宿主端口；`migrate` 等待数据库健康、成功应用 migration 后退出；`web` 只在 migration 成功后启动，默认监听 `http://localhost:3000`。`CHAT_PORT` 可改宿主端口。未设置 `POSTGRES_PASSWORD` 时的 fallback 只适合本机试用，公网部署必须覆盖。

单独验证 image：

```bash
docker build --target runner -t chat:local .
docker run --rm -p 3000:3000 chat:local
```

`.github/workflows/ci.yml` 在 Linux 上重放全仓检查与 Vercel profile build，并用 BuildKit 真正构建 `runner` target；不登录 registry，也不 push image。它是 Dockerfile 变更的必需合并门禁。

## 当前能力矩阵

| 能力 | Vercel Core | Docker Compose |
| --- | --- | --- |
| Next.js 页面 | 已构建 | 已构建 |
| PostgreSQL schema | 外部数据库 + 显式 migration | Compose PostgreSQL + migrate service |
| Chat repository | 已实现，Goal 2 接入 Web | 已实现，Goal 2 接入 Web |
| Redis/实时 replay | 未实现 | 未实现 |
| Trigger/worker | 不要求 | 不要求 |
| 对象存储 | 未实现 | 未实现 |

## 变更协议

构建命令、Root Directory、standalone 布局、基础镜像、migration 策略、环境变量或 profile 能力变化时，必须同步 `Dockerfile`/`compose.yaml`、本文件、`design.md`、根 README 和相关构建验收。
