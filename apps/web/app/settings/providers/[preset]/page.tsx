/**
 * [INPUT]: preset params、权威 session、公开 ProviderConnection 模型快照与 Server Actions
 * [OUTPUT]: 紧凑单供应商配置、自动模型目录、标准 Combobox、连通性结果和删除入口
 * [POS]: Learning Chatbot v1 用户供应商详情页
 * [DOC]: docs/architecture/model-catalog.md
 *
 * [PROTOCOL]: API Key 永不回填；空值更新保留旧密钥，模型目录只能由服务端安全获取。
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
import { Badge } from "@repo/design-system/components/badge";
import { Button } from "@repo/design-system/components/button";
import { Input } from "@repo/design-system/components/input";
import { Label } from "@repo/design-system/components/label";
import { Separator } from "@repo/design-system/components/separator";
import { Switch } from "@repo/design-system/components/switch";
import {
  getProviderPresetDefinition,
  type ProviderConnection,
} from "@repo/model-router";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { DeleteProviderConnectionForm } from "@/components/providers/delete-provider-connection-form";
import { ProviderModelField } from "@/components/providers/provider-model-field";
import {
  getConnectionStatusLabel,
  ProviderSettingsLayout,
} from "@/components/providers/provider-settings-layout";
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
  const connections = await runtime.providers.list(ownerId);
  const connection =
    connections.find((candidate) => candidate.preset === preset) ?? null;
  const definition = getProviderPresetDefinition(preset);
  const notice = getNotice(query.notice);
  const controlsDisabled = !runtime.credentialVaultConfigured;

  return (
    <ProviderSettingsLayout
      activePreset={preset}
      connections={connections}
    >
      <div className="provider-detail-header">
        <span className="provider-mark provider-mark-large">
          {definition.displayName.slice(0, 1)}
        </span>
        <div>
          <h2>{definition.displayName}</h2>
          <p>{definition.description}</p>
        </div>
        <Badge
          variant={
            connection?.checkStatus === "connected" ? "default" : "secondary"
          }
        >
          {getConnectionStatusLabel(connection?.checkStatus)}
        </Badge>
      </div>

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
            设置 PROVIDER_CREDENTIAL_ENCRYPTION_KEY 并重启 Web 服务后再保存。
          </AlertDescription>
        </Alert>
      )}

      <form className="provider-detail-form">
        <input name="preset" type="hidden" value={preset} />

        <div className="provider-detail-field">
          <div>
            <Label htmlFor="apiKey">API Key</Label>
            <p>仅在服务端使用 AES-256-GCM 加密保存，不会再次回显。</p>
          </div>
          <Input
            autoComplete="off"
            disabled={controlsDisabled}
            id="apiKey"
            name="apiKey"
            placeholder={
              connection?.hasCredential
                ? "已安全保存；留空表示不更换"
                : "粘贴供应商 API Key"
            }
            type="password"
          />
        </div>
        <Separator />

        <div className="provider-detail-field">
          <div>
            <Label htmlFor="baseUrl">API Base URL</Label>
            <p>默认使用官方地址，也支持通过安全校验的公开兼容端点。</p>
          </div>
          <Input
            defaultValue={connection?.baseUrl ?? definition.defaultBaseUrl}
            disabled={controlsDisabled}
            id="baseUrl"
            inputMode="url"
            name="baseUrl"
            required
            type="url"
          />
        </div>
        <Separator />

        <div className="provider-detail-field">
          <div>
            <Label htmlFor="modelId">默认模型</Label>
            <p>
              {connection
                ? `已从供应商读取 ${connection.models.length} 个模型，可搜索选择。`
                : "首次保存时自动读取模型目录并选择第一个可用模型。"}
            </p>
          </div>
          {connection ? (
            <ProviderModelField
              disabled={controlsDisabled}
              initialValue={connection.modelId}
              models={connection.models}
            />
          ) : (
            <div className="provider-model-empty">
              保存凭证后自动获取，无需手填
            </div>
          )}
        </div>
        <Separator />

        <div className="provider-detail-field provider-detail-toggle-row">
          <div>
            <Label htmlFor="enabled">启用供应商</Label>
            <p>保存启用状态；接入聊天路由仍属于下一阶段。</p>
          </div>
          <Switch
            defaultChecked={connection?.enabled ?? true}
            disabled={controlsDisabled}
            id="enabled"
            name="enabled"
          />
        </div>

        <div className="provider-form-actions">
          <Button
            disabled={controlsDisabled}
            formAction={saveProviderConnectionAction}
            type="submit"
            variant="outline"
          >
            {connection ? "刷新模型并保存" : "保存并获取模型"}
          </Button>
          <Button
            disabled={controlsDisabled}
            formAction={checkProviderConnectionAction}
            type="submit"
          >
            保存并检查连接
          </Button>
        </div>
      </form>

      {connection ? (
        <section className="provider-compact-section">
          <div>
            <h3>最近一次检查</h3>
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
        </section>
      ) : null}

      {connection ? (
        <section
          aria-labelledby="danger-title"
          className="provider-compact-section provider-danger-zone"
        >
          <div>
            <h3 id="danger-title">删除配置</h3>
            <p>移除地址、模型目录和加密凭证，此操作不可撤销。</p>
          </div>
          <DeleteProviderConnectionForm
            displayName={definition.displayName}
            preset={preset}
          />
        </section>
      ) : null}
    </ProviderSettingsLayout>
  );
}

function getCheckSummary(connection: ProviderConnection): string {
  if (connection.checkStatus === "connected") {
    return "服务端已使用当前地址、默认模型和凭证完成最小生成请求。";
  }
  if (connection.checkStatus === "failed" && connection.failureCode) {
    return getFailureLabel(connection.failureCode);
  }
  return "保存配置后可执行一次低输出上限的真实连通性检查。";
}

function getFailureLabel(code: ProviderConnectionFailureCode): string {
  const labels: Record<ProviderConnectionFailureCode, string> = {
    authentication_failed: "认证失败，请检查 API Key。",
    model_not_found: "默认模型不可用，请刷新模型目录后重试。",
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
      description: "当前地址、默认模型与凭证已通过最小生成请求。",
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
      description: "请填写合法的 API Key 和兼容地址。",
      destructive: true,
      title: "配置不完整",
    },
    "model-discovery-failed": {
      description: "无法从供应商读取模型目录，请检查 API Key、地址或上游服务状态。",
      destructive: true,
      title: "模型目录获取失败",
    },
    "model-list-empty": {
      description: "供应商没有返回可用于文本生成的模型。",
      destructive: true,
      title: "没有可用模型",
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
      description: "模型目录、默认模型、地址、启用状态与加密凭证已更新。",
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
