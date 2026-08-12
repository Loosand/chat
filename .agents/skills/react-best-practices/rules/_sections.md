# Sections

本文件定义所有 sections、它们的顺序、影响级别和描述。
括号中的 section ID 是用于分组规则的文件名前缀。

---

## 1. 消除瀑布流 (async)

**影响:** CRITICAL
**描述:** 瀑布流是头号性能杀手。每个顺序 await 都会增加完整的网络延迟。消除它们能获得最大收益。

## 2. Bundle 大小优化 (bundle)

**影响:** CRITICAL
**描述:** 减少初始 bundle 大小可改善 Time to Interactive 和 Largest Contentful Paint。

## 3. 服务器端性能 (server)

**影响:** HIGH
**描述:** 优化服务器端渲染和数据获取可消除服务器端瀑布流并减少响应时间。

## 4. 客户端数据获取 (client)

**影响:** MEDIUM-HIGH
**描述:** 自动去重和高效的数据获取模式可减少冗余网络请求。

## 5. 重渲染优化 (rerender)

**影响:** MEDIUM
**描述:** 减少不必要的重渲染可最小化浪费的计算并提升 UI 响应性。

## 6. 渲染性能 (rendering)

**影响:** MEDIUM
**描述:** 优化渲染过程可减少浏览器需要执行的工作。

## 7. JavaScript 性能 (js)

**影响:** LOW-MEDIUM
**描述:** 热路径的微优化可累积产生有意义的改进。

## 8. 高级模式 (advanced)

**影响:** LOW
**描述:** 需要谨慎实现的特定场景的高级模式。
