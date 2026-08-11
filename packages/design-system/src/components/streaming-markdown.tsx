/**
 * [INPUT]: AI 生成的 Markdown、流式状态、Streamdown 与可选渲染插件
 * [OUTPUT]: 支持 CJK、数学、按需代码高亮和 Mermaid 的安全流式 Markdown
 * [POS]: @repo/design-system 的通用 AI 文本渲染边界，不解析消息或工具业务
 * [DOC]: docs/architecture/frontend-stack.md
 *
 * [PROTOCOL]:
 * 1. Markdown 能力、安全策略、插件加载或公开 props 变化时更新此 Header。
 * 2. 同步 frontend-stack.md、本目录 .folder.md 和共享样式扫描入口。
 */

"use client";

import { cjk } from "@streamdown/cjk";
import { createMathPlugin } from "@streamdown/math";
import { useEffect, useMemo, useState } from "react";
import {
  defaultRehypePlugins,
  type PluginConfig,
  Streamdown,
} from "streamdown";

import { cn } from "#lib/utils";

export type StreamingMarkdownProps = {
  className?: string;
  content: string;
  streaming?: boolean;
};

const BASE_PLUGINS: PluginConfig = {
  cjk,
  math: createMathPlugin({ singleDollarTextMath: true }),
};

const SAFE_REHYPE_PLUGINS = [
  defaultRehypePlugins.sanitize,
  defaultRehypePlugins.harden,
];

const CODE_BLOCK_PATTERN =
  /(?:^|\n)[ \t]*(?:```|~~~)(?!\s*(?:mermaid|mmd)\b)[^\n]*(?:\n|$)/i;
const MERMAID_BLOCK_PATTERN = /(?:^|\n)[ \t]*(?:```|~~~)\s*(?:mermaid|mmd)\b/i;

const pluginCache = new Map<string, PluginConfig>();

function getPluginKey(content: string) {
  return [
    CODE_BLOCK_PATTERN.test(content) ? "code" : "",
    MERMAID_BLOCK_PATTERN.test(content) ? "mermaid" : "",
  ]
    .filter(Boolean)
    .join(":");
}

async function loadPlugins(key: string): Promise<PluginConfig> {
  const cached = pluginCache.get(key);
  if (cached) {
    return cached;
  }

  const plugins: PluginConfig = { ...BASE_PLUGINS };

  if (key.includes("code")) {
    const { code } = await import("@streamdown/code");
    plugins.code = code;
  }

  if (key.includes("mermaid")) {
    const { createMermaidPlugin } = await import("@streamdown/mermaid");
    plugins.mermaid = createMermaidPlugin({
      config: {
        flowchart: { htmlLabels: false },
        securityLevel: "strict",
      },
    });
  }

  pluginCache.set(key, plugins);
  return plugins;
}

function useStreamingMarkdownPlugins(content: string) {
  const key = useMemo(() => getPluginKey(content), [content]);
  const [plugins, setPlugins] = useState<PluginConfig>(
    () => pluginCache.get(key) ?? BASE_PLUGINS
  );

  useEffect(() => {
    let cancelled = false;
    const cached = pluginCache.get(key);

    if (cached) {
      setPlugins(cached);
      return;
    }

    setPlugins(BASE_PLUGINS);
    loadPlugins(key)
      .then((loaded) => {
        if (!cancelled) {
          setPlugins(loaded);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPlugins(BASE_PLUGINS);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [key]);

  return plugins;
}

export function StreamingMarkdown({
  className,
  content,
  streaming = false,
}: StreamingMarkdownProps) {
  const plugins = useStreamingMarkdownPlugins(content);

  if (!content.trim()) {
    return null;
  }

  return (
    <Streamdown
      animated={false}
      caret={streaming ? "circle" : undefined}
      className={cn(
        "min-w-0 max-w-full overflow-hidden text-foreground text-sm leading-7 [overflow-wrap:anywhere]",
        className
      )}
      controls={{
        code: { copy: true, download: false },
        mermaid: {
          copy: true,
          download: false,
          fullscreen: true,
          panZoom: true,
        },
        table: { copy: true, download: false, fullscreen: false },
      }}
      isAnimating={streaming}
      mode={streaming ? "streaming" : "static"}
      parseIncompleteMarkdown={streaming}
      plugins={plugins}
      rehypePlugins={SAFE_REHYPE_PLUGINS}
      shikiTheme={["github-light", "github-dark"]}
    >
      {content}
    </Streamdown>
  );
}
