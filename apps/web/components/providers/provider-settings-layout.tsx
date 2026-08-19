/**
 * [INPUT]: 五个 preset、owner-scoped 公开连接、当前 preset 与页面内容
 * [OUTPUT]: 紧凑双栏供应商设置工作区和一致的供应商导航状态
 * [POS]: Learning Chatbot v1 供应商设置共享页面骨架
 * [DOC]: docs/architecture/frontend-stack.md
 *
 * [PROTOCOL]: 只消费公开 ProviderConnection；不得接收 encryptedCredential 或 API Key。
 */

import { Badge } from "@repo/design-system/components/badge";
import { buttonVariants } from "@repo/design-system/components/button";
import {
  providerPresetDefinitions,
  type ProviderConnection,
} from "@repo/model-router";
import Link from "next/link";
import type { ReactNode } from "react";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { appRoute } from "@/lib/app-route";

export function ProviderSettingsLayout({
  activePreset,
  children,
  connections,
}: {
  activePreset?: string;
  children: ReactNode;
  connections: ProviderConnection[];
}) {
  const byPreset = new Map(
    connections.map((connection) => [connection.preset, connection])
  );

  return (
    <main className="provider-settings-workspace">
      <header className="provider-settings-topbar">
        <div>
          <p className="eyebrow">个人设置</p>
          <h1>AI 供应商</h1>
        </div>
        <div className="settings-header-actions">
          <Link
            className={buttonVariants({ variant: "ghost" })}
            href={appRoute("/chat")}
          >
            返回聊天
          </Link>
          <SignOutButton />
        </div>
      </header>

      <div className="provider-settings-frame">
        <aside aria-label="供应商" className="provider-settings-sidebar">
          <div className="provider-settings-sidebar-heading">
            <span>模型服务</span>
            <Badge variant="secondary">{connections.length} / 5</Badge>
          </div>
          <nav className="provider-settings-nav">
            <Link
              aria-current={activePreset ? undefined : "page"}
              className="provider-settings-nav-item"
              href="/settings/providers"
            >
              <span className="provider-mark">AI</span>
              <span>
                <strong>全部供应商</strong>
                <small>配置与状态总览</small>
              </span>
            </Link>
            {providerPresetDefinitions.map((definition) => {
              const connection = byPreset.get(definition.preset);
              return (
                <Link
                  aria-current={
                    activePreset === definition.preset ? "page" : undefined
                  }
                  className="provider-settings-nav-item"
                  href={`/settings/providers/${definition.preset}`}
                  key={definition.preset}
                >
                  <span className="provider-mark">
                    {definition.displayName.slice(0, 1)}
                  </span>
                  <span>
                    <strong>{definition.displayName}</strong>
                    <small>
                      {connection
                        ? `${connection.models.length} 个模型`
                        : "尚未配置"}
                    </small>
                  </span>
                  <i
                    aria-label={getConnectionStatusLabel(
                      connection?.checkStatus
                    )}
                    className="provider-status-dot"
                    data-status={
                      connection?.checkStatus ?? "unconfigured"
                    }
                  />
                </Link>
              );
            })}
          </nav>
        </aside>
        <section className="provider-settings-content">{children}</section>
      </div>
    </main>
  );
}

export function getConnectionStatusLabel(
  status: "connected" | "failed" | "unchecked" | undefined
): string {
  switch (status) {
    case "connected":
      return "连接正常";
    case "failed":
      return "检查失败";
    case "unchecked":
      return "等待检查";
    default:
      return "未配置";
  }
}
