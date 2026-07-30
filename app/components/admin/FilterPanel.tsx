"use client";

import { type FormEvent, type ReactNode, useId } from "react";
import styles from "./admin.module.css";
import {
  AdminButton,
  AdminInput,
  AdminSelect,
  cx,
} from "./shared";

export interface FilterOption {
  label: string;
  value: string;
  disabled?: boolean;
}

interface BaseFilterField {
  name: string;
  label: string;
  span?: "normal" | "wide" | "full";
  disabled?: boolean;
}

export interface TextFilterField extends BaseFilterField {
  type: "text" | "search" | "date" | "datetime-local" | "number";
  value: string;
  placeholder?: string;
  min?: string;
  max?: string;
}

export interface SelectFilterField extends BaseFilterField {
  type: "select";
  value: string;
  options: FilterOption[];
  placeholder?: string;
}

export interface DateRangeFilterField extends BaseFilterField {
  type: "dateRange";
  startValue: string;
  endValue: string;
  startName?: string;
  endName?: string;
  min?: string;
  max?: string;
}

export interface CustomFilterField extends BaseFilterField {
  type: "custom";
  control: ReactNode;
}

export type FilterField =
  | TextFilterField
  | SelectFilterField
  | DateRangeFilterField
  | CustomFilterField;

export interface FilterPanelProps {
  fields: FilterField[];
  onChange?: (name: string, value: string) => void;
  onSearch?: () => void;
  onReset?: () => void;
  searchLabel?: string;
  resetLabel?: string;
  loading?: boolean;
  className?: string;
}

export function FilterPanel({
  fields,
  onChange,
  onSearch,
  onReset,
  searchLabel = "검색",
  resetLabel = "초기화",
  loading = false,
  className,
}: FilterPanelProps) {
  const idPrefix = useId();
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSearch?.();
  };

  return (
    <form
      className={cx(styles.filterPanel, className)}
      onSubmit={handleSubmit}
    >
      <div className={styles.filterRows}>
        {fields.map((field) => {
          const fieldId = `${idPrefix}-${field.name}`;
          const spanClass =
            field.span === "wide"
              ? styles.filterFieldWide
              : field.span === "full"
                ? styles.filterFieldFull
                : undefined;

          return (
            <div
              className={cx(styles.filterField, spanClass)}
              key={field.name}
            >
              <label className={styles.filterLabel} htmlFor={fieldId}>
                {field.label}
              </label>
              {field.type === "select" ? (
                <AdminSelect
                  id={fieldId}
                  name={field.name}
                  value={field.value}
                  disabled={field.disabled || !onChange}
                  onChange={(event) =>
                    onChange?.(field.name, event.currentTarget.value)
                  }
                >
                  {field.placeholder !== undefined ? (
                    <option value="">{field.placeholder}</option>
                  ) : null}
                  {field.options.map((option) => (
                    <option
                      key={option.value}
                      value={option.value}
                      disabled={option.disabled}
                    >
                      {option.label}
                    </option>
                  ))}
                </AdminSelect>
              ) : field.type === "dateRange" ? (
                <div className={styles.dateRange}>
                  <AdminInput
                    id={fieldId}
                    type="date"
                    name={field.startName ?? `${field.name}Start`}
                    value={field.startValue}
                    min={field.min}
                    max={field.max}
                    disabled={field.disabled || !onChange}
                    aria-label={`${field.label} 시작일`}
                    onChange={(event) =>
                      onChange?.(
                        field.startName ?? `${field.name}Start`,
                        event.currentTarget.value,
                      )
                    }
                  />
                  <span className={styles.dateSeparator} aria-hidden="true">
                    ~
                  </span>
                  <AdminInput
                    type="date"
                    name={field.endName ?? `${field.name}End`}
                    value={field.endValue}
                    min={field.min}
                    max={field.max}
                    disabled={field.disabled || !onChange}
                    aria-label={`${field.label} 종료일`}
                    onChange={(event) =>
                      onChange?.(
                        field.endName ?? `${field.name}End`,
                        event.currentTarget.value,
                      )
                    }
                  />
                </div>
              ) : field.type === "custom" ? (
                field.control
              ) : (
                <AdminInput
                  id={fieldId}
                  type={field.type}
                  name={field.name}
                  value={field.value}
                  min={field.min}
                  max={field.max}
                  placeholder={field.placeholder}
                  disabled={field.disabled || !onChange}
                  onChange={(event) =>
                    onChange?.(field.name, event.currentTarget.value)
                  }
                />
              )}
            </div>
          );
        })}
      </div>
      <div className={styles.filterActions}>
        <AdminButton
          type="submit"
          variant="primary"
          loading={loading}
          disabled={!onSearch}
        >
          {searchLabel}
        </AdminButton>
        <AdminButton
          type="button"
          onClick={onReset}
          disabled={!onReset || loading}
        >
          {resetLabel}
        </AdminButton>
      </div>
    </form>
  );
}

