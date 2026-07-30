"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AdminButton,
  ConfirmDialog,
  DataTable,
  Notice,
  StatusBadge,
  type DataColumn,
  type DataRowAction,
  type RowKey,
} from "@/app/components/admin";
import styles from "../../admin-routes.module.css";
import {
  isAdminProduct,
  readProductApiError,
  type AdminProduct,
  type AdminProductCategory,
  type ProductListSuccessPayload,
} from "./product-contract";
import { ProductBulkManager } from "./ProductBulkManager";

interface ProductsTableProps {
  initialProducts: AdminProduct[];
  categories: AdminProductCategory[];
  stockMode?: boolean;
}

const PAGE_SIZE = 20;
const flagLabels = {
  hit: "히트",
  recommend: "추천",
  new: "최신",
  popular: "인기",
  sale: "할인",
} as const;

export function ProductsTable({
  initialProducts,
  categories,
  stockMode = false,
}: ProductsTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [products, setProducts] = useState(initialProducts);
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(
    searchParams.get("deleted") === "1"
      ? { tone: "success", message: "상품이 삭제되었습니다." }
      : null,
  );
  const [productToDelete, setProductToDelete] =
    useState<AdminProduct | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<RowKey>>(new Set());
  const [bulkVisible, setBulkVisible] = useState(false);

  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category.label])),
    [categories],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadProducts() {
      setLoading(true);
      try {
        const response = await fetch("/api/admin/products", {
          cache: "no-store",
        });
        if (response.status === 401) {
          router.replace("/adm/login");
          return;
        }
        if (!response.ok) {
          const error = await readProductApiError(
            response,
            "최신 상품 목록을 불러오지 못했습니다.",
          );
          if (!cancelled) {
            setFeedback({
              tone: "error",
              message: `${error.message} 현재 화면에는 기본 카탈로그가 표시됩니다.`,
            });
          }
          return;
        }

        const payload =
          (await response.json()) as Partial<ProductListSuccessPayload>;
        if (
          !Array.isArray(payload.products) ||
          !payload.products.every(isAdminProduct)
        ) {
          throw new Error("상품 목록 응답 형식이 올바르지 않습니다.");
        }
        if (!cancelled) setProducts(payload.products);
      } catch (error) {
        if (!cancelled) {
          setFeedback({
            tone: "error",
            message: `${
              error instanceof Error
                ? error.message
                : "최신 상품 목록을 불러오지 못했습니다."
            } 현재 화면에는 기본 카탈로그가 표시됩니다.`,
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadProducts();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const filteredProducts = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("ko-KR");
    return products.filter((product) => {
      const matchesQuery =
        !needle ||
        `${product.name} ${product.id} ${product.model}`
          .toLocaleLowerCase("ko-KR")
          .includes(needle);
      const matchesCategory =
        !categoryId || product.categoryId === categoryId;
      return matchesQuery && matchesCategory;
    });
  }, [categoryId, products, query]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visibleProducts = filteredProducts.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  const columns: DataColumn<AdminProduct>[] = [
    {
      id: "productCode",
      header: "상품코드",
      width: 112,
      align: "center",
      render: (product) => product.id,
    },
    {
      id: "image",
      header: "이미지",
      width: 72,
      align: "center",
      render: (product) => (
        <Image
          className={styles.productImage}
          src={product.images[0] || "/legacy/logo.png"}
          alt=""
          width={46}
          height={46}
          unoptimized
        />
      ),
    },
    {
      id: "product",
      header: "상품명",
      align: "left",
      render: (product) => (
        <div>
          <div className={styles.productName}>{product.name}</div>
          <div className={styles.productMeta}>
            {categoryById.get(product.categoryId) ?? "미분류"} · {product.basic}
          </div>
        </div>
      ),
    },
    {
      id: "price",
      header: "판매가격",
      width: 105,
      align: "right",
      render: (product) => (
        <span className={styles.money}>
          {product.price.toLocaleString("ko-KR")}원
        </span>
      ),
    },
    {
      id: "originalPrice",
      header: "시중가격",
      width: 105,
      align: "right",
      render: (product) => (
        <span className={styles.money}>
          {product.originalPrice.toLocaleString("ko-KR")}원
        </span>
      ),
    },
    {
      id: "stock",
      header: "재고",
      width: 82,
      align: "right",
      render: (product) => product.stock.toLocaleString("ko-KR"),
    },
    {
      id: "status",
      header: "판매",
      width: 76,
      align: "center",
      render: (product) =>
        product.active ? (
          <StatusBadge
            tone={
              product.stock > 0 && !product.soldOut
                ? "success"
                : "warning"
            }
          >
            {product.stock > 0 && !product.soldOut ? "판매중" : "품절"}
          </StatusBadge>
        ) : (
          <StatusBadge>숨김</StatusBadge>
        ),
    },
    {
      id: "flags",
      header: "표시",
      width: 120,
      align: "center",
      render: (product) => {
        const labels = Object.entries(product.flags)
          .filter(([, enabled]) => enabled)
          .map(([flag]) => flagLabels[flag as keyof typeof flagLabels]);
        return labels.length ? labels.join(" · ") : "-";
      },
    },
  ];

  const rowActions: DataRowAction<AdminProduct>[] = [
    {
      id: "preview",
      label: "보기",
      onClick: (product) =>
        window.open(
          `/shop/item.php?it_id=${encodeURIComponent(product.id)}`,
          "_blank",
          "noopener,noreferrer",
        ),
      ariaLabel: (product) => `${product.name} 공개 페이지 보기`,
    },
    {
      id: "edit",
      label: "수정",
      variant: "primary",
      onClick: (product) =>
        router.push(`/adm/products/${encodeURIComponent(product.id)}`),
      disabled: () => deleting,
      ariaLabel: (product) => `${product.name} 수정`,
    },
    {
      id: "delete",
      label: "삭제",
      variant: "danger",
      onClick: setProductToDelete,
      disabled: () => deleting,
      ariaLabel: (product) => `${product.name} 삭제`,
    },
  ];

  function updateQuery(value: string) {
    setQuery(value);
    setPage(1);
  }

  function updateCategory(value: string) {
    setCategoryId(value);
    setPage(1);
  }

  async function handleDelete() {
    if (!productToDelete) return;
    setDeleting(true);
    setFeedback(null);
    try {
      const response = await fetch(
        `/api/admin/products/${encodeURIComponent(productToDelete.id)}`,
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
        setProductToDelete(null);
        return;
      }

      setProducts((current) =>
        current.filter((product) => product.id !== productToDelete.id),
      );
      setProductToDelete(null);
      setFeedback({ tone: "success", message: "상품이 삭제되었습니다." });
      router.refresh();
    } catch {
      setFeedback({
        tone: "error",
        message: "상품 삭제 중 서버에 연결하지 못했습니다.",
      });
      setProductToDelete(null);
    } finally {
      setDeleting(false);
    }
  }

  async function handleBulkImported() {
    const response = await fetch("/api/admin/products", {
      cache: "no-store",
    });
    if (response.status === 401) {
      router.replace("/adm/login");
      return;
    }
    if (!response.ok) {
      throw new Error("등록 후 상품 목록을 새로 불러오지 못했습니다.");
    }
    const payload =
      (await response.json()) as Partial<ProductListSuccessPayload>;
    if (
      !Array.isArray(payload.products) ||
      !payload.products.every(isAdminProduct)
    ) {
      throw new Error("상품 목록 응답 형식이 올바르지 않습니다.");
    }
    setProducts(payload.products);
    setPage(1);
    router.refresh();
  }

  function editSelectedProduct() {
    if (selectedKeys.size !== 1) {
      setFeedback({
        tone: "error",
        message: "수정할 상품 한 개를 선택해 주세요.",
      });
      return;
    }
    const [selectedId] = selectedKeys;
    router.push(`/adm/products/${encodeURIComponent(String(selectedId))}`);
  }

  async function deleteSelectedProducts() {
    if (selectedKeys.size === 0) {
      setFeedback({
        tone: "error",
        message: "삭제할 상품을 선택해 주세요.",
      });
      return;
    }
    if (
      !window.confirm(
        `선택한 ${selectedKeys.size.toLocaleString("ko-KR")}개 상품을 삭제하시겠습니까?`,
      )
    ) {
      return;
    }

    const ids = [...selectedKeys].map(String);
    setDeleting(true);
    setFeedback(null);
    try {
      for (const id of ids) {
        const response = await fetch(
          `/api/admin/products/${encodeURIComponent(id)}`,
          { method: "DELETE" },
        );
        if (response.status === 401) {
          router.replace("/adm/login");
          return;
        }
        if (!response.ok) {
          const error = await readProductApiError(
            response,
            `${id} 상품을 삭제하지 못했습니다.`,
          );
          throw new Error(error.message);
        }
      }
      const deleted = new Set(ids);
      setProducts((current) =>
        current.filter((product) => !deleted.has(product.id)),
      );
      setSelectedKeys(new Set());
      setFeedback({
        tone: "success",
        message: `${ids.length.toLocaleString("ko-KR")}개 상품을 삭제했습니다.`,
      });
      router.refresh();
    } catch (error) {
      setFeedback({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "선택 상품을 삭제하지 못했습니다.",
      });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className={`${styles.contentStack} legacy-product-page`}>
      <div className="btn_fixed_top legacy-product-actions">
        {!stockMode ? (
          <AdminButton
            variant="primary"
            onClick={() => router.push("/adm/products/new")}
          >
            상품등록
          </AdminButton>
        ) : null}
        <AdminButton onClick={() => setBulkVisible((current) => !current)}>
          {stockMode ? "재고일괄수정" : "상품일괄등록"}
        </AdminButton>
        <AdminButton onClick={editSelectedProduct}>선택수정</AdminButton>
        <AdminButton
          onClick={() => void deleteSelectedProducts()}
          disabled={deleting}
        >
          선택삭제
        </AdminButton>
      </div>

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
      {loading ? <Notice>최신 상품 목록을 확인하는 중입니다.</Notice> : null}

      <div className="local_ov legacy-product-summary">
        <span className="legacy-summary-label">전체목록</span>
        <span className="legacy-summary-count">
          {stockMode ? "재고관리 상품" : "등록된 상품"}{" "}
          <strong>{filteredProducts.length.toLocaleString("ko-KR")}</strong>건
        </span>
      </div>

      <form
        className="local_sch legacy-product-search"
        onSubmit={(event) => event.preventDefault()}
      >
        <label className="sound_only" htmlFor="legacy-product-category">
          상품 분류
        </label>
        <select
          id="legacy-product-category"
          value={categoryId}
          onChange={(event) => updateCategory(event.currentTarget.value)}
        >
          <option value="">전체분류</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.label}
            </option>
          ))}
        </select>
        <label className="sound_only" htmlFor="legacy-product-search-kind">
          검색 기준
        </label>
        <select id="legacy-product-search-kind" defaultValue="name">
          <option value="name">상품명</option>
          <option value="code">상품코드</option>
        </select>
        <label className="sound_only" htmlFor="legacy-product-query">
          검색어
        </label>
        <input
          id="legacy-product-query"
          type="search"
          value={query}
          onChange={(event) => updateQuery(event.currentTarget.value)}
        />
        <button type="submit">검색</button>
      </form>

      {bulkVisible ? (
        <ProductBulkManager onImported={handleBulkImported} />
      ) : null}

      <div>
        <DataTable
          caption="상품관리"
          rows={visibleProducts}
          columns={columns}
          getRowKey={(product) => product.id}
          rowActions={rowActions}
          selectable
          selectedKeys={selectedKeys}
          onSelectionChange={setSelectedKeys}
          page={safePage}
          totalPages={totalPages}
          onPageChange={setPage}
          loading={loading && products.length === 0}
          emptyTitle="검색된 상품이 없습니다."
          emptyDescription="상품명이나 분류 조건을 변경해 보세요."
        />
      </div>

      <ConfirmDialog
        open={Boolean(productToDelete)}
        title="상품 삭제"
        message={`“${productToDelete?.name ?? ""}” 상품을 삭제하시겠습니까?`}
        warning="삭제 후에는 상품 목록과 공개 페이지에서 더 이상 조회할 수 없습니다."
        confirmLabel="삭제"
        destructive
        busy={deleting}
        onConfirm={handleDelete}
        onClose={() => {
          if (!deleting) setProductToDelete(null);
        }}
      />
    </div>
  );
}
