# 项目概述

Chat 是一个从简开始的多模型聊天平台 Monorepo。当前只包含可运行的 Next.js Web 骨架、基础 package contracts 和两份 DEEIX 研究文档；模型网关、认证、持久化、计费、工具与后台均处于规划状态，不得把目标设计写成已实现能力。

产品功能事实以 `docs/DEEIX_FEATURE_INVENTORY.zh-CN.md` 为参考，目标技术方案以 `docs/DEEIX_REIMPLEMENTATION_ARCHITECTURE.zh-CN.md` 为参考，当前架构取舍以根目录 `design.md` 为准。

## 强制分形文档协议

任何代码、结构或架构文档变更都必须使用项目 Skill：`.agents/skills/fractal-document/SKILL.md`。

1. 开始前读取根 `README.md`、本文件、最近的 `.folder.md` 和相关深度文档。
2. 修改源码时同步维护文件 Header 的 `[INPUT]`、`[OUTPUT]`、`[POS]`；被深度文档引用的 source of truth 还要维护 `[DOC]`。
3. 文件增删或目录职责变化时同步更新最近的 `.folder.md`。
4. 影响 package 边界、主流程、数据模型、部署或横切约束时，上浮更新 `README.md`、`design.md` 或 `docs/architecture/`。
5. 文档必须区分“已实现”“部分实现”“规划”，不得提前宣称能力已完成。

## Monorepo 约束

- 使用 Bun workspace、Turborepo、内部包名 `@repo/*` 和 `workspace:*`。
- `apps/web` 是 Next.js App Router 的产品入口；默认使用 Server Component，只有交互或浏览器 API 需要时才使用 Client Component。
- `packages/contracts` 不依赖框架或基础设施。
- `packages/ai` 只封装 AI SDK 和 provider adapter，不访问数据库、缓存、任务系统或 Next.js。
- `packages/database`、`cache`、`storage` 是基础设施 adapter，不依赖 Web。
- `packages/jobs` 只定义任务 contract/driver；以后接入 Trigger.dev 时，Web 不得导入 task 实现。
- `packages/design-system` 拥有 shadcn/ui Base Nova + Base UI 的组件源码和语义主题；业务页面不复制基础组件，也不引入 Radix-only primitive。
- 禁止跨包导入未导出的内部文件。

## 数据与安全

- 外部输入、环境变量、任务 payload 和模型结构化输出必须在边界校验。
- 密钥只存在环境变量或加密存储中，不提交 `.env`、API Key、Cookie 或真实用户数据。
- 数据库 schema 变更必须通过版本化 migration；禁止对未知数据库执行迁移。
- 金额不得使用浮点数作为最终事实。
- 外部 URL、模型制品和 MCP endpoint 必须经过 SSRF 与大小限制设计。

## 开发与完成标准

常用命令：

```bash
bun install
bun run dev
bun run format
bun run typecheck
bun run test
bun run build
```

变更完成前按影响范围运行检查；修改 Web、共享配置或 design-system 时必须运行 build。不得通过删除测试、放宽类型、吞掉错误或伪造 fallback 让检查变绿。
