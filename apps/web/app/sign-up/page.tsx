/**
 * [INPUT]: AuthCard 与注册 EmailAuthForm
 * [OUTPUT]: `/sign-up` 邮箱注册与验证等待页面
 * [POS]: Chat Web 公开注册入口
 * [DOC]: docs/architecture/auth.md
 */

import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { EmailAuthForm } from "@/components/auth/email-auth-form";
import { appRoute } from "@/lib/app-route";

export default function SignUpPage() {
  return (
    <main className="auth-shell">
      <AuthCard
        description="创建账户后，需要先通过邮件验证邮箱。"
        footer={
          <span>
            已有账户？ <Link href={appRoute("/sign-in")}>返回登录</Link>
          </span>
        }
        title="创建账户"
      >
        <EmailAuthForm mode="sign-up" />
      </AuthCard>
    </main>
  );
}
