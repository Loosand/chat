/**
 * [INPUT]: 标题和 React children
 * [OUTPUT]: 无业务状态、可组合的语义 section Panel
 * [POS]: @repo/design-system 当前公共 UI primitive 入口
 *
 * [PROTOCOL]:
 * 1. Panel 的 DOM、props 或样式 contract 变化时更新此 Header。
 * 2. 修改后检查本目录 .folder.md、styles/.folder.md 和 design.md。
 */

import type { ReactNode } from "react";

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
