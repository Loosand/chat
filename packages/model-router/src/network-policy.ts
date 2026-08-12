/**
 * [INPUT]: @repo/network-security 共享 policy、可注入 DNS resolver 与模型目录错误边界
 * [OUTPUT]: 映射为 ModelCatalogError 的 Upstream base URL policy facade
 * [POS]: @repo/model-router 的 Upstream SSRF 配置时校验入口
 * [DOC]: docs/architecture/model-catalog.md
 *
 * [PROTOCOL]:
 * 1. URL、IP、DNS 或私网策略变化时同步 model-catalog.md、测试和 provider fetch policy。
 * 2. 解析成功不授权任意重定向；adapter 必须对每次连接/跳转重复同等检查。
 */

import {
  createNetworkTargetPolicy as createSharedNetworkTargetPolicy,
  type HostResolver,
  isPublicNetworkAddress,
} from "@repo/network-security";
import { ModelCatalogError } from "./errors";

export type { HostResolver } from "@repo/network-security";

export type NetworkTargetPolicy = {
  validateBaseUrl(
    untrustedUrl: string,
    allowPrivateNetwork: boolean
  ): Promise<string>;
};

export function createNetworkTargetPolicy(
  resolver: HostResolver
): NetworkTargetPolicy {
  const sharedPolicy = createSharedNetworkTargetPolicy(resolver);
  return {
    async validateBaseUrl(untrustedUrl, allowPrivateNetwork) {
      try {
        return await sharedPolicy.validateBaseUrl(
          untrustedUrl,
          allowPrivateNetwork
        );
      } catch {
        throw invalidTarget();
      }
    },
  };
}

export const isPublicAddress = isPublicNetworkAddress;

function invalidTarget(): ModelCatalogError {
  return new ModelCatalogError(
    "invalid_network_target",
    "Upstream URL is not an allowed HTTP(S) network target."
  );
}
