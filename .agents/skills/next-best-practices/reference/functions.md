# 函数

Next.js 函数 API。

参考：https://nextjs.org/docs/app/api-reference/functions

## 导航 Hooks（客户端）

| Hook | 用途 | 参考 |
|------|---------|-----------|
| `useRouter` | 编程式导航（`push`、`replace`、`back`、`refresh`）| [文档](https://nextjs.org/docs/app/api-reference/functions/use-router) |
| `usePathname` | 获取当前路径名 | [文档](https://nextjs.org/docs/app/api-reference/functions/use-pathname) |
| `useSearchParams` | 读取 URL 搜索参数 | [文档](https://nextjs.org/docs/app/api-reference/functions/use-search-params) |
| `useParams` | 访问动态路由参数 | [文档](https://nextjs.org/docs/app/api-reference/functions/use-params) |
| `useSelectedLayoutSegment` | 活动子段（一级）| [文档](https://nextjs.org/docs/app/api-reference/functions/use-selected-layout-segment) |
| `useSelectedLayoutSegments` | 布局下的所有活动段 | [文档](https://nextjs.org/docs/app/api-reference/functions/use-selected-layout-segments) |
| `useLinkStatus` | 检查链接预取状态 | [文档](https://nextjs.org/docs/app/api-reference/functions/use-link-status) |
| `useReportWebVitals` | 报告核心 Web Vitals 指标 | [文档](https://nextjs.org/docs/app/api-reference/functions/use-report-web-vitals) |

## 服务器函数

| 函数 | 用途 | 参考 |
|----------|---------|-----------|
| `cookies` | 读取/写入 cookies | [文档](https://nextjs.org/docs/app/api-reference/functions/cookies) |
| `headers` | 读取请求头 | [文档](https://nextjs.org/docs/app/api-reference/functions/headers) |
| `draftMode` | 启用未发布 CMS 内容的预览 | [文档](https://nextjs.org/docs/app/api-reference/functions/draft-mode) |
| `after` | 在响应流式传输完成后运行代码 | [文档](https://nextjs.org/docs/app/api-reference/functions/after) |
| `connection` | 在动态渲染前等待连接 | [文档](https://nextjs.org/docs/app/api-reference/functions/connection) |
| `userAgent` | 解析 User-Agent 头 | [文档](https://nextjs.org/docs/app/api-reference/functions/userAgent) |

## Generate 函数

| 函数 | 用途 | 参考 |
|----------|---------|-----------|
| `generateStaticParams` | 在构建时预渲染动态路由 | [文档](https://nextjs.org/docs/app/api-reference/functions/generate-static-params) |
| `generateMetadata` | 动态元数据 | [文档](https://nextjs.org/docs/app/api-reference/functions/generate-metadata) |
| `generateViewport` | 动态视口配置 | [文档](https://nextjs.org/docs/app/api-reference/functions/generate-viewport) |
| `generateSitemaps` | 为大型站点生成多个站点地图 | [文档](https://nextjs.org/docs/app/api-reference/functions/generate-sitemaps) |
| `generateImageMetadata` | 每个路由生成多个 OG 图像 | [文档](https://nextjs.org/docs/app/api-reference/functions/generate-image-metadata) |

## 请求/响应

| 函数 | 用途 | 参考 |
|----------|---------|-----------|
| `NextRequest` | 扩展的 Request 及辅助方法 | [文档](https://nextjs.org/docs/app/api-reference/functions/next-request) |
| `NextResponse` | 扩展的 Response 及辅助方法 | [文档](https://nextjs.org/docs/app/api-reference/functions/next-response) |
| `ImageResponse` | 生成 OG 图像 | [文档](https://nextjs.org/docs/app/api-reference/functions/image-response) |

## 常见示例

### 导航

使用 `next/link` 进行内部导航，而不是 `<a>` 标签。

```tsx
// 不好：普通 anchor 标签
<a href="/about">About</a>

// 好：Next.js Link
import Link from 'next/link'

<Link href="/about">About</Link>
```

活动链接样式：

```tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export function NavLink({ href, children }) {
  const pathname = usePathname()

  return (
    <Link href={href} className={pathname === href ? 'active' : ''}>
      {children}
    </Link>
  )
}
```

### 静态生成

```tsx
// app/blog/[slug]/page.tsx
export async function generateStaticParams() {
  const posts = await getPosts()
  return posts.map((post) => ({ slug: post.slug }))
}
```

### 响应后执行

```tsx
import { after } from 'next/server'

export async function POST(request: Request) {
  const data = await processRequest(request)

  after(async () => {
    await logAnalytics(data)
  })

  return Response.json({ success: true })
}
```
