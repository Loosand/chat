/**
 * [INPUT]: 固定 verified query、AuthCard 与登录 EmailAuthForm
 * [OUTPUT]: `/sign-in` 邮箱密码登录页面与验证成功提示
 * [POS]: Chat Web 公开认证入口
 * [DOC]: docs/architecture/auth.md
 *
 * [PROTOCOL]: 不接受外部 redirect；成功目标固定为 `/chat`。
 */

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@repo/design-system/components/alert";
import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { EmailAuthForm } from "@/components/auth/email-auth-form";
import { appRoute } from "@/lib/app-route";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ verified?: string | string[] }>;
}) {
  const verified = (await searchParams).verified === "1";

  return (
    <main className="auth-shell">
      <AuthCard
        description="使用已验证的邮箱继续。"
        footer={
          <span>
            还没有账户？ <Link href={appRoute("/sign-up")}>创建账户</Link>
          </span>
        }
        title="登录 Chat"
      >
        {verified ? (
          <Alert className="auth-notice">
            <AlertTitle>邮箱已验证</AlertTitle>
            <AlertDescription>现在可以使用邮箱和密码登录。</AlertDescription>
          </Alert>
        ) : null}
        <EmailAuthForm mode="sign-in" />
      </AuthCard>
    </main>
  );
}
