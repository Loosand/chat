# Authentication

> 代码源头：`packages/auth/src/feature-options.ts`、`packages/auth/src/server.ts`、`packages/auth/src/identity.ts`、`packages/database/src/auth-schema.ts`
> 状态：Goal 2.1 已实现 Better Auth/Drizzle/Admin 配置、生成式 schema、追加 migration、server/client factory 与 OwnerId 映射；Web 挂载和完整认证流程仍待实现。
> 审计日期：2026-08-12。

## 决策

Chat 默认采用 Better Auth，并通过其 Drizzle adapter 复用现有 PostgreSQL/Drizzle 数据层。Next.js 只负责挂载 `/api/auth/*` Route Handler 和读取 session；聊天领域只接收稳定的 `OwnerId`，不得依赖 Better Auth 的 session、user 或 plugin 类型。

这层隔离允许未来替换身份提供方，也使 Vercel 和 Docker 共享同一套 auth schema 与 owner 语义。Better Auth user id 以字符串进入 `OwnerId`；聊天表不直接级联删除到 auth user，账号删除、匿名化和事实留存由显式生命周期流程完成。

## 首期范围

- 邮箱/密码注册与登录。
- 邮箱验证、忘记密码与密码重置；没有可用邮件通道时，部署页面必须明确标记能力受限，不能静默跳过验证。
- 数据库 session、退出当前/全部设备和基础 session 管理。
- Admin plugin：用于后台用户、角色和封禁管理；启用时必须把 plugin schema 放进同一条版本化 migration。

首期不默认启用 Organization、Two-Factor、Passkey、Magic Link、Generic OAuth、OIDC/SSO 等插件。它们都属于独立功能：只有产品权限模型、恢复流程、密钥/邮件依赖、数据库变更和端到端测试齐备后才启用，不能只把 plugin 塞进配置。

## 已实现组合边界

`@repo/auth` 固定 Better Auth 与独立 Drizzle adapter `1.6.27`，不在模块 import 时读取环境或创建连接：

- `feature-options.ts` 是 CLI 与运行时共用的首期认证事实源，启用邮箱密码、强制邮箱验证、注册/登录时发送验证链接、密码重置与 Admin plugin。
- `server.ts` 只接受调用方显式注入的 Drizzle database、至少 32 字符 secret、公开 base URL、精确 trusted origins 与邮件 dispatcher。
- 邮件 callback 只把一次性 URL 交给 dispatcher 并立即返回已完成 Promise；dispatcher 必须用平台 `waitUntil` 或可靠 job 续命，不能在认证响应里等待外部 SMTP，也不能丢弃任务。
- `client.ts` 组合 React client 与 Admin client plugin；同 origin 默认不配置 base URL。
- `identity.ts` 是 Better Auth `user.id` 到公共 `OwnerId` 的唯一映射，经过 1–128 字符 contract 校验，不从 email、role、cookie 或 session token 派生身份。

Next.js 环境解析、`/api/auth/*`、真实邮件 adapter 与权限 API 属于 Goal 2.2，尚未实现。

## Schema 与 migration

Better Auth CLI 只用于根据实际 auth 配置生成 Drizzle schema；Drizzle Kit 再生成可审计 SQL migration。Vercel Function 或 Web 进程启动时不得自动迁移数据库。

固定流程（已由脚本落实）：

1. 修改 Better Auth 配置或 plugin 清单。
2. 用 Better Auth CLI 更新受版本控制的 Drizzle auth schema。
3. 审查字段、索引、外键和删除策略。
4. 用 Drizzle Kit 生成追加式 migration。
5. 在 PGlite/PostgreSQL 集成测试执行全量 migration，并覆盖登录与 session 回归。

当前使用 `bun run --cwd packages/auth auth:schema` 调用固定版本 CLI，先生成临时文件，再补充分形 Header 并用 Biome 格式化到 `packages/database/src/auth-schema.ts`；随后 `bun run --cwd packages/database db:generate` 只追加 migration。`0001_wandering_toro.sql` 创建 `user`、`session`、`account`、`verification`；Admin plugin 增加 role/ban 字段与 impersonation session 字段。PGlite 已验证 UUID、唯一键与 user 删除后 account/session 级联。

Better Auth 官方说明 Drizzle adapter 应由 ORM 自己生成和应用 migration；plugin 也可能增加表或核心字段，因此 plugin 变更必须走同一流程。参考：[Database](https://better-auth.com/docs/concepts/database)、[Drizzle adapter](https://better-auth.com/docs/adapters/drizzle)、[CLI](https://better-auth.com/docs/concepts/cli)。

## 部署配置

共同必需配置：

- `BETTER_AUTH_SECRET`：至少 32 字符的高熵密钥；生产支持有计划的 secret rotation。
- `BETTER_AUTH_URL`：生产环境显式配置公开 origin。
- 邮件发送配置：启用验证和密码重置时必需。

安全边界：

- `trustedOrigins` 使用精确 allowlist；不允许为了省配置关闭 CSRF/origin 检查。
- 生产 cookie 使用 secure、host-only 默认值；只有明确的同根域产品需求才评估跨子域 cookie。
- Vercel Production 使用稳定自定义域名；Preview 只在非生产环境加入当前部署的精确 `VERCEL_URL`，不信任整个 `*.vercel.app`。
- Docker 要求显式公开 URL。只有入口代理会覆盖且能阻止客户端伪造 `X-Forwarded-*` 时，才允许启用 trusted proxy headers。

这些规则对应 Better Auth 的 [installation](https://better-auth.com/docs/installation)、[options](https://better-auth.com/docs/reference/options)、[cookies](https://better-auth.com/docs/concepts/cookies) 与 [security](https://better-auth.com/docs/reference/security) 文档。

## Goal 2 验收

- Vercel 与 Docker 使用同一份 auth schema 和 migration 历史。
- 注册、验证、登录、登出、过期、撤销、封禁和密码重置有集成测试。
- 未登录、普通用户、管理员的 Route Handler 权限测试通过。
- session 到 `OwnerId` 的映射只有一个受测入口；领域层没有 Better Auth import。
- 日志、错误、URL 和前端 payload 不暴露 session token、密码、邮件 token 或 auth secret。

## 变更协议

认证 provider、ID 策略、插件、Cookie、origin、session、账号删除策略或 auth schema 变化时，必须同步本文档、`design.md`、最近目录地图、migration 与相关测试。
