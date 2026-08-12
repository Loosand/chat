/**
 * [INPUT]: `/api/auth/*` GET/POST Request 与请求时 Better Auth runtime
 * [OUTPUT]: Better Auth 标准 HTTP Response
 * [POS]: apps/web 的认证 catch-all Route Handler
 * [DOC]: docs/architecture/auth.md
 *
 * [PROTOCOL]:
 * 1. 方法、base path 或 runtime 变化时同步目录地图、auth.md 和 route tests。
 * 2. 保持惰性 composition；不得在模块加载时读取环境、连接或迁移数据库。
 */

import { getAuthRuntime } from "@/server/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function handleAuthRequest(request: Request): Promise<Response> {
  return getAuthRuntime().auth.handler(request);
}

export const GET = handleAuthRequest;
export const POST = handleAuthRequest;
