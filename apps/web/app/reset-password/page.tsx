/**
 * [INPUT]: URL token、AuthCard 与 reset PasswordRecoveryForm
 * [OUTPUT]: `/reset-password?token=...` 新密码页面
 * [POS]: Chat Web 一次性密码重置入口
 * [DOC]: docs/architecture/auth.md
 */

import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { PasswordRecoveryForm } from "@/components/auth/password-recovery-form";
import { appRoute } from "@/lib/app-route";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const tokenParam = (await searchParams).token;
  const token = typeof tokenParam === "string" ? tokenParam : "";

  return (
    <main className="auth-shell">
      <AuthCard
        description="设置一个至少 8 位的新密码。完成后已有会话会失效。"
        footer={<Link href={appRoute("/sign-in")}>返回登录</Link>}
        title="设置新密码"
      >
        <PasswordRecoveryForm mode="reset" token={token} />
      </AuthCard>
    </main>
  );
}
