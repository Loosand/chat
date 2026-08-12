/**
 * [INPUT]: Better Auth client error code 与认证流程上下文
 * [OUTPUT]: 不含服务端原文的固定中文用户提示
 * [POS]: apps/web 认证 UI 的错误披露边界
 * [DOC]: docs/architecture/auth.md
 *
 * [PROTOCOL]: 不接受/返回原始 message、URL、token、邮箱存在性或内部异常。
 */

export type AuthAction = "reset" | "sign-in" | "sign-out" | "sign-up";

const errorMessages: Record<string, string> = {
  EMAIL_NOT_VERIFIED: "请先打开验证邮件完成邮箱验证。",
  INVALID_EMAIL_OR_PASSWORD: "邮箱或密码不正确。",
  INVALID_PASSWORD: "邮箱或密码不正确。",
  SESSION_EXPIRED: "登录已过期，请重新登录。",
  TOO_MANY_REQUESTS: "操作过于频繁，请稍后再试。",
  USER_BANNED: "此账户暂时无法登录。",
};

export function getSafeAuthErrorMessage(
  action: AuthAction,
  code: string | undefined
): string {
  if (code && errorMessages[code]) {
    return errorMessages[code];
  }
  if (action === "sign-in") {
    return "暂时无法登录，请检查信息后重试。";
  }
  if (action === "sign-up") {
    return "暂时无法创建账户，请稍后重试。";
  }
  if (action === "sign-out") {
    return "暂时无法退出，请稍后重试。";
  }
  return "暂时无法完成密码操作，请稍后重试。";
}
