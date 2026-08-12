/**
 * [INPUT]: fake session reader、headers 与 redirect adapter
 * [OUTPUT]: `/chat` 未认证固定重定向和认证 owner 回归
 * [POS]: Chat Web 产品入口 server gate 的可执行规范
 * [DOC]: docs/architecture/auth.md
 */

import { ownerIdSchema } from "@repo/contracts";
import { describe, expect, it, vi } from "vitest";
import { requireChatPageOwner } from "./chat-page-auth";

describe("chat page session gate", () => {
  it("redirects an unauthenticated request to the fixed sign-in route", async () => {
    const redirect = vi.fn((path: "/sign-in"): never => {
      throw new Error(`redirect:${path}`);
    });

    await expect(
      requireChatPageOwner({
        headers: new Headers(),
        readOwnerId: vi.fn(async () => null),
        redirect,
      })
    ).rejects.toThrow("redirect:/sign-in");
    expect(redirect).toHaveBeenCalledWith("/sign-in");
  });

  it("returns the owner resolved from the authoritative server session", async () => {
    const expectedOwnerId = ownerIdSchema.parse("owner_1");
    const ownerId = await requireChatPageOwner({
      headers: new Headers(),
      readOwnerId: vi.fn(async () => expectedOwnerId),
      redirect: vi.fn((): never => {
        throw new Error("unexpected redirect");
      }),
    });

    expect(ownerId).toBe(expectedOwnerId);
  });
});
