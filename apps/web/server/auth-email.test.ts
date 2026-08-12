/**
 * [INPUT]: Resend auth email dispatcher、mock fetch 与 background task registrar
 * [OUTPUT]: 非阻塞注册、HTML escaping、provider 成败处理的 adapter 回归证据
 * [POS]: apps/web Resend 认证邮件 adapter 的单元测试
 * [DOC]: docs/architecture/auth.md
 *
 * [PROTOCOL]:
 * 1. Resend payload、模板或 task 续命策略变化时同步本测试与认证/部署文档。
 * 2. 不发真实网络请求，不把示例 URL/Key 当作生产凭证。
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { createResendAuthEmailDispatcher } from "./auth-email";

describe("createResendAuthEmailDispatcher", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("registers a successful send and escapes HTML", async () => {
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body));
      expect(payload.html).toContain("Ada &lt;Admin&gt;");
      expect(payload.html).toContain("&amp;safe=1");
      return Promise.resolve(
        new Response(JSON.stringify({ id: "email_01" }), {
          headers: { "content-type": "application/json" },
          status: 200,
        })
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const tasks: Promise<unknown>[] = [];
    const dispatcher = createResendAuthEmailDispatcher({
      apiKey: "re_test_key",
      from: "Chat <auth@example.com>",
      registerTask: (task) => tasks.push(task),
    });

    dispatcher.dispatch({
      kind: "verification",
      recipient: "ada@example.com",
      recipientName: "Ada <Admin>",
      url: "https://chat.example.com/api/auth/verify-email?token=test&safe=1",
    });

    expect(tasks).toHaveLength(1);
    await expect(tasks[0]).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("surfaces a provider rejection through the registered task", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              message: "invalid sender",
              name: "validation_error",
            }),
            { headers: { "content-type": "application/json" }, status: 422 }
          )
        )
      )
    );
    const tasks: Promise<unknown>[] = [];
    const dispatcher = createResendAuthEmailDispatcher({
      apiKey: "re_test_key",
      from: "Chat <auth@example.com>",
      registerTask: (task) => tasks.push(task),
    });

    dispatcher.dispatch({
      kind: "password-reset",
      recipient: "ada@example.com",
      recipientName: "Ada",
      url: "https://chat.example.com/api/auth/reset-password/test",
    });

    await expect(tasks[0]).rejects.toThrow(
      "Resend rejected authentication email: validation_error"
    );
  });
});
