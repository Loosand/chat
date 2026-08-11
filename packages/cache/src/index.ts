/**
 * [INPUT]: 缓存 key、字符串 value 和可选 TTL
 * [OUTPUT]: 可由 Redis、Upstash 或 Memory 实现的 CacheStore contract
 * [POS]: @repo/cache 当前唯一公共 port；尚无具体 provider adapter
 *
 * [PROTOCOL]:
 * 1. 缓存能力或一致性语义变化时更新此 Header。
 * 2. 修改后检查本目录 .folder.md 和使用该 port 的领域设计。
 */

export type CacheWriteOptions = {
  ttlSeconds?: number;
};

export type CacheStore = {
  delete(key: string): Promise<void>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options?: CacheWriteOptions): Promise<void>;
};
