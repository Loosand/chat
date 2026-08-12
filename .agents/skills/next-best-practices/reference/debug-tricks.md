# 调试技巧

加速 Next.js 应用程序调试的技巧。

## MCP 端点（开发服务器）

Next.js 在开发环境中暴露了 `/_next/mcp` 端点，通过 MCP（模型上下文协议）实现 AI 辅助调试。

- **Next.js 16+**：默认启用，使用 `next-devtools-mcp`
- **Next.js < 16**：需要在 next.config.js 中设置 `experimental.mcpServer: true`

参考：https://nextjs.org/docs/app/guides/mcp

**重要提示**：找到正在运行的 Next.js 开发服务器的实际端口（检查终端输出或 `package.json` 脚本）。不要假设是 3000 端口。

### 请求格式

该端点使用 HTTP POST 上的 JSON-RPC 2.0：

```bash
curl -X POST http://localhost:<port>/_next/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": "1",
    "method": "tools/call",
    "params": {
      "name": "<tool-name>",
      "arguments": {}
    }
  }'
```

### 可用工具

#### `get_errors`
从开发服务器获取当前错误（构建错误、带有源映射堆栈的运行时错误）：
```json
{ "name": "get_errors", "arguments": {} }
```

#### `get_routes`
通过扫描文件系统发现所有路由：
```json
{ "name": "get_routes", "arguments": {} }
// 可选: { "name": "get_routes", "arguments": { "routerType": "app" } }
```
返回：`{ "appRouter": ["/", "/api/users/[id]", ...], "pagesRouter": [...] }`

#### `get_project_metadata`
获取项目路径和开发服务器 URL：
```json
{ "name": "get_project_metadata", "arguments": {} }
```
返回：`{ "projectPath": "/path/to/project", "devServerUrl": "http://localhost:3000" }`

#### `get_page_metadata`
获取当前页面渲染的运行时元数据（需要活动的浏览器会话）：
```json
{ "name": "get_page_metadata", "arguments": {} }
```
返回显示布局、边界和页面组件的分段树数据。

#### `get_logs`
获取 Next.js 开发日志文件的路径：
```json
{ "name": "get_logs", "arguments": {} }
```
返回 `<distDir>/logs/next-development.log` 的路径

#### `get_server_action_by_id`
通过 ID 定位 Server Action：
```json
{ "name": "get_server_action_by_id", "arguments": { "actionId": "<action-id>" } }
```

### 示例：获取错误

```bash
curl -X POST http://localhost:<port>/_next/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":"1","method":"tools/call","params":{"name":"get_errors","arguments":{}}}'
```

## 重新构建特定路由（Next.js 16+）

使用 `--debug-build-paths` 仅重新构建特定路由，而不是整个应用：

```bash
# 重新构建特定路由
next build --debug-build-paths "/dashboard"

# 重新构建匹配 glob 的路由
next build --debug-build-paths "/api/*"

# 动态路由
next build --debug-build-paths "/blog/[slug]"
```

使用场景：
- 无需完整重建即可快速验证构建修复
- 调试特定页面的静态生成问题
- 更快地迭代构建错误
