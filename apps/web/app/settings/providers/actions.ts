/**
 * [INPUT]: Provider 配置 FormData、权威 Better Auth session 与自动模型发现 ProviderConnectionService
 * [OUTPUT]: owner-scoped 模型刷新、保存、连通性检查、删除及固定 notice 重定向
 * [POS]: `/settings/providers` 写操作的 Server Action 边界
 * [DOC]: docs/architecture/model-catalog.md
 *
 * [PROTOCOL]: 每次 action 必须重新认证；不得把 API Key、上游错误或内部异常写入 URL/返回值。
 */

"use server";

import { type ProviderPreset, providerPresetSchema } from "@repo/contracts";
import { isProviderConnectionError } from "@repo/model-router";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthenticatedOwnerId } from "@/server/auth";
import { requireChatPageOwner } from "@/server/chat-page-auth";
import { getProviderRuntime } from "@/server/provider-runtime";

export async function saveProviderConnectionAction(
  formData: FormData
): Promise<void> {
  const preset = parsePreset(formData);
  const ownerId = await requireOwner();
  try {
    await getProviderRuntime().providers.save({
      apiKey: optionalString(formData, "apiKey"),
      baseUrl: requiredString(formData, "baseUrl"),
      enabled: formData.get("enabled") === "on",
      modelId: optionalString(formData, "modelId"),
      ownerId,
      preset,
    });
  } catch (error) {
    redirectToPreset(preset, toSafeNotice(error));
  }
  revalidateProviderPages(preset);
  redirectToPreset(preset, "saved");
}

export async function checkProviderConnectionAction(
  formData: FormData
): Promise<void> {
  const preset = parsePreset(formData);
  const ownerId = await requireOwner();
  let notice: "connected" | "check-failed";
  try {
    await getProviderRuntime().providers.save({
      apiKey: optionalString(formData, "apiKey"),
      baseUrl: requiredString(formData, "baseUrl"),
      enabled: formData.get("enabled") === "on",
      modelId: optionalString(formData, "modelId"),
      ownerId,
      preset,
    });
    const checked = await getProviderRuntime().providers.check({
      ownerId,
      preset,
    });
    notice = checked.checkStatus === "connected" ? "connected" : "check-failed";
  } catch (error) {
    redirectToPreset(preset, toSafeNotice(error));
  }
  revalidateProviderPages(preset);
  redirectToPreset(preset, notice);
}

export async function deleteProviderConnectionAction(
  formData: FormData
): Promise<void> {
  const preset = parsePreset(formData);
  const ownerId = await requireOwner();
  try {
    await getProviderRuntime().providers.delete({ ownerId, preset });
  } catch (error) {
    redirectToPreset(preset, toSafeNotice(error));
  }
  revalidateProviderPages(preset);
  redirect("/settings/providers?notice=deleted");
}

function parsePreset(formData: FormData): ProviderPreset {
  const parsed = providerPresetSchema.safeParse(formData.get("preset"));
  if (!parsed.success) {
    redirect("/settings/providers?notice=invalid");
  }
  return parsed.data;
}

async function requireOwner() {
  return requireChatPageOwner({
    headers: await headers(),
    readOwnerId: getAuthenticatedOwnerId,
    redirect,
  });
}

function requiredString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function optionalString(formData: FormData, name: string): string | undefined {
  const value = requiredString(formData, name).trim();
  return value.length > 0 ? value : undefined;
}

function toSafeNotice(error: unknown): string {
  if (!isProviderConnectionError(error)) {
    return "unexpected";
  }
  switch (error.code) {
    case "invalid_provider_connection_input":
      return "invalid";
    case "invalid_network_target":
      return "unsafe-url";
    case "provider_credential_required":
      return "credential-required";
    case "provider_connection_not_found":
      return "not-found";
    case "provider_credential_unavailable":
      return "credential-unavailable";
    case "provider_model_discovery_failed":
      return "model-discovery-failed";
    case "provider_model_list_empty":
      return "model-list-empty";
    case "provider_connection_persistence_failure":
      return "persistence-failed";
    default:
      return "unexpected";
  }
}

function revalidateProviderPages(preset: ProviderPreset): void {
  revalidatePath("/settings/providers");
  revalidatePath(`/settings/providers/${preset}`);
}

function redirectToPreset(preset: ProviderPreset, notice: string): never {
  redirect(`/settings/providers/${preset}?notice=${notice}`);
}
