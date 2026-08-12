/**
 * [INPUT]: 已知/未知 Better Auth error code 与认证流程
 * [OUTPUT]: 防账号枚举且不透传原始消息的错误文案回归
 * [POS]: apps/web 认证错误披露边界的可执行规范
 * [DOC]: docs/architecture/auth.md
 */

import { describe, expect, it } from "vitest";
import { getSafeAuthErrorMessage } from "./safe-auth-error";

describe("safe auth error messages", () => {
  it("maps known sign-in errors without exposing provider text", () => {
    expect(
      getSafeAuthErrorMessage("sign-in", "INVALID_EMAIL_OR_PASSWORD")
    ).toBe("邮箱或密码不正确。");
  });

  it("uses action-specific fixed fallbacks for unknown errors", () => {
    expect(getSafeAuthErrorMessage("sign-up", "database_details")).toBe(
      "暂时无法创建账户，请稍后重试。"
    );
    expect(getSafeAuthErrorMessage("reset", undefined)).toBe(
      "暂时无法完成密码操作，请稍后重试。"
    );
    expect(getSafeAuthErrorMessage("sign-out", "internal_details")).toBe(
      "暂时无法退出，请稍后重试。"
    );
  });
});
