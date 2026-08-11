/**
 * [INPUT]: @repo/database 内部连接工厂
 * [OUTPUT]: 数据库 handle 类型与显式连接创建 API
 * [POS]: database package 唯一公共导出入口
 *
 * [PROTOCOL]:
 * 1. 公共导出变化时更新此 Header。
 * 2. 修改后同步本目录 .folder.md 和所有调用方。
 */

export type { DatabaseHandle } from "./client";
export { createDatabase } from "./client";
