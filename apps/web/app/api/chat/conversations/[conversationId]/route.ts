/**
 * [INPUT]: 认证 GET 与 conversationId path
 * [OUTPUT]: conversation + active branch + 可恢复 active run JSON snapshot
 * [POS]: `/api/chat/conversations/:conversationId` Route Handler
 * [DOC]: docs/architecture/chat-http.md
 *
 * [PROTOCOL]:
 * 1. conversation 与 branch 必须使用同一 session OwnerId。
 * 2. 不加载 sibling branch；active run 只取当前叶子且不返回内部 route/隐藏 reasoning。
 */

import { chatConversationPathSchema } from "@repo/contracts";
import {
  requireChatOwner,
  toChatErrorResponse,
  toConversationResource,
  toMessageResource,
  toRunResource,
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
    const activeRun = conversation.activeLeafMessageId
      ? await chat.getRunByAssistantMessage(
          conversation.activeLeafMessageId,
          ownerId
        )
      : null;
    return Response.json({
      activeRun:
        activeRun &&
        ["pending", "running", "cancel_requested"].includes(activeRun.status)
          ? toRunResource(activeRun)
          : null,
      conversation: toConversationResource(conversation),
      messages: messages.map(toMessageResource),
    });
  } catch (error) {
    return toChatErrorResponse(error);
  }
}
