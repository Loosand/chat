# Route Handlers

使用 `route.ts` 文件创建 API 端点。

## 基本用法

```tsx
// app/api/users/route.ts
export async function GET() {
  const users = await getUsers()
  return Response.json(users)
}

export async function POST(request: Request) {
  const body = await request.json()
  const user = await createUser(body)
  return Response.json(user, { status: 201 })
}
```

## 支持的方法

`GET`、`POST`、`PUT`、`PATCH`、`DELETE`、`HEAD`、`OPTIONS`

## GET Handler 与 page.tsx 冲突

**`route.ts` 和 `page.tsx` 不能共存于同一文件夹中。**

```
app/
├── api/
│   └── users/
│       └── route.ts    # /api/users
└── users/
    ├── page.tsx        # /users (页面)
    └── route.ts        # 警告：与 page.tsx 冲突！
```

如果需要在同一路径上同时拥有页面和 API，请使用不同的路径：

```
app/
├── users/
│   └── page.tsx        # /users (页面)
└── api/
    └── users/
        └── route.ts    # /api/users (API)
```

## 环境行为

Route handlers 在**类似服务器组件的环境**中运行：

- 是：可以使用 `async/await`
- 是：可以访问 `cookies()`、`headers()`
- 是：可以使用 Node.js API
- 否：不能使用 React hooks
- 否：不能使用 React DOM API
- 否：不能使用浏览器 API

```tsx
// 不好：这不会工作 - route handlers 中没有 React DOM
import { renderToString } from 'react-dom/server'

export async function GET() {
  const html = renderToString(<Component />)  // 错误！
  return new Response(html)
}
```

## 动态 Route Handlers

```tsx
// app/api/users/[id]/route.ts
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const user = await getUser(id)

  if (!user) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  return Response.json(user)
}
```

## 请求辅助方法

```tsx
export async function GET(request: Request) {
  // URL 和搜索参数
  const { searchParams } = new URL(request.url)
  const query = searchParams.get('q')

  // 请求头
  const authHeader = request.headers.get('authorization')

  // Cookies（Next.js 辅助方法）
  const cookieStore = await cookies()
  const token = cookieStore.get('token')

  return Response.json({ query, token })
}
```

## 响应辅助方法

```tsx
// JSON 响应
return Response.json({ data })

// 带状态码
return Response.json({ error: 'Not found' }, { status: 404 })

// 带响应头
return Response.json(data, {
  headers: {
    'Cache-Control': 'max-age=3600',
  },
})

// 重定向
return Response.redirect(new URL('/login', request.url))

// 流式传输
return new Response(stream, {
  headers: { 'Content-Type': 'text/event-stream' },
})
```

## 何时使用 Route Handlers 与 Server Actions

| 用例 | Route Handlers | Server Actions |
|----------|----------------|----------------|
| 表单提交 | 否 | 是 |
| 来自 UI 的数据变更 | 否 | 是 |
| 第三方 webhooks | 是 | 否 |
| 外部 API 消费 | 是 | 否 |
| 公共 REST API | 是 | 否 |
| 文件上传 | 都可以 | 都可以 |

**优先使用 Server Actions** 处理从 UI 触发的变更操作。
**使用 Route Handlers** 处理外部集成和公共 API。
