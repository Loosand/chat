/**
 * [INPUT]: Base UI Input、原生 input props 与共享 cn
 * [OUTPUT]: shadcn/ui Base Rhea Input primitive
 * [POS]: @repo/design-system 的单行表单控件
 *
 * [PROTOCOL]: 输入状态或 Base UI props 变化时同步本目录 .folder.md 和表单调用方。
 */

import { Input as InputPrimitive } from "@base-ui/react/input";
import type * as React from "react";

import { cn } from "#lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      className={cn(
        "h-8 w-full min-w-0 rounded-2xl border border-transparent bg-input/50 px-2.5 py-1 text-base outline-none transition-[color,box-shadow] duration-200 file:inline-flex file:h-6 file:border-0 file:bg-transparent file:font-medium file:text-foreground file:text-sm placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      data-slot="input"
      type={type}
      {...props}
    />
  );
}

export { Input };
