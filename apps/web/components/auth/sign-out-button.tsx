/**
 * [INPUT]: Better Auth 浏览器 client 与 Next.js router
 * [OUTPUT]: 退出当前 session、固定错误提示与 `/sign-in` 导航
 * [POS]: apps/web 认证后页面复用的最小退出入口
 * [DOC]: docs/architecture/auth.md
 *
 * [PROTOCOL]: 只退出当前 session；不得回显 Better Auth 原始错误或 token。
 */

"use client";

import { Button } from "@repo/design-system/components/button";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { appRoute } from "@/lib/app-route";
import { authClient } from "@/lib/auth-client";
import { getSafeAuthErrorMessage } from "./safe-auth-error";

export function SignOutButton() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function signOut() {
    setError(null);
    setPending(true);
    try {
      const result = await authClient.signOut();
      if (result.error) {
        setError(getSafeAuthErrorMessage("sign-out", result.error.code));
        return;
      }
      router.replace(appRoute("/sign-in"));
      router.refresh();
    } catch {
      setError(getSafeAuthErrorMessage("sign-out", undefined));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="sign-out-control">
      <Button
        disabled={pending}
        onClick={signOut}
        type="button"
        variant="outline"
      >
        {pending ? "正在退出…" : "退出登录"}
      </Button>
      {error ? (
        <p className="auth-error-text" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
