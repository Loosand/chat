# Suspense 边界

没有 Suspense 边界会导致 CSR 降级的客户端 hooks。

## useSearchParams

在静态路由中始终需要 Suspense 边界。没有它，整个页面会变成客户端渲染。

```tsx
// 不好：整个页面变成 CSR
'use client'

import { useSearchParams } from 'next/navigation'

export default function SearchBar() {
  const searchParams = useSearchParams()
  return <div>Query: {searchParams.get('q')}</div>
}
```

```tsx
// 好：用 Suspense 包裹
import { Suspense } from 'react'
import SearchBar from './search-bar'

export default function Page() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <SearchBar />
    </Suspense>
  )
}
```

## usePathname

当路由有动态参数时需要 Suspense 边界。

```tsx
// 在动态路由 [slug] 中
// 不好：无 Suspense
'use client'
import { usePathname } from 'next/navigation'

export function Breadcrumb() {
  const pathname = usePathname()
  return <nav>{pathname}</nav>
}
```

```tsx
// 好：用 Suspense 包裹
<Suspense fallback={<BreadcrumbSkeleton />}>
  <Breadcrumb />
</Suspense>
```

如果你使用 `generateStaticParams`，Suspense 是可选的。

## 快速参考

| Hook | 需要 Suspense |
|------|-------------------|
| `useSearchParams()` | 是 |
| `usePathname()` | 是（动态路由）|
| `useParams()` | 否 |
| `useRouter()` | 否 |
