/**
 * [INPUT]: 认证 GET 与 conversationId path
 * [OUTPUT]: conversation + active branch JSON snapshot
 * [POS]: `/api/chat/conversations/:conversationId` Route Handler
 * [DOC]: docs/architecture/chat-http.md
 *
 * [PROTOCOL]:
 * 1. conversation 与 branch 必须使用同一 session OwnerId。
 * 2. 不加载 sibling branch，不返回隐藏 reasoning。
 */

import { chatConversationPathSchema } from "@repo/contracts";
import {
  requireChatOwner,
  toChatErrorResponse,
  toConversationResource,
  toMessageResource,
} from "@/server/chat-http";
import { getChatRuntime } from "@/server/chat-runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ conversationId: string }>;
};

export async function GET(
  request: Request,
  context: RouteContext
): Promise<Response> {
  try {
    const [ownerId, params] = await Promise.all([
      requireChatOwner(request),
      context.params,
    ]);
    const { conversationId } = chatConversationPathSchema.parse(params);
    const chat = getChatRuntime().chat;
    const conversation = await chat.getConversation(conversationId, ownerId);
    const messages = conversation.activeLeafMessageId
      ? await chat.listBranchMessages(
          conversation.id,
          conversation.activeLeafMessageId,
          ownerId
        )
      : [];
    return Response.json({
      conversation: toConversationResource(conversation),
      messages: messages.map(toMessageResource),
    });
  } catch (error) {
    return toChatErrorResponse(error);
  }
}
