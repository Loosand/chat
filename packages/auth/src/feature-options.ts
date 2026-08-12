/**
 * [INPUT]: 认证邮件发送 port
 * [OUTPUT]: 邮箱密码、邮箱验证、UUID identity 与 Admin plugin 的统一 Better Auth options
 * [POS]: @repo/auth 的首期认证能力事实源，供 CLI 与运行时共同组合
 * [DOC]: docs/architecture/auth.md
 *
 * [PROTOCOL]:
 * 1. 认证策略或 plugin 变化时同步 auth.config、auth schema、migration 和 auth.md。
 * 2. 邮件消息只暴露收件人与一次性 URL，不记录原始 token、密码或 session。
 */

import type { BetterAuthOptions } from "better-auth";
import { admin } from "better-auth/plugins";

export type AuthEmailMessage =
  | {
      kind: "password-reset";
      recipient: string;
      recipientName: string;
      url: string;
    }
  | {
      kind: "verification";
      recipient: string;
      recipientName: string;
      url: string;
    };

export type AuthEmailDispatcher = {
  dispatch(message: AuthEmailMessage, request?: Request): void;
};

export function createAuthFeatureOptions(emailDispatcher: AuthEmailDispatcher) {
  return {
    advanced: {
      database: {
        generateId: "uuid",
      },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      sendResetPassword: ({ url, user }, request) => {
        emailDispatcher.dispatch(
          {
            kind: "password-reset",
            recipient: user.email,
            recipientName: user.name,
            url,
          },
          request
        );
        return Promise.resolve();
      },
    },
    emailVerification: {
      sendOnSignIn: true,
      sendOnSignUp: true,
      sendVerificationEmail: ({ url, user }, request) => {
        emailDispatcher.dispatch(
          {
            kind: "verification",
            recipient: user.email,
            recipientName: user.name,
            url,
          },
          request
        );
        return Promise.resolve();
      },
    },
    plugins: [admin()],
  } satisfies BetterAuthOptions;
}
