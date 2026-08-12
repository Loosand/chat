/**
 * [INPUT]: Web Crypto randomUUID
 * [OUTPUT]: 符合 contract brand 的默认聊天实体 ID generator
 * [POS]: @repo/chat 的无状态 UUID adapter，可由测试或外部 composition root 替换
 *
 * [PROTOCOL]:
 * 1. ID 格式变化时同步 contracts、数据库列与迁移策略。
 * 2. 保持生成器无数据库和运行时全局状态依赖。
 */

import {
  conversationIdSchema,
  messageIdSchema,
  runIdSchema,
} from "@repo/contracts";
import type { IdGenerator } from "./ports";

export const uuidIdGenerator: IdGenerator = {
  conversationId: () => conversationIdSchema.parse(crypto.randomUUID()),
  messageId: () => messageIdSchema.parse(crypto.randomUUID()),
  runId: () => runIdSchema.parse(crypto.randomUUID()),
};

export const systemClock = {
  now: () => new Date(),
};
