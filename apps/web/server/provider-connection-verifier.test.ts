/**
 * [INPUT]: provider verifier 的未知异常链、HTTP status、网络 code 与超时标记
 * [OUTPUT]: 不依赖 provider body 的稳定 failureCode 分类回归覆盖
 * [POS]: apps/web 用户供应商连通性检查错误边界的单元规范
 * [DOC]: docs/architecture/ai-adapters.md
 *
 * [PROTOCOL]: 不断言或保留厂商错误正文，只验证稳定分类。
 */

import { describe, expect, it } from "vitest";
import { classifyProviderVerificationFailure } from "./provider-connection-verifier";

describe("classifyProviderVerificationFailure", () => {
  it.each([
    [{ statusCode: 401 }, "authentication_failed"],
    [{ cause: { response: { status: 403 } } }, "authentication_failed"],
    [{ status: 404 }, "model_not_found"],
    [{ statusCode: 429 }, "rate_limited"],
    [{ cause: { code: "ECONNREFUSED" } }, "network_error"],
    [new Error("unknown"), "provider_error"],
  ] as const)("maps a safe error shape to %s", (error, expected) => {
    expect(classifyProviderVerificationFailure(error)).toBe(expected);
  });

  it("prioritizes the local timeout signal", () => {
    expect(classifyProviderVerificationFailure({ statusCode: 401 }, true)).toBe(
      "timeout"
    );
  });
});
