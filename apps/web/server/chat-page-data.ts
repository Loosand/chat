/**
 * [INPUT]: 可选 conversationId、已认证 OwnerId 与 Chat runtime
 * [OUTPUT]: 校验后的 conversation snapshot 与公开可用模型
 * [POS]: `/chat` Server Components 的首屏数据组合边界
 * [DOC]: docs/architecture/frontend-stack.md
 *
 * [PROTOCOL]: owner 由页面 session gate 注入；先完成 model bootstrap，再只返回公开模型资源。
 */

import {
  conversationIdSchema,
  type OwnerId,
  type PublicModelResource,
} from "@repo/contracts";
import { getConversationSnapshot, toPublicModelResource } from "./chat-http";
import { getChatRuntime } from "./chat-runtime";

export async function loadChatPageData(
  ownerId: OwnerId,
  conversationIdValue?: string
) {
  const runtime = getChatRuntime();
  const conversationId = conversationIdValue
    ? conversationIdSchema.parse(conversationIdValue)
    : null;
  const [modelResult, snapshot] = await Promise.all([
    loadPublicModels(runtime),
    conversationId
      ? getConversationSnapshot(runtime.chat, conversationId, ownerId)
      : Promise.resolve(null),
  ]);
  return {
    modelError: modelResult.error,
    models: modelResult.models,
    snapshot,
  };
}

async function loadPublicModels(runtime: ReturnType<typeof getChatRuntime>) {
  try {
    await runtime.ensureModels();
    const models = await runtime.models.listPublicPlatformModels("chat");
    return {
      error: null,
      models: models.map(toPublicModelResource) satisfies PublicModelResource[],
    };
  } catch {
    return {
      error: "模型配置暂不可用。已有消息仍可查看，请检查部署配置后刷新。",
      models: [] satisfies PublicModelResource[],
    };
  }
}
