/**
 * [INPUT]: GET 与 ModelCatalogService 公开 chat 模型列表
 * [OUTPUT]: PublicModelResource JSON array
 * [POS]: `/api/chat/models` 只读 Route Handler
 * [DOC]: docs/architecture/chat-http.md
 *
 * [PROTOCOL]:
 * 1. 只调用 listPublicPlatformModels("chat")。
 * 2. 不返回目录内部 topology、system prompt 或 secret reference。
 */

import { toChatErrorResponse, toPublicModelResource } from "@/server/chat-http";
import { getChatRuntime } from "@/server/chat-runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  try {
    const models =
      await getChatRuntime().models.listPublicPlatformModels("chat");
    return Response.json(models.map(toPublicModelResource));
  } catch (error) {
    return toChatErrorResponse(error);
  }
}
