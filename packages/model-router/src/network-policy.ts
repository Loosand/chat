/**
 * [INPUT]: 不可信 Upstream base URL、私网显式开关与可注入 DNS resolver
 * [OUTPUT]: 规范化 URL、公共网络目标检查和 NetworkTargetPolicy
 * [POS]: @repo/model-router 的 Upstream SSRF 第一层策略；实际 fetch/redirect 仍需 adapter 复验
 * [DOC]: docs/architecture/model-catalog.md
 *
 * [PROTOCOL]:
 * 1. URL、IP、DNS 或私网策略变化时同步 model-catalog.md、测试和 provider fetch policy。
 * 2. 解析成功不授权任意重定向；adapter 必须对每次连接/跳转重复同等检查。
 */

import ipaddr from "ipaddr.js";
import { ModelCatalogError } from "./errors";

export type HostResolver = {
  resolve(hostname: string): Promise<string[]>;
};

export type NetworkTargetPolicy = {
  validateBaseUrl(
    untrustedUrl: string,
    allowPrivateNetwork: boolean
  ): Promise<string>;
};

const trailingSlashPattern = /\/+$/;

export function createNetworkTargetPolicy(
  resolver: HostResolver
): NetworkTargetPolicy {
  return {
    async validateBaseUrl(untrustedUrl, allowPrivateNetwork) {
      const url = parseBaseUrl(untrustedUrl);
      if (allowPrivateNetwork) {
        return url.toString();
      }

      const hostname = stripIpv6Brackets(url.hostname).toLowerCase();
      if (
        hostname === "localhost" ||
        hostname.endsWith(".localhost") ||
        hostname.endsWith(".local")
      ) {
        throw invalidTarget();
      }

      const addresses = ipaddr.isValid(hostname)
        ? [hostname]
        : await resolveSafely(resolver, hostname);
      if (
        addresses.length === 0 ||
        addresses.some((address) => !isPublicAddress(address))
      ) {
        throw invalidTarget();
      }
      return url.toString();
    },
  };
}

export function isPublicAddress(address: string): boolean {
  const normalized = stripIpv6Brackets(address).toLowerCase();
  if (!ipaddr.isValid(normalized)) {
    return false;
  }
  const parsed = ipaddr.process(normalized);
  return parsed.range() === "unicast";
}

function parseBaseUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw invalidTarget();
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw invalidTarget();
  }
  url.pathname = url.pathname.replace(trailingSlashPattern, "") || "/";
  return url;
}

async function resolveSafely(
  resolver: HostResolver,
  hostname: string
): Promise<string[]> {
  try {
    return await resolver.resolve(hostname);
  } catch (error) {
    throw new ModelCatalogError(
      "invalid_network_target",
      "Upstream host could not be resolved to an allowed network target.",
      { cause: error }
    );
  }
}

function stripIpv6Brackets(value: string): string {
  return value.startsWith("[") && value.endsWith("]")
    ? value.slice(1, -1)
    : value;
}

function invalidTarget(): ModelCatalogError {
  return new ModelCatalogError(
    "invalid_network_target",
    "Upstream URL is not an allowed HTTP(S) network target."
  );
}
