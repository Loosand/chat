/**
 * [INPUT]: 不可信 base/request URL、私网显式开关与可注入 DNS resolver
 * [OUTPUT]: 规范化 URL、地址 range 判定与 NetworkTargetPolicy
 * [POS]: @repo/network-security 的配置时及请求前 SSRF 校验事实源
 * [DOC]: docs/architecture/network-security.md
 *
 * [PROTOCOL]:
 * 1. public-only 必须检查 DNS 返回的每个地址；任一非公网结果都 fail closed。
 * 2. allowPrivate 只放行 loopback/private/CGNAT/ULA，不放行 link-local、metadata、reserved 或 multicast。
 */

import ipaddr from "ipaddr.js";
import { NetworkSecurityError } from "./errors";

export type HostResolver = {
  resolve(hostname: string): Promise<string[]>;
};

export type NetworkTargetPolicy = {
  validateBaseUrl(
    untrustedUrl: string,
    allowPrivateNetwork: boolean
  ): Promise<string>;
  validateRequestUrl(
    untrustedUrl: string,
    allowPrivateNetwork: boolean
  ): Promise<string>;
};

const allowedPrivateRanges = new Set([
  "carrierGradeNat",
  "loopback",
  "private",
  "uniqueLocal",
  "unicast",
]);
const trailingSlashPattern = /\/+$/;

export function createNetworkTargetPolicy(
  resolver: HostResolver
): NetworkTargetPolicy {
  const validate = async (
    untrustedUrl: string,
    allowPrivateNetwork: boolean,
    kind: "base" | "request"
  ) => {
    const url = parseHttpUrl(untrustedUrl, kind);
    const hostname = stripIpv6Brackets(url.hostname).toLowerCase();
    if (
      !allowPrivateNetwork &&
      (hostname === "localhost" ||
        hostname.endsWith(".localhost") ||
        hostname.endsWith(".local"))
    ) {
      throw invalidTarget();
    }

    const addresses = ipaddr.isValid(hostname)
      ? [hostname]
      : await resolveSafely(resolver, hostname);
    if (
      addresses.length === 0 ||
      addresses.some(
        (address) => !isNetworkAddressAllowed(address, allowPrivateNetwork)
      )
    ) {
      throw invalidTarget();
    }
    return url.toString();
  };

  return {
    validateBaseUrl: (url, allowPrivate) => validate(url, allowPrivate, "base"),
    validateRequestUrl: (url, allowPrivate) =>
      validate(url, allowPrivate, "request"),
  };
}

export function isNetworkAddressAllowed(
  address: string,
  allowPrivateNetwork: boolean
): boolean {
  const normalized = stripIpv6Brackets(address).toLowerCase();
  if (!ipaddr.isValid(normalized)) {
    return false;
  }
  const range = ipaddr.process(normalized).range();
  return allowPrivateNetwork
    ? allowedPrivateRanges.has(range)
    : range === "unicast";
}

export function isPublicNetworkAddress(address: string): boolean {
  return isNetworkAddressAllowed(address, false);
}

function parseHttpUrl(value: string, kind: "base" | "request"): URL {
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
    url.hash ||
    (kind === "base" && url.search)
  ) {
    throw invalidTarget();
  }
  if (kind === "base") {
    url.pathname = url.pathname.replace(trailingSlashPattern, "") || "/";
  }
  return url;
}

async function resolveSafely(
  resolver: HostResolver,
  hostname: string
): Promise<string[]> {
  try {
    return await resolver.resolve(hostname);
  } catch {
    throw new NetworkSecurityError(
      "network_target_unresolved",
      "The network target could not be resolved safely."
    );
  }
}

function stripIpv6Brackets(value: string): string {
  return value.startsWith("[") && value.endsWith("]")
    ? value.slice(1, -1)
    : value;
}

function invalidTarget(): NetworkSecurityError {
  return new NetworkSecurityError(
    "invalid_network_target",
    "The HTTP(S) network target is not allowed."
  );
}
