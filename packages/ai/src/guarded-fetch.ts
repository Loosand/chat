/**
 * [INPUT]: 已配置 upstream base URL、私网开关、请求时目标校验 port 与底层 fetch
 * [OUTPUT]: 同源、base path 受限、每次请求复验且禁止自动 redirect 的 provider fetch
 * [POS]: @repo/ai provider adapter 的运行时 SSRF 第二层边界
 * [DOC]: docs/architecture/ai-adapters.md
 *
 * [PROTOCOL]:
 * 1. 每个网络请求都必须先调用 targetPolicy；不得提供跳过校验的生产默认值。
 * 2. redirect 固定为 manual；如未来支持 redirect，必须逐跳重复完整校验。
 */

import { createPinnedNetworkFetch } from "@repo/network-security";
import { AiAdapterError } from "./errors";

const trailingSlashPattern = /\/+$/;

export type ProviderRequestTargetPolicy = {
  validateRequestUrl(
    untrustedUrl: string,
    allowPrivateNetwork: boolean
  ): Promise<string>;
};

export type CreateGuardedProviderFetchInput = {
  allowPrivateNetwork: boolean;
  baseUrl: string;
  fetch?: typeof globalThis.fetch;
  targetPolicy: ProviderRequestTargetPolicy;
};

export function createGuardedProviderFetch({
  allowPrivateNetwork,
  baseUrl,
  fetch,
  targetPolicy,
}: CreateGuardedProviderFetchInput): typeof globalThis.fetch {
  const configuredBase = parseConfiguredBaseUrl(baseUrl);
  const underlyingFetch =
    fetch ?? createPinnedNetworkFetch(allowPrivateNetwork);

  return async (input, init) => {
    const requestUrl = parseRequestUrl(input);
    if (
      requestUrl.origin !== configuredBase.origin ||
      !isWithinBasePath(requestUrl.pathname, configuredBase.pathname)
    ) {
      throw rejectedTarget();
    }

    try {
      await targetPolicy.validateRequestUrl(
        requestUrl.toString(),
        allowPrivateNetwork
      );
    } catch {
      throw rejectedTarget();
    }

    return underlyingFetch(input, { ...init, redirect: "manual" });
  };
}

function parseConfiguredBaseUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw invalidConfiguration();
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw invalidConfiguration();
  }
  return url;
}

function parseRequestUrl(input: Parameters<typeof globalThis.fetch>[0]): URL {
  let url: URL;
  try {
    url = new URL(getRequestUrl(input));
  } catch {
    throw rejectedTarget();
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.hash
  ) {
    throw rejectedTarget();
  }
  return url;
}

function getRequestUrl(input: Parameters<typeof globalThis.fetch>[0]): string {
  if (typeof input === "string") {
    return input;
  }
  return input instanceof URL ? input.href : input.url;
}

function isWithinBasePath(pathname: string, basePathname: string): boolean {
  const basePath = basePathname.replace(trailingSlashPattern, "");
  return (
    basePath === "" ||
    pathname === basePath ||
    pathname.startsWith(`${basePath}/`)
  );
}

function invalidConfiguration(): AiAdapterError {
  return new AiAdapterError(
    "invalid_adapter_configuration",
    "The model adapter configuration is invalid."
  );
}

function rejectedTarget(): AiAdapterError {
  return new AiAdapterError(
    "network_target_rejected",
    "The provider request target is not allowed."
  );
}
