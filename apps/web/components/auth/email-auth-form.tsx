/**
 * [INPUT]: 登录/注册 mode、浏览器表单值与 Better Auth client
 * [OUTPUT]: 邮箱密码登录、注册验证等待状态和 `/chat` 导航
 * [POS]: apps/web 首期邮箱认证交互入口
 * [DOC]: docs/architecture/auth.md
 *
 * [PROTOCOL]: 注册成功统一提示查收邮件；错误只使用 safe-auth-error 固定文案。
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
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { appRoute } from "@/lib/app-route";
import { authClient } from "@/lib/auth-client";
import { getSafeAuthErrorMessage } from "./safe-auth-error";

export function EmailAuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);
  const submitLabel = getSubmitLabel(mode, pending);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(event.currentTarget);
    const email = requireString(form, "email");
    const password = requireString(form, "password");

    try {
      if (mode === "sign-up") {
        const result = await authClient.signUp.email({
          callbackURL: `${window.location.origin}/sign-in?verified=1`,
          email,
          name: requireString(form, "name"),
          password,
        });
        if (result.error) {
          setError(getSafeAuthErrorMessage(mode, result.error.code));
          return;
        }
        setVerificationSent(true);
        return;
      }

      const result = await authClient.signIn.email({
        callbackURL: `${window.location.origin}/chat`,
        email,
        password,
      });
      if (result.error) {
        setError(getSafeAuthErrorMessage(mode, result.error.code));
        return;
      }
      router.replace(appRoute("/chat"));
      router.refresh();
    } catch {
      setError(getSafeAuthErrorMessage(mode, undefined));
    } finally {
      setPending(false);
    }
  }

  if (verificationSent) {
    return (
      <Alert>
        <AlertTitle>请查收验证邮件</AlertTitle>
        <AlertDescription>
          如果该邮箱可以注册，我们已经发送验证链接。完成验证后即可登录。
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

      {mode === "sign-up" ? (
        <div className="auth-field">
          <Label htmlFor="name">称呼</Label>
          <Input
            autoComplete="name"
            disabled={pending}
            id="name"
            maxLength={120}
            minLength={1}
            name="name"
            required
          />
        </div>
      ) : null}

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

      <div className="auth-field">
        <div className="auth-label-row">
          <Label htmlFor="password">密码</Label>
          {mode === "sign-in" ? (
            <Link href={appRoute("/forgot-password")}>忘记密码？</Link>
          ) : null}
        </div>
        <Input
          autoComplete={
            mode === "sign-in" ? "current-password" : "new-password"
          }
          disabled={pending}
          id="password"
          maxLength={128}
          minLength={8}
          name="password"
          required
          type="password"
        />
      </div>

      <Button className="w-full" disabled={pending} size="lg" type="submit">
        {submitLabel}
      </Button>
    </form>
  );
}

function getSubmitLabel(mode: "sign-in" | "sign-up", pending: boolean) {
  if (pending) {
    return "正在提交…";
  }
  return mode === "sign-in" ? "登录" : "创建账户";
}

function requireString(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}
