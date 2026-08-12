# 运行时选择

## 默认使用 Node.js 运行时

为新路由和页面使用默认的 Node.js 运行时。仅在项目已经使用 Edge 运行时或有特定需求时才使用 Edge 运行时。

```tsx
// 好：默认 - 无需运行时配置（使用 Node.js）
export default function Page() { ... }

// 谨慎：仅在项目已使用或有特定需求时
export const runtime = 'edge'
```

## 何时使用每种运行时

### Node.js 运行时（默认）

- 完整的 Node.js API 支持
- 文件系统访问（`fs`）
- 完整的 `crypto` 支持
- 数据库连接
- 大多数 npm 包都能工作

### Edge 运行时

- 仅用于特定的边缘位置延迟需求
- 有限的 API（无 `fs`，有限的 `crypto`）
- 更小的冷启动
- 地理分布需求

## 检测

**在添加 `runtime = 'edge'` 之前**，检查：
1. 项目是否已经使用 Edge 运行时？
2. 是否有特定的延迟需求？
3. 所有依赖项是否兼容 Edge？

如果不确定，使用 Node.js 运行时。
