---
name: next-cache-components
description: Next.js 16 缓存组件 - PPR、use cache 指令、cacheLife、cacheTag、updateTag
---

# 缓存组件（Next.js 16+）

缓存组件启用了部分预渲染（PPR）- 在单个路由中混合静态、缓存和动态内容。

## 启用缓存组件

```ts
// next.config.ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
}

export default nextConfig
```

这取代了旧的 `experimental.ppr` 标志。

---

## 三种内容类型

启用缓存组件后，内容分为三类：

### 1. 静态（自动预渲染）

同步代码、导入、纯计算 - 在构建时预渲染：

```tsx
export default function Page() {
  return (
    <header>
      <h1>我们的博客</h1>  {/* 静态 - 即时 */}
      <nav>...</nav>
    </header>
  )
}
```

### 2. 缓存（`use cache`）

不需要每次请求都重新获取的异步数据：

```tsx
async function BlogPosts() {
  'use cache'
  cacheLife('hours')

  const posts = await db.posts.findMany()
  return <PostList posts={posts} />
}
```

### 3. 动态（Suspense）

必须保持新鲜的运行时数据 - 用 Suspense 包裹：

```tsx
import { Suspense } from 'react'

export default function Page() {
  return (
    <>
      <BlogPosts />  {/* 缓存 */}

      <Suspense fallback={<p>加载中...</p>}>
        <UserPreferences />  {/* 动态 - 流式传输 */}
      </Suspense>
    </>
  )
}

async function UserPreferences() {
  const theme = (await cookies()).get('theme')?.value
  return <p>主题: {theme}</p>
}
```

---

## `use cache` 指令

### 文件级别

```tsx
'use cache'

export default async function Page() {
  // 整个页面被缓存
  const data = await fetchData()
  return <div>{data}</div>
}
```

### 组件级别

```tsx
export async function CachedComponent() {
  'use cache'
  const data = await fetchData()
  return <div>{data}</div>
}
```

### 函数级别

```tsx
export async function getData() {
  'use cache'
  return db.query('SELECT * FROM posts')
}
```

---

## 缓存配置文件

### 内置配置文件

```tsx
'use cache'                    // 默认: 5分钟过期，15分钟重新验证
```

```tsx
'use cache: remote'           // 平台提供的缓存（Redis, KV）
```

```tsx
'use cache: private'          // 用于合规性，允许运行时 API
```

### `cacheLife()` - 自定义生命周期

```tsx
import { cacheLife } from 'next/cache'

async function getData() {
  'use cache'
  cacheLife('hours')  // 内置配置文件
  return fetch('/api/data')
}
```

内置配置文件：`'default'`、`'minutes'`、`'hours'`、`'days'`、`'weeks'`、`'max'`

### 内联配置

```tsx
async function getData() {
  'use cache'
  cacheLife({
    stale: 3600,      // 1小时 - 在重新验证时提供过期数据
    revalidate: 7200, // 2小时 - 后台重新验证间隔
    expire: 86400,    // 1天 - 硬过期
  })
  return fetch('/api/data')
}
```

---

## 缓存失效

### `cacheTag()` - 标记缓存内容

```tsx
import { cacheTag } from 'next/cache'

async function getProducts() {
  'use cache'
  cacheTag('products')
  return db.products.findMany()
}

async function getProduct(id: string) {
  'use cache'
  cacheTag('products', `product-${id}`)
  return db.products.findUnique({ where: { id } })
}
```

### `updateTag()` - 立即失效

当你需要在同一请求中刷新缓存时使用：

```tsx
'use server'

import { updateTag } from 'next/cache'

export async function updateProduct(id: string, data: FormData) {
  await db.products.update({ where: { id }, data })
  updateTag(`product-${id}`)  // 立即 - 同一请求看到新鲜数据
}
```

### `revalidateTag()` - 后台重新验证

用于 stale-while-revalidate 行为：

```tsx
'use server'

import { revalidateTag } from 'next/cache'

export async function createPost(data: FormData) {
  await db.posts.create({ data })
  revalidateTag('posts')  // 后台 - 下一个请求看到新鲜数据
}
```

---

## 运行时数据约束

**不能**在 `use cache` 内访问 `cookies()`、`headers()` 或 `searchParams`。

### 解决方案：作为参数传递

```tsx
// 错误 - use cache 内的运行时 API
async function CachedProfile() {
  'use cache'
  const session = (await cookies()).get('session')?.value  // 错误！
  return <div>{session}</div>
}

// 正确 - 在外部提取，作为参数传递
async function ProfilePage() {
  const session = (await cookies()).get('session')?.value
  return <CachedProfile sessionId={session} />
}

async function CachedProfile({ sessionId }: { sessionId: string }) {
  'use cache'
  // sessionId 自动成为缓存键的一部分
  const data = await fetchUserData(sessionId)
  return <div>{data.name}</div>
}
```

### 例外：`use cache: private`

当你无法重构时，用于合规性要求：

```tsx
async function getData() {
  'use cache: private'
  const session = (await cookies()).get('session')?.value  // 允许
  return fetchData(session)
}
```

---

## 缓存键生成

缓存键基于以下内容自动生成：
- **构建 ID** - 部署时使所有缓存失效
- **函数 ID** - 函数位置的哈希
- **可序列化参数** - props 成为键的一部分
- **闭包变量** - 包含外部作用域值

```tsx
async function Component({ userId }: { userId: string }) {
  const getData = async (filter: string) => {
    'use cache'
    // 缓存键 = userId（闭包）+ filter（参数）
    return fetch(`/api/users/${userId}?filter=${filter}`)
  }
  return getData('active')
}
```

---

## 完整示例

```tsx
import { Suspense } from 'react'
import { cookies } from 'next/headers'
import { cacheLife, cacheTag } from 'next/cache'

export default function DashboardPage() {
  return (
    <>
      {/* 静态外壳 - 从 CDN 即时获取 */}
      <header><h1>仪表板</h1></header>
      <nav>...</nav>

      {/* 缓存 - 快速，每小时重新验证 */}
      <Stats />

      {/* 动态 - 使用新鲜数据流式传输 */}
      <Suspense fallback={<NotificationsSkeleton />}>
        <Notifications />
      </Suspense>
    </>
  )
}

async function Stats() {
  'use cache'
  cacheLife('hours')
  cacheTag('dashboard-stats')

  const stats = await db.stats.aggregate()
  return <StatsDisplay stats={stats} />
}

async function Notifications() {
  const userId = (await cookies()).get('userId')?.value
  const notifications = await db.notifications.findMany({
    where: { userId, read: false }
  })
  return <NotificationList items={notifications} />
}
```

---

## 从旧版本迁移

| 旧配置 | 替代方案 |
|-----------|-------------|
| `experimental.ppr` | `cacheComponents: true` |
| `dynamic = 'force-dynamic'` | 移除（默认行为） |
| `dynamic = 'force-static'` | `'use cache'` + `cacheLife('max')` |
| `revalidate = N` | `cacheLife({ revalidate: N })` |
| `unstable_cache()` | `'use cache'` 指令 |

---

## 限制

- **不支持 Edge 运行时** - 需要 Node.js
- **不支持静态导出** - 需要服务器
- **非确定性值**（`Math.random()`、`Date.now()`）在 `use cache` 内在构建时执行一次

对于缓存外的请求时随机性：

```tsx
import { connection } from 'next/server'

async function DynamicContent() {
  await connection()  // 推迟到请求时
  const id = crypto.randomUUID()  // 每个请求不同
  return <div>{id}</div>
}
```

来源：
- [缓存组件指南](https://nextjs.org/docs/app/getting-started/cache-components)
- [use cache 指令](https://nextjs.org/docs/app/api-reference/directives/use-cache)
