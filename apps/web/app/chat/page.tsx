/**
 * [INPUT]: 请求 headers、权威 Better Auth session→OwnerId helper
 * [OUTPUT]: 未认证 redirect 或空白的新聊天工作区
 * [POS]: Chat Web 认证后新对话入口
 * [DOC]: docs/architecture/frontend-stack.md
 *
 * [PROTOCOL]: owner 只从 server session 推导；不得接受 query/cookie 以外的客户端 owner。
 */

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ChatWorkspace } from "@/components/chat/chat-workspace";
import { getAuthenticatedOwnerId } from "@/server/auth";
import { requireChatPageOwner } from "@/server/chat-page-auth";
import { loadChatPageData } from "@/server/chat-page-data";

export default async function ChatPage() {
  const ownerId = await requireChatPageOwner({
    headers: await headers(),
    readOwnerId: getAuthenticatedOwnerId,
    redirect,
  });
  const { modelError, models } = await loadChatPageData(ownerId);

  return (
    <ChatWorkspace
      initialError={modelError}
      initialSnapshot={null}
      key="new-chat"
      models={models}
    />
  );
}
