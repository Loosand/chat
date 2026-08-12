/**
 * [INPUT]: request/reset 判别 props、server 读取的 URL token、浏览器表单与 Better Auth client
 * [OUTPUT]: 防枚举的重置邮件请求、token 密码更新与登录引导
 * [POS]: apps/web 首期密码恢复交互入口
 * [DOC]: docs/architecture/auth.md
 *
 * [PROTOCOL]: request 成功不披露邮箱是否存在；token/原始错误不得进入页面文案。
 */

"use client";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@repo/design-system/components/alert";
import { Button } from "@repo/design-system/components/button";
import { Input } from "@repo/design-system/components/input";
import { Label } from "@repo/design-system/components/label";
import Link from "next/link";
import { type FormEvent, useState } from "react";
import { appRoute } from "@/lib/app-route";
import { authClient } from "@/lib/auth-client";
import { getSafeAuthErrorMessage } from "./safe-auth-error";

type PasswordRecoveryFormProps =
  | { mode: "request" }
  | { mode: "reset"; token: string };

export function PasswordRecoveryForm(props: PasswordRecoveryFormProps) {
  const { mode } = props;
  const token = mode === "reset" ? props.token : "";
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [success, setSuccess] = useState(false);
  const submitLabel = getSubmitLabel(mode, pending);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(event.currentTarget);

    try {
      const result =
        mode === "request"
          ? await authClient.requestPasswordReset({
              email: requireString(form, "email"),
              redirectTo: `${window.location.origin}/reset-password`,
            })
          : await authClient.resetPassword({
              newPassword: requireString(form, "password"),
              token,
            });
      if (result.error) {
        setError(getSafeAuthErrorMessage("reset", result.error.code));
        return;
      }
      setSuccess(true);
    } catch {
      setError(getSafeAuthErrorMessage("reset", undefined));
    } finally {
      setPending(false);
    }
  }

  if (mode === "reset" && !token) {
    return (
      <Alert variant="destructive">
        <AlertTitle>重置链接无效</AlertTitle>
        <AlertDescription>
          请重新申请一封密码重置邮件，不要复制或分享其中的链接。
        </AlertDescription>
      </Alert>
    );
  }

  if (success) {
    return (
      <Alert>
        <AlertTitle>
          {mode === "request" ? "请查收邮件" : "密码已更新"}
        </AlertTitle>
        <AlertDescription>
          {mode === "request"
            ? "如果该邮箱已注册，我们已经发送密码重置链接。"
            : "已有登录会话已失效，请使用新密码重新登录。"}
          {mode === "reset" ? (
            <span className="auth-inline-link">
              <Link href={appRoute("/sign-in")}>前往登录</Link>
            </span>
          ) : null}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>操作未完成</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {mode === "request" ? (
        <div className="auth-field">
          <Label htmlFor="email">邮箱</Label>
          <Input
            autoCapitalize="none"
            autoComplete="email"
            disabled={pending}
            id="email"
            maxLength={320}
            name="email"
            required
            type="email"
          />
        </div>
      ) : (
        <div className="auth-field">
          <Label htmlFor="password">新密码</Label>
          <Input
            autoComplete="new-password"
            disabled={pending}
            id="password"
            maxLength={128}
            minLength={8}
            name="password"
            required
            type="password"
          />
        </div>
      )}

      <Button className="w-full" disabled={pending} size="lg" type="submit">
        {submitLabel}
      </Button>
    </form>
  );
}

function getSubmitLabel(mode: "request" | "reset", pending: boolean) {
  if (pending) {
    return "正在提交…";
  }
  return mode === "request" ? "发送重置邮件" : "更新密码";
}

function requireString(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}
