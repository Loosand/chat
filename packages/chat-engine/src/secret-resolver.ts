/**
 * [INPUT]: 进程环境映射与已校验 SecretReference
 * [OUTPUT]: 仅在模型调用边界短暂返回 secret value 的 resolver
 * [POS]: @repo/chat-engine 的 environment secret adapter
 * [DOC]: docs/architecture/chat-execution.md
 *
 * [PROTOCOL]:
 * 1. 不缓存、不日志化、不序列化 secret value。
 * 2. 只支持 contracts 明确声明的 source；缺失值必须 fail closed。
 */

import type { SecretReference } from "@repo/contracts";
import { ChatExecutionError } from "./errors";
import type { SecretResolver } from "./ports";

export function createEnvironmentSecretResolver(
  environment: Record<string, string | undefined>
): SecretResolver {
  return {
    resolve(reference: SecretReference | null): string | null {
      if (reference === null) {
        return null;
      }
      const value = environment[reference.name]?.trim();
      if (!value) {
        throw new ChatExecutionError(
          "missing_credential",
          "The configured model credential is unavailable."
        );
      }
      return value;
    },
  };
}
