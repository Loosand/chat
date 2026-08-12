/**
 * [INPUT]: 请求 headers、权威 Better Auth session→OwnerId helper
 * [OUTPUT]: 未认证 redirect 或带退出操作的 `/chat` 最小入口壳页
 * [POS]: Chat Web 认证后产品入口；聊天 client 在下一独立功能接入
 * [DOC]: docs/architecture/auth.md
 *
 * [PROTOCOL]: owner 只从 server session 推导；不得接受 query/cookie 以外的客户端 owner。
 */

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { getAuthenticatedOwnerId } from "@/server/auth";
import { requireChatPageOwner } from "@/server/chat-page-auth";

export default async function ChatPage() {
  await requireChatPageOwner({
    headers: await headers(),
    readOwnerId: getAuthenticatedOwnerId,
    redirect,
  });

  return (
    <main className="auth-shell">
      <div className="chat-placeholder">
        <p className="eyebrow">Authenticated</p>
        <h1>Chat</h1>
        <p className="chat-placeholder-copy">
          身份验证已完成。聊天界面将在下一项独立功能中接入。
        </p>
        <SignOutButton />
      </div>
    </main>
  );
}
