/**
 * [INPUT]: 认证标题、说明、表单内容与辅助链接
 * [OUTPUT]: 统一 Base Rhea Card 认证页面结构
 * [POS]: apps/web 首期认证界面的无状态布局
 * [DOC]: docs/architecture/auth.md
 *
 * [PROTOCOL]: 页面只允许一个 h1；交互与认证请求由子表单负责。
 */

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
} from "@repo/design-system/components/card";
import Link from "next/link";
import type { ReactNode } from "react";

export function AuthCard({
  children,
  description,
  footer,
  title,
}: {
  children: ReactNode;
  description: string;
  footer: ReactNode;
  title: string;
}) {
  return (
    <Card className="w-full max-w-md border border-border shadow-none">
      <CardHeader>
        <Link className="auth-wordmark" href="/">
          Chat
        </Link>
        <h1 className="auth-title">{title}</h1>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
      <CardFooter className="border-t text-muted-foreground text-sm">
        {footer}
      </CardFooter>
    </Card>
  );
}
