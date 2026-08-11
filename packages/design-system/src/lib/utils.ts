/**
 * [INPUT]: clsx 可组合类名与 tailwind-merge 冲突消解
 * [OUTPUT]: shadcn/ui 组件统一使用的 cn 类名合并函数
 * [POS]: @repo/design-system 的无状态样式工具入口
 *
 * [PROTOCOL]:
 * 1. 类名合并语义或依赖变化时更新此 Header。
 * 2. 修改后检查本目录 .folder.md 和组件调用方。
 */

import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
