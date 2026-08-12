/**
 * [INPUT]: 可选的跨 origin Better Auth base URL
 * [OUTPUT]: 带 Admin client plugin 的 React auth client factory
 * [POS]: @repo/auth 的浏览器客户端组合入口
 * [DOC]: docs/architecture/auth.md
 *
 * [PROTOCOL]:
 * 1. Client plugin 变化时同步 server plugin、schema/migration 和 auth.md。
 * 2. 同 origin 默认不传 baseURL；不得向客户端暴露 secret 或数据库配置。
 */

import { adminClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export function createChatAuthClient(baseURL?: string) {
  return createAuthClient({
    ...(baseURL ? { baseURL } : {}),
    plugins: [adminClient()],
  });
}

export type ChatAuthClient = ReturnType<typeof createChatAuthClient>;
