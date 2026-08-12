/**
 * [INPUT]: @repo/auth 的邮件 contract 与 identity mapper
 * [OUTPUT]: 框架无关认证公共类型和 OwnerId 映射
 * [POS]: @repo/auth 根公共入口；server/client 通过显式子路径导入
 * [DOC]: docs/architecture/auth.md
 *
 * [PROTOCOL]:
 * 1. 根公共导出变化时同步本目录 .folder.md 和调用方。
 * 2. 不从根入口导出 server/client 实现，避免运行时边界被意外混用。
 */

export type {
  AuthEmailDispatcher,
  AuthEmailMessage,
} from "./feature-options";
export { type AuthIdentity, toOwnerId } from "./identity";
