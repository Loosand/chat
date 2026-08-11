/**
 * [INPUT]: 稳定 object key、二进制内容和 MIME metadata
 * [OUTPUT]: Blob、S3 或 Local adapter 可实现的 ObjectStore contract
 * [POS]: @repo/storage 当前唯一公共 port；不包含文件领域规则
 *
 * [PROTOCOL]:
 * 1. 对象生命周期或安全边界变化时更新此 Header。
 * 2. 修改后检查本目录 .folder.md 和文件/部署设计。
 */

export type ObjectMetadata = {
  contentType: string;
  key: string;
  size: number;
};

export type PutObjectInput = {
  body: Uint8Array;
  contentType: string;
  key: string;
};

export type ObjectStore = {
  delete(key: string): Promise<void>;
  get(key: string): Promise<Uint8Array>;
  head(key: string): Promise<ObjectMetadata | null>;
  put(input: PutObjectInput): Promise<ObjectMetadata>;
};
