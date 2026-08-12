# Hydration 错误

诊断和修复 React hydration 不匹配错误。

## 错误标志

- "Hydration failed because the initial UI does not match"
- "Text content does not match server-rendered HTML"

## 调试

在开发环境中，点击 hydration 错误以查看服务器/客户端差异。

## 常见原因和修复方法

### 浏览器专用 API

```tsx
// 不好：导致不匹配 - 服务器端不存在 window
<div>{window.innerWidth}</div>

// 好：使用带挂载检查的客户端组件
'use client'
import { useState, useEffect } from 'react'

export function ClientOnly({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  return mounted ? children : null
}
```

### 日期/时间渲染

服务器和客户端可能处于不同的时区：

```tsx
// 不好：导致不匹配
<span>{new Date().toLocaleString()}</span>

// 好：仅在客户端渲染
'use client'
const [time, setTime] = useState<string>()
useEffect(() => setTime(new Date().toLocaleString()), [])
```

### 随机值或 ID

```tsx
// 不好：服务器和客户端的随机值不同
<div id={Math.random().toString()}>

// 好：使用 useId hook
import { useId } from 'react'

function Input() {
  const id = useId()
  return <input id={id} />
}
```

### 无效的 HTML 嵌套

```tsx
// 不好：无效 - p 内嵌 div
<p><div>Content</div></p>

// 不好：无效 - p 内嵌 p
<p><p>Nested</p></p>

// 好：有效嵌套
<div><p>Content</p></div>
```

### 第三方脚本

在 hydration 期间修改 DOM 的脚本。

```tsx
// 好：使用 next/script 和 afterInteractive 策略
import Script from 'next/script'

export default function Page() {
  return (
    <Script
      src="https://example.com/script.js"
      strategy="afterInteractive"
    />
  )
}
```
