/**
 * [INPUT]: 可选模型摘要、当前值、禁用态与值变更回调
 * [OUTPUT]: 基于 Base UI 的可搜索、键盘可访问单选模型 Combobox
 * [POS]: apps/web 供应商设置与聊天输入共享的标准模型选择器
 * [DOC]: docs/architecture/frontend-stack.md
 */

"use client";

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@repo/design-system/components/combobox";
import { useMemo } from "react";

export type ModelComboboxOption = {
  label: string;
  value: string;
};

export function ModelCombobox({
  disabled = false,
  id,
  name,
  onValueChange,
  options,
  placeholder = "搜索模型…",
  value,
}: {
  disabled?: boolean;
  id?: string;
  name?: string;
  onValueChange?(value: string): void;
  options: ModelComboboxOption[];
  placeholder?: string;
  value: string;
}) {
  const labels = useMemo(
    () => new Map(options.map((option) => [option.value, option.label])),
    [options]
  );

  return (
    <>
      {name ? <input name={name} type="hidden" value={value} /> : null}
      <Combobox
        disabled={disabled}
        itemToStringLabel={(itemValue) => labels.get(itemValue) ?? itemValue}
        onValueChange={(nextValue) => {
          if (nextValue) {
            onValueChange?.(nextValue);
          }
        }}
        value={value || null}
      >
        <ComboboxInput
          aria-label="选择模型"
          className="model-combobox-input"
          disabled={disabled}
          id={id}
          placeholder={placeholder}
        />
        <ComboboxContent>
          <ComboboxEmpty>没有匹配的模型</ComboboxEmpty>
          <ComboboxList>
            {options.map((option) => (
              <ComboboxItem key={option.value} value={option.value}>
                <span className="model-combobox-item-label">
                  {option.label}
                </span>
                <span className="model-combobox-item-id">{option.value}</span>
              </ComboboxItem>
            ))}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </>
  );
}
