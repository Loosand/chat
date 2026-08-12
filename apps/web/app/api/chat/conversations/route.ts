/**
 * [INPUT]: 认证 POST、可信 Origin 与 create conversation JSON
 * [OUTPUT]: 201 ConversationResource 或稳定 ChatApiErrorResource
 * [POS]: `/api/chat/conversations` collection Route Handler
 * [DOC]: docs/architecture/chat-http.md
 *
 * [PROTOCOL]:
 * 1. owner 只来自 Better Auth session，不接受请求字段。
 * 2. 保持 Node/dynamic；不得自动 migration。
 */

import { createChatConversationRequestSchema } from "@repo/contracts";
import {
  assertTrustedWriteOrigin,
  parseChatJsonBody,
  requireChatOwner,
  toChatErrorResponse,
  toConversationResource,
} from "@/server/chat-http";
import { getChatRuntime } from "@/server/chat-runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  try {
    const chatRuntime = getChatRuntime();
    assertTrustedWriteOrigin(request, chatRuntime.trustedOrigins);
    const [ownerId, input] = await Promise.all([
      requireChatOwner(request),
      parseChatJsonBody(request, createChatConversationRequestSchema),
    ]);
    const conversation = await chatRuntime.chat.createConversation({
      ownerId,
      title: input.title,
    });
    return Response.json(toConversationResource(conversation), { status: 201 });
  } catch (error) {
    return toChatErrorResponse(error);
  }
}
