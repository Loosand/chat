---
name: nextjs-data-caching
description: |
  Next.js 16 数据缓存实战指南。适用于为 Server Action / RSC 数据查询添加缓存时触发。
  涵盖：unstable_cache 包装模式、updateTag 即时失效、React.cache 请求级去重、
  SWR 客户端缓存联动、缓存分层策略、cache tag 设计规范。
  基于本项目（Higgsfield）的实际缓存实践总结。
version: 1.0.0
tools:
  - Read
  - Glob
  - Grep
---

# Next.js 16 数据缓存实战指南

基于 Higgsfield 项目的实际缓存实践，适用于 Next.js 16+（`unstable_cache` 模式，无需 `cacheComponents`）。

## 何时使用本技能

- 为 Server Action 或 RSC 的数据查询添加缓存
- 设计缓存 tag 命名和失效策略
- 在 mutation 后正确失效服务端 + 客户端缓存
- 评估某个查询是否适合缓存

---

## 核心 API（Next.js 16）

### `unstable_cache` — 跨请求缓存

```tsx
import { unstable_cache } from "next/cache";

// 包装纯 DB 查询（不含 headers/cookies 等请求依赖）
const cachedQuery = unstable_cache(
  async () => { /* 纯数据查询 */ },
  ["cache-key-prefix"],             // 缓存键前缀
  { tags: ["tag-name"], revalidate: 60 }  // tag 用于手动失效，revalidate 为 TTL（秒）
);
```

### `updateTag` — 即时失效（Server Action 内）

```tsx
import { updateTag } from "next/cache";

// 在 mutation 后调用，同一请求即可读到新数据
updateTag("tag-name");
```

### `revalidateTag` — 后台重验证（Next.js 16 需要 2 个参数）

```tsx
import { revalidateTag } from "next/cache";

// 签名：revalidateTag(tag: string, profile: string | CacheLifeConfig)
// 适用于 `use cache` 指令的缓存，NOT unstable_cache
revalidateTag("posts", "default");
```

> **重要**：Next.js 16 的 `revalidateTag` 需要第二个 `profile` 参数，且主要配合 `use cache` 指令使用。
> 对于 `unstable_cache`，应使用 **`updateTag`**（单参数，即时失效，仅限 Server Action）。

### `React.cache` — 请求级去重

```tsx
import React from "react";

// 同一请求内多次调用只执行一次 DB 查询
const cachedGetData = React.cache(getData);
```

---

## 缓存分层架构

本项目采用三层缓存：

```
┌─────────────────────────────────────────┐
│  Layer 1: React.cache()                  │  请求级去重（同一 RSC render）
│  用途：同一请求内多个组件调用同一查询       │
├─────────────────────────────────────────┤
│  Layer 2: unstable_cache()               │  跨请求缓存（服务端，TTL + tag）
│  用途：减少 DB 查询频率                    │
├─────────────────────────────────────────┤
│  Layer 3: SWR (客户端)                    │  客户端缓存 + 去重 + 乐观更新
│  用途：避免页面切换时重复请求               │
└─────────────────────────────────────────┘
```

三层可以叠加使用，互不冲突。

---

## 标准实现模式

### 模式 1：包装 Server Action 查询

**核心原则**：将 session 获取和 DB 查询分离。`unstable_cache` 只包装纯数据查询。

```tsx
"use server";

import { auth } from "@repo/auth/server";
import { database, someTable } from "@repo/database";
import { eq } from "@repo/database/operators";
import { unstable_cache } from "next/cache";
import { headers } from "next/headers";

// 1. 纯 DB 查询函数 — 参数化，不依赖 request context
function queryData(userId: string, orgId: string | null) {
  const ownerId = orgId ?? userId;

  return unstable_cache(
    async () => {
      // 纯 DB 查询，无 headers()/cookies() 调用
      return database.query.someTable.findMany({
        where: eq(someTable.userId, userId),
      });
    },
    [`data-${ownerId}`],                           // 缓存键
    { tags: [`data-${ownerId}`], revalidate: 60 }  // tag + TTL
  )();  // 注意：立即调用
}

// 2. 公开的 Server Action — 处理 auth，委托给缓存函数
export async function getData() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return [];

  return queryData(
    session.user.id,
    session.session.activeOrganizationId ?? null
  );
}
```

### 模式 2：Mutation 后失效缓存

```tsx
"use server";

import { updateTag } from "next/cache";

export async function updateData(id: string, data: unknown) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return { success: false };

  await database.update(someTable).set(data).where(eq(someTable.id, id));

  // 失效服务端缓存
  const ownerId = session.session.activeOrganizationId ?? session.user.id;
  updateTag(`data-${ownerId}`);

  return { success: true };
}
```

### 模式 3：服务端 + 客户端联动失效

当同时使用 `unstable_cache`（服务端）和 SWR（客户端）时：

```tsx
// mutate-helper.ts — 客户端缓存失效工具
import { mutate } from "swr";

export function mutateData(type?: string) {
  if (type) mutate(`data-${type}`);
  mutate("data-recent");
}
```

```tsx
// mutation action
export async function createItem(params: CreateParams) {
  // ... DB 操作 ...

  // 服务端缓存失效
  updateTag(`data-${ownerId}`);

  return { success: true };
}

// 客户端调用
const result = await createItem(params);
if (result.success) {
  mutateData("image");  // 客户端 SWR 缓存也失效
}
```

### 模式 4：RSC 页面内直接缓存

对于页面级查询（非 Server Action），可以在 page.tsx 中直接使用：

```tsx
import { unstable_cache } from "next/cache";

const getPublicItems = unstable_cache(
  () => database.query.item.findMany({
    where: eq(item.visibility, "public"),
    orderBy: (t, { desc }) => [desc(t.usageCount)],
  }),
  ["public-items"],
  { tags: ["public-items"], revalidate: 300 }
);

export default async function Page() {
  const items = await getPublicItems();
  return <ItemList items={items} />;
}
```

### 模式 5：React.cache + unstable_cache 叠加

当同一请求内多个 Suspense 边界调用同一查询时：

```tsx
// layout.tsx
import React from "react";

// React.cache 防止同一请求内重复调用
// unstable_cache 防止跨请求重复查询 DB
const cachedGetCounts = React.cache(getAssetCounts);

async function TabsLoader() {
  const counts = await cachedGetCounts();
  return <Tabs counts={counts} />;
}

async function SidebarLoader() {
  const counts = await cachedGetCounts();  // 同一请求内不会再查 DB
  return <Sidebar counts={counts} />;
}
```

---

## Cache Tag 命名规范

### 格式

```
{资源类型}-{scope}[-{子类型}]
```

### 项目中的实际 tag

| Tag 模式 | 示例 | 用途 |
|----------|------|------|
| `projects-{ownerId}` | `projects-user123` | 用户/组织的项目列表 |
| `pins-{userId}` | `pins-user123` | 用户的置顶项 |
| `asset-counts-{ownerId}` | `asset-counts-org456` | 资产分类计数 |
| `app-{slug}` | `app-portrait-gen` | 单个 App 详情 |
| `public-apps` | `public-apps` | 公开 App 列表 |
| `inpaint-results-{userId}-{storageKey}` | `inpaint-results-u1-abc.png` | Inpaint 结果 |
| `admin-dashboard` | `admin-dashboard` | 管理后台仪表盘 |

### 设计原则

1. **按 owner 隔离**：用户数据 tag 包含 `userId` 或 `ownerId`（orgId ?? userId）
2. **全局资源用固定名**：如 `public-apps`、`admin-dashboard`
3. **粒度适中**：`app-{slug}` 精确到单条记录，`projects-{ownerId}` 覆盖整个列表
4. **失效时多 tag 并行**：一次 mutation 可以 `updateTag` 多个 tag

---

## TTL 推荐值

| 数据类型 | TTL | 理由 |
|----------|-----|------|
| 用户配置（pin、偏好） | 60s | 变更不频繁，但要较快反映 |
| 列表数据（项目、资产计数） | 60s | 平衡新鲜度与性能 |
| 公开资源（App 列表） | 300s (5min) | 只有 admin 修改，变更极少 |
| 静态详情（App by slug） | 300s (5min) | 同上 |
| Admin 仪表盘 | 120s | 聚合查询重，admin 可接受延迟 |
| 实时数据（pending jobs） | 不缓存 | 必须实时 |

---

## 适合缓存 vs 不适合缓存

### 适合

- 列表查询（项目列表、App 列表、资产计数）
- 配置/设置数据（置顶、用户偏好）
- 聚合统计（dashboard 的 COUNT/SUM）
- 按 slug/id 的单条记录查询
- 跨页面共享数据（layout 中的模型配置）

### 不适合

- 游标分页的非首页（cursor 导致缓存键爆炸）
- 带动态筛选+排序的 Admin 表格（组合爆炸）
- 实时性要求高的数据（pending 任务、在线状态）
- 一次性操作（重新生成参数查询）
- 低流量页面的简单查询（缓存开销 > 收益）

---

## `unstable_cache` 注意事项

### 序列化限制

`unstable_cache` 返回值会被 JSON 序列化。`Date` 对象会变成字符串：

```tsx
// 错误：Date 对象序列化后变成 string
const data = await unstable_cache(async () => {
  return { createdAt: new Date() };  // 调用方拿到的是 string，不是 Date
}, ...)();

// 正确：手动转为 ISO string
const data = await unstable_cache(async () => {
  const row = await db.query();
  return { ...row, createdAt: row.createdAt.toISOString() };
}, ...)();
```

### 不能包含 request context

```tsx
// 错误：unstable_cache 内调用 headers()
unstable_cache(async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  // ...
});

// 正确：session 在外层获取，参数传入
function queryData(userId: string) {
  return unstable_cache(async () => {
    return database.query.findMany({ where: eq(table.userId, userId) });
  }, [`data-${userId}`], { tags: [...], revalidate: 60 })();
}
```

### 闭包变量作为缓存键

传入 `unstable_cache` 回调的闭包变量 **不会** 自动成为缓存键。必须在第二个参数中显式指定：

```tsx
function queryByType(userId: string, type: string) {
  return unstable_cache(
    async () => db.query({ userId, type }),
    [`items-${userId}-${type}`],  // 必须包含所有变量
    { tags: [`items-${userId}`], revalidate: 60 }
  )();
}
```

---

## 项目缓存文件索引

| 文件 | 缓存类型 | Tag |
|------|----------|-----|
| `_actions/project/get-projects.ts` | unstable_cache 60s | `projects-{ownerId}` |
| `_actions/project/revalidate.ts` | updateTag | `projects-{ownerId}` |
| `_actions/pin.ts` | unstable_cache 60s | `pins-{userId}` |
| `_actions/credits.ts` | React.cache | — |
| `asset/actions.ts` | unstable_cache 60s | `asset-counts-{ownerId}` |
| `asset/layout.tsx` | React.cache (叠加) | — |
| `app/[app]/_actions/index.ts` | unstable_cache 300s | `app-{slug}` |
| `apps/page.tsx` | unstable_cache 300s | `public-apps` |
| `apps/[category]/page.tsx` | unstable_cache 300s | `public-apps` |
| `inpaint/_actions/get-inpaint-results.ts` | unstable_cache 60s | `inpaint-results-{userId}-{key}` |
| `admin/_actions/dashboard.ts` | unstable_cache 120s | `admin-dashboard` |
| `lib/models/resolve.ts` | 内存 TTL 5min + React.cache | — |
| `project/project-list.tsx` | SWR 10s dedup | — |
| `image/image-gallery.tsx` | SWR Infinite 5s dedup | — |
| `project/mutate-projects.ts` | SWR mutate helper | — |
