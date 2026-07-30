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

export type ContentVisibility = "published" | "draft" | "scheduled" | "hidden";
export type EditorCommand =
  | "bold"
  | "italic"
  | "underline"
  | "link"
  | "unordered-list"
  | "ordered-list";

export interface ContentFormValue {
  title: string;
  slug: string;
  body: string;
  visibility: ContentVisibility;
  publishAt: string;
  showInMenu: boolean;
  seoTitle: string;
  seoDescription: string;
}

export type ContentFormErrors = Partial<
  Record<keyof ContentFormValue, string>
>;

export interface ContentFormProps {
  value: ContentFormValue;
  onChange?: <K extends keyof ContentFormValue>(
    field: K,
    value: ContentFormValue[K],
  ) => void;
  onFormat?: (command: EditorCommand) => void;
  onSubmit?: (value: ContentFormValue) => void | Promise<void>;
  onCancel?: () => void;
  errors?: ContentFormErrors;
  saving?: boolean;
  readOnly?: boolean;
  submitLabel?: string;
}

const VISIBILITY_OPTIONS: ReadonlyArray<{
  value: ContentVisibility;
  label: string;
}> = [
  { value: "published", label: "게시" },
  { value: "draft", label: "임시저장" },
  { value: "scheduled", label: "예약게시" },
  { value: "hidden", label: "숨김" },
];

export function ContentForm({
  value,
  onChange,
  onFormat,
  onSubmit,
  onCancel,
  errors = {},
  saving = false,
  readOnly = false,
  submitLabel = "내용 저장",
}: ContentFormProps) {
  const idPrefix = useId();
  const disabled = readOnly || !onChange;
  const id = (name: string) => `${idPrefix}-${name}`;
  const change = <K extends keyof ContentFormValue>(
    field: K,
    nextValue: ContentFormValue[K],
  ) => onChange?.(field, nextValue);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!readOnly) void onSubmit?.(value);
  };

  return (
    <form className={styles.form} onSubmit={submit}>
      <FormSection title="내용 기본정보">
        <FormRow
          label="제목"
          required
          htmlFor={id("title")}
          error={errors.title}
        >
          <AdminInput
            id={id("title")}
            className={styles.inputLong}
            value={value.title}
            maxLength={120}
            disabled={disabled}
            invalid={Boolean(errors.title)}
            onChange={(event) => change("title", event.currentTarget.value)}
          />
        </FormRow>
        <FormRow
          label="고유주소"
          htmlFor={id("slug")}
          help="영문 소문자, 숫자와 하이픈으로 작성하세요."
          error={errors.slug}
        >
          <AdminInput
            id={id("slug")}
            className={styles.inputMedium}
            value={value.slug}
            maxLength={100}
            disabled={disabled}
            invalid={Boolean(errors.slug)}
            onChange={(event) => change("slug", event.currentTarget.value)}
          />
        </FormRow>
        <FormRow label="게시상태" required>
          <div className={styles.radioGroup}>
            {VISIBILITY_OPTIONS.map((option) => (
              <label
                key={option.value}
                className={cx(
                  styles.choiceLabel,
                  disabled && styles.choiceLabelDisabled,
                )}
              >
                <input
                  type="radio"
                  name={`${idPrefix}-visibility`}
                  value={option.value}
                  checked={value.visibility === option.value}
                  disabled={disabled}
                  onChange={() => change("visibility", option.value)}
                />
                {option.label}
              </label>
            ))}
          </div>
        </FormRow>
        {value.visibility === "scheduled" ? (
          <FormRow
            label="게시 예약일"
            required
            htmlFor={id("publish-at")}
            error={errors.publishAt}
          >
            <AdminInput
              id={id("publish-at")}
              className={styles.inputMedium}
              type="datetime-local"
              value={value.publishAt}
              disabled={disabled}
              invalid={Boolean(errors.publishAt)}
              onChange={(event) =>
                change("publishAt", event.currentTarget.value)
              }
            />
          </FormRow>
        ) : null}
        <FormRow label="메뉴 노출">
          <Toggle
            checked={value.showInMenu}
            label={value.showInMenu ? "메뉴에 노출" : "메뉴에서 숨김"}
            disabled={readOnly}
            onChange={
              onChange
                ? (checked) => change("showInMenu", checked)
                : undefined
            }
          />
        </FormRow>
      </FormSection>

      <FormSection title="본문">
        <FormRow
          label="내용"
          required
          htmlFor={id("body")}
          error={errors.body}
        >
          <div className={styles.editorToolbar} aria-label="서식 도구">
            {(
              [
                ["bold", "굵게"],
                ["italic", "기울임"],
                ["underline", "밑줄"],
                ["link", "링크"],
                ["unordered-list", "글머리"],
                ["ordered-list", "번호"],
              ] as const
            ).map(([command, label]) => (
              <button
                key={command}
                type="button"
                className={styles.editorToolbarButton}
                onClick={() => onFormat?.(command)}
                disabled={readOnly || !onFormat}
                aria-label={label}
              >
                {label}
              </button>
            ))}
          </div>
          <AdminTextarea
            id={id("body")}
            className={styles.editorTextarea}
            value={value.body}
            disabled={disabled}
            invalid={Boolean(errors.body)}
            onChange={(event) => change("body", event.currentTarget.value)}
          />
        </FormRow>
      </FormSection>

      <FormSection title="검색 정보">
        <FormRow
          label="검색 제목"
          htmlFor={id("seo-title")}
          error={errors.seoTitle}
        >
          <AdminInput
            id={id("seo-title")}
            className={styles.inputLong}
            value={value.seoTitle}
            maxLength={70}
            disabled={disabled}
            invalid={Boolean(errors.seoTitle)}
            onChange={(event) => change("seoTitle", event.currentTarget.value)}
          />
        </FormRow>
        <FormRow
          label="검색 설명"
          htmlFor={id("seo-description")}
          error={errors.seoDescription}
        >
          <AdminTextarea
            id={id("seo-description")}
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

      <FormActions
        onCancel={onCancel}
        submitLabel={submitLabel}
        saving={saving}
        submitDisabled={readOnly || !onSubmit}
      />
    </form>
  );
}

export interface FaqCategoryOption {
  id: string;
  label: string;
  disabled?: boolean;
}

export interface FaqFormValue {
  categoryId: string;
  question: string;
  answer: string;
  sortOrder: number;
  enabled: boolean;
}

export type FaqFormErrors = Partial<Record<keyof FaqFormValue, string>>;

export interface FaqFormProps {
  value: FaqFormValue;
  categories: FaqCategoryOption[];
  onChange?: <K extends keyof FaqFormValue>(
    field: K,
    value: FaqFormValue[K],
  ) => void;
  onSubmit?: (value: FaqFormValue) => void | Promise<void>;
  onCancel?: () => void;
  errors?: FaqFormErrors;
  saving?: boolean;
  readOnly?: boolean;
  submitLabel?: string;
}

export function FaqForm({
  value,
  categories,
  onChange,
  onSubmit,
  onCancel,
  errors = {},
  saving = false,
  readOnly = false,
  submitLabel = "FAQ 저장",
}: FaqFormProps) {
  const idPrefix = useId();
  const disabled = readOnly || !onChange;
  const id = (name: string) => `${idPrefix}-${name}`;
  const change = <K extends keyof FaqFormValue>(
    field: K,
    nextValue: FaqFormValue[K],
  ) => onChange?.(field, nextValue);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!readOnly) void onSubmit?.(value);
  };

  return (
    <form className={styles.form} onSubmit={submit}>
      <FormSection
        title="FAQ 정보"
        description="자주 묻는 질문과 답변을 관리합니다."
      >
        <FormRow
          label="분류"
          required
          htmlFor={id("category")}
          error={errors.categoryId}
        >
          <AdminSelect
            id={id("category")}
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
        <FormRow
          label="질문"
          required
          htmlFor={id("question")}
          error={errors.question}
        >
          <AdminInput
            id={id("question")}
            value={value.question}
            maxLength={200}
            disabled={disabled}
            invalid={Boolean(errors.question)}
            onChange={(event) => change("question", event.currentTarget.value)}
          />
        </FormRow>
        <FormRow
          label="답변"
          required
          htmlFor={id("answer")}
          error={errors.answer}
        >
          <AdminTextarea
            id={id("answer")}
            className={styles.editorTextarea}
            value={value.answer}
            disabled={disabled}
            invalid={Boolean(errors.answer)}
            onChange={(event) => change("answer", event.currentTarget.value)}
          />
        </FormRow>
        <FormRow
          label="정렬순서"
          htmlFor={id("sort-order")}
          help="숫자가 작을수록 먼저 표시됩니다."
          error={errors.sortOrder}
        >
          <AdminInput
            id={id("sort-order")}
            className={styles.inputShort}
            type="number"
            min={0}
            step={1}
            value={value.sortOrder}
            disabled={disabled}
            invalid={Boolean(errors.sortOrder)}
            onChange={(event) =>
              change("sortOrder", Number(event.currentTarget.value) || 0)
            }
          />
        </FormRow>
        <FormRow label="사용 여부">
          <Toggle
            checked={value.enabled}
            label={value.enabled ? "사용" : "사용 안 함"}
            disabled={readOnly}
            onChange={
              onChange
                ? (checked) => change("enabled", checked)
                : undefined
            }
          />
        </FormRow>
      </FormSection>
      <FormActions
        onCancel={onCancel}
        submitLabel={submitLabel}
        saving={saving}
        submitDisabled={readOnly || !onSubmit}
      />
    </form>
  );
}

export type BannerLinkTarget = "self" | "blank";

export interface BannerPlacementOption {
  id: string;
  label: string;
  disabled?: boolean;
}

export interface BannerFormValue {
  title: string;
  placementId: string;
  desktopImageUrl: string;
  mobileImageUrl: string;
  imageAlt: string;
  linkUrl: string;
  linkTarget: BannerLinkTarget;
  startAt: string;
  endAt: string;
  sortOrder: number;
  enabled: boolean;
}

export type BannerFormErrors = Partial<Record<keyof BannerFormValue, string>>;

export interface BannerFormProps {
  value: BannerFormValue;
  placements: BannerPlacementOption[];
  onChange?: <K extends keyof BannerFormValue>(
    field: K,
    value: BannerFormValue[K],
  ) => void;
  onDesktopImageSelect?: (file: File) => void;
  onMobileImageSelect?: (file: File) => void;
  onRemoveDesktopImage?: () => void;
  onRemoveMobileImage?: () => void;
  onSubmit?: (value: BannerFormValue) => void | Promise<void>;
  onCancel?: () => void;
  errors?: BannerFormErrors;
  saving?: boolean;
  readOnly?: boolean;
  submitLabel?: string;
}

export function BannerForm({
  value,
  placements,
  onChange,
  onDesktopImageSelect,
  onMobileImageSelect,
  onRemoveDesktopImage,
  onRemoveMobileImage,
  onSubmit,
  onCancel,
  errors = {},
  saving = false,
  readOnly = false,
  submitLabel = "배너 저장",
}: BannerFormProps) {
  const idPrefix = useId();
  const disabled = readOnly || !onChange;
  const id = (name: string) => `${idPrefix}-${name}`;
  const change = <K extends keyof BannerFormValue>(
    field: K,
    nextValue: BannerFormValue[K],
  ) => onChange?.(field, nextValue);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!readOnly) void onSubmit?.(value);
  };

  const imageField = (
    kind: "desktop" | "mobile",
    url: string,
    onSelect: ((file: File) => void) | undefined,
    onRemove: (() => void) | undefined,
  ) => {
    const inputId = id(`${kind}-image`);
    return (
      <div className={styles.uploadRow}>
        <div className={styles.imagePreview}>
          {url ? (
            // Image locations are supplied by the new application.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="" />
          ) : (
            <span>이미지 없음</span>
          )}
        </div>
        <div>
          <input
            id={inputId}
            className={styles.fileInput}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            disabled={readOnly || !onSelect}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) onSelect?.(file);
              event.currentTarget.value = "";
            }}
          />
          <div className={styles.fieldInlineWrap}>
            <label
              className={cx(
                styles.fileButton,
                (readOnly || !onSelect) && styles.fileButtonDisabled,
              )}
              htmlFor={inputId}
            >
              이미지 선택
            </label>
            {url ? (
              <AdminButton
                size="small"
                variant="danger"
                onClick={onRemove}
                disabled={readOnly || !onRemove}
              >
                이미지 제거
              </AdminButton>
            ) : null}
          </div>
        </div>
      </div>
    );
  };

  return (
    <form className={styles.form} onSubmit={submit}>
      <FormSection
        title="배너 기본정보"
        description="배너 위치, 노출 기간과 링크를 설정합니다."
      >
        <FormRow
          label="관리 제목"
          required
          htmlFor={id("title")}
          error={errors.title}
        >
          <AdminInput
            id={id("title")}
            className={styles.inputLong}
            value={value.title}
            maxLength={120}
            disabled={disabled}
            invalid={Boolean(errors.title)}
            onChange={(event) => change("title", event.currentTarget.value)}
          />
        </FormRow>
        <FormRow
          label="노출 위치"
          required
          htmlFor={id("placement")}
          error={errors.placementId}
        >
          <AdminSelect
            id={id("placement")}
            className={styles.inputMedium}
            value={value.placementId}
            disabled={disabled}
            onChange={(event) =>
              change("placementId", event.currentTarget.value)
            }
          >
            <option value="">위치를 선택하세요</option>
            {placements.map((placement) => (
              <option
                key={placement.id}
                value={placement.id}
                disabled={placement.disabled}
              >
                {placement.label}
              </option>
            ))}
          </AdminSelect>
        </FormRow>
        <FormRow
          label="PC 이미지"
          required
          error={errors.desktopImageUrl}
        >
          {imageField(
            "desktop",
            value.desktopImageUrl,
            onDesktopImageSelect,
            onRemoveDesktopImage,
          )}
        </FormRow>
        <FormRow label="모바일 이미지" error={errors.mobileImageUrl}>
          {imageField(
            "mobile",
            value.mobileImageUrl,
            onMobileImageSelect,
            onRemoveMobileImage,
          )}
        </FormRow>
        <FormRow
          label="대체 텍스트"
          required
          htmlFor={id("image-alt")}
          error={errors.imageAlt}
        >
          <AdminInput
            id={id("image-alt")}
            className={styles.inputLong}
            value={value.imageAlt}
            maxLength={160}
            disabled={disabled}
            invalid={Boolean(errors.imageAlt)}
            onChange={(event) => change("imageAlt", event.currentTarget.value)}
          />
        </FormRow>
        <FormRow
          label="연결 주소"
          htmlFor={id("link-url")}
          help="새 사이트 내부 주소 또는 신뢰할 수 있는 외부 주소를 입력하세요."
          error={errors.linkUrl}
        >
          <AdminInput
            id={id("link-url")}
            className={styles.inputLong}
            type="url"
            value={value.linkUrl}
            placeholder="https://"
            disabled={disabled}
            invalid={Boolean(errors.linkUrl)}
            onChange={(event) => change("linkUrl", event.currentTarget.value)}
          />
        </FormRow>
        <FormRow label="링크 열기">
          <div className={styles.radioGroup}>
            {(
              [
                ["self", "현재 창"],
                ["blank", "새 창"],
              ] as const
            ).map(([target, label]) => (
              <label
                key={target}
                className={cx(
                  styles.choiceLabel,
                  disabled && styles.choiceLabelDisabled,
                )}
              >
                <input
                  type="radio"
                  name={`${idPrefix}-target`}
                  checked={value.linkTarget === target}
                  disabled={disabled}
                  onChange={() => change("linkTarget", target)}
                />
                {label}
              </label>
            ))}
          </div>
        </FormRow>
        <FormRow label="노출 기간" error={errors.startAt ?? errors.endAt}>
          <div className={styles.dateRange}>
            <AdminInput
              type="datetime-local"
              value={value.startAt}
              disabled={disabled}
              aria-label="배너 노출 시작일"
              onChange={(event) => change("startAt", event.currentTarget.value)}
            />
            <span className={styles.dateSeparator} aria-hidden="true">
              ~
            </span>
            <AdminInput
              type="datetime-local"
              value={value.endAt}
              disabled={disabled}
              aria-label="배너 노출 종료일"
              onChange={(event) => change("endAt", event.currentTarget.value)}
            />
          </div>
        </FormRow>
        <FormRow
          label="정렬순서"
          htmlFor={id("sort-order")}
          error={errors.sortOrder}
        >
          <AdminInput
            id={id("sort-order")}
            className={styles.inputShort}
            type="number"
            min={0}
            step={1}
            value={value.sortOrder}
            disabled={disabled}
            invalid={Boolean(errors.sortOrder)}
            onChange={(event) =>
              change("sortOrder", Number(event.currentTarget.value) || 0)
            }
          />
        </FormRow>
        <FormRow label="사용 여부">
          <Toggle
            checked={value.enabled}
            label={value.enabled ? "사용" : "사용 안 함"}
            disabled={readOnly}
            onChange={
              onChange
                ? (checked) => change("enabled", checked)
                : undefined
            }
          />
        </FormRow>
      </FormSection>
      <FormActions
        onCancel={onCancel}
        submitLabel={submitLabel}
        saving={saving}
        submitDisabled={readOnly || !onSubmit}
      />
    </form>
  );
}

interface FormActionsProps {
  onCancel?: () => void;
  submitLabel: string;
  saving: boolean;
  submitDisabled: boolean;
}

function FormActions({
  onCancel,
  submitLabel,
  saving,
  submitDisabled,
}: FormActionsProps) {
  return (
    <div className={styles.stickyActions}>
      <AdminButton onClick={onCancel} disabled={!onCancel || saving}>
        취소
      </AdminButton>
      <AdminButton
        type="submit"
        variant="primary"
        size="large"
        loading={saving}
        disabled={submitDisabled}
      >
        {submitLabel}
      </AdminButton>
    </div>
  );
}

