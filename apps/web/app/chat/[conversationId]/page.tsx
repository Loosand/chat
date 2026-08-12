/**
 * [INPUT]: conversationId params、权威 Better Auth session 与 server chat page data
 * [OUTPUT]: 未认证 redirect 或持久 conversation 工作区
 * [POS]: Chat Web 刷新恢复入口
 * [DOC]: docs/architecture/frontend-stack.md
 *
 * [PROTOCOL]: conversation/owner 关系由 server repository 校验；浏览器参数不得成为 owner 事实。
 */

import { isChatDomainError } from "@repo/chat";
import { conversationIdSchema } from "@repo/contracts";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ChatWorkspace } from "@/components/chat/chat-workspace";
import { getAuthenticatedOwnerId } from "@/server/auth";
import { requireChatPageOwner } from "@/server/chat-page-auth";
import { loadChatPageData } from "@/server/chat-page-data";

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const [ownerId, { conversationId }] = await Promise.all([
    requireChatPageOwner({
      headers: await headers(),
      readOwnerId: getAuthenticatedOwnerId,
      redirect,
    }),
    params,
  ]);
  const parsedConversationId = conversationIdSchema.safeParse(conversationId);
  if (!parsedConversationId.success) {
    notFound();
  }
  let data: Awaited<ReturnType<typeof loadChatPageData>>;
  try {
    data = await loadChatPageData(ownerId, parsedConversationId.data);
  } catch (error) {
    if (isChatDomainError(error) && error.code === "conversation_not_found") {
      notFound();
    }
    throw error;
  }

  return (
    <ChatWorkspace
      initialError={data.modelError}
      initialSnapshot={data.snapshot}
      key={data.snapshot?.conversation.id}
      models={data.models}
    />
  );
}
