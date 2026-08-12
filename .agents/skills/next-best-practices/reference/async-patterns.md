# 异步模式 (Async Patterns)

在 Next.js 15+ 中，`params`、`searchParams`、`cookies()` 和 `headers()` 均为异步操作。

## 异步 Params 和 SearchParams

请始终将其类型定义为 `Promise<...>` 并使用 `await` 等待结果。

### 页面与布局 (Pages and Layouts)

```tsx
type Props = { params: Promise<{ slug: string }> }

export default async function Page({ params }: Props) {
  const { slug } = await params
}
```

### 路由处理程序 (Route Handlers)

```tsx
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
}
```

### SearchParams

```tsx
type Props = {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ query?: string }>
}

export default async function Page({ params, searchParams }: Props) {
  const { slug } = await params
  const { query } = await searchParams
}
```

### 同步组件 (Synchronous Components)

对于非异步组件，请使用 `React.use()`：

```tsx
import { use } from 'react'

type Props = { params: Promise<{ slug: string }> }

export default function Page({ params }: Props) {
  const { slug } = use(params)
}
```

### generateMetadata

```tsx
type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  return { title: slug }
}
```

## 异步 Cookies 和 Headers

```tsx
import { cookies, headers } from 'next/headers'

export default async function Page() {
  const cookieStore = await cookies()
  const headersList = await headers()

  const theme = cookieStore.get('theme')
  const userAgent = headersList.get('user-agent')
}
```

## 迁移 Codemod (自动化重构工具)

```bash
npx @next/codemod@latest next-async-request-api .
```
