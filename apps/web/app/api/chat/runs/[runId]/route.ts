/**
 * [INPUT]: 认证 GET 与 runId path
 * [OUTPUT]: 最新 RunSnapshotResource
 * [POS]: `/api/chat/runs/:runId` Route Handler
 * [DOC]: docs/architecture/chat-http.md
 *
 * [PROTOCOL]:
 * 1. run/message 必须由同一 OwnerId 读取。
 * 2. serializer 必须移除内部 route 与 hidden reasoning。
 */

import { chatRunPathSchema } from "@repo/contracts";
import {
  getRunSnapshot,
  requireChatOwner,
  toChatErrorResponse,
} from "@/server/chat-http";
import { getChatRuntime } from "@/server/chat-runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ runId: string }> };

export async function GET(
  request: Request,
  context: RouteContext
): Promise<Response> {
  try {
    const [ownerId, params] = await Promise.all([
      requireChatOwner(request),
      context.params,
    ]);
    const { runId } = chatRunPathSchema.parse(params);
    return Response.json(
      await getRunSnapshot(getChatRuntime().chat, runId, ownerId)
    );
  } catch (error) {
    return toChatErrorResponse(error);
  }
}
