# RSC 边界

检测并防止跨越服务器/客户端组件边界时的无效模式。

## 检测规则

### 1. 异步客户端组件无效

客户端组件**不能**是异步函数。只有服务器组件可以是异步的。

**检测：** 文件有 `'use client'` 且组件是 `async function` 或返回 `Promise`

```tsx
// 不好：异步客户端组件
'use client'
export default async function UserProfile() {
  const user = await getUser() // 不能在客户端组件中 await
  return <div>{user.name}</div>
}

// 好：移除 async，在父服务器组件中获取数据
// page.tsx（服务器组件 - 无 'use client'）
export default async function Page() {
  const user = await getUser()
  return <UserProfile user={user} />
}

// UserProfile.tsx（客户端组件）
'use client'
export function UserProfile({ user }: { user: User }) {
  return <div>{user.name}</div>
}
```

```tsx
// 不好：异步箭头函数客户端组件
'use client'
const Dashboard = async () => {
  const data = await fetchDashboard()
  return <div>{data}</div>
}

// 好：在服务器组件中获取，向下传递数据
```

### 2. 传递给客户端组件的非可序列化 Props

从服务器 → 客户端传递的 Props 必须是 JSON 可序列化的。

**检测：** 服务器组件将以下内容传递给客户端组件：
- 函数（除了带 `'use server'` 的 Server Actions）
- `Date` 对象
- `Map`、`Set`、`WeakMap`、`WeakSet`
- 类实例
- `Symbol`（除非全局注册）
- 循环引用

```tsx
// 不好：函数 prop
// page.tsx（服务器）
export default function Page() {
  const handleClick = () => console.log('clicked')
  return <ClientButton onClick={handleClick} />
}

// 好：在客户端组件内定义函数
// ClientButton.tsx
'use client'
export function ClientButton() {
  const handleClick = () => console.log('clicked')
  return <button onClick={handleClick}>Click</button>
}
```

```tsx
// 不好：Date 对象（静默转换为字符串，然后崩溃）
// page.tsx（服务器）
export default async function Page() {
  const post = await getPost()
  return <PostCard createdAt={post.createdAt} /> // Date 对象
}

// PostCard.tsx（客户端）- 调用 .getFullYear() 时会崩溃
'use client'
export function PostCard({ createdAt }: { createdAt: Date }) {
  return <span>{createdAt.getFullYear()}</span> // 运行时错误！
}

// 好：在服务器端序列化为字符串
// page.tsx（服务器）
export default async function Page() {
  const post = await getPost()
  return <PostCard createdAt={post.createdAt.toISOString()} />
}

// PostCard.tsx（客户端）
'use client'
export function PostCard({ createdAt }: { createdAt: string }) {
  const date = new Date(createdAt)
  return <span>{date.getFullYear()}</span>
}
```

```tsx
// 不好：类实例
const user = new UserModel(data)
<ClientProfile user={user} /> // 方法会被剥离

// 好：传递普通对象
const user = await getUser()
<ClientProfile user={{ id: user.id, name: user.name }} />
```

```tsx
// 不好：Map/Set
<ClientComponent items={new Map([['a', 1]])} />

// 好：转换为数组/对象
<ClientComponent items={Object.fromEntries(map)} />
<ClientComponent items={Array.from(set)} />
```

### 3. Server Actions 是例外

标记了 `'use server'` 的函数可以传递给客户端组件。

```tsx
// 有效：Server Action 可以传递
// actions.ts
'use server'
export async function submitForm(formData: FormData) {
  // 服务器端逻辑
}

// page.tsx（服务器）
import { submitForm } from './actions'
export default function Page() {
  return <ClientForm onSubmit={submitForm} /> // 可以！
}

// ClientForm.tsx（客户端）
'use client'
export function ClientForm({ onSubmit }: { onSubmit: (data: FormData) => Promise<void> }) {
  return <form action={onSubmit}>...</form>
}
```

## 快速参考

| 模式 | 有效？ | 修复方法 |
|---------|--------|-----|
| `'use client'` + `async function` | 否 | 在服务器父组件中获取，传递数据 |
| 传递 `() => {}` 给客户端 | 否 | 在客户端定义或使用 server action |
| 传递 `new Date()` 给客户端 | 否 | 使用 `.toISOString()` |
| 传递 `new Map()` 给客户端 | 否 | 转换为对象/数组 |
| 传递类实例给客户端 | 否 | 传递普通对象 |
| 传递 server action 给客户端 | 是 | - |
| 传递 `string/number/boolean` | 是 | - |
| 传递普通对象/数组 | 是 | - |
