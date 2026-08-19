/**
 * [INPUT]: 权威 session、五个 ProviderPreset 定义与 owner-scoped 公开连接
 * [OUTPUT]: 脱敏供应商配置总览、vault readiness 和详情导航
 * [POS]: Learning Chatbot v1 用户供应商管理首页
 * [DOC]: docs/architecture/model-catalog.md
 *
 * [PROTOCOL]: 页面只组合 hasCredential 与检查状态；不得读取或传递 encryptedCredential。
 */

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@repo/design-system/components/alert";
import { buttonVariants } from "@repo/design-system/components/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/card";
import { providerPresetDefinitions } from "@repo/model-router";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { appRoute } from "@/lib/app-route";
import { getAuthenticatedOwnerId } from "@/server/auth";
import { requireChatPageOwner } from "@/server/chat-page-auth";
import { getProviderRuntime } from "@/server/provider-runtime";

export default async function ProviderSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const ownerId = await requireChatPageOwner({
    headers: await headers(),
    readOwnerId: getAuthenticatedOwnerId,
    redirect,
  });
  const runtime = getProviderRuntime();
  const [connections, query] = await Promise.all([
    runtime.providers.list(ownerId),
    searchParams,
  ]);
  const byPreset = new Map(
    connections.map((connection) => [connection.preset, connection])
  );

  return (
    <main className="settings-shell">
      <header className="settings-header">
        <div>
          <p className="eyebrow">个人设置</p>
          <h1>AI 供应商</h1>
          <p className="settings-lede">
            配置你自己的 API 凭证、兼容地址和默认模型。每项配置只属于当前账号。
          </p>
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

      {query.notice === "deleted" ? (
        <Alert className="settings-notice">
          <AlertTitle>配置已删除</AlertTitle>
          <AlertDescription>
            该供应商的地址、模型和加密凭证已从当前账号移除。
          </AlertDescription>
        </Alert>
      ) : null}

      {runtime.credentialVaultConfigured ? null : (
        <Alert className="settings-notice" variant="destructive">
          <AlertTitle>尚未配置凭证加密主密钥</AlertTitle>
          <AlertDescription>
            请先在服务端设置
            PROVIDER_CREDENTIAL_ENCRYPTION_KEY；在此之前不能保存或检查 API Key。
          </AlertDescription>
        </Alert>
      )}

      <section aria-labelledby="provider-list-title">
        <div className="settings-section-heading">
          <div>
            <h2 id="provider-list-title">兼容接口</h2>
            <p>第一阶段固定支持以下五种协议入口，不自动发现模型。</p>
          </div>
          <span>{connections.length} / 5 已配置</span>
        </div>
        <div className="provider-grid">
          {providerPresetDefinitions.map((definition) => {
            const connection = byPreset.get(definition.preset);
            return (
              <Card key={definition.preset}>
                <CardHeader>
                  <CardTitle>{definition.displayName}</CardTitle>
                  <CardDescription>{definition.description}</CardDescription>
                  <CardAction>
                    <span
                      className="provider-status"
                      data-status={connection?.checkStatus ?? "unconfigured"}
                    >
                      {getConnectionStatusLabel(connection?.checkStatus)}
                    </span>
                  </CardAction>
                </CardHeader>
                <CardContent className="provider-card-content">
                  <dl>
                    <div>
                      <dt>配置</dt>
                      <dd>{connection ? "已保存" : "未配置"}</dd>
                    </div>
                    <div>
                      <dt>状态</dt>
                      <dd>{connection?.enabled ? "已启用" : "未启用"}</dd>
                    </div>
                    <div>
                      <dt>模型</dt>
                      <dd>{connection?.modelId ?? "等待填写"}</dd>
                    </div>
                  </dl>
                </CardContent>
                <CardFooter>
                  <Link
                    className={buttonVariants({
                      className: "provider-card-action",
                      variant: connection ? "outline" : "default",
                    })}
                    href={`/settings/providers/${definition.preset}`}
                  >
                    {connection ? "管理配置" : "开始配置"}
                  </Link>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      </section>
    </main>
  );
}

function getConnectionStatusLabel(
  status: "unchecked" | "connected" | "failed" | undefined
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
