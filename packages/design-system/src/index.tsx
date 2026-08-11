/**
 * [INPUT]: 标题、React children 与共享 shadcn/ui primitive
 * [OUTPUT]: Panel、Base UI Button、variants 与 cn 的公共导出
 * [POS]: @repo/design-system 公共入口，统一暴露自有 primitive 和 shadcn 源码
 *
 * [PROTOCOL]:
 * 1. Panel 的 DOM、props 或样式 contract 变化时更新此 Header。
 * 2. 修改后检查本目录 .folder.md、styles/.folder.md 和 design.md。
 */

import type { ReactNode } from "react";

export { Button, buttonVariants } from "./components/button";
export { cn } from "./lib/utils";

export type PanelProps = {
  children: ReactNode;
  title: string;
};

export function Panel({ children, title }: PanelProps) {
  return (
    <section className="ds-panel">
      <h2>{title}</h2>
      <div className="ds-panel-content">{children}</div>
    </section>
  );
}
