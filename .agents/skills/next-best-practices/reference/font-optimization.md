# 字体优化

使用 `next/font` 实现自动字体优化，无布局偏移。

## Google Fonts

```tsx
// app/layout.tsx
import { Inter } from 'next/font/google'

const inter = Inter({ subsets: ['latin'] })

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.className}>
      <body>{children}</body>
    </html>
  )
}
```

## 多个字体

```tsx
import { Inter, Roboto_Mono } from 'next/font/google'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
})

const robotoMono = Roboto_Mono({
  subsets: ['latin'],
  variable: '--font-roboto-mono',
})

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${robotoMono.variable}`}>
      <body>{children}</body>
    </html>
  )
}
```

在 CSS 中使用：
```css
body {
  font-family: var(--font-inter);
}

code {
  font-family: var(--font-roboto-mono);
}
```

## 字体粗细和样式

```tsx
// 单一粗细
const inter = Inter({
  subsets: ['latin'],
  weight: '400',
})

// 多个粗细
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
})

// 可变字体（推荐）- 包含所有粗细
const inter = Inter({
  subsets: ['latin'],
  // 无需指定 weight - 可变字体支持所有粗细
})

// 带斜体
const inter = Inter({
  subsets: ['latin'],
  style: ['normal', 'italic'],
})
```

## 本地字体

```tsx
import localFont from 'next/font/local'

const myFont = localFont({
  src: './fonts/MyFont.woff2',
})

// 为不同粗细使用多个文件
const myFont = localFont({
  src: [
    {
      path: './fonts/MyFont-Regular.woff2',
      weight: '400',
      style: 'normal',
    },
    {
      path: './fonts/MyFont-Bold.woff2',
      weight: '700',
      style: 'normal',
    },
  ],
})

// 可变字体
const myFont = localFont({
  src: './fonts/MyFont-Variable.woff2',
  variable: '--font-my-font',
})
```

## Tailwind CSS 集成

```tsx
// app/layout.tsx
import { Inter } from 'next/font/google'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
})

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>{children}</body>
    </html>
  )
}
```

```js
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-inter)'],
      },
    },
  },
}
```

## 预加载子集

仅加载所需的字符子集：

```tsx
// 仅拉丁文（最常见）
const inter = Inter({ subsets: ['latin'] })

// 多个子集
const inter = Inter({ subsets: ['latin', 'latin-ext', 'cyrillic'] })
```

## 显示策略

控制字体加载行为：

```tsx
const inter = Inter({
  subsets: ['latin'],
  display: 'swap', // 默认 - 显示回退字体，加载完成后切换
})

// 选项：
// 'auto' - 浏览器决定
// 'block' - 短暂阻塞期，然后切换
// 'swap' - 立即回退，准备好后切换（推荐）
// 'fallback' - 短暂阻塞，短暂切换，然后回退
// 'optional' - 短暂阻塞，不切换（如果字体是可选的则使用）
```

## 不要使用手动字体链接

始终使用 `next/font` 而不是 Google Fonts 的 `<link>` 标签。

```tsx
// 不好：手动 link 标签（阻塞渲染，无优化）
<link href="https://fonts.googleapis.com/css2?family=Inter" rel="stylesheet" />

// 不好：缺少 display 和 preconnect
<link href="https://fonts.googleapis.com/css2?family=Inter" rel="stylesheet" />

// 好：使用 next/font（自托管，零布局偏移）
import { Inter } from 'next/font/google'

const inter = Inter({ subsets: ['latin'] })
```

## 常见错误

```tsx
// 不好：在每个组件中导入字体
// components/Button.tsx
import { Inter } from 'next/font/google'
const inter = Inter({ subsets: ['latin'] }) // 每次都创建新实例！

// 好：在 layout 中导入一次，使用 CSS 变量
// app/layout.tsx
const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

// 不好：在 CSS 中使用 @import（阻塞渲染）
/* globals.css */
@import url('https://fonts.googleapis.com/css2?family=Inter');

// 好：使用 next/font（自托管，无网络请求）
import { Inter } from 'next/font/google'

// 不好：仅使用几个粗细时加载所有粗细
const inter = Inter({ subsets: ['latin'] }) // 加载所有粗细

// 好：仅指定所需的粗细（对于非可变字体）
const inter = Inter({ subsets: ['latin'], weight: ['400', '700'] })

// 不好：缺少 subset - 加载所有字符
const inter = Inter({})

// 好：始终指定 subset
const inter = Inter({ subsets: ['latin'] })
```

## 特定组件中的字体

```tsx
// 对于组件特定的字体，从共享文件中导出
// lib/fonts.ts
import { Inter, Playfair_Display } from 'next/font/google'

export const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
export const playfair = Playfair_Display({ subsets: ['latin'], variable: '--font-playfair' })

// components/Heading.tsx
import { playfair } from '@/lib/fonts'

export function Heading({ children }) {
  return <h1 className={playfair.className}>{children}</h1>
}
```
