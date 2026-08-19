/**
 * [INPUT]: 已发现模型快照与服务端保存的默认模型
 * [OUTPUT]: 表单可提交的受控标准模型 Combobox
 * [POS]: 用户供应商详情页默认模型交互边界
 * [DOC]: docs/architecture/model-catalog.md
 */

"use client";

import type { ProviderConnectionModel } from "@repo/model-router";
import { useState } from "react";
import { ModelCombobox } from "@/components/model-combobox";

export function ProviderModelField({
  disabled,
  initialValue,
  models,
}: {
  disabled: boolean;
  initialValue: string;
  models: ProviderConnectionModel[];
}) {
  const [value, setValue] = useState(initialValue);

  return (
    <ModelCombobox
      disabled={disabled}
      id="modelId"
      name="modelId"
      onValueChange={setValue}
      options={models.map((model) => ({
        label: model.displayName,
        value: model.modelId,
      }))}
      value={value}
    />
  );
}
