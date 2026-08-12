---
title: 策略性的 Suspense Boundaries
impact: HIGH
impactDescription: 更快的初始渲染
tags: async, suspense, streaming, layout-shift
---

## 策略性的 Suspense Boundaries

不要在返回 JSX 前在 async 组件中等待数据,而是使用 Suspense boundaries 在数据加载时更快地显示包装器 UI。

**错误 (wrapper 被数据获取阻塞):**

```tsx
async function Page() {
  const data = await fetchData() // 阻塞整个页面

  return (
    <div>
      <div>Sidebar</div>
      <div>Header</div>
      <div>
        <DataDisplay data={data} />
      </div>
      <div>Footer</div>
    </div>
  )
}
```

整个布局等待数据,即使只有中间部分需要它。

**正确 (wrapper 立即显示,数据流式传入):**

```tsx
function Page() {
  return (
    <div>
      <div>Sidebar</div>
      <div>Header</div>
      <div>
        <Suspense fallback={<Skeleton />}>
          <DataDisplay />
        </Suspense>
      </div>
      <div>Footer</div>
    </div>
  )
}

async function DataDisplay() {
  const data = await fetchData() // 只阻塞这个组件
  return <div>{data.content}</div>
}
```

Sidebar、Header 和 Footer 立即渲染。只有 DataDisplay 等待数据。

**替代方案 (跨组件共享 promise):**

```tsx
function Page() {
  // 立即启动获取,但不 await
  const dataPromise = fetchData()

  return (
    <div>
      <div>Sidebar</div>
      <div>Header</div>
      <Suspense fallback={<Skeleton />}>
        <DataDisplay dataPromise={dataPromise} />
        <DataSummary dataPromise={dataPromise} />
      </Suspense>
      <div>Footer</div>
    </div>
  )
}

function DataDisplay({ dataPromise }: { dataPromise: Promise<Data> }) {
  const data = use(dataPromise) // 解包 promise
  return <div>{data.content}</div>
}

function DataSummary({ dataPromise }: { dataPromise: Promise<Data> }) {
  const data = use(dataPromise) // 重用相同的 promise
  return <div>{data.summary}</div>
}
```

两个组件共享相同的 promise,因此只发生一次获取。布局立即渲染,而两个组件一起等待。

**何时不使用此模式:**

- 布局决策所需的关键数据(影响定位)
- 折叠上方的 SEO 关键内容
- Suspense 开销不值得的小型快速查询
- 想要避免布局偏移(loading → content jump)

**权衡:** 更快的初始渲染 vs 潜在的布局偏移。根据你的 UX 优先级选择。
