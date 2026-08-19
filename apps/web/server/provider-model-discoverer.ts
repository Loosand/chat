/**
 * [INPUT]: ProviderPreset 发现目标与共享逐请求网络安全策略
 * [OUTPUT]: 将五个产品 preset 映射到 @repo/ai 官方模型目录协议的 discoverer adapter
 * [POS]: apps/web 用户供应商模型目录发现 composition adapter
 * [DOC]: docs/architecture/model-catalog.md
 *
 * [PROTOCOL]: credential 只进入当前服务端请求栈；不得记录目录响应、header 或密钥。
 */

import {
  discoverProviderModels,
  type ProviderModelDiscoveryProtocol,
  type ProviderRequestTargetPolicy,
} from "@repo/ai";
import type {
  ProviderConnectionModelDiscoverer,
  ProviderConnectionModelDiscoveryTarget,
} from "@repo/model-router";

export function createAiProviderModelDiscoverer(
  targetPolicy: ProviderRequestTargetPolicy
): ProviderConnectionModelDiscoverer {
  return {
    discover(target) {
      return discoverProviderModels({
        baseUrl: target.baseUrl,
        credential: target.credential,
        protocol: getDiscoveryProtocol(target),
        targetPolicy,
      });
    },
  };
}

function getDiscoveryProtocol(
  target: ProviderConnectionModelDiscoveryTarget
): ProviderModelDiscoveryProtocol {
  switch (target.preset) {
    case "anthropic-compatible":
      return "anthropic-models";
    case "gemini-compatible":
      return "google-models";
    case "grok-compatible":
      return "xai-language-models";
    case "deepseek-compatible":
    case "openai-compatible":
      return "openai-models";
  }
}
