/**
 * [INPUT]: 认证 POST、可信 Origin、可选模型 readiness 与 strict text run JSON
 * [OUTPUT]: 201/200 PreparedRunResource，并为新 run 注册 request-lifetime background execution
 * [POS]: `/api/chat/runs` collection Route Handler
 * [DOC]: docs/architecture/chat-http.md
 *
 * [PROTOCOL]:
 * 1. 新建或仍 pending 的幂等重试可注册领取；数据库 CAS 保证只有一个实例执行上游。
 * 2. 不把 request.signal 传给执行器；浏览器断开不等于取消。
 */

import { createChatRunRequestSchema } from "@repo/contracts";
import { after } from "next/server";
import {
  assertTrustedWriteOrigin,
  parseChatJsonBody,
  requireChatOwner,
  toChatErrorResponse,
  toMessageResource,
  toRunResource,
} from "@/server/chat-http";
import { getChatRuntime } from "@/server/chat-runtime";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  try {
    const chatRuntime = getChatRuntime();
    assertTrustedWriteOrigin(request, chatRuntime.trustedOrigins);
    const [ownerId, input] = await Promise.all([
      requireChatOwner(request),
      parseChatJsonBody(request, createChatRunRequestSchema),
    ]);
    await chatRuntime.ensureModels();

    const prepared = await chatRuntime.chat.prepareRun({
      branchReason: input.branchReason,
      clientRunId: input.clientRunId,
      content: {
        parts: [{ text: input.text, type: "text" }],
        version: 1,
      },
      conversationId: input.conversationId,
      ownerId,
      parentMessageId: input.parentMessageId,
      requestedModelId: input.modelKey,
    });
    if (prepared.run.status === "pending") {
      after(() => chatRuntime.runs.execute(ownerId, prepared.run.id));
    }

    return Response.json(
      {
        assistantMessage: toMessageResource(prepared.assistantMessage),
        created: prepared.created,
        run: toRunResource(prepared.run),
        userMessage: toMessageResource(prepared.userMessage),
      },
      { status: prepared.created ? 201 : 200 }
    );
  } catch (error) {
    return toChatErrorResponse(error);
  }
}
