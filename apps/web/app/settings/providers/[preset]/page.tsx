/**
 * [INPUT]: preset params、权威 session、公开 ProviderConnection 与 Server Actions
 * [OUTPUT]: 单供应商配置、脱敏凭证状态、连通性结果和删除入口
 * [POS]: Learning Chatbot v1 用户供应商详情页
 * [DOC]: docs/architecture/model-catalog.md
 *
 * [PROTOCOL]: API Key 永不回填；空值更新保留旧密钥，所有兼容 Base URL 由服务端校验。
 */

import {
  type ProviderConnectionFailureCode,
  providerPresetSchema,
} from "@repo/contracts";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@repo/design-system/components/alert";
import { Button, buttonVariants } from "@repo/design-system/components/button";
import { Card, CardContent } from "@repo/design-system/components/card";
import { Input } from "@repo/design-system/components/input";
import { Label } from "@repo/design-system/components/label";
import {
  getProviderPresetDefinition,
  type ProviderConnection,
} from "@repo/model-router";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DeleteProviderConnectionForm } from "@/components/providers/delete-provider-connection-form";
import { getAuthenticatedOwnerId } from "@/server/auth";
import { requireChatPageOwner } from "@/server/chat-page-auth";
import { getProviderRuntime } from "@/server/provider-runtime";
import {
  checkProviderConnectionAction,
  saveProviderConnectionAction,
} from "../actions";

export default async function ProviderSettingsDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ preset: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const [{ preset: rawPreset }, query] = await Promise.all([
    params,
    searchParams,
  ]);
  const parsedPreset = providerPresetSchema.safeParse(rawPreset);
  if (!parsedPreset.success) {
    notFound();
  }
  const preset = parsedPreset.data;
  const ownerId = await requireChatPageOwner({
    headers: await headers(),
    readOwnerId: getAuthenticatedOwnerId,
    redirect,
  });
  const runtime = getProviderRuntime();
  const connection = await runtime.providers.find({ ownerId, preset });
  const definition = getProviderPresetDefinition(preset);
  const notice = getNotice(query.notice);

  return (
    <main className="settings-shell settings-detail-shell">
      <header className="settings-header">
        <div>
          <Link
            className={buttonVariants({
              className: "settings-back-link",
              variant: "ghost",
            })}
            href="/settings/providers"
          >
            ← 所有供应商
          </Link>
          <h1>{definition.displayName}</h1>
          <p className="settings-lede">{definition.description}</p>
        </div>
        <span
          className="provider-status provider-status-large"
          data-status={connection?.checkStatus ?? "unconfigured"}
        >
          {getStatusLabel(connection)}
        </span>
      </header>

      {notice ? (
        <Alert
          className="settings-notice"
          variant={notice.destructive ? "destructive" : "default"}
        >
          <AlertTitle>{notice.title}</AlertTitle>
          <AlertDescription>{notice.description}</AlertDescription>
        </Alert>
      ) : null}

      {runtime.credentialVaultConfigured ? null : (
        <Alert className="settings-notice" variant="destructive">
          <AlertTitle>服务端加密未就绪</AlertTitle>
          <AlertDescription>
            设置 PROVIDER_CREDENTIAL_ENCRYPTION_KEY 并重启 Web
            服务后，才能保存或检查凭证。
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent>
          <form className="provider-form">
            <input name="preset" type="hidden" value={preset} />
            <div className="provider-field">
              <Label htmlFor="apiKey">API Key</Label>
              <Input
                autoComplete="off"
                disabled={!runtime.credentialVaultConfigured}
                id="apiKey"
                name="apiKey"
                placeholder={
                  connection?.hasCredential
                    ? "已安全保存；留空表示不更换"
                    : "粘贴供应商 API Key"
                }
                type="password"
              />
              <p>
                {connection?.hasCredential
                  ? "现有密钥不会回显；只有填写新值才会替换。"
                  : "密钥提交后使用 AES-256-GCM 加密保存。"}
              </p>
            </div>

            <div className="provider-field">
              <Label htmlFor="baseUrl">兼容 Base URL</Label>
              <Input
                defaultValue={connection?.baseUrl ?? definition.defaultBaseUrl}
                disabled={!runtime.credentialVaultConfigured}
                id="baseUrl"
                inputMode="url"
                name="baseUrl"
                required
                type="url"
              />
              <p>
                仅允许公开 HTTP(S) 目标；保存和请求时都会进行服务端网络校验。
              </p>
            </div>

            <div className="provider-field">
              <Label htmlFor="modelId">默认模型 ID</Label>
              <Input
                defaultValue={connection?.modelId ?? ""}
                disabled={!runtime.credentialVaultConfigured}
                id="modelId"
                name="modelId"
                placeholder="例如供应商文档中的模型标识"
                required
              />
              <p>
                第一阶段不自动拉取模型列表，请填写供应商实际支持的模型标识。
              </p>
            </div>

            <label className="provider-toggle" htmlFor="enabled">
              <input
                defaultChecked={connection?.enabled ?? true}
                disabled={!runtime.credentialVaultConfigured}
                id="enabled"
                name="enabled"
                type="checkbox"
              />
              <span>
                <strong>启用此供应商</strong>
                <small>保存启用状态；接入聊天模型选择将在下一阶段完成。</small>
              </span>
            </label>

            <div className="provider-form-actions">
              <Button
                disabled={!runtime.credentialVaultConfigured}
                formAction={saveProviderConnectionAction}
                type="submit"
                variant="outline"
              >
                保存配置
              </Button>
              <Button
                disabled={!runtime.credentialVaultConfigured}
                formAction={checkProviderConnectionAction}
                type="submit"
              >
                保存并检查连接
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {connection ? (
        <Card className="provider-check-card">
          <CardContent>
            <div className="provider-check-summary">
              <div>
                <h2>最近一次检查</h2>
                <p>{getCheckSummary(connection)}</p>
              </div>
              <time dateTime={connection.lastCheckedAt?.toISOString()}>
                {connection.lastCheckedAt
                  ? new Intl.DateTimeFormat("zh-CN", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(connection.lastCheckedAt)
                  : "尚未检查"}
              </time>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {connection ? (
        <section
          aria-labelledby="danger-title"
          className="provider-danger-zone"
        >
          <div>
            <h2 id="danger-title">删除配置</h2>
            <p>删除会移除当前账号保存的地址、模型和加密凭证。</p>
          </div>
          <DeleteProviderConnectionForm
            displayName={definition.displayName}
            preset={preset}
          />
        </section>
      ) : null}
    </main>
  );
}

function getStatusLabel(connection: ProviderConnection | null): string {
  if (!connection) {
    return "未配置";
  }
  switch (connection.checkStatus) {
    case "connected":
      return "连接正常";
    case "failed":
      return "检查失败";
    case "unchecked":
      return "等待检查";
    default:
      return "状态未知";
  }
}

function getCheckSummary(connection: ProviderConnection): string {
  if (connection.checkStatus === "connected") {
    return "服务端已使用当前地址、模型和凭证完成最小生成请求。";
  }
  if (connection.checkStatus === "failed" && connection.failureCode) {
    return getFailureLabel(connection.failureCode);
  }
  return "保存配置后可执行一次低输出上限的真实连通性检查。";
}

function getFailureLabel(code: ProviderConnectionFailureCode): string {
  const labels: Record<ProviderConnectionFailureCode, string> = {
    authentication_failed: "认证失败，请检查 API Key。",
    model_not_found: "未找到模型，请核对模型 ID 与兼容地址。",
    network_error: "无法安全连接到该公开网络地址。",
    provider_error: "供应商返回了无法归类的失败，请稍后再试。",
    rate_limited: "供应商触发限流，请稍后再试。",
    timeout: "检查在 15 秒内未完成。",
  };
  return labels[code];
}

function getNotice(code: string | undefined): {
  description: string;
  destructive: boolean;
  title: string;
} | null {
  const notices: Record<
    string,
    { description: string; destructive: boolean; title: string }
  > = {
    connected: {
      description: "当前地址、模型与凭证已通过最小生成请求。",
      destructive: false,
      title: "连接正常",
    },
    "check-failed": {
      description: "配置已保存，请根据下方归一化结果检查地址、模型或凭证。",
      destructive: true,
      title: "连通性检查未通过",
    },
    "credential-required": {
      description: "首次保存必须填写 API Key。",
      destructive: true,
      title: "缺少凭证",
    },
    "credential-unavailable": {
      description: "服务端暂时无法加密或解密凭证，请检查加密主密钥配置。",
      destructive: true,
      title: "凭证服务不可用",
    },
    invalid: {
      description: "请填写合法的兼容地址和模型 ID。",
      destructive: true,
      title: "配置不完整",
    },
    "not-found": {
      description: "该配置不存在或已被删除。",
      destructive: true,
      title: "未找到配置",
    },
    "persistence-failed": {
      description: "配置暂时无法保存，请确认数据库迁移已执行后重试。",
      destructive: true,
      title: "保存失败",
    },
    saved: {
      description: "地址、模型、启用状态与加密凭证状态已更新。",
      destructive: false,
      title: "配置已保存",
    },
    unexpected: {
      description: "操作暂时无法完成，请稍后重试。",
      destructive: true,
      title: "出现意外错误",
    },
    "unsafe-url": {
      description: "只允许可安全访问的公开 HTTP(S) 地址。",
      destructive: true,
      title: "兼容地址不可用",
    },
  };
  return code ? (notices[code] ?? null) : null;
}
