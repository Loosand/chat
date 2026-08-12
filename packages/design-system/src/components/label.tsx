/**
 * [INPUT]: 原生 label props 与共享 cn
 * [OUTPUT]: shadcn/ui Base Rhea Label primitive
 * [POS]: @repo/design-system 的表单标签
 *
 * [PROTOCOL]: label 状态或样式变化时同步本目录 .folder.md 和表单调用方。
 */

"use client";

import type * as React from "react";

import { cn } from "#lib/utils";

function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: this primitive receives htmlFor/content from each form composition.
    <label
      className={cn(
        "flex select-none items-center gap-2 font-medium text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-50 group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50",
        className
      )}
      data-slot="label"
      {...props}
    />
  );
}

export { Label };
