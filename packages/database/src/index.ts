/**
 * [INPUT]: @repo/database 内部连接工厂、ChatRepository adapter、聊天/认证/模型目录 schema
 * [OUTPUT]: 数据库 handle、连接/ChatRepository 创建 API及聊天、认证、模型目录表
 * [POS]: database package 唯一公共导出入口
 *
 * [PROTOCOL]:
 * 1. 公共导出变化时更新此 Header。
 * 2. 修改后同步本目录 .folder.md 和所有调用方。
 */

export { account, rateLimit, session, user, verification } from "./auth-schema";
export { createDrizzleChatRepository } from "./chat-repository";
export type { CreateDatabaseOptions, DatabaseHandle } from "./client";
export { createDatabase } from "./client";
export {
  llmModelRoutes,
  llmPlatformModels,
  llmUpstreamModels,
  llmUpstreams,
} from "./model-catalog-schema";
export { chatRunEvents, chatRuns, conversations, messages } from "./schema";
