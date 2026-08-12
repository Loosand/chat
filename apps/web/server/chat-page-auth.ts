/**
 * [INPUT]: 权威 session→OwnerId reader、请求 headers 与 redirect adapter
 * [OUTPUT]: 已认证 OwnerId 或固定 `/sign-in` 重定向
 * [POS]: `/chat` Server Component 的可测试认证决策边界
 * [DOC]: docs/architecture/auth.md
 *
 * [PROTOCOL]: owner 只能由 reader 推导；未认证目标固定，不接受客户端 redirect。
 */

import type { OwnerId } from "@repo/contracts";

export async function requireChatPageOwner({
  headers,
  readOwnerId,
  redirect,
}: {
  headers: Headers;
  readOwnerId: (headers: Headers) => Promise<OwnerId | null>;
  redirect: (path: "/sign-in") => never;
}): Promise<OwnerId> {
  const ownerId = await readOwnerId(headers);
  if (!ownerId) {
    return redirect("/sign-in");
  }
  return ownerId;
}
