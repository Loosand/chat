/**
 * [INPUT]: ProviderPreset、展示名与 owner-scoped 删除 Server Action
 * [OUTPUT]: 带显式二次确认的供应商配置删除表单
 * [POS]: 供应商详情页唯一危险浏览器交互
 *
 * [PROTOCOL]: 组件只接收 preset/displayName，不得接收凭证、密文或 ownerId。
 */

"use client";

import type { ProviderPreset } from "@repo/contracts";
import { Button } from "@repo/design-system/components/button";
import { useState } from "react";
import { deleteProviderConnectionAction } from "@/app/settings/providers/actions";

export function DeleteProviderConnectionForm({
  displayName,
  preset,
}: {
  displayName: string;
  preset: ProviderPreset;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <form action={deleteProviderConnectionAction}>
      <input name="preset" type="hidden" value={preset} />
      {confirming ? (
        <div className="provider-delete-confirmation">
          <span>确定删除 {displayName}？</span>
          <Button type="submit" variant="destructive">
            确认删除
          </Button>
          <Button
            onClick={() => setConfirming(false)}
            type="button"
            variant="ghost"
          >
            取消
          </Button>
        </div>
      ) : (
        <Button
          onClick={() => setConfirming(true)}
          type="button"
          variant="destructive"
        >
          删除配置
        </Button>
      )}
    </form>
  );
}
