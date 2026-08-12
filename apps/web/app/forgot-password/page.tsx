/**
 * [INPUT]: AuthCard 与 request PasswordRecoveryForm
 * [OUTPUT]: `/forgot-password` 重置邮件申请页面
 * [POS]: Chat Web 公开密码恢复入口
 * [DOC]: docs/architecture/auth.md
 */

import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { PasswordRecoveryForm } from "@/components/auth/password-recovery-form";
import { appRoute } from "@/lib/app-route";

export default function ForgotPasswordPage() {
  return (
    <main className="auth-shell">
      <AuthCard
        description="输入账户邮箱，我们会发送一次性重置链接。"
        footer={<Link href={appRoute("/sign-in")}>返回登录</Link>}
        title="找回密码"
      >
        <PasswordRecoveryForm mode="request" />
      </AuthCard>
    </main>
  );
}
