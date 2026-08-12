# 文件约定

Next.js App Router 使用基于文件的路由和特殊的文件约定。

## 项目结构

参考：https://nextjs.org/docs/app/getting-started/project-structure

```
app/
├── layout.tsx          # 根布局（必需）
├── page.tsx            # 首页（/）
├── loading.tsx         # 加载 UI
├── error.tsx           # 错误 UI
├── not-found.tsx       # 404 UI
├── global-error.tsx    # 全局错误 UI
├── route.ts            # API 端点
├── template.tsx        # 可重新渲染的布局
├── default.tsx         # 并行路由回退
├── blog/
│   ├── page.tsx        # /blog
│   └── [slug]/
│       └── page.tsx    # /blog/:slug
└── (group)/            # 路由组（不影响 URL）
    └── page.tsx
```

## 特殊文件

| 文件 | 用途 |
|------|---------|
| `page.tsx` | 路由段的 UI |
| `layout.tsx` | 段及其子级的共享 UI |
| `loading.tsx` | 加载 UI（Suspense 边界）|
| `error.tsx` | 错误 UI（错误边界）|
| `not-found.tsx` | 404 UI |
| `route.ts` | API 端点 |
| `template.tsx` | 类似 layout 但在导航时重新渲染 |
| `default.tsx` | 并行路由的回退 |

## 路由段

```
app/
├── blog/               # 静态段：/blog
├── [slug]/             # 动态段：/:slug
├── [...slug]/          # 捕获所有：/a/b/c
├── [[...slug]]/        # 可选捕获所有：/ 或 /a/b/c
└── (marketing)/        # 路由组（URL 中忽略）
```

## 并行路由

```
app/
├── @analytics/
│   └── page.tsx
├── @sidebar/
│   └── page.tsx
└── layout.tsx          # 接收 { analytics, sidebar } 作为 props
```

## 拦截路由

```
app/
├── feed/
│   └── page.tsx
├── @modal/
│   └── (.)photo/[id]/  # 从 /feed 拦截 /photo/[id]
│       └── page.tsx
└── photo/[id]/
    └── page.tsx
```

约定：
- `(.)` - 同级
- `(..)` - 上一级
- `(..)(..)` - 上两级
- `(...)` - 从根目录

## 私有文件夹

```
app/
├── _components/        # 私有文件夹（非路由）
│   └── Button.tsx
└── page.tsx
```

使用 `_` 前缀排除路由。

## 中间件 / 代理

### Next.js 14-15：`middleware.ts`

```ts
// middleware.ts（项目根目录）
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // 认证、重定向、重写等
  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/api/:path*'],
};
```

### Next.js 16+：`proxy.ts`

为了清晰而重命名 - 功能相同，名称不同：

```ts
// proxy.ts（项目根目录）
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  // 与 middleware 相同的逻辑
  return NextResponse.next();
}

export const proxyConfig = {
  matcher: ['/dashboard/:path*', '/api/:path*'],
};
```

| 版本 | 文件 | 导出 | 配置 |
|---------|------|--------|--------|
| v14-15 | `middleware.ts` | `middleware()` | `config` |
| v16+ | `proxy.ts` | `proxy()` | `proxyConfig` |

**迁移**：运行 `npx @next/codemod@latest upgrade` 自动重命名。

## 文件约定参考

参考：https://nextjs.org/docs/app/api-reference/file-conventions
