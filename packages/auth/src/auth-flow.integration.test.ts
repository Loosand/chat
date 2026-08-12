/**
 * [INPUT]: 全量 PostgreSQL migration、PGlite Drizzle、Better Auth HTTP handler 与捕获式邮件 dispatcher
 * [OUTPUT]: 注册/验证/登录/session/登出/重置/Admin 封禁/origin 防护的纵向集成证据
 * [POS]: @repo/auth 首期身份能力的可执行验收规范
 * [DOC]: docs/architecture/auth.md
 *
 * [PROTOCOL]:
 * 1. Auth endpoint、plugin、邮件、session 或权限行为变化时同步本测试与 auth.md。
 * 2. 测试必须走真实 handler 和 migration 数据库；不得绕过 token、cookie 或权限中间件。
 */

import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AuthEmailMessage } from "./feature-options";
import { createChatAuth } from "./server";

const baseURL = "https://chat.example.com";
const migrationsFolder = join(process.cwd(), "../database/migrations");
const testSecret = "test-secret-that-is-at-least-32-characters";
const password = "correct-horse-battery-staple";

describe("Better Auth first-party flow", () => {
  let client: PGlite;
  let emails: AuthEmailMessage[];
  let auth: ReturnType<typeof createChatAuth>;

  beforeEach(async () => {
    client = new PGlite();
    const database = drizzle(client);
    await migrate(database, { migrationsFolder });
    emails = [];
    auth = createChatAuth({
      baseURL,
      database,
      emailDispatcher: {
        dispatch(message) {
          emails.push(message);
        },
      },
      secret: testSecret,
      trustedOrigins: [baseURL],
    });
  });

  afterEach(async () => {
    await client.close();
  });

  it("registers, verifies, signs in, resolves a session and signs out", async () => {
    const signUp = await post("/api/auth/sign-up/email", {
      email: "ada@example.com",
      name: "Ada",
      password,
    });
    expect(signUp.status).toBe(200);
    expect(emails).toHaveLength(1);
    expect(emails[0]).toMatchObject({
      kind: "verification",
      recipient: "ada@example.com",
    });
    const duplicateSignUp = await post("/api/auth/sign-up/email", {
      email: "ada@example.com",
      name: "Different Name",
      password: "different-password",
    });
    expect(duplicateSignUp.status).toBe(200);
    const userCount = await client.query<{ count: number }>(
      `select count(*)::int as count from "user" where email = 'ada@example.com'`
    );
    expect(userCount.rows[0]?.count).toBe(1);
    const rateLimitCount = await client.query<{ count: number }>(
      "select count(*)::int as count from rate_limit"
    );
    expect(rateLimitCount.rows[0]?.count).toBeGreaterThan(0);

    const blockedSignIn = await post("/api/auth/sign-in/email", {
      email: "ada@example.com",
      password,
    });
    expect(blockedSignIn.status).toBe(403);

    const verification = await auth.handler(
      new Request(requireEmail(emails, "verification").url, {
        headers: { origin: baseURL },
      })
    );
    expect(verification.status).toBe(302);

    const signIn = await post("/api/auth/sign-in/email", {
      email: "ada@example.com",
      password,
    });
    expect(signIn.status).toBe(200);
    const cookie = requireSessionCookie(signIn);

    const session = await get("/api/auth/get-session", cookie);
    const sessionBody = await session.json();
    expect(session.status).toBe(200);
    expect(sessionBody.user).toMatchObject({
      email: "ada@example.com",
      emailVerified: true,
    });

    const signOut = await post("/api/auth/sign-out", undefined, cookie);
    expect(signOut.status).toBe(200);
    expect(
      await get("/api/auth/get-session", cookie).then((res) => res.json())
    ).toBeNull();
  });

  it("resets a password and invalidates existing sessions", async () => {
    const cookie = await registerAndSignIn("grace@example.com", "Grace");

    const requestReset = await post("/api/auth/request-password-reset", {
      email: "grace@example.com",
      redirectTo: `${baseURL}/reset-password`,
    });
    expect(requestReset.status).toBe(200);
    const resetURL = new URL(requireEmail(emails, "password-reset").url);

    const resetToken = resetURL.pathname.split("/").at(-1) ?? "";
    const reset = await post(
      `/api/auth/reset-password?token=${encodeURIComponent(resetToken)}`,
      { newPassword: "a-brand-new-password" }
    );
    expect(reset.status).toBe(200);
    expect(
      await get("/api/auth/get-session", cookie).then((res) => res.json())
    ).toBeNull();

    expect(
      await post("/api/auth/sign-in/email", {
        email: "grace@example.com",
        password,
      })
    ).toHaveProperty("status", 401);
    expect(
      await post("/api/auth/sign-in/email", {
        email: "grace@example.com",
        password: "a-brand-new-password",
      })
    ).toHaveProperty("status", 200);
  });

  it("allows an admin to ban a user and rejects the banned user's sessions", async () => {
    const adminCookie = await registerAndSignIn("admin@example.com", "Admin");
    const adminSession = await get("/api/auth/get-session", adminCookie).then(
      (response) => response.json()
    );
    const userCookie = await registerAndSignIn("user@example.com", "User");
    const userSession = await get("/api/auth/get-session", userCookie).then(
      (response) => response.json()
    );
    const unauthenticatedBan = await post("/api/auth/admin/ban-user", {
      userId: userSession.user.id,
    });
    expect(unauthenticatedBan.status).toBe(401);
    const unauthorizedBan = await post(
      "/api/auth/admin/ban-user",
      { userId: userSession.user.id },
      adminCookie
    );
    expect(unauthorizedBan.status).toBe(403);

    await client.exec(
      `update "user" set role = 'admin' where id = '${adminSession.user.id}'`
    );
    const ban = await post(
      "/api/auth/admin/ban-user",
      { banReason: "policy", userId: userSession.user.id },
      adminCookie
    );
    expect(ban.status).toBe(200);

    const blockedSession = await get("/api/auth/get-session", userCookie);
    expect(await blockedSession.json()).toBeNull();
    expect(
      await post("/api/auth/sign-in/email", {
        email: "user@example.com",
        password,
      })
    ).toHaveProperty("status", 403);
  });

  it("rejects an expired database session", async () => {
    const cookie = await registerAndSignIn("expired@example.com", "Expired");
    await client.exec(
      `update "session" set expires_at = timestamp '2000-01-01 00:00:00'`
    );

    const session = await get("/api/auth/get-session", cookie);
    expect(await session.json()).toBeNull();
  });

  it("rejects state-changing requests from an untrusted origin", async () => {
    const response = await auth.handler(
      new Request(`${baseURL}/api/auth/sign-up/email`, {
        body: JSON.stringify({
          email: "mallory@example.com",
          name: "Mallory",
          password,
        }),
        headers: {
          "content-type": "application/json",
          origin: "https://attacker.example",
        },
        method: "POST",
      })
    );

    expect(response.status).toBe(403);
  });

  async function registerAndSignIn(
    email: string,
    name: string
  ): Promise<string> {
    const startIndex = emails.length;
    const signUp = await post("/api/auth/sign-up/email", {
      email,
      name,
      password,
    });
    if (signUp.status !== 200) {
      throw new Error(`Expected sign-up 200, received ${signUp.status}`);
    }
    const verificationEmail = emails
      .slice(startIndex)
      .find((message) => message.kind === "verification");
    if (!verificationEmail) {
      throw new Error("Expected a verification email");
    }
    const verification = await auth.handler(
      new Request(verificationEmail.url, { headers: { origin: baseURL } })
    );
    if (verification.status !== 302) {
      throw new Error(
        `Expected email verification redirect, received ${verification.status}`
      );
    }

    const signIn = await post("/api/auth/sign-in/email", { email, password });
    if (signIn.status !== 200) {
      throw new Error(`Expected sign-in 200, received ${signIn.status}`);
    }
    return requireSessionCookie(signIn);
  }

  function get(path: string, cookie?: string): Promise<Response> {
    return auth.handler(
      new Request(`${baseURL}${path}`, {
        headers: {
          ...(cookie ? { cookie } : {}),
          origin: baseURL,
        },
      })
    );
  }

  function post(
    path: string,
    body?: unknown,
    cookie?: string
  ): Promise<Response> {
    return auth.handler(
      new Request(`${baseURL}${path}`, {
        body: body === undefined ? undefined : JSON.stringify(body),
        headers: {
          ...(cookie ? { cookie } : {}),
          "content-type": "application/json",
          origin: baseURL,
        },
        method: "POST",
      })
    );
  }
});

function requireEmail(
  emails: AuthEmailMessage[],
  kind: AuthEmailMessage["kind"]
): AuthEmailMessage {
  const message = emails.find((email) => email.kind === kind);
  if (!message) {
    throw new Error(`Expected ${kind} email`);
  }
  return message;
}

function requireSessionCookie(response: Response): string {
  const setCookie = response.headers.get("set-cookie");
  if (!setCookie) {
    throw new Error("Expected a session cookie");
  }
  const sessionCookie = setCookie
    .split(",")
    .map((value) => value.trim())
    .find((value) => value.includes("better-auth.session_token="));
  if (!sessionCookie) {
    throw new Error("Expected a Better Auth session token cookie");
  }
  return sessionCookie.split(";", 1)[0] ?? "";
}
