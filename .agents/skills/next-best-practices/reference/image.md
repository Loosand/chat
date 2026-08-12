# 图像优化

使用 `next/image` 进行自动图像优化。

## 始终使用 next/image

```tsx
// 不好：避免使用原生 img
<img src="/hero.png" alt="Hero" />

// 好：使用 next/image
import Image from 'next/image'
<Image src="/hero.png" alt="Hero" width={800} height={400} />
```

## 必需的 Props

图像需要明确的尺寸以防止布局偏移：

```tsx
// 本地图像 - 自动推断尺寸
import heroImage from './hero.png'
<Image src={heroImage} alt="Hero" />

// 远程图像 - 必须指定 width/height
<Image src="https://example.com/image.jpg" alt="Hero" width={800} height={400} />

// 或使用 fill 进行相对于父元素的尺寸调整
<div style={{ position: 'relative', width: '100%', height: 400 }}>
  <Image src="/hero.png" alt="Hero" fill style={{ objectFit: 'cover' }} />
</div>
```

## 远程图像配置

远程域名必须在 `next.config.js` 中配置：

```js
// next.config.js
module.exports = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'example.com',
        pathname: '/images/**',
      },
      {
        protocol: 'https',
        hostname: '*.cdn.com', // 通配符子域名
      },
    ],
  },
}
```

## 响应式图像

使用 `sizes` 告诉浏览器下载哪个尺寸：

```tsx
// 全宽 hero 图
<Image
  src="/hero.png"
  alt="Hero"
  fill
  sizes="100vw"
/>

// 响应式网格（桌面 3 列，移动 1 列）
<Image
  src="/card.png"
  alt="Card"
  fill
  sizes="(max-width: 768px) 100vw, 33vw"
/>

// 固定侧边栏图像
<Image
  src="/avatar.png"
  alt="Avatar"
  width={200}
  height={200}
  sizes="200px"
/>
```

## 模糊占位符

使用占位符防止布局偏移：

```tsx
// 本地图像 - 自动模糊哈希
import heroImage from './hero.png'
<Image src={heroImage} alt="Hero" placeholder="blur" />

// 远程图像 - 提供 blurDataURL
<Image
  src="https://example.com/image.jpg"
  alt="Hero"
  width={800}
  height={400}
  placeholder="blur"
  blurDataURL="data:image/jpeg;base64,/9j/4AAQSkZJRg..."
/>

// 或使用颜色占位符
<Image
  src="https://example.com/image.jpg"
  alt="Hero"
  width={800}
  height={400}
  placeholder="empty"
  style={{ backgroundColor: '#e0e0e0' }}
/>
```

## 优先加载

为首屏图像（LCP）使用 `priority`：

```tsx
// Hero 图像 - 立即加载
<Image src="/hero.png" alt="Hero" fill priority />

// 首屏以下图像 - 默认懒加载（不需要 priority）
<Image src="/card.png" alt="Card" width={400} height={300} />
```

## 常见错误

```tsx
// 不好：使用 fill 时缺少 sizes - 下载最大图像
<Image src="/hero.png" alt="Hero" fill />

// 好：添加 sizes 以获得正确的响应式行为
<Image src="/hero.png" alt="Hero" fill sizes="100vw" />

// 不好：仅使用 width/height 表示宽高比
<Image src="/hero.png" alt="Hero" width={16} height={9} />

// 好：使用实际显示尺寸或带 sizes 的 fill
<Image src="/hero.png" alt="Hero" fill sizes="100vw" style={{ objectFit: 'cover' }} />

// 不好：未配置的远程图像
<Image src="https://untrusted.com/image.jpg" alt="Image" width={400} height={300} />
// 错误：Invalid src prop, hostname not configured

// 好：将 hostname 添加到 next.config.js 的 remotePatterns
```

## 静态导出

使用 `output: 'export'` 时，使用 `unoptimized` 或自定义加载器：

```tsx
// 选项 1：禁用优化
<Image src="/hero.png" alt="Hero" width={800} height={400} unoptimized />

// 选项 2：全局配置
// next.config.js
module.exports = {
  output: 'export',
  images: { unoptimized: true },
}

// 选项 3：自定义加载器（Cloudinary、Imgix 等）
const cloudinaryLoader = ({ src, width, quality }) => {
  return `https://res.cloudinary.com/demo/image/upload/w_${width},q_${quality || 75}/${src}`
}

<Image loader={cloudinaryLoader} src="sample.jpg" alt="Sample" width={800} height={400} />
```
