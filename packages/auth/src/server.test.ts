/**
 * [INPUT]: 显式注入的数据库 handle、secret、base URL、trusted origins 与邮件 dispatcher
 * [OUTPUT]: Better Auth server factory 的 build-safe 组合和运行配置校验证据
 * [POS]: @repo/auth server composition 的单元边界测试
 * [DOC]: docs/architecture/auth.md
 *
 * [PROTOCOL]:
 * 1. Server factory 配置或环境边界变化时同步此测试和 auth.md。
 * 2. 测试不得连接外部数据库、发送邮件或使用生产 secret。
 */

import { createDatabase } from "@repo/database";
import { afterEach, describe, expect, it } from "vitest";
import { createChatAuth } from "./server";

const testSecret = "test-secret-that-is-at-least-32-characters";

describe("createChatAuth", () => {
  const handles: ReturnType<typeof createDatabase>[] = [];

  afterEach(async () => {
    await Promise.all(handles.splice(0).map((handle) => handle.close()));
  });

  it("composes a handler without opening a database connection", () => {
    const database = createDatabase(
      "postgresql://postgres:postgres@127.0.0.1:1/chat"
    );
    handles.push(database);

    const auth = createChatAuth({
      baseURL: "https://chat.example.com",
      database: database.database,
      emailDispatcher: { dispatch: () => undefined },
      secret: testSecret,
      trustedOrigins: ["https://chat.example.com"],
    });

    expect(auth.handler).toBeTypeOf("function");
    expect(auth.api.getSession).toBeTypeOf("function");
  });

  it("rejects an unsafe secret before handling requests", () => {
    const database = createDatabase(
      "postgresql://postgres:postgres@127.0.0.1:1/chat"
    );
    handles.push(database);

    expect(() =>
      createChatAuth({
        baseURL: "https://chat.example.com",
        database: database.database,
        emailDispatcher: { dispatch: () => undefined },
        secret: "too-short",
        trustedOrigins: ["https://chat.example.com"],
      })
    ).toThrow();
  });

  it("rejects malformed origins instead of disabling origin checks", () => {
    const database = createDatabase(
      "postgresql://postgres:postgres@127.0.0.1:1/chat"
    );
    handles.push(database);

    expect(() =>
      createChatAuth({
        baseURL: "https://chat.example.com",
        database: database.database,
        emailDispatcher: { dispatch: () => undefined },
        secret: testSecret,
        trustedOrigins: ["*.example.com"],
      })
    ).toThrow();
  });
});
