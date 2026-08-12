---
name: next-best-practices
description: Next.js 最佳实践 - 文件约定、RSC 边界、数据模式、异步 API、元数据、错误处理、路由处理器、图像/字体优化、打包
---

# Next.js 最佳实践

在编写或审查 Next.js 代码时应用这些规则。

## 文件约定

参见 [file-conventions.md](./reference/file-conventions.md)：
- 项目结构和特殊文件
- 路由段（动态、捕获所有、组）
- 并行和拦截路由
- v16 中的中间件重命名（middleware → proxy）

## RSC 边界

检测无效的 React 服务器组件模式。

参见 [rsc-boundaries.md](./reference/rsc-boundaries.md)：
- 异步客户端组件检测（无效）
- 非可序列化 props 检测
- Server Action 例外

## 异步模式

Next.js 15+ 异步 API 变更。

参见 [async-patterns.md](./reference/async-patterns.md)：
- 异步 `params` 和 `searchParams`
- 异步 `cookies()` 和 `headers()`
- 迁移 codemod

## 运行时选择

参见 [runtime-selection.md](./reference/runtime-selection.md)：
- 默认使用 Node.js 运行时
- Edge 运行时的适用场景

## 指令

参见 [directives.md](./reference/directives.md)：
- `'use client'`、`'use server'`（React）
- `'use cache'`（Next.js）

## 函数

参见 [functions.md](./reference/functions.md)：
- 导航 hooks：`useRouter`、`usePathname`、`useSearchParams`、`useParams`
- 服务器函数：`cookies`、`headers`、`draftMode`、`after`
- Generate 函数：`generateStaticParams`、`generateMetadata`

## 错误处理

参见 [error-handling.md](./reference/error-handling.md)：
- `error.tsx`、`global-error.tsx`、`not-found.tsx`
- `redirect`、`permanentRedirect`、`notFound`
- `forbidden`、`unauthorized`（认证错误）
- catch 块中的 `unstable_rethrow`

## 数据模式

参见 [data-patterns.md](./reference/data-patterns.md)：
- 服务器组件 vs Server Actions vs Route Handlers
- 避免数据瀑布流（`Promise.all`、Suspense、预加载）
- 客户端组件数据获取

## Route Handlers

参见 [route-handlers.md](./reference/route-handlers.md)：
- `route.ts` 基础
- GET handler 与 `page.tsx` 冲突
- 环境行为（无 React DOM）
- 何时使用 vs Server Actions

## 元数据和 OG 图像

参见 [metadata.md](./reference/metadata.md)：
- 静态和动态元数据
- `generateMetadata` 函数
- 使用 `next/og` 生成 OG 图像
- 基于文件的元数据约定

## 图像优化

参见 [image.md](./reference/image.md)：
- 始终使用 `next/image` 而非 `<img>`
- 远程图像配置
- 响应式 `sizes` 属性
- 模糊占位符
- LCP 的优先加载

## 字体优化

参见 [font.md](./reference/font.md)：
- `next/font` 设置
- Google Fonts、本地字体
- Tailwind CSS 集成
- 预加载子集

## 打包

参见 [bundling.md](./reference/bundling.md)：
- 服务器不兼容的包
- CSS 导入（而非 link 标签）
- Polyfills（已包含）
- ESM/CommonJS 问题
- Bundle 分析

## 脚本

参见 [scripts.md](./reference/scripts.md)：
- `next/script` vs 原生 script 标签
- 内联脚本需要 `id`
- 加载策略
- 使用 `@next/third-parties` 的 Google Analytics

## Hydration 错误

参见 [hydration-error.md](./reference/hydration-error.md)：
- 常见原因（浏览器 API、日期、无效 HTML）
- 使用错误遮罩层调试
- 每种原因的修复方法

## Suspense 边界

参见 [suspense-boundaries.md](./reference/suspense-boundaries.md)：
- `useSearchParams` 和 `usePathname` 的 CSR 降级
- 哪些 hooks 需要 Suspense 边界

## 并行路由和拦截路由

参见 [parallel-routes.md](./reference/parallel-routes.md)：
- 使用 `@slot` 和 `(.)` 拦截器的模态框模式
- 回退的 `default.tsx`
- 使用 `router.back()` 正确关闭模态框

## 自托管

参见 [self-hosting.md](./reference/self-hosting.md)：
- Docker 的 `output: 'standalone'`
- 多实例 ISR 的缓存处理器
- 什么能工作 vs 需要额外设置

## 调试技巧

参见 [debug-tricks.md](./reference/debug-tricks.md)：
- 用于 AI 辅助调试的 MCP 端点
- 使用 `--debug-build-paths` 重新构建特定路由
