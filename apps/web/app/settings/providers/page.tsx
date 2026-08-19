/**
 * [INPUT]: 权威 session、五个 ProviderPreset 定义、owner-scoped 公开连接与模型快照
 * [OUTPUT]: 紧凑供应商总览、模型数量、检查状态和详情导航
 * [POS]: Learning Chatbot v1 用户供应商管理首页
 * [DOC]: docs/architecture/model-catalog.md
 *
 * [PROTOCOL]: 页面只组合 hasCredential、模型摘要与检查状态；不得读取或传递 encryptedCredential。
 */

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@repo/design-system/components/alert";
import { Badge } from "@repo/design-system/components/badge";
import { buttonVariants } from "@repo/design-system/components/button";
import { Separator } from "@repo/design-system/components/separator";
import { providerPresetDefinitions } from "@repo/model-router";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  getConnectionStatusLabel,
  ProviderSettingsLayout,
} from "@/components/providers/provider-settings-layout";
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
    <ProviderSettingsLayout connections={connections}>
      <div className="provider-overview-header">
        <div>
          <p className="eyebrow">自带密钥</p>
          <h2>连接你的模型服务</h2>
          <p>
            保存 API Key 后自动读取供应商模型目录。你只需选择默认模型，不再手填模型 ID。
          </p>
        </div>
        <Badge variant="secondary">{connections.length} 个已配置</Badge>
      </div>

      {query.notice === "deleted" ? (
        <Alert className="settings-notice">
          <AlertTitle>配置已删除</AlertTitle>
          <AlertDescription>
            该供应商的地址、模型目录和加密凭证已从当前账号移除。
          </AlertDescription>
        </Alert>
      ) : null}

      {runtime.credentialVaultConfigured ? null : (
        <Alert className="settings-notice" variant="destructive">
          <AlertTitle>凭证加密尚未就绪</AlertTitle>
          <AlertDescription>
            请先在服务端配置 PROVIDER_CREDENTIAL_ENCRYPTION_KEY。
          </AlertDescription>
        </Alert>
      )}

      <div className="provider-overview-list">
        {providerPresetDefinitions.map((definition, index) => {
          const connection = byPreset.get(definition.preset);
          return (
            <div key={definition.preset}>
              {index > 0 ? <Separator /> : null}
              <div className="provider-overview-row">
                <span className="provider-mark provider-mark-large">
                  {definition.displayName.slice(0, 1)}
                </span>
                <div className="provider-overview-copy">
                  <div>
                    <h3>{definition.displayName}</h3>
                    <Badge
                      variant={
                        connection?.checkStatus === "connected"
                          ? "default"
                          : "secondary"
                      }
                    >
                      {getConnectionStatusLabel(connection?.checkStatus)}
                    </Badge>
                  </div>
                  <p>{definition.description}</p>
                </div>
                <div className="provider-overview-meta">
                  <strong>{connection?.models.length ?? 0}</strong>
                  <span>模型</span>
                </div>
                <Link
                  aria-label={`配置 ${definition.displayName}`}
                  className={buttonVariants({ size: "icon", variant: "ghost" })}
                  href={`/settings/providers/${definition.preset}`}
                >
                  <span aria-hidden="true">›</span>
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </ProviderSettingsLayout>
  );
}
