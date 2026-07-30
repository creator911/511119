"use client";

import { type FormEvent, useId } from "react";
import styles from "./admin.module.css";
import {
  AdminButton,
  AdminInput,
  AdminSelect,
  AdminTextarea,
  FormRow,
  FormSection,
  Toggle,
  cx,
} from "./shared";

export type ProductSaleStatus = "selling" | "paused" | "soldout" | "hidden";

export interface ProductCategoryOption {
  id: string;
  label: string;
  disabled?: boolean;
}

export interface ProductOptionValue {
  id: string;
  label: string;
  additionalPrice: number;
  stock: number;
  enabled: boolean;
}

export interface ProductFormValue {
  name: string;
  sku: string;
  categoryId: string;
  status: ProductSaleStatus;
  price: number;
  marketPrice: number;
  stock: number;
  minimumOrderQuantity: number;
  maximumOrderQuantity: number | null;
  weightLabel: string;
  shortDescription: string;
  description: string;
  thumbnailUrl: string;
  thumbnailAlt: string;
  visible: boolean;
  featured: boolean;
  taxable: boolean;
  seoTitle: string;
  seoDescription: string;
  options: ProductOptionValue[];
}

export type ProductFormErrors = Partial<
  Record<keyof Omit<ProductFormValue, "options"> | "options", string>
>;

export interface ProductFormProps {
  value: ProductFormValue;
  categories: ProductCategoryOption[];
  onChange?: <K extends keyof ProductFormValue>(
    field: K,
    value: ProductFormValue[K],
  ) => void;
  onSubmit?: (value: ProductFormValue) => void | Promise<void>;
  onCancel?: () => void;
  onThumbnailSelect?: (file: File) => void;
  onOptionAdd?: () => void;
  onOptionChange?: (
    optionId: string,
    patch: Partial<Omit<ProductOptionValue, "id">>,
  ) => void;
  onOptionRemove?: (optionId: string) => void;
  errors?: ProductFormErrors;
  saving?: boolean;
  readOnly?: boolean;
  submitLabel?: string;
  currencyUnit?: string;
}

const SALE_STATUS_OPTIONS: ReadonlyArray<{
  value: ProductSaleStatus;
  label: string;
}> = [
  { value: "selling", label: "판매중" },
  { value: "paused", label: "판매중지" },
  { value: "soldout", label: "품절" },
  { value: "hidden", label: "숨김" },
];

function parseNumber(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function ProductForm({
  value,
  categories,
  onChange,
  onSubmit,
  onCancel,
  onThumbnailSelect,
  onOptionAdd,
  onOptionChange,
  onOptionRemove,
  errors = {},
  saving = false,
  readOnly = false,
  submitLabel = "상품 저장",
  currencyUnit = "원",
}: ProductFormProps) {
  const idPrefix = useId();
  const disabled = readOnly || !onChange;
  const fieldId = (field: string) => `${idPrefix}-${field}`;
  const change = <K extends keyof ProductFormValue>(
    field: K,
    nextValue: ProductFormValue[K],
  ) => onChange?.(field, nextValue);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!readOnly) void onSubmit?.(value);
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <FormSection
        title="기본 정보"
        description="상품명, 분류, 판매 상태와 기본 노출 정보를 설정합니다."
      >
        <FormRow
          label="상품명"
          required
          htmlFor={fieldId("name")}
          error={errors.name}
        >
          <AdminInput
            id={fieldId("name")}
            className={styles.inputLong}
            value={value.name}
            maxLength={120}
            disabled={disabled}
            invalid={Boolean(errors.name)}
            onChange={(event) => change("name", event.currentTarget.value)}
          />
        </FormRow>
        <FormRow
          label="상품코드"
          htmlFor={fieldId("sku")}
          help="운영 중 중복되지 않는 관리용 코드를 사용하세요."
          error={errors.sku}
        >
          <AdminInput
            id={fieldId("sku")}
            className={styles.inputMedium}
            value={value.sku}
            maxLength={80}
            disabled={disabled}
            invalid={Boolean(errors.sku)}
            onChange={(event) => change("sku", event.currentTarget.value)}
          />
        </FormRow>
        <FormRow
          label="상품분류"
          required
          htmlFor={fieldId("category")}
          error={errors.categoryId}
        >
          <AdminSelect
            id={fieldId("category")}
            className={styles.inputMedium}
            value={value.categoryId}
            disabled={disabled}
            onChange={(event) =>
              change("categoryId", event.currentTarget.value)
            }
          >
            <option value="">분류를 선택하세요</option>
            {categories.map((category) => (
              <option
                key={category.id}
                value={category.id}
                disabled={category.disabled}
              >
                {category.label}
              </option>
            ))}
          </AdminSelect>
        </FormRow>
        <FormRow label="판매상태" required>
          <div className={styles.radioGroup}>
            {SALE_STATUS_OPTIONS.map((option) => (
              <label
                key={option.value}
                className={cx(
                  styles.choiceLabel,
                  disabled && styles.choiceLabelDisabled,
                )}
              >
                <input
                  type="radio"
                  name={`${idPrefix}-sale-status`}
                  value={option.value}
                  checked={value.status === option.value}
                  disabled={disabled}
                  onChange={() => change("status", option.value)}
                />
                {option.label}
              </label>
            ))}
          </div>
        </FormRow>
        <FormRow label="노출 설정">
          <div className={styles.fieldInlineWrap}>
            <Toggle
              checked={value.visible}
              label="쇼핑몰 노출"
              disabled={readOnly}
              onChange={
                onChange
                  ? (checked) => change("visible", checked)
                  : undefined
              }
            />
            <Toggle
              checked={value.featured}
              label="추천상품"
              disabled={readOnly}
              onChange={
                onChange
                  ? (checked) => change("featured", checked)
                  : undefined
              }
            />
          </div>
        </FormRow>
      </FormSection>

      <FormSection
        title="판매 정보"
        description="판매가, 재고와 주문 가능 수량을 입력합니다."
      >
        <FormRow
          label="판매가"
          required
          htmlFor={fieldId("price")}
          error={errors.price}
        >
          <div className={styles.fieldInline}>
            <AdminInput
              id={fieldId("price")}
              className={styles.inputShort}
              type="number"
              min={0}
              step={1}
              value={value.price}
              disabled={disabled}
              invalid={Boolean(errors.price)}
              onChange={(event) =>
                change("price", parseNumber(event.currentTarget.value))
              }
            />
            <span className={styles.inputSuffix}>{currencyUnit}</span>
          </div>
        </FormRow>
        <FormRow
          label="정상가"
          htmlFor={fieldId("market-price")}
          help="비교 가격이 필요하지 않으면 0으로 입력하세요."
          error={errors.marketPrice}
        >
          <div className={styles.fieldInline}>
            <AdminInput
              id={fieldId("market-price")}
              className={styles.inputShort}
              type="number"
              min={0}
              step={1}
              value={value.marketPrice}
              disabled={disabled}
              invalid={Boolean(errors.marketPrice)}
              onChange={(event) =>
                change("marketPrice", parseNumber(event.currentTarget.value))
              }
            />
            <span className={styles.inputSuffix}>{currencyUnit}</span>
          </div>
        </FormRow>
        <FormRow
          label="재고"
          required
          htmlFor={fieldId("stock")}
          error={errors.stock}
        >
          <div className={styles.fieldInline}>
            <AdminInput
              id={fieldId("stock")}
              className={styles.inputShort}
              type="number"
              min={0}
              step={1}
              value={value.stock}
              disabled={disabled}
              invalid={Boolean(errors.stock)}
              onChange={(event) =>
                change("stock", parseNumber(event.currentTarget.value))
              }
            />
            <span className={styles.inputSuffix}>개</span>
          </div>
        </FormRow>
        <FormRow label="주문수량" error={errors.minimumOrderQuantity}>
          <div className={styles.fieldInlineWrap}>
            <span className={styles.inputSuffix}>최소</span>
            <AdminInput
              className={styles.inputShort}
              type="number"
              min={1}
              step={1}
              value={value.minimumOrderQuantity}
              disabled={disabled}
              onChange={(event) =>
                change(
                  "minimumOrderQuantity",
                  parseNumber(event.currentTarget.value),
                )
              }
              aria-label="최소 주문수량"
            />
            <span className={styles.inputSuffix}>개 / 최대</span>
            <AdminInput
              className={styles.inputShort}
              type="number"
              min={1}
              step={1}
              value={value.maximumOrderQuantity ?? ""}
              disabled={disabled}
              onChange={(event) =>
                change(
                  "maximumOrderQuantity",
                  event.currentTarget.value === ""
                    ? null
                    : parseNumber(event.currentTarget.value),
                )
              }
              aria-label="최대 주문수량"
            />
            <span className={styles.inputSuffix}>개</span>
          </div>
        </FormRow>
        <FormRow
          label="중량/규격"
          htmlFor={fieldId("weight")}
          error={errors.weightLabel}
        >
          <AdminInput
            id={fieldId("weight")}
            className={styles.inputMedium}
            value={value.weightLabel}
            maxLength={80}
            disabled={disabled}
            invalid={Boolean(errors.weightLabel)}
            onChange={(event) =>
              change("weightLabel", event.currentTarget.value)
            }
          />
        </FormRow>
        <FormRow label="과세 여부">
          <Toggle
            checked={value.taxable}
            label={value.taxable ? "과세 상품" : "비과세 상품"}
            disabled={readOnly}
            onChange={
              onChange
                ? (checked) => change("taxable", checked)
                : undefined
            }
          />
        </FormRow>
      </FormSection>

      <FormSection
        title="상품 옵션"
        description="옵션별 추가 금액과 재고를 관리합니다."
      >
        <FormRow label="옵션 목록" error={errors.options}>
          <div className={styles.optionActions}>
            <AdminButton
              size="small"
              onClick={onOptionAdd}
              disabled={readOnly || !onOptionAdd}
            >
              옵션 추가
            </AdminButton>
          </div>
          {value.options.length > 0 ? (
            <div className={styles.tableScroll}>
              <table className={styles.optionTable}>
                <thead>
                  <tr>
                    <th>옵션명</th>
                    <th style={{ width: 150 }}>추가금액</th>
                    <th style={{ width: 130 }}>재고</th>
                    <th style={{ width: 90 }}>사용</th>
                    <th style={{ width: 72 }}>관리</th>
                  </tr>
                </thead>
                <tbody>
                  {value.options.map((option) => (
                    <tr key={option.id}>
                      <td>
                        <AdminInput
                          value={option.label}
                          disabled={readOnly || !onOptionChange}
                          aria-label="옵션명"
                          onChange={(event) =>
                            onOptionChange?.(option.id, {
                              label: event.currentTarget.value,
                            })
                          }
                        />
                      </td>
                      <td>
                        <AdminInput
                          type="number"
                          value={option.additionalPrice}
                          disabled={readOnly || !onOptionChange}
                          aria-label="옵션 추가금액"
                          onChange={(event) =>
                            onOptionChange?.(option.id, {
                              additionalPrice: parseNumber(
                                event.currentTarget.value,
                              ),
                            })
                          }
                        />
                      </td>
                      <td>
                        <AdminInput
                          type="number"
                          min={0}
                          value={option.stock}
                          disabled={readOnly || !onOptionChange}
                          aria-label="옵션 재고"
                          onChange={(event) =>
                            onOptionChange?.(option.id, {
                              stock: parseNumber(event.currentTarget.value),
                            })
                          }
                        />
                      </td>
                      <td className={styles.cellCenter}>
                        <Toggle
                          checked={option.enabled}
                          label=""
                          disabled={readOnly}
                          onChange={
                            onOptionChange
                              ? (checked) =>
                                  onOptionChange(option.id, {
                                    enabled: checked,
                                  })
                              : undefined
                          }
                        />
                      </td>
                      <td className={styles.cellCenter}>
                        <AdminButton
                          size="small"
                          variant="danger"
                          onClick={() => onOptionRemove?.(option.id)}
                          disabled={readOnly || !onOptionRemove}
                          aria-label={`${option.label || "옵션"} 삭제`}
                        >
                          삭제
                        </AdminButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className={styles.fieldHelp}>
              단일 상품이면 옵션을 추가하지 않아도 됩니다.
            </p>
          )}
        </FormRow>
      </FormSection>

      <FormSection
        title="상품 설명"
        description="목록에 표시할 요약과 상세 설명을 작성합니다."
      >
        <FormRow
          label="요약 설명"
          htmlFor={fieldId("short-description")}
          error={errors.shortDescription}
        >
          <AdminInput
            id={fieldId("short-description")}
            value={value.shortDescription}
            maxLength={180}
            disabled={disabled}
            invalid={Boolean(errors.shortDescription)}
            onChange={(event) =>
              change("shortDescription", event.currentTarget.value)
            }
          />
        </FormRow>
        <FormRow
          label="상세 설명"
          required
          htmlFor={fieldId("description")}
          error={errors.description}
        >
          <AdminTextarea
            id={fieldId("description")}
            className={styles.editorTextarea}
            value={value.description}
            disabled={disabled}
            invalid={Boolean(errors.description)}
            onChange={(event) =>
              change("description", event.currentTarget.value)
            }
          />
        </FormRow>
      </FormSection>

      <FormSection
        title="대표 이미지"
        description="상품 목록과 상세 화면에 노출할 이미지를 설정합니다."
      >
        <FormRow
          label="대표 이미지"
          required
          htmlFor={fieldId("thumbnail")}
          error={errors.thumbnailUrl}
        >
          <div className={styles.uploadRow}>
            <div className={styles.imagePreview}>
              {value.thumbnailUrl ? (
                // The URL is supplied by the new application; this component
                // never reaches the retired service on its own.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={value.thumbnailUrl} alt={value.thumbnailAlt} />
              ) : (
                <span>이미지 없음</span>
              )}
            </div>
            <div>
              <input
                id={fieldId("thumbnail")}
                className={styles.fileInput}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                disabled={readOnly || !onThumbnailSelect}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  if (file) onThumbnailSelect?.(file);
                  event.currentTarget.value = "";
                }}
              />
              <label
                className={cx(
                  styles.fileButton,
                  (readOnly || !onThumbnailSelect) &&
                    styles.fileButtonDisabled,
                )}
                htmlFor={fieldId("thumbnail")}
              >
                이미지 선택
              </label>
              <p className={styles.fieldHelp}>
                JPG, PNG, WEBP 또는 GIF 파일을 사용할 수 있습니다.
              </p>
            </div>
          </div>
        </FormRow>
        <FormRow
          label="대체 텍스트"
          htmlFor={fieldId("thumbnail-alt")}
          help="이미지를 볼 수 없는 사용자를 위해 상품을 설명하세요."
          error={errors.thumbnailAlt}
        >
          <AdminInput
            id={fieldId("thumbnail-alt")}
            className={styles.inputLong}
            value={value.thumbnailAlt}
            maxLength={160}
            disabled={disabled}
            invalid={Boolean(errors.thumbnailAlt)}
            onChange={(event) =>
              change("thumbnailAlt", event.currentTarget.value)
            }
          />
        </FormRow>
      </FormSection>

      <FormSection title="검색 정보">
        <FormRow
          label="검색 제목"
          htmlFor={fieldId("seo-title")}
          error={errors.seoTitle}
        >
          <AdminInput
            id={fieldId("seo-title")}
            className={styles.inputLong}
            value={value.seoTitle}
            maxLength={70}
            disabled={disabled}
            invalid={Boolean(errors.seoTitle)}
            onChange={(event) =>
              change("seoTitle", event.currentTarget.value)
            }
          />
        </FormRow>
        <FormRow
          label="검색 설명"
          htmlFor={fieldId("seo-description")}
          error={errors.seoDescription}
        >
          <AdminTextarea
            id={fieldId("seo-description")}
            value={value.seoDescription}
            maxLength={180}
            disabled={disabled}
            invalid={Boolean(errors.seoDescription)}
            onChange={(event) =>
              change("seoDescription", event.currentTarget.value)
            }
          />
        </FormRow>
      </FormSection>

      <div className={styles.stickyActions}>
        <AdminButton onClick={onCancel} disabled={!onCancel || saving}>
          취소
        </AdminButton>
        <AdminButton
          type="submit"
          variant="primary"
          size="large"
          loading={saving}
          disabled={readOnly || !onSubmit}
        >
          {submitLabel}
        </AdminButton>
      </div>
    </form>
  );
}

