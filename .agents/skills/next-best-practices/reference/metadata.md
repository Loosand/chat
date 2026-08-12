# 元数据

使用 Metadata API 向 Next.js 页面添加 SEO 元数据。

## 重要：仅限服务器组件

`metadata` 对象和 `generateMetadata` 函数**仅在服务器组件中受支持**。它们不能在客户端组件中使用。

如果目标页面有 `'use client'`：
1. 如果可能，移除 `'use client'`，将客户端逻辑移至子组件
2. 或将元数据提取到父级服务器组件布局中
3. 或拆分文件：带元数据的服务器组件导入客户端组件

## 静态元数据

```tsx
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Page Title',
  description: 'Page description for search engines',
}
```

## 动态元数据

```tsx
import type { Metadata } from 'next'

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const post = await getPost(slug)
  return { title: post.title, description: post.description }
}
```

## 避免重复获取

当元数据和页面需要相同数据时，使用 React 的 `cache()`：

```tsx
import { cache } from 'react'

export const getPost = cache(async (slug: string) => {
  return await db.posts.findFirst({ where: { slug } })
})
```

## 视口

从元数据中分离以支持流式传输：

```tsx
import type { Viewport } from 'next'

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#000000',
}

// 或动态
export function generateViewport({ params }): Viewport {
  return { themeColor: getThemeColor(params) }
}
```

## 标题模板

在根布局中保持一致的命名：

```tsx
export const metadata: Metadata = {
  title: { default: 'Site Name', template: '%s | Site Name' },
}
```

## 元数据文件约定

参考：https://nextjs.org/docs/app/getting-started/project-structure#metadata-file-conventions

将这些文件放在 `app/` 目录（或路由段）中：

| 文件 | 用途 |
|------|---------|
| `favicon.ico` | 网站图标 |
| `icon.png` / `icon.svg` | 应用图标 |
| `apple-icon.png` | Apple 应用图标 |
| `opengraph-image.png` | OG 图像 |
| `twitter-image.png` | Twitter 卡片图像 |
| `sitemap.ts` / `sitemap.xml` | 站点地图（使用 `generateSitemaps` 生成多个）|
| `robots.ts` / `robots.txt` | Robots 指令 |
| `manifest.ts` / `manifest.json` | Web 应用清单 |

## SEO 最佳实践：静态文件通常就够了

对于大多数网站，**静态元数据文件提供了出色的 SEO 覆盖**：

```
app/
├── favicon.ico
├── opengraph-image.png     # 同时适用于 OG 和 Twitter
├── sitemap.ts
├── robots.ts
└── layout.tsx              # 带 title/description 元数据
```

**提示：**
- 单个 `opengraph-image.png` 同时覆盖 Open Graph 和 Twitter（Twitter 回退到 OG）
- 布局元数据中的静态 `title` 和 `description` 对大多数页面来说已足够
- 仅在内容因页面而异时使用动态 `generateMetadata`

---

# OG 图像生成

使用 `next/og` 生成动态 Open Graph 图像。

## 重要规则

1. **使用 `next/og`** - 而非 `@vercel/og`（它已内置在 Next.js 中）
2. **不支持 searchParams** - OG 图像无法访问搜索参数，改用路由参数
3. **避免 Edge 运行时** - 使用默认的 Node.js 运行时

```tsx
// 好
import { ImageResponse } from 'next/og'

// 不好
// import { ImageResponse } from '@vercel/og'
// export const runtime = 'edge'
```

## 基本 OG 图像

```tsx
// app/opengraph-image.tsx
import { ImageResponse } from 'next/og'

export const alt = 'Site Name'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 128,
          background: 'white',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        Hello World
      </div>
    ),
    { ...size }
  )
}
```

## 动态 OG 图像

```tsx
// app/blog/[slug]/opengraph-image.tsx
import { ImageResponse } from 'next/og'

export const alt = 'Blog Post'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

type Props = { params: Promise<{ slug: string }> }

export default async function Image({ params }: Props) {
  const { slug } = await params
  const post = await getPost(slug)

  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 48,
          background: 'linear-gradient(to bottom, #1a1a1a, #333)',
          color: 'white',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 48,
        }}
      >
        <div style={{ fontSize: 64, fontWeight: 'bold' }}>{post.title}</div>
        <div style={{ marginTop: 24, opacity: 0.8 }}>{post.description}</div>
      </div>
    ),
    { ...size }
  )
}
```

## 自定义字体

```tsx
import { ImageResponse } from 'next/og'
import { join } from 'path'
import { readFile } from 'fs/promises'

export default async function Image() {
  const fontPath = join(process.cwd(), 'assets/fonts/Inter-Bold.ttf')
  const fontData = await readFile(fontPath)

  return new ImageResponse(
    (
      <div style={{ fontFamily: 'Inter', fontSize: 64 }}>
        Custom Font Text
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [{ name: 'Inter', data: fontData, style: 'normal' }],
    }
  )
}
```

## 文件命名

- `opengraph-image.tsx` - Open Graph（Facebook、LinkedIn）
- `twitter-image.tsx` - Twitter/X 卡片（可选，回退到 OG）

## 样式说明

ImageResponse 使用 Flexbox 布局：
- 使用 `display: 'flex'`
- 不支持 CSS Grid
- 样式必须是内联对象

## 多个 OG 图像

使用 `generateImageMetadata` 为每个路由生成多个图像：

```tsx
// app/blog/[slug]/opengraph-image.tsx
import { ImageResponse } from 'next/og'

export async function generateImageMetadata({ params }) {
  const images = await getPostImages(params.slug)
  return images.map((img, idx) => ({
    id: idx,
    alt: img.alt,
    size: { width: 1200, height: 630 },
    contentType: 'image/png',
  }))
}

export default async function Image({ params, id }) {
  const images = await getPostImages(params.slug)
  const image = images[id]
  return new ImageResponse(/* ... */)
}
```

## 多个站点地图

为大型站点使用 `generateSitemaps`：

```tsx
// app/sitemap.ts
import type { MetadataRoute } from 'next'

export async function generateSitemaps() {
  // 返回站点地图 ID 数组
  return [{ id: 0 }, { id: 1 }, { id: 2 }]
}

export default async function sitemap({
  id,
}: {
  id: number
}): Promise<MetadataRoute.Sitemap> {
  const start = id * 50000
  const end = start + 50000
  const products = await getProducts(start, end)

  return products.map((product) => ({
    url: `https://example.com/product/${product.id}`,
    lastModified: product.updatedAt,
  }))
}
```

生成 `/sitemap/0.xml`、`/sitemap/1.xml` 等。
