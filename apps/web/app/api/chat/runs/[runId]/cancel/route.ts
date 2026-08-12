/**
 * [INPUT]: 认证 POST、可信 Origin 与 runId path
 * [OUTPUT]: 幂等 cancel/current ChatRunResource
 * [POS]: `/api/chat/runs/:runId/cancel` Route Handler
 * [DOC]: docs/architecture/chat-http.md
 *
 * [PROTOCOL]:
 * 1. 先持久 requestCancel，后调用进程内 Abort 加速。
 * 2. terminal/repeated cancel 返回当前事实，不创建重复事件。
 */

import { chatRunPathSchema } from "@repo/contracts";
import {
  assertTrustedWriteOrigin,
  requireChatOwner,
  toChatErrorResponse,
  toRunResource,
} from "@/server/chat-http";
import { getChatRuntime } from "@/server/chat-runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ runId: string }> };

export async function POST(
  request: Request,
  context: RouteContext
): Promise<Response> {
  try {
    const chatRuntime = getChatRuntime();
    assertTrustedWriteOrigin(request, chatRuntime.trustedOrigins);
    const [ownerId, params] = await Promise.all([
      requireChatOwner(request),
      context.params,
    ]);
    const { runId } = chatRunPathSchema.parse(params);
    const run = await chatRuntime.chat.requestCancel({
      data: { source: "user" },
      ownerId,
      runId,
    });
    chatRuntime.runs.cancel(runId);
    return Response.json(toRunResource(run));
  } catch (error) {
    return toChatErrorResponse(error);
  }
}
