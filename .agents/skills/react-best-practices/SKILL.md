---
name: react-best-practices
description: 来自 Vercel Engineering 的 React 和 Next.js 性能优化指南。此技能应在编写、审查或重构 React/Next.js 代码时使用,以确保最佳性能模式。适用于涉及 React 组件、Next.js 页面、数据获取、bundle 优化或性能改进的任务。
license: MIT
metadata:
  author: vercel
  version: "1.0.0"
---

# Vercel React Best Practices

由 Vercel 维护的 React 和 Next.js 应用程序综合性能优化指南。包含 8 个类别的 45 条规则,按影响程度排序,用于指导自动化重构和代码生成。

## 何时应用

在以下情况下参考这些指南:
- 编写新的 React 组件或 Next.js 页面
- 实现数据获取(客户端或服务器端)
- 审查代码的性能问题
- 重构现有的 React/Next.js 代码
- 优化 bundle 大小或加载时间

## 按优先级分类的规则

| 优先级 | 类别 | 影响 | 前缀 |
|----------|----------|--------|--------|
| 1 | 消除瀑布流 | CRITICAL | `async-` |
| 2 | Bundle 大小优化 | CRITICAL | `bundle-` |
| 3 | 服务器端性能 | HIGH | `server-` |
| 4 | 客户端数据获取 | MEDIUM-HIGH | `client-` |
| 5 | 重渲染优化 | MEDIUM | `rerender-` |
| 6 | 渲染性能 | MEDIUM | `rendering-` |
| 7 | JavaScript 性能 | LOW-MEDIUM | `js-` |
| 8 | 高级模式 | LOW | `advanced-` |

## 快速参考

### 1. 消除瀑布流 (CRITICAL)

- `async-defer-await` - 将 await 移到实际使用的分支中
- `async-parallel` - 对独立操作使用 Promise.all()
- `async-dependencies` - 对部分依赖使用 better-all
- `async-api-routes` - 在 API routes 中尽早启动 promises,延迟 await
- `async-suspense-boundaries` - 使用 Suspense 流式传输内容

### 2. Bundle 大小优化 (CRITICAL)

- `bundle-barrel-imports` - 直接导入,避免 barrel files
- `bundle-dynamic-imports` - 对重型组件使用 next/dynamic
- `bundle-defer-third-party` - 在 hydration 后加载 analytics/logging
- `bundle-conditional` - 仅在功能激活时加载模块
- `bundle-preload` - 在 hover/focus 时预加载以提升感知速度

### 3. 服务器端性能 (HIGH)

- `server-cache-react` - 使用 React.cache() 进行单次请求去重
- `server-cache-lru` - 使用 LRU cache 进行跨请求缓存
- `server-serialization` - 最小化传递给 client 组件的数据
- `server-parallel-fetching` - 重构组件以并行化数据获取
- `server-after-nonblocking` - 使用 after() 进行非阻塞操作

### 4. 客户端数据获取 (MEDIUM-HIGH)

- `client-swr-dedup` - 使用 SWR 自动去重请求
- `client-event-listeners` - 去重全局 event listeners

### 5. 重渲染优化 (MEDIUM)

- `rerender-defer-reads` - 不要订阅仅在回调中使用的 state
- `rerender-memo` - 将昂贵的工作提取到 memoized 组件中
- `rerender-dependencies` - 在 effects 中使用原始类型依赖
- `rerender-derived-state` - 订阅派生的 booleans,而非原始值
- `rerender-functional-setstate` - 使用函数式 setState 获得稳定的回调
- `rerender-lazy-state-init` - 对昂贵值向 useState 传递函数
- `rerender-transitions` - 对非紧急更新使用 startTransition

### 6. 渲染性能 (MEDIUM)

- `rendering-animate-svg-wrapper` - 动画化 div wrapper,而非 SVG element
- `rendering-content-visibility` - 对长列表使用 content-visibility
- `rendering-hoist-jsx` - 将静态 JSX 提取到组件外部
- `rendering-svg-precision` - 降低 SVG 坐标精度
- `rendering-hydration-no-flicker` - 对 client-only 数据使用 inline script
- `rendering-activity` - 使用 Activity component 显示/隐藏
- `rendering-conditional-render` - 使用三元运算符,而非 && 进行条件渲染

### 7. JavaScript 性能 (LOW-MEDIUM)

- `js-batch-dom-css` - 通过 classes 或 cssText 分组 CSS 更改
- `js-index-maps` - 为重复查找构建 Map
- `js-cache-property-access` - 在循环中缓存对象属性
- `js-cache-function-results` - 在 module-level Map 中缓存函数结果
- `js-cache-storage` - 缓存 localStorage/sessionStorage 读取
- `js-combine-iterations` - 将多个 filter/map 合并为一个循环
- `js-length-check-first` - 在昂贵比较前检查数组长度
- `js-early-exit` - 从函数中尽早返回
- `js-hoist-regexp` - 将 RegExp 创建提升到循环外
- `js-min-max-loop` - 使用循环获取 min/max 而非 sort
- `js-set-map-lookups` - 使用 Set/Map 进行 O(1) 查找
- `js-tosorted-immutable` - 使用 toSorted() 保证不可变性

### 8. 高级模式 (LOW)

- `advanced-event-handler-refs` - 在 refs 中存储 event handlers
- `advanced-use-latest` - 使用 useLatest 获得稳定的 callback refs

## 如何使用

阅读单个规则文件以获取详细说明和代码示例:

```
rules/async-parallel.md
rules/bundle-barrel-imports.md
rules/_sections.md
```

每个规则文件包含:
- 简要说明其重要性
- 错误代码示例及说明
- 正确代码示例及说明
- 额外的上下文和参考

## 完整编译文档

要查看包含所有规则展开的完整指南: `AGENTS.md`
