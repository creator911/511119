"use client";

import { type ChangeEvent, type FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AdminButton,
  AdminInput,
  AdminSelect,
  AdminTextarea,
  ConfirmDialog,
  FormRow,
  FormSection,
  Notice,
  Toggle,
} from "@/app/components/admin";
import styles from "../../admin-routes.module.css";
import {
  createEmptyProduct,
  isAdminProduct,
  readProductApiError,
  type AdminProduct,
  type AdminProductCategory,
  type ProductSuccessPayload,
} from "./product-contract";

interface ProductEditorProps {
  mode: "create" | "edit";
  categories: AdminProductCategory[];
  productId?: string;
  initialProduct?: AdminProduct | null;
  initialRevision?: number;
  initialMessage?: string;
}

type ProductFieldErrors = Record<string, string>;

const flagOptions = [
  { id: "hit", label: "히트상품" },
  { id: "recommend", label: "추천상품" },
  { id: "new", label: "신상품" },
  { id: "popular", label: "인기상품" },
  { id: "sale", label: "할인상품" },
] as const;

export function ProductEditor({
  mode,
  categories,
  productId,
  initialProduct = null,
  initialRevision = 0,
  initialMessage = "",
}: ProductEditorProps) {
  const router = useRouter();
  const [product, setProduct] = useState<AdminProduct>(
    () => initialProduct ?? createEmptyProduct(),
  );
  const [imagesText, setImagesText] = useState(
    () => initialProduct?.images.join("\n") ?? "",
  );
  const [expectedStock, setExpectedStock] = useState<number | null>(
    () => initialProduct?.stock ?? null,
  );
  const [expectedRevision, setExpectedRevision] = useState(initialRevision);
  const [fieldErrors, setFieldErrors] = useState<ProductFieldErrors>({});
  const [feedback, setFeedback] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(
    initialMessage ? { tone: "success", message: initialMessage } : null,
  );
  const [loading, setLoading] = useState(mode === "edit" && !initialProduct);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (mode !== "edit" || !productId) return;
    let cancelled = false;

    async function loadProduct() {
      setLoading(true);
      try {
        const response = await fetch(
          `/api/admin/products/${encodeURIComponent(productId!)}`,
          { cache: "no-store" },
        );
        if (response.status === 401) {
          router.replace("/adm/login");
          return;
        }
        if (!response.ok) {
          const error = await readProductApiError(
            response,
            "상품 정보를 불러오지 못했습니다.",
          );
          if (!cancelled) {
            setFeedback({ tone: "error", message: error.message });
          }
          return;
        }

        const payload = (await response.json()) as Partial<ProductSuccessPayload>;
        if (
          !isAdminProduct(payload.product) ||
          !Number.isSafeInteger(payload.revision) ||
          Number(payload.revision) < 0
        ) {
          throw new Error("상품 응답 형식이 올바르지 않습니다.");
        }
        if (!cancelled) {
          setProduct(payload.product);
          setImagesText(payload.product.images.join("\n"));
          setExpectedStock(payload.product.stock);
          setExpectedRevision(Number(payload.revision));
          setFieldErrors({});
        }
      } catch (error) {
        if (!cancelled) {
          setFeedback({
            tone: "error",
            message:
              error instanceof Error
                ? error.message
                : "상품 정보를 불러오지 못했습니다.",
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadProduct();
    return () => {
      cancelled = true;
    };
  }, [mode, productId, router]);

  function setField<K extends keyof AdminProduct>(
    field: K,
    value: AdminProduct[K],
  ) {
    setProduct((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
    setFeedback(null);
  }

  function setFlag(flag: keyof AdminProduct["flags"], checked: boolean) {
    setProduct((current) => ({
      ...current,
      flags: { ...current.flags, [flag]: checked },
    }));
    setFeedback(null);
  }

  function updateImages(value: string) {
    setImagesText(value);
    setField(
      "images",
      value
        .split(/\r?\n/)
        .map((image) => image.trim())
        .filter(Boolean),
    );
  }

  function validate(): ProductFieldErrors {
    const errors: ProductFieldErrors = {};
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(product.id)) {
      errors.id =
        "상품코드는 영문·숫자로 시작하고 점, 하이픈, 밑줄을 포함해 80자 이하로 입력해 주세요.";
    }
    if (!product.name.trim() || product.name.trim().length > 200) {
      errors.name = "상품명은 1~200자로 입력해 주세요.";
    }
    if (!categories.some((category) => category.id === product.categoryId)) {
      errors.categoryId = "유효한 상품 분류를 선택해 주세요.";
    }
    for (const field of ["price", "originalPrice", "stock"] as const) {
      if (
        !Number.isSafeInteger(product[field]) ||
        product[field] < 0 ||
        (field === "stock"
          ? product[field] > 10_000_000
          : product[field] > 2_147_483_647)
      ) {
        errors[field] = "0 이상의 정수를 입력해 주세요.";
      }
    }
    if (product.originalPrice > 0 && product.originalPrice < product.price) {
      errors.originalPrice = "정상가는 판매가보다 작을 수 없습니다.";
    }
    if (
      product.images.length > 20 ||
      product.images.some((image) => {
        const legacyImage =
          /^\/legacy\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]+$/u.test(image) &&
          !image.includes("..") &&
          !image.includes("//");
        const uploadedImage =
          /^\/api\/media\/[a-f0-9]{32}\.(?:jpg|png|webp|gif)$/u.test(
            image,
          );
        return image.length > 500 || (!legacyImage && !uploadedImage);
      })
    ) {
      errors.images =
        "이미지는 업로드 주소 또는 /legacy/ 로 시작하는 로컬 주소를 최대 20개까지 사용할 수 있습니다.";
    }
    if (new TextEncoder().encode(product.detailHtml).byteLength > 500_000) {
      errors.detailHtml = "상세 설명은 500KB 이하로 입력해 주세요.";
    }
    if (
      /<\s*script\b|on[a-z]+\s*=|javascript\s*:/i.test(product.detailHtml)
    ) {
      errors.detailHtml =
        "스크립트, 이벤트 속성, javascript 주소는 상품 설명에 사용할 수 없습니다.";
    }
    return errors;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const errors = validate();
    setFieldErrors(errors);
    setFeedback(null);
    if (Object.keys(errors).length > 0) {
      setFeedback({
        tone: "error",
        message: "입력한 상품 정보를 다시 확인해 주세요.",
      });
      return;
    }

    setSaving(true);
    try {
      const endpoint =
        mode === "create"
          ? "/api/admin/products"
          : `/api/admin/products/${encodeURIComponent(productId ?? product.id)}`;
      const response = await fetch(endpoint, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          mode === "edit"
            ? { ...product, expectedStock, expectedRevision }
            : product,
        ),
      });

      if (response.status === 401) {
        router.replace("/adm/login");
        return;
      }
      if (!response.ok) {
        const error = await readProductApiError(
          response,
          mode === "create"
            ? "상품을 등록하지 못했습니다."
            : "상품을 수정하지 못했습니다.",
        );
        setFieldErrors(error.fieldErrors);
        setFeedback({ tone: "error", message: error.message });
        return;
      }

      const payload = (await response.json()) as Partial<ProductSuccessPayload>;
      if (
        !isAdminProduct(payload.product) ||
        !Number.isSafeInteger(payload.revision) ||
        Number(payload.revision) < 0
      ) {
        throw new Error("저장 결과를 확인하지 못했습니다.");
      }
      setProduct(payload.product);
      setImagesText(payload.product.images.join("\n"));
      setExpectedStock(payload.product.stock);
      setExpectedRevision(Number(payload.revision));
      setFieldErrors({});
      setFeedback({
        tone: "success",
        message:
          mode === "create"
            ? "상품이 등록되었습니다."
            : "상품 변경사항이 저장되었습니다.",
      });
      if (mode === "create") {
        router.replace(
          `/adm/products/${encodeURIComponent(payload.product.id)}?created=1`,
        );
      }
      router.refresh();
    } catch (error) {
      setFeedback({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "상품 저장 중 오류가 발생했습니다.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (mode !== "edit" || !productId) return;
    setDeleting(true);
    setFeedback(null);
    try {
      const response = await fetch(
        `/api/admin/products/${encodeURIComponent(productId)}`,
        { method: "DELETE" },
      );
      if (response.status === 401) {
        router.replace("/adm/login");
        return;
      }
      if (!response.ok) {
        const error = await readProductApiError(
          response,
          "상품을 삭제하지 못했습니다.",
        );
        setFeedback({ tone: "error", message: error.message });
        setDeleteOpen(false);
        return;
      }

      setDeleteOpen(false);
      router.replace("/adm/products?deleted=1");
      router.refresh();
    } catch {
      setFeedback({
        tone: "error",
        message: "상품 삭제 중 서버에 연결하지 못했습니다.",
      });
      setDeleteOpen(false);
    } finally {
      setDeleting(false);
    }
  }

  async function handleImageUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    if (
      !["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"].includes(
        file.type.toLowerCase(),
      )
    ) {
      setFieldErrors((current) => ({
        ...current,
        images: "JPEG, PNG, WebP, GIF 이미지만 업로드할 수 있습니다.",
      }));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setFieldErrors((current) => ({
        ...current,
        images: "이미지는 5MB 이하만 업로드할 수 있습니다.",
      }));
      return;
    }

    setUploading(true);
    setFeedback(null);
    try {
      const form = new FormData();
      form.set("file", file);
      const response = await fetch("/api/admin/media", {
        method: "POST",
        body: form,
      });
      if (response.status === 401) {
        router.replace("/adm/login");
        return;
      }
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; url?: string; message?: string }
        | null;
      if (
        !response.ok ||
        !payload?.url ||
        !payload.url.startsWith("/") ||
        payload.url.startsWith("//")
      ) {
        throw new Error(payload?.message || "이미지를 업로드하지 못했습니다.");
      }
      const nextImages = [...new Set([...product.images, payload.url])];
      setProduct((current) => ({ ...current, images: nextImages }));
      setImagesText(nextImages.join("\n"));
      setFieldErrors((current) => {
        const next = { ...current };
        delete next.images;
        return next;
      });
      setFeedback({ tone: "success", message: "이미지가 업로드되었습니다." });
    } catch (error) {
      setFeedback({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "이미지를 업로드하지 못했습니다.",
      });
    } finally {
      setUploading(false);
    }
  }

  const disabled = loading || saving || deleting;

  return (
    <>
      {loading ? <Notice>상품 정보를 불러오는 중입니다.</Notice> : null}
      {feedback ? (
        feedback.tone === "error" ? (
          <Notice tone="danger">{feedback.message}</Notice>
        ) : (
          <div className={styles.successMessage} role="status">
            <strong>완료</strong>
            <span>{feedback.message}</span>
          </div>
        )
      ) : null}

      <form className={styles.editorForm} onSubmit={handleSubmit} noValidate>
        <FormSection
          title="기본 정보"
          description="상품코드, 분류, 상품명과 공개 상태를 설정합니다."
        >
          <FormRow
            label="상품코드"
            required
            htmlFor="product-id"
            error={fieldErrors.id}
            help={mode === "edit" ? "등록 후 상품코드는 변경할 수 없습니다." : undefined}
          >
            <AdminInput
              id="product-id"
              value={product.id}
              maxLength={80}
              readOnly={mode === "edit"}
              disabled={disabled}
              invalid={Boolean(fieldErrors.id)}
              onChange={(event) => setField("id", event.currentTarget.value)}
            />
          </FormRow>
          <FormRow
            label="상품 분류"
            required
            htmlFor="product-category"
            error={fieldErrors.categoryId}
          >
            <AdminSelect
              id="product-category"
              value={product.categoryId}
              disabled={disabled}
              onChange={(event) =>
                setField("categoryId", event.currentTarget.value)
              }
            >
              <option value="">분류를 선택하세요.</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.label}
                </option>
              ))}
            </AdminSelect>
          </FormRow>
          <FormRow
            label="상품명"
            required
            htmlFor="product-name"
            error={fieldErrors.name}
          >
            <AdminInput
              id="product-name"
              value={product.name}
              maxLength={200}
              disabled={disabled}
              invalid={Boolean(fieldErrors.name)}
              onChange={(event) => setField("name", event.currentTarget.value)}
            />
          </FormRow>
          <FormRow label="판매 노출" error={fieldErrors.active}>
            <Toggle
              checked={product.active}
              label={product.active ? "쇼핑몰에 노출" : "쇼핑몰에서 숨김"}
              disabled={disabled}
              onChange={(checked) => setField("active", checked)}
            />
          </FormRow>
        </FormSection>

        <FormSection
          title="가격·재고"
          description="금액과 수량은 0 이상의 정수로 입력합니다."
        >
          <FormRow
            label="판매가"
            required
            htmlFor="product-price"
            error={fieldErrors.price}
          >
            <AdminInput
              id="product-price"
              type="number"
              min={0}
              step={1}
              value={product.price}
              max={2_147_483_647}
              disabled={disabled}
              invalid={Boolean(fieldErrors.price)}
              onChange={(event) =>
                setField("price", Number(event.currentTarget.value))
              }
            />
          </FormRow>
          <FormRow
            label="정상가"
            htmlFor="product-original-price"
            error={fieldErrors.originalPrice}
            help="할인 전 가격이 없으면 0으로 입력합니다."
          >
            <AdminInput
              id="product-original-price"
              type="number"
              min={0}
              step={1}
              value={product.originalPrice}
              max={2_147_483_647}
              disabled={disabled}
              invalid={Boolean(fieldErrors.originalPrice)}
              onChange={(event) =>
                setField("originalPrice", Number(event.currentTarget.value))
              }
            />
          </FormRow>
          <FormRow
            label="재고"
            required
            htmlFor="product-stock"
            error={fieldErrors.stock}
          >
            <AdminInput
              id="product-stock"
              type="number"
              min={0}
              step={1}
              value={product.stock}
              max={10_000_000}
              disabled={disabled}
              invalid={Boolean(fieldErrors.stock)}
              onChange={(event) =>
                setField("stock", Number(event.currentTarget.value))
              }
            />
          </FormRow>
        </FormSection>

        <FormSection title="상품 표시">
          <FormRow label="상품 유형" error={fieldErrors.flags}>
            <div className={styles.toggleGrid}>
              {flagOptions.map((flag) => (
                <Toggle
                  key={flag.id}
                  checked={product.flags[flag.id]}
                  label={flag.label}
                  disabled={disabled}
                  onChange={(checked) => setFlag(flag.id, checked)}
                />
              ))}
            </div>
          </FormRow>
          <FormRow label="제조사" htmlFor="product-maker">
            <AdminInput
              id="product-maker"
              value={product.maker}
              maxLength={200}
              disabled={disabled}
              onChange={(event) => setField("maker", event.currentTarget.value)}
            />
          </FormRow>
          <FormRow label="원산지" htmlFor="product-origin">
            <AdminInput
              id="product-origin"
              value={product.origin}
              maxLength={200}
              disabled={disabled}
              onChange={(event) => setField("origin", event.currentTarget.value)}
            />
          </FormRow>
          <FormRow label="브랜드" htmlFor="product-brand">
            <AdminInput
              id="product-brand"
              value={product.brand}
              maxLength={200}
              disabled={disabled}
              onChange={(event) => setField("brand", event.currentTarget.value)}
            />
          </FormRow>
          <FormRow label="모델명" htmlFor="product-model">
            <AdminInput
              id="product-model"
              value={product.model}
              maxLength={200}
              disabled={disabled}
              onChange={(event) => setField("model", event.currentTarget.value)}
            />
          </FormRow>
        </FormSection>

        <FormSection
          title="상품 설명"
          description="요약 설명과 상세 페이지 내용을 입력합니다."
        >
          <FormRow label="요약 설명" htmlFor="product-basic">
            <AdminTextarea
              id="product-basic"
              value={product.basic}
              maxLength={2_000}
              disabled={disabled}
              onChange={(event) => setField("basic", event.currentTarget.value)}
            />
          </FormRow>
          <FormRow
            label="상세 설명 HTML"
            htmlFor="product-detail"
            error={fieldErrors.detailHtml}
            help="스크립트와 이벤트 속성은 저장할 수 없습니다."
          >
            <AdminTextarea
              id="product-detail"
              className={styles.detailEditor}
              value={product.detailHtml}
              disabled={disabled}
              invalid={Boolean(fieldErrors.detailHtml)}
              onChange={(event) =>
                setField("detailHtml", event.currentTarget.value)
              }
            />
          </FormRow>
        </FormSection>

        <FormSection
          title="상품 이미지"
          description="이미지를 업로드하거나 동일 사이트의 로컬 경로를 한 줄에 하나씩 입력합니다."
        >
          <FormRow
            label="이미지 경로"
            htmlFor="product-images"
            error={fieldErrors.images}
          >
            <AdminTextarea
              id="product-images"
              value={imagesText}
              disabled={disabled || uploading}
              invalid={Boolean(fieldErrors.images)}
              placeholder={"/api/media/상품이미지.webp\n/legacy/products/상품코드/01.jpg"}
              onChange={(event) => updateImages(event.currentTarget.value)}
            />
          </FormRow>
          <FormRow label="이미지 업로드" help="JPG, PNG, WebP 등 5MB 이하 이미지">
            <label className={styles.uploadButton}>
              <input
                className={styles.visuallyHidden}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                disabled={disabled || uploading}
                onChange={handleImageUpload}
              />
              {uploading ? "업로드 중…" : "이미지 선택"}
            </label>
          </FormRow>
        </FormSection>

        <div className={styles.editorActions}>
          <div>
            {mode === "edit" ? (
              <AdminButton
                type="button"
                variant="danger"
                disabled={disabled}
                onClick={() => setDeleteOpen(true)}
              >
                상품 삭제
              </AdminButton>
            ) : null}
          </div>
          <div className={styles.toolbarGroup}>
            <AdminButton
              type="button"
              disabled={disabled}
              onClick={() => router.push("/adm/products")}
            >
              목록으로
            </AdminButton>
            <AdminButton
              type="submit"
              variant="primary"
              loading={saving}
              disabled={disabled}
            >
              {mode === "create" ? "상품 등록" : "변경사항 저장"}
            </AdminButton>
          </div>
        </div>
      </form>

      <ConfirmDialog
        open={deleteOpen}
        title="상품 삭제"
        message={`“${product.name || product.id}” 상품을 삭제하시겠습니까?`}
        warning="삭제 후에는 상품 목록과 공개 페이지에서 더 이상 조회할 수 없습니다."
        confirmLabel="삭제"
        destructive
        busy={deleting}
        onConfirm={handleDelete}
        onClose={() => {
          if (!deleting) setDeleteOpen(false);
        }}
      />
    </>
  );
}
