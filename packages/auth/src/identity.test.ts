/**
 * [INPUT]: 合法与非法 Better Auth user id
 * [OUTPUT]: OwnerId 映射稳定性与边界校验回归证据
 * [POS]: @repo/auth identity adapter 的单元测试
 * [DOC]: docs/architecture/auth.md
 *
 * [PROTOCOL]:
 * 1. OwnerId 或 session identity 规则变化时同步此测试和 auth.md。
 * 2. 测试必须证明身份来自 user.id，而不是 email、role 或 session token。
 */

import { describe, expect, it } from "vitest";
import { toOwnerId } from "./identity";

describe("toOwnerId", () => {
  it("maps the stable Better Auth user id", () => {
    expect(toOwnerId({ user: { id: "user_01" } })).toBe("user_01");
  });

  it("rejects an empty user id", () => {
    expect(() => toOwnerId({ user: { id: "" } })).toThrow();
  });

  it("rejects an id that cannot fit the chat owner column", () => {
    expect(() => toOwnerId({ user: { id: "a".repeat(129) } })).toThrow();
  });
});
