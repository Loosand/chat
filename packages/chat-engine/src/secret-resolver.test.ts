/**
 * [INPUT]: environment SecretReference、存在/缺失/空白值
 * [OUTPUT]: 运行时解析与安全 fail-closed 回归覆盖
 * [POS]: @repo/chat-engine environment secret adapter 的可执行规范
 * [DOC]: docs/architecture/chat-execution.md
 *
 * [PROTOCOL]:
 * 1. 测试不得快照或打印 secret value。
 * 2. source/name contract 由 @repo/contracts 校验，本测试只验证运行时解析。
 */

import { describe, expect, it } from "vitest";
import { createEnvironmentSecretResolver } from "./secret-resolver";

describe("environment secret resolver", () => {
  it("resolves a configured reference without retaining it", () => {
    const resolver = createEnvironmentSecretResolver({
      MODEL_API_KEY: " runtime-secret ",
    });

    expect(
      resolver.resolve({ name: "MODEL_API_KEY", source: "environment" })
    ).toBe("runtime-secret");
    expect(resolver.resolve(null)).toBeNull();
  });

  it("fails closed without naming or exposing a missing credential value", () => {
    const resolver = createEnvironmentSecretResolver({ MODEL_API_KEY: " " });

    expect(() =>
      resolver.resolve({ name: "MODEL_API_KEY", source: "environment" })
    ).toThrowError(
      expect.objectContaining({
        code: "missing_credential",
        message: "The configured model credential is unavailable.",
      })
    );
  });
});
