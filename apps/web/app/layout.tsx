/**
 * [INPUT]: Next.js metadata、React children 与应用全局样式
 * [OUTPUT]: 全站根 HTML 结构和中文页面元数据
 * [POS]: apps/web App Router 的根布局
 *
 * [PROTOCOL]:
 * 1. 全局 metadata、语言或根 Provider 变化时更新此 Header。
 * 2. 修改后检查 apps/web/app/.folder.md 和 design.md。
 */

import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  description: "A lightweight, deployable multi-model chat platform.",
  title: "Chat",
};

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
