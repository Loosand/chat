# Authentication

> 代码源头：`packages/auth/src/feature-options.ts`、`packages/auth/src/server.ts`、`packages/auth/src/identity.ts`、`packages/database/src/auth-schema.ts`、`apps/web/server/auth.ts`、`apps/web/components/auth/`
> 状态：Goal 2 身份闭环已实现：Better Auth/Drizzle/Admin、生成式 schema/migration、Web Route Handler、Resend 邮件、数据库限流、session→OwnerId、首期纵向测试，以及邮箱登录/注册/验证/重置/退出界面。
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

- `feature-options.ts` 是 CLI 与运行时共用的首期认证事实源，启用邮箱密码、强制邮箱验证、注册/登录时发送验证链接、密码重置时撤销旧 session、数据库限流、枚举保护所需 synthetic Admin fields 与 Admin plugin。
- `server.ts` 只接受调用方显式注入的 Drizzle database、至少 32 字符 secret、公开 base URL、精确 trusted origins 与邮件 dispatcher。
- 邮件 callback 只把一次性 URL 交给 dispatcher 并立即返回已完成 Promise；dispatcher 必须用 Next.js `after()`、平台 `waitUntil` 或可靠 job 续命，不能在认证响应里等待外部 SMTP，也不能丢弃任务。
- `client.ts` 组合 React client 与 Admin client plugin；同 origin 默认不配置 base URL。
- `identity.ts` 是 Better Auth `user.id` 到公共 `OwnerId` 的唯一映射，经过 1–128 字符 contract 校验，不从 email、role、cookie 或 session token 派生身份。

`apps/web/server/auth.ts` 在首次认证请求时才校验环境并创建数据库/auth handle；构建和静态首页不读 secret、不连数据库。`/api/auth/[...all]` 使用 Node runtime 把标准 Request 交给 Better Auth handler；浏览器使用同 origin React/Admin client。`getAuthenticatedOwnerId()` 对授权路径禁用 cookie cache，读取权威数据库 session 后经唯一 mapper 转成 `OwnerId`。

认证邮件由 Resend adapter 发送：callback 立即把 Promise 注册给 Next.js `after()`，使 Vercel Function 与 Docker server 都在响应后续命，不阻塞响应以降低时序侧信道。邮件包含一次性 URL，因此失败只作为 server-side background failure，URL 不得进入日志或响应。

纵向测试通过真实 Better Auth HTTP handler 与全量 PGlite migration 覆盖：注册、重复邮箱枚举保护、未验证禁止登录、邮箱验证、登录、数据库 session、登出、session 过期、密码重置撤销旧 session、未登录/普通用户拒绝 Admin endpoint、管理员封禁与被封用户失效，以及恶意 origin 拒绝。

## 已实现用户界面

公开首页提供登录和注册入口；`/sign-in`、`/sign-up`、`/forgot-password` 与 `/reset-password` 使用仓库自有 shadcn/ui Base Rhea + Base UI primitive。注册成功和密码重置邮件请求都使用不披露邮箱存在性的固定文案，Better Auth 原始 error message、token 和内部异常不进入页面。

邮箱验证 callback 固定返回 `/sign-in?verified=1`，页面只识别该布尔标记并显示成功提示，不接受外部 redirect。登录成功固定进入 `/chat`；该 Server Component 重新读取权威数据库 session，未认证时跳回登录。退出操作只撤销当前 session 并回到登录页。完整设备 session 管理已有服务能力，但管理界面仍属后续功能。

## Schema 与 migration

Better Auth CLI 只用于根据实际 auth 配置生成 Drizzle schema；Drizzle Kit 再生成可审计 SQL migration。Vercel Function 或 Web 进程启动时不得自动迁移数据库。

固定流程（已由脚本落实）：

1. 修改 Better Auth 配置或 plugin 清单。
2. 用 Better Auth CLI 更新受版本控制的 Drizzle auth schema。
3. 审查字段、索引、外键和删除策略。
4. 用 Drizzle Kit 生成追加式 migration。
5. 在 PGlite/PostgreSQL 集成测试执行全量 migration，并覆盖登录与 session 回归。

当前使用 `bun run --cwd packages/auth auth:schema` 调用固定版本 CLI，先生成临时文件，再补充分形 Header 并用 Biome 格式化到 `packages/database/src/auth-schema.ts`；随后 `bun run --cwd packages/database db:generate` 只追加 migration。`0001_wandering_toro.sql` 创建 `user`、`session`、`account`、`verification`；Admin plugin 增加 role/ban 字段与 impersonation session 字段。`0002_steep_lady_deathstrike.sql` 增加跨 Function/实例共享的 `rate_limit` 表，基础认证不依赖 Redis。PGlite 已验证 UUID、唯一键、限流 key 与 user 删除后 account/session 级联。

Better Auth 官方说明 Drizzle adapter 应由 ORM 自己生成和应用 migration；plugin 也可能增加表或核心字段，因此 plugin 变更必须走同一流程。参考：[Database](https://better-auth.com/docs/concepts/database)、[Drizzle adapter](https://better-auth.com/docs/adapters/drizzle)、[CLI](https://better-auth.com/docs/concepts/cli)。

## 部署配置

共同必需配置：

- `DATABASE_URL`：PostgreSQL 连接。
- `BETTER_AUTH_SECRET`：至少 32 字符的高熵密钥。当前尚未实现多密钥轮换；更换密钥会使现有 session 与 token 失效，轮换前必须先实现并验证 `BETTER_AUTH_SECRETS` 兼容层。
- `RESEND_API_KEY`、`AUTH_EMAIL_FROM`：验证和密码重置邮件必需；发件域名必须在 Resend 验证。
- `BETTER_AUTH_URL`：Docker/本地显式公开 origin；Vercel Production/Preview 可以分别从 `VERCEL_PROJECT_PRODUCTION_URL`/当前 `VERCEL_URL` 精确推导，也可显式覆盖。
- 可选 `BETTER_AUTH_TRUSTED_ORIGINS` 与 `BETTER_AUTH_ADMIN_USER_IDS` 都是逗号分隔的精确值；后者必须是 Better Auth UUID user id。

安全边界：

- `trustedOrigins` 使用精确 allowlist；不允许为了省配置关闭 CSRF/origin 检查。
- 生产 cookie 使用 secure、host-only 默认值；只有明确的同根域产品需求才评估跨子域 cookie。
- Vercel Production 使用显式 URL 或稳定 `VERCEL_PROJECT_PRODUCTION_URL`；Preview 只加入当前部署的精确 `VERCEL_URL`，不信任整个 `*.vercel.app`。
- Docker 要求显式公开 URL。只有入口代理会覆盖且能阻止客户端伪造 `X-Forwarded-*` 时，才允许启用 trusted proxy headers。

这些规则对应 Better Auth 的 [installation](https://better-auth.com/docs/installation)、[options](https://better-auth.com/docs/reference/options)、[cookies](https://better-auth.com/docs/concepts/cookies) 与 [security](https://better-auth.com/docs/reference/security) 文档。

## Goal 2 验收

- Vercel 与 Docker 使用同一份 auth schema 和 migration 历史。
- 注册、验证、登录、登出、过期、撤销、封禁和密码重置有集成测试。
- 未登录、普通用户、管理员的 Route Handler 权限测试通过。
- session 到 `OwnerId` 的映射只有一个受测入口；领域层没有 Better Auth import。
- 日志、错误、URL 和前端 payload 不暴露 session token、密码、邮件 token 或 auth secret。
- 登录、注册、验证提示、密码恢复和当前 session 退出拥有可访问的最小页面；聊天业务仍独立演进。

## 变更协议

认证 provider、ID 策略、插件、Cookie、origin、session、账号删除策略或 auth schema 变化时，必须同步本文档、`design.md`、最近目录地图、migration 与相关测试。
