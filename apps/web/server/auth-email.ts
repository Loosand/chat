/**
 * [INPUT]: @repo/auth 邮件消息、Resend client 配置与 request-scoped task registrar
 * [OUTPUT]: 不阻塞认证响应且由平台续命的事务邮件 dispatcher
 * [POS]: apps/web 的 Resend 认证邮件 adapter
 * [DOC]: docs/architecture/auth.md
 *
 * [PROTOCOL]:
 * 1. 邮件 provider、模板、错误策略或续命方式变化时同步认证/部署文档与测试。
 * 2. 不记录或返回一次性 URL；发送失败只进入 server-side task failure。
 */

import type { AuthEmailDispatcher, AuthEmailMessage } from "@repo/auth";
import { Resend } from "resend";

export type BackgroundTaskRegistrar = (task: Promise<unknown>) => void;

export type ResendAuthEmailOptions = {
  apiKey: string;
  from: string;
  registerTask: BackgroundTaskRegistrar;
};

export function createResendAuthEmailDispatcher(
  options: ResendAuthEmailOptions
): AuthEmailDispatcher {
  const resend = new Resend(options.apiKey);

  return {
    dispatch(message) {
      options.registerTask(sendAuthEmail(resend, options.from, message));
    },
  };
}

async function sendAuthEmail(
  resend: Resend,
  from: string,
  message: AuthEmailMessage
): Promise<void> {
  const content = getEmailContent(message);
  const { error } = await resend.emails.send({
    from,
    html: content.html,
    subject: content.subject,
    text: content.text,
    to: message.recipient,
  });

  if (error) {
    throw new Error(`Resend rejected authentication email: ${error.name}`);
  }
}

function getEmailContent(message: AuthEmailMessage) {
  const displayName = escapeHtml(message.recipientName || "there");
  const safeURL = escapeHtml(message.url);
  const isVerification = message.kind === "verification";
  const action = isVerification ? "验证邮箱" : "重置密码";
  const subject = isVerification ? "验证你的 Chat 邮箱" : "重置你的 Chat 密码";

  return {
    html: `<p>你好，${displayName}：</p><p>请<a href="${safeURL}">${action}</a>。如果不是你发起的请求，可以忽略这封邮件。</p>`,
    subject,
    text: `你好，${message.recipientName || "there"}：\n\n请打开下面的链接${action}：\n${message.url}\n\n如果不是你发起的请求，可以忽略这封邮件。`,
  };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}
