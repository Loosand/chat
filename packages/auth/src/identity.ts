/**
 * [INPUT]: Better Auth session 的最小 user identity 形状
 * [OUTPUT]: 经公共 contract 校验的稳定 OwnerId
 * [POS]: 认证身份到聊天领域身份的唯一映射边界
 * [DOC]: docs/architecture/auth.md
 *
 * [PROTOCOL]:
 * 1. session identity 形状或 OwnerId 语义变化时同步测试、auth.md 和所有调用方。
 * 2. 不从 email、role、cookie 或 session token 派生 OwnerId。
 */

import { type OwnerId, ownerIdSchema } from "@repo/contracts";

export type AuthIdentity = {
  user: {
    id: string;
  };
};

export function toOwnerId(identity: AuthIdentity): OwnerId {
  return ownerIdSchema.parse(identity.user.id);
}
