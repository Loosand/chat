# 错误处理

在 Next.js 应用程序中优雅地处理错误。

参考：https://nextjs.org/docs/app/getting-started/error-handling

## 错误边界

### `error.tsx`

捕获路由段及其子级中的错误：

```tsx
'use client'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div>
      <h2>Something went wrong!</h2>
      <button onClick={() => reset()}>Try again</button>
    </div>
  )
}
```

**重要提示**：`error.tsx` 必须是客户端组件。

### `global-error.tsx`

捕获根布局中的错误：

```tsx
'use client'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html>
      <body>
        <h2>Something went wrong!</h2>
        <button onClick={() => reset()}>Try again</button>
      </body>
    </html>
  )
}
```

**重要提示**：必须包含 `<html>` 和 `<body>` 标签。

## Server Actions：导航 API 陷阱

**不要将导航 API 包装在 try-catch 中。** 它们会抛出 Next.js 内部处理的特殊错误。

参考：https://nextjs.org/docs/app/api-reference/functions/redirect#behavior

```tsx
'use server'

import { redirect } from 'next/navigation'
import { notFound } from 'next/navigation'

// 不好：try-catch 捕获了导航"错误"
async function createPost(formData: FormData) {
  try {
    const post = await db.post.create({ ... })
    redirect(`/posts/${post.id}`)  // 这会抛出错误！
  } catch (error) {
    // redirect() 的抛出在这里被捕获 - 导航失败！
    return { error: 'Failed to create post' }
  }
}

// 好：在 try-catch 外调用导航 API
async function createPost(formData: FormData) {
  let post
  try {
    post = await db.post.create({ ... })
  } catch (error) {
    return { error: 'Failed to create post' }
  }
  redirect(`/posts/${post.id}`)  // 在 try-catch 外
}

// 好：重新抛出导航错误
async function createPost(formData: FormData) {
  try {
    const post = await db.post.create({ ... })
    redirect(`/posts/${post.id}`)
  } catch (error) {
    if (error instanceof Error && error.message === 'NEXT_REDIRECT') {
      throw error  // 重新抛出导航错误
    }
    return { error: 'Failed to create post' }
  }
}
```

同样适用于：
- `redirect()` - 307 临时重定向
- `permanentRedirect()` - 308 永久重定向
- `notFound()` - 404 未找到
- `forbidden()` - 403 禁止访问
- `unauthorized()` - 401 未授权

使用 `unstable_rethrow()` 在 catch 块中重新抛出这些错误：

```tsx
import { unstable_rethrow } from 'next/navigation'

async function action() {
  try {
    // ...
    redirect('/success')
  } catch (error) {
    unstable_rethrow(error) // 重新抛出 Next.js 内部错误
    return { error: 'Something went wrong' }
  }
}
```

## 重定向

```tsx
import { redirect, permanentRedirect } from 'next/navigation'

// 307 临时 - 用于大多数情况
redirect('/new-path')

// 308 永久 - 用于 URL 迁移（被浏览器缓存）
permanentRedirect('/new-url')
```

## 认证错误

触发与认证相关的错误页面：

```tsx
import { forbidden, unauthorized } from 'next/navigation'

async function Page() {
  const session = await getSession()

  if (!session) {
    unauthorized() // 渲染 unauthorized.tsx（401）
  }

  if (!session.hasAccess) {
    forbidden() // 渲染 forbidden.tsx（403）
  }

  return <Dashboard />
}
```

创建相应的错误页面：

```tsx
// app/forbidden.tsx
export default function Forbidden() {
  return <div>You don't have access to this resource</div>
}

// app/unauthorized.tsx
export default function Unauthorized() {
  return <div>Please log in to continue</div>
}
```

## 未找到

### `not-found.tsx`

路由段的自定义 404 页面：

```tsx
export default function NotFound() {
  return (
    <div>
      <h2>Not Found</h2>
      <p>Could not find the requested resource</p>
    </div>
  )
}
```

### 触发未找到

```tsx
import { notFound } from 'next/navigation'

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const post = await getPost(id)

  if (!post) {
    notFound()  // 渲染最近的 not-found.tsx
  }

  return <div>{post.title}</div>
}
```

## 错误层级

错误会冒泡到最近的错误边界：

```
app/
├── error.tsx           # 捕获所有子级的错误
├── blog/
│   ├── error.tsx       # 捕获 /blog/* 中的错误
│   └── [slug]/
│       ├── error.tsx   # 捕获 /blog/[slug] 中的错误
│       └── page.tsx
└── layout.tsx          # 这里的错误会到 global-error.tsx
```
