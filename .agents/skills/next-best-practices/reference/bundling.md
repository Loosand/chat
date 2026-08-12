# 打包 (Bundling)

修复第三方包常见的打包问题。

## 与服务端不兼容的包 (Server-Incompatible Packages)

某些包使用了浏览器 API（`window`、`document`、`localStorage`），导致在服务端组件（Server Components）中运行时失败。

### 错误迹象

```
ReferenceError: window is not defined
ReferenceError: document is not defined
ReferenceError: localStorage is not defined
Module not found: Can't resolve 'fs'
```

### 解决方案 1：标记为仅客户端 (Client-Only)

如果该包仅在客户端需要：

```tsx
// 错误：会失败 - 包使用了 window
import SomeChart from 'some-chart-library'

export default function Page() {
  return <SomeChart />
}

// 正确：使用带有 ssr: false 的动态导入
import dynamic from 'next/dynamic'

const SomeChart = dynamic(() => import('some-chart-library'), {
  ssr: false,
})

export default function Page() {
  return <SomeChart />
}
```

### 解决方案 2：从服务端包中排除 (Externalize from Server Bundle)

对于应该在服务端运行但存在打包问题的包：

```js
// next.config.js
module.exports = {
  serverExternalPackages: ['problematic-package'],
}
```

适用于：
- 带有原生绑定的包（如 sharp, bcrypt）
- 无法良好打包的包（某些 ORM）
- 存在循环依赖的包

### 解决方案 3：客户端组件包装器 (Client Component Wrapper)

将整个用法包装在一个客户端组件中：

```tsx
// components/ChartWrapper.tsx
'use client'

import { Chart } from 'chart-library'

export function ChartWrapper(props) {
  return <Chart {...props} />
}

// app/page.tsx (server component)
import { ChartWrapper } from '@/components/ChartWrapper'

export default function Page() {
  return <ChartWrapper data={data} />
}
```

## CSS 导入

导入 CSS 文件，而不是使用 `<link>` 标签。Next.js 会自动处理打包和优化。

```tsx
// 错误：手动 link 标签
<link rel="stylesheet" href="/styles.css" />

// 正确：导入 CSS
import './styles.css'

// 正确：CSS Modules
import styles from './Button.module.css'
```

## Polyfills

Next.js 自动包含常见的 Polyfills。不要从 polyfill.io 或类似的 CDN 加载多余的 Polyfills。

已包含：`Array.from`, `Object.assign`, `Promise`, `fetch`, `Map`, `Set`, `Symbol`, `URLSearchParams`, 以及其他 50 多个。

```tsx
// 错误：多余的 polyfills
<script src="[https://polyfill.io/v3/polyfill.min.js?features=fetch,Promise,Array.from](https://polyfill.io/v3/polyfill.min.js?features=fetch,Promise,Array.from)" />

// 正确：Next.js 自动包含这些
```

## ESM/CommonJS 问题

### 错误迹象

```
SyntaxError: Cannot use import statement outside a module
Error: require() of ES Module
Module not found: ESM packages need to be imported
```

### 解决方案：转译包 (Transpile Package)

```js
// next.config.js
module.exports = {
  transpilePackages: ['some-esm-package', 'another-package'],
}
```

## 常见的这类问题包

| 包名 | 问题 | 解决方案 |
|---------|-------|----------|
| `sharp` | 原生绑定 | `serverExternalPackages: ['sharp']` |
| `bcrypt` | 原生绑定 | `serverExternalPackages: ['bcrypt']` 或使用 `bcryptjs` |
| `canvas` | 原生绑定 | `serverExternalPackages: ['canvas']` |
| `recharts` | 使用 window | `dynamic(() => import('recharts'), { ssr: false })` |
| `react-quill` | 使用 document | `dynamic(() => import('react-quill'), { ssr: false })` |
| `mapbox-gl` | 使用 window | `dynamic(() => import('mapbox-gl'), { ssr: false })` |
| `monaco-editor` | 使用 window | `dynamic(() => import('@monaco-editor/react'), { ssr: false })` |
| `lottie-web` | 使用 document | `dynamic(() => import('lottie-react'), { ssr: false })` |

## 包分析 (Bundle Analysis)

使用内置分析器（Next.js 16.1+）分析包大小：

```bash
next experimental-analyze
```

这将打开一个交互式 UI，用于：
- 按路由、环境（客户端/服务端）和类型过滤
- 检查模块大小和导入链
- 查看树状图 (Treemap) 可视化

保存输出以便比较：

```bash
next experimental-analyze --output
# 输出保存至 .next/diagnostics/analyze
```

参考：https://nextjs.org/docs/app/guides/package-bundling

## 从 Webpack 迁移到 Turbopack

Turbopack 是 Next.js 15+ 的默认打包器。如果您有自定义 webpack 配置，请迁移到兼容 Turbopack 的替代方案：

```js
// next.config.js
module.exports = {
  // 正确：适用于 Turbopack
  serverExternalPackages: ['package'],
  transpilePackages: ['package'],

  // 错误：仅限 Webpack - 请迁移并远离此用法
  webpack: (config) => {
    // 自定义 webpack 配置
  },
}
```

参考：https://nextjs.org/docs/app/building-your-application/upgrading/from-webpack-to-turbopack
