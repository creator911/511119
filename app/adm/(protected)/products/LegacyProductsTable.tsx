"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  isAdminProduct,
  readProductApiError,
  type AdminProduct,
  type AdminProductCategory,
  type ProductListSuccessPayload,
} from "./product-contract";
import { ProductBulkManager } from "./ProductBulkManager";
import { mergeLegacyAdminCategoryOptions } from "@/lib/legacy-admin-category-options";

interface LegacyProductsTableProps {
  initialProducts: AdminProduct[];
  categories: AdminProductCategory[];
}

interface ProductDraft {
  primaryCategoryId: string;
  secondaryCategoryId: string;
  tertiaryCategoryId: string;
  sortOrder: string;
  active: boolean;
  soldOut: boolean;
  name: string;
  price: string;
  originalPrice: string;
  stock: string;
  desktopSkin: string;
  mobileSkin: string;
}

type SearchField =
  | "name"
  | "id"
  | "maker"
  | "origin"
  | "sellerEmail";
type SortField =
  | "id"
  | "sortOrder"
  | "active"
  | "soldOut"
  | "viewCount"
  | "name"
  | "price"
  | "originalPrice"
  | "rewardPoints"
  | "stock";

const PAGE_SIZE = 15;

export function LegacyProductsTable({
  initialProducts,
  categories,
}: LegacyProductsTableProps) {
  const router = useRouter();
  const legacySearchCategories = useMemo(
    () =>
      mergeLegacyAdminCategoryOptions(
        categories.map((category) => ({
          id: category.id,
          name: category.label,
        })),
      ),
    [categories],
  );
  const [products, setProducts] = useState(initialProducts);
  const [drafts, setDrafts] = useState<Record<string, ProductDraft>>(() =>
    buildDrafts(initialProducts),
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [categoryId, setCategoryId] = useState("");
  const [searchField, setSearchField] = useState<SearchField>("name");
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("id");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [bulkVisible, setBulkVisible] = useState(false);
  const [feedback, setFeedback] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function refreshProducts() {
      try {
        const response = await fetch("/api/admin/products", {
          cache: "no-store",
        });
        if (response.status === 401) {
          router.replace("/adm/login");
          return;
        }
        if (!response.ok) return;
        const payload =
          (await response.json()) as Partial<ProductListSuccessPayload>;
        if (
          !Array.isArray(payload.products) ||
          !payload.products.every(isAdminProduct)
        ) {
          return;
        }
        if (!cancelled) {
          setProducts(payload.products);
          setDrafts(buildDrafts(payload.products));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void refreshProducts();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const filteredProducts = useMemo(() => {
    const needle = searchQuery.trim().toLocaleLowerCase("ko-KR");
    const rows = products.filter((product) => {
      const matchesCategory =
        !categoryId ||
        [
          product.primaryCategoryId,
          product.secondaryCategoryId,
          product.tertiaryCategoryId,
          product.categoryId,
        ].includes(categoryId);
      if (!matchesCategory || !needle) return matchesCategory;
      const value =
        searchField === "id"
          ? product.id
          : searchField === "maker"
            ? product.maker
            : searchField === "origin"
              ? product.origin
              : searchField === "sellerEmail"
                ? ""
                : product.name;
      return value.toLocaleLowerCase("ko-KR").includes(needle);
    });
    return rows.sort((left, right) => {
      const leftValue = sortValue(left, sortField);
      const rightValue = sortValue(right, sortField);
      const comparison =
        typeof leftValue === "number" && typeof rightValue === "number"
          ? leftValue - rightValue
          : String(leftValue).localeCompare(String(rightValue), "ko-KR", {
              numeric: true,
              sensitivity: "base",
            });
      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [
    categoryId,
    products,
    searchField,
    searchQuery,
    sortDirection,
    sortField,
  ]);
  const totalPages = Math.max(
    1,
    Math.ceil(filteredProducts.length / PAGE_SIZE),
  );
  const safePage = Math.min(page, totalPages);
  const visibleProducts = filteredProducts.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );
  const allVisibleSelected =
    visibleProducts.length > 0 &&
    visibleProducts.every((product) => selectedIds.has(product.id));

  function updateDraft(
    id: string,
    field: keyof ProductDraft,
    value: string | boolean,
  ) {
    setDrafts((current) => ({
      ...current,
      [id]: {
        ...(current[id] ?? buildDraft(productById(products, id))),
        [field]: value,
      },
    }));
  }

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection(field === "name" ? "asc" : "desc");
    }
    setPage(1);
  }

  function toggleRow(id: string, checked: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAllVisible(checked: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const product of visibleProducts) {
        if (checked) next.add(product.id);
        else next.delete(product.id);
      }
      return next;
    });
  }

  async function saveSelected() {
    const selected = products.filter((product) =>
      selectedIds.has(product.id),
    );
    if (selected.length === 0) {
      setFeedback({ tone: "error", message: "수정할 상품을 선택해 주세요." });
      return;
    }
    if (selected.length > PAGE_SIZE) {
      setFeedback({
        tone: "error",
        message: "현재 페이지의 상품 15개까지 선택수정할 수 있습니다.",
      });
      return;
    }
    let rows: Array<Record<string, unknown>>;
    try {
      rows = selected.map((product) => {
        const draft = drafts[product.id] ?? buildDraft(product);
        return {
          id: product.id,
          expectedRevision: product.revision,
          expectedStock: product.stock,
          expectedStockControlRevision: product.stockControlRevision,
          primaryCategoryId: draft.primaryCategoryId,
          secondaryCategoryId: draft.secondaryCategoryId,
          tertiaryCategoryId: draft.tertiaryCategoryId,
          sortOrder: draftInteger(draft.sortOrder, "순서", true),
          active: draft.active,
          soldOut: draft.soldOut,
          name: requiredText(draft.name, "상품명"),
          price: draftInteger(draft.price, "판매가격"),
          originalPrice: draftInteger(draft.originalPrice, "시중가격"),
          stock: draftInteger(draft.stock, "재고"),
          desktopSkin: draft.desktopSkin,
          mobileSkin: draft.mobileSkin,
        };
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        message:
          error instanceof Error ? error.message : "입력값을 확인해 주세요.",
      });
      return;
    }

    setBusy(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/admin/products/list", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      if (response.status === 401) {
        router.replace("/adm/login");
        return;
      }
      if (!response.ok) {
        const error = await readProductApiError(
          response,
          "상품목록을 수정하지 못했습니다.",
        );
        throw new Error(error.message);
      }
      const payload = (await response.json()) as {
        products?: unknown[];
        updated?: number;
      };
      if (
        !Array.isArray(payload.products) ||
        !payload.products.every(isAdminProduct)
      ) {
        throw new Error("상품목록 저장 응답 형식이 올바르지 않습니다.");
      }
      const updatedProducts = payload.products;
      const updatedById = new Map(
        updatedProducts.map((product) => [product.id, product]),
      );
      setProducts((current) =>
        current.map((product) => updatedById.get(product.id) ?? product),
      );
      setDrafts((current) => ({
        ...current,
        ...buildDrafts(updatedProducts),
      }));
      setSelectedIds(new Set());
      setFeedback({
        tone: "success",
        message: `${updatedProducts.length.toLocaleString("ko-KR")}개 상품을 수정했습니다.`,
      });
      router.refresh();
    } catch (error) {
      setFeedback({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "상품목록을 수정하지 못했습니다.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function cloneProduct(source: AdminProduct) {
    const proposedId = `${source.id}-copy`;
    const newId = window.prompt("새 상품코드를 입력해 주세요.", proposedId);
    if (newId === null) return;
    setBusy(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/admin/products/clone", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sourceId: source.id,
          newId: newId.trim(),
          expectedRevision: source.revision,
          expectedStock: source.stock,
          expectedStockControlRevision: source.stockControlRevision,
        }),
      });
      if (response.status === 401) {
        router.replace("/adm/login");
        return;
      }
      if (!response.ok) {
        const error = await readProductApiError(
          response,
          "상품을 복사하지 못했습니다.",
        );
        throw new Error(error.message);
      }
      const payload = (await response.json()) as { product?: unknown };
      if (!isAdminProduct(payload.product)) {
        throw new Error("상품 복사 응답 형식이 올바르지 않습니다.");
      }
      setProducts((current) => [payload.product as AdminProduct, ...current]);
      setDrafts((current) => ({
        ...current,
        [(payload.product as AdminProduct).id]: buildDraft(
          payload.product as AdminProduct,
        ),
      }));
      setPage(1);
      setFeedback({
        tone: "success",
        message: `${source.name} 상품을 ${newId.trim()} 코드로 복사했습니다.`,
      });
      router.refresh();
    } catch (error) {
      setFeedback({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "상품을 복사하지 못했습니다.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function deleteSelected() {
    const selected = products.filter((product) =>
      selectedIds.has(product.id),
    );
    if (selected.length === 0) {
      setFeedback({ tone: "error", message: "삭제할 상품을 선택해 주세요." });
      return;
    }
    if (
      !window.confirm(
        "선택한 자료를 정말 삭제하시겠습니까?\n\n한번 삭제한 자료는 복구할 수 없습니다.",
      )
    ) {
      return;
    }
    setBusy(true);
    setFeedback(null);
    const deletedIds: string[] = [];
    try {
      for (const product of selected) {
        const response = await fetch(
          `/api/admin/products/${encodeURIComponent(product.id)}`,
          { method: "DELETE" },
        );
        if (!response.ok) {
          const error = await readProductApiError(
            response,
            `${product.id} 상품을 삭제하지 못했습니다.`,
          );
          throw new Error(error.message);
        }
        deletedIds.push(product.id);
      }
      const deleted = new Set(deletedIds);
      setProducts((current) =>
        current.filter((product) => !deleted.has(product.id)),
      );
      setSelectedIds(new Set());
      setFeedback({
        tone: "success",
        message: `${deletedIds.length.toLocaleString("ko-KR")}개 상품을 삭제했습니다.`,
      });
      router.refresh();
    } catch (error) {
      if (deletedIds.length > 0) {
        const deleted = new Set(deletedIds);
        setProducts((current) =>
          current.filter((product) => !deleted.has(product.id)),
        );
      }
      setFeedback({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "선택 상품을 삭제하지 못했습니다.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function refreshAfterBulkImport() {
    const response = await fetch("/api/admin/products", {
      cache: "no-store",
    });
    if (response.status === 401) {
      router.replace("/adm/login");
      return;
    }
    if (!response.ok) {
      throw new Error("등록된 상품목록을 다시 불러오지 못했습니다.");
    }
    const payload =
      (await response.json()) as Partial<ProductListSuccessPayload>;
    if (
      !Array.isArray(payload.products) ||
      !payload.products.every(isAdminProduct)
    ) {
      throw new Error("상품목록 응답 형식이 올바르지 않습니다.");
    }
    setProducts(payload.products);
    setDrafts(buildDrafts(payload.products));
    setSelectedIds(new Set());
    setPage(1);
    router.refresh();
  }

  return (
    <div className="legacy-product-page">
      <div className="btn_fixed_top legacy-product-actions">
        <button
          type="button"
          className="btn btn_01"
          onClick={() => router.push("/adm/products/new")}
          disabled={busy}
        >
          상품등록
        </button>
        <button
          type="button"
          className="btn btn_02"
          onClick={() => setBulkVisible((current) => !current)}
          disabled={busy}
        >
          상품일괄등록
        </button>
        <button
          type="button"
          className="btn btn_02"
          onClick={() => void saveSelected()}
          disabled={busy}
        >
          선택수정
        </button>
        <button
          type="button"
          className="btn btn_02"
          onClick={() => void deleteSelected()}
          disabled={busy}
        >
          선택삭제
        </button>
      </div>

      {feedback ? (
        <div
          className={`legacy-product-feedback ${feedback.tone}`}
          role={feedback.tone === "error" ? "alert" : "status"}
        >
          {feedback.message}
        </div>
      ) : null}

      <div className="local_ov01 local_ov legacy-product-summary">
        <button
          type="button"
          className="ov_listall"
          onClick={() => {
            setCategoryId("");
            setSearchInput("");
            setSearchQuery("");
            setPage(1);
          }}
        >
          전체목록
        </button>
        <span className="btn_ov01">
          <span className="ov_txt">등록된 상품</span>
          <span className="ov_num">
            {" "}
            {filteredProducts.length.toLocaleString("ko-KR")}건
          </span>
        </span>
      </div>

      <form
        className="local_sch01 local_sch legacy-product-search"
        onSubmit={(event) => {
          event.preventDefault();
          setSearchQuery(searchInput);
          setPage(1);
        }}
      >
        <label htmlFor="legacy-product-category" className="sound_only">
          분류선택
        </label>
        <select
          id="legacy-product-category"
          value={categoryId}
          onChange={(event) => {
            setCategoryId(event.currentTarget.value);
            setPage(1);
          }}
        >
          <option value="">전체분류</option>
          {legacySearchCategories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        <label htmlFor="legacy-product-search-field" className="sound_only">
          검색대상
        </label>
        <select
          id="legacy-product-search-field"
          value={searchField}
          onChange={(event) =>
            setSearchField(event.currentTarget.value as SearchField)
          }
        >
          <option value="name">상품명</option>
          <option value="id">상품코드</option>
          <option value="maker">제조사</option>
          <option value="origin">원산지</option>
          <option value="sellerEmail">판매자 e-mail</option>
        </select>
        <label htmlFor="legacy-product-query" className="sound_only">
          검색어
        </label>
        <input
          id="legacy-product-query"
          type="text"
          className="frm_input"
          value={searchInput}
          onChange={(event) => setSearchInput(event.currentTarget.value)}
        />
        <input type="submit" value="검색" className="btn_submit" />
      </form>

      {bulkVisible ? (
        <ProductBulkManager onImported={refreshAfterBulkImport} />
      ) : null}

      <form
        id="fitemlistupdate"
        onSubmit={(event) => {
          event.preventDefault();
          void saveSelected();
        }}
        autoComplete="off"
      >
        <div className="tbl_head01 tbl_wrap legacy-itemlist-wrap">
          <table>
            <caption>상품관리 목록</caption>
            <colgroup>
              <col className="legacy-col-check" />
              <col className="legacy-col-code" />
              <col className="legacy-col-image" />
              <col className="legacy-col-name" />
              <col className="legacy-col-price" />
              <col className="legacy-col-original-price" />
              <col className="legacy-col-skin" />
              <col className="legacy-col-order" />
              <col className="legacy-col-active" />
              <col className="legacy-col-soldout" />
              <col className="legacy-col-view" />
              <col className="legacy-col-actions" />
            </colgroup>
            <thead>
              <tr>
                <th scope="col" rowSpan={3}>
                  <label htmlFor="chkall" className="sound_only">
                    상품 전체
                  </label>
                  <input
                    id="chkall"
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={(event) =>
                      toggleAllVisible(event.currentTarget.checked)
                    }
                  />
                </th>
                <SortHeader
                  rowSpan={3}
                  label="상품코드"
                  field="id"
                  onSort={toggleSort}
                />
                <th scope="col" colSpan={5}>
                  분류
                </th>
                <SortHeader
                  rowSpan={3}
                  label="순서"
                  field="sortOrder"
                  onSort={toggleSort}
                />
                <SortHeader
                  rowSpan={3}
                  label="판매"
                  field="active"
                  onSort={toggleSort}
                />
                <SortHeader
                  rowSpan={3}
                  label="품절"
                  field="soldOut"
                  onSort={toggleSort}
                />
                <SortHeader
                  rowSpan={3}
                  label="조회"
                  field="viewCount"
                  onSort={toggleSort}
                />
                <th scope="col" rowSpan={3}>
                  관리
                </th>
              </tr>
              <tr>
                <th scope="col" rowSpan={2} id="th_img">
                  이미지
                </th>
                <SortHeader
                  rowSpan={2}
                  id="th_pc_title"
                  label="상품명"
                  field="name"
                  onSort={toggleSort}
                />
                <SortHeader
                  id="th_amt"
                  label="판매가격"
                  field="price"
                  onSort={toggleSort}
                />
                <SortHeader
                  id="th_camt"
                  label="시중가격"
                  field="originalPrice"
                  onSort={toggleSort}
                />
                <th scope="col" id="th_skin">
                  PC스킨
                </th>
              </tr>
              <tr>
                <SortHeader
                  id="th_pt"
                  label="포인트"
                  field="rewardPoints"
                  onSort={toggleSort}
                />
                <SortHeader
                  id="th_qty"
                  label="재고"
                  field="stock"
                  onSort={toggleSort}
                />
                <th scope="col" id="th_mskin">
                  모바일스킨
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleProducts.map((product, index) => {
                const draft = drafts[product.id] ?? buildDraft(product);
                const backgroundClass = index % 2 === 0 ? "bg0" : "bg1";
                return (
                  <ProductRows
                    key={product.id}
                    product={product}
                    draft={draft}
                    categories={categories}
                    backgroundClass={backgroundClass}
                    selected={selectedIds.has(product.id)}
                    busy={busy}
                    onSelect={(checked) => toggleRow(product.id, checked)}
                    onDraft={(field, value) =>
                      updateDraft(product.id, field, value)
                    }
                    onEdit={() =>
                      router.push(
                        `/adm/products/${encodeURIComponent(product.id)}`,
                      )
                    }
                    onClone={() => void cloneProduct(product)}
                  />
                );
              })}
              {visibleProducts.length === 0 ? (
                <tr>
                  <td colSpan={12} className="empty_table">
                    자료가 없습니다.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </form>

      {loading ? (
        <p className="legacy-product-loading" role="status">
          최신 상품목록을 확인하는 중입니다.
        </p>
      ) : null}
      <Pagination
        page={safePage}
        totalPages={totalPages}
        onPage={(nextPage) => setPage(nextPage)}
      />
    </div>
  );
}

function ProductRows({
  product,
  draft,
  categories,
  backgroundClass,
  selected,
  busy,
  onSelect,
  onDraft,
  onEdit,
  onClone,
}: {
  product: AdminProduct;
  draft: ProductDraft;
  categories: AdminProductCategory[];
  backgroundClass: string;
  selected: boolean;
  busy: boolean;
  onSelect: (checked: boolean) => void;
  onDraft: (
    field: keyof ProductDraft,
    value: string | boolean,
  ) => void;
  onEdit: () => void;
  onClone: () => void;
}) {
  const controlId = `product-${product.id.replace(/[^A-Za-z0-9_-]/gu, "-")}`;
  return (
    <>
      <tr className={backgroundClass}>
        <td rowSpan={3} className="td_chk">
          <label htmlFor={`${controlId}-check`} className="sound_only">
            {product.name}
          </label>
          <input
            id={`${controlId}-check`}
            type="checkbox"
            checked={selected}
            onChange={(event) => onSelect(event.currentTarget.checked)}
          />
        </td>
        <td rowSpan={3} className="td_num legacy-product-code">
          {product.id}
        </td>
        <td colSpan={5} className="td_sort">
          <CategorySelect
            id={`${controlId}-category-1`}
            label={`${product.name} 기본분류`}
            value={draft.primaryCategoryId}
            categories={categories}
            required
            onChange={(value) => onDraft("primaryCategoryId", value)}
          />
          <CategorySelect
            id={`${controlId}-category-2`}
            label={`${product.name} 2차분류`}
            value={draft.secondaryCategoryId}
            categories={categories}
            onChange={(value) => onDraft("secondaryCategoryId", value)}
          />
          <CategorySelect
            id={`${controlId}-category-3`}
            label={`${product.name} 3차분류`}
            value={draft.tertiaryCategoryId}
            categories={categories}
            onChange={(value) => onDraft("tertiaryCategoryId", value)}
          />
        </td>
        <td rowSpan={3} className="td_num legacy-product-order">
          <label htmlFor={`${controlId}-order`} className="sound_only">
            순서
          </label>
          <input
            id={`${controlId}-order`}
            type="text"
            className="tbl_input"
            size={3}
            inputMode="numeric"
            value={draft.sortOrder}
            onChange={(event) =>
              onDraft("sortOrder", event.currentTarget.value)
            }
          />
        </td>
        <td rowSpan={3}>
          <label htmlFor={`${controlId}-active`} className="sound_only">
            판매여부
          </label>
          <input
            id={`${controlId}-active`}
            type="checkbox"
            checked={draft.active}
            onChange={(event) =>
              onDraft("active", event.currentTarget.checked)
            }
          />
        </td>
        <td rowSpan={3}>
          <label htmlFor={`${controlId}-soldout`} className="sound_only">
            품절
          </label>
          <input
            id={`${controlId}-soldout`}
            type="checkbox"
            checked={draft.soldOut}
            onChange={(event) =>
              onDraft("soldOut", event.currentTarget.checked)
            }
          />
        </td>
        <td rowSpan={3} className="td_num legacy-product-view-count">
          {product.viewCount.toLocaleString("ko-KR")}
        </td>
        <td rowSpan={3} className="td_mng td_mng_s">
          <button
            type="button"
            className="btn btn_03"
            onClick={onEdit}
            disabled={busy}
          >
            수정
          </button>
          <button
            type="button"
            className="btn btn_02"
            onClick={onClone}
            disabled={busy}
          >
            복사
          </button>
          <a
            href={`/shop/item.php?it_id=${encodeURIComponent(product.id)}`}
            className="btn btn_02"
            target="_blank"
            rel="noreferrer"
          >
            보기
          </a>
        </td>
      </tr>
      <tr className={`${backgroundClass} legacy-product-detail-row`}>
        <td rowSpan={2} className="td_img">
          <a
            href={`/shop/item.php?it_id=${encodeURIComponent(product.id)}`}
            target="_blank"
            rel="noreferrer"
          >
            <Image
              src={product.images[0] || "/legacy/logo.png"}
              width={50}
              height={50}
              alt=""
              unoptimized
            />
          </a>
        </td>
        <td headers="th_pc_title" rowSpan={2} className="td_input">
          <label htmlFor={`${controlId}-name`} className="sound_only">
            상품명
          </label>
          <input
            id={`${controlId}-name`}
            type="text"
            className="tbl_input required"
            size={30}
            required
            value={draft.name}
            onChange={(event) => onDraft("name", event.currentTarget.value)}
          />
        </td>
        <td headers="th_amt" className="td_numbig td_input">
          <label htmlFor={`${controlId}-price`} className="sound_only">
            판매가격
          </label>
          <input
            id={`${controlId}-price`}
            type="text"
            className="tbl_input sit_amt"
            size={7}
            inputMode="numeric"
            value={draft.price}
            onChange={(event) => onDraft("price", event.currentTarget.value)}
          />
        </td>
        <td headers="th_camt" className="td_numbig td_input">
          <label htmlFor={`${controlId}-original-price`} className="sound_only">
            시중가격
          </label>
          <input
            id={`${controlId}-original-price`}
            type="text"
            className="tbl_input sit_camt"
            size={7}
            inputMode="numeric"
            value={draft.originalPrice}
            onChange={(event) =>
              onDraft("originalPrice", event.currentTarget.value)
            }
          />
        </td>
        <td headers="th_skin" className="td_numbig td_input">
          <label htmlFor={`${controlId}-skin`} className="sound_only">
            PC 스킨
          </label>
          <select
            id={`${controlId}-skin`}
            value={draft.desktopSkin}
            onChange={(event) =>
              onDraft("desktopSkin", event.currentTarget.value)
            }
          >
            <option value="">선택</option>
            <option value="basic">basic</option>
          </select>
        </td>
      </tr>
      <tr className={`${backgroundClass} legacy-product-detail-row`}>
        <td headers="th_pt" className="td_numbig td_input">
          {product.rewardPoints.toLocaleString("ko-KR")}
        </td>
        <td headers="th_qty" className="td_numbig td_input">
          <label htmlFor={`${controlId}-stock`} className="sound_only">
            재고
          </label>
          <input
            id={`${controlId}-stock`}
            type="text"
            className="tbl_input sit_qty"
            size={7}
            inputMode="numeric"
            value={draft.stock}
            onChange={(event) => onDraft("stock", event.currentTarget.value)}
          />
        </td>
        <td headers="th_mskin" className="td_numbig td_input">
          <label htmlFor={`${controlId}-mobile-skin`} className="sound_only">
            모바일 스킨
          </label>
          <select
            id={`${controlId}-mobile-skin`}
            value={draft.mobileSkin}
            onChange={(event) =>
              onDraft("mobileSkin", event.currentTarget.value)
            }
          >
            <option value="">선택</option>
            <option value="basic">basic</option>
          </select>
        </td>
      </tr>
    </>
  );
}

function CategorySelect({
  id,
  label,
  value,
  categories,
  required = false,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  categories: AdminProductCategory[];
  required?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <>
      <label htmlFor={id} className="sound_only">
        {label}
      </label>
      <select
        id={id}
        value={value}
        required={required}
        onChange={(event) => onChange(event.currentTarget.value)}
      >
        <option value="">선택</option>
        {categories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.label}
          </option>
        ))}
      </select>
    </>
  );
}

function SortHeader({
  label,
  field,
  onSort,
  rowSpan,
  id,
}: {
  label: string;
  field: SortField;
  onSort: (field: SortField) => void;
  rowSpan?: number;
  id?: string;
}) {
  return (
    <th scope="col" rowSpan={rowSpan} id={id}>
      <button type="button" className="legacy-sort-link" onClick={() => onSort(field)}>
        {label}
      </button>
    </th>
  );
}

function Pagination({
  page,
  totalPages,
  onPage,
}: {
  page: number;
  totalPages: number;
  onPage: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  const groupStart = Math.floor((page - 1) / 10) * 10 + 1;
  const groupEnd = Math.min(totalPages, groupStart + 9);
  const pages = Array.from(
    { length: groupEnd - groupStart + 1 },
    (_, index) => groupStart + index,
  );
  return (
    <nav className="pg_wrap" aria-label="상품관리 페이지">
      <span className="pg">
        {groupStart > 1 ? (
          <>
            <button type="button" className="pg_page pg_start" onClick={() => onPage(1)}>
              처음
            </button>
            <button
              type="button"
              className="pg_page pg_prev"
              onClick={() => onPage(groupStart - 1)}
            >
              이전
            </button>
          </>
        ) : null}
        {pages.map((pageNumber) =>
          pageNumber === page ? (
            <strong key={pageNumber} className="pg_current">
              <span className="sound_only">열린</span>
              {pageNumber}
              <span className="sound_only">페이지</span>
            </strong>
          ) : (
            <button
              key={pageNumber}
              type="button"
              className="pg_page"
              onClick={() => onPage(pageNumber)}
            >
              {pageNumber}
              <span className="sound_only">페이지</span>
            </button>
          ),
        )}
        {groupEnd < totalPages ? (
          <>
            <button
              type="button"
              className="pg_page pg_next"
              onClick={() => onPage(groupEnd + 1)}
            >
              다음
            </button>
            <button
              type="button"
              className="pg_page pg_end"
              onClick={() => onPage(totalPages)}
            >
              맨끝
            </button>
          </>
        ) : null}
      </span>
    </nav>
  );
}

function buildDraft(product: AdminProduct): ProductDraft {
  return {
    primaryCategoryId:
      product.primaryCategoryId || product.categoryId,
    secondaryCategoryId: product.secondaryCategoryId,
    tertiaryCategoryId: product.tertiaryCategoryId,
    sortOrder: String(product.sortOrder),
    active: product.active,
    soldOut: Boolean(product.soldOut),
    name: product.name,
    price: String(product.price),
    originalPrice: String(product.originalPrice),
    stock: String(product.stock),
    desktopSkin: product.desktopSkin,
    mobileSkin: product.mobileSkin,
  };
}

function buildDrafts(products: AdminProduct[]): Record<string, ProductDraft> {
  return Object.fromEntries(
    products.map((product) => [product.id, buildDraft(product)]),
  );
}

function productById(products: AdminProduct[], id: string): AdminProduct {
  const product = products.find((entry) => entry.id === id);
  if (!product) throw new Error("상품을 찾을 수 없습니다.");
  return product;
}

function draftInteger(
  value: string,
  label: string,
  allowNegative = false,
): number {
  const trimmed = value.trim().replaceAll(",", "");
  const pattern = allowNegative ? /^-?\d+$/u : /^\d+$/u;
  if (!pattern.test(trimmed)) {
    throw new Error(`${label}은 정수로 입력해 주세요.`);
  }
  const number = Number(trimmed);
  if (!Number.isSafeInteger(number)) {
    throw new Error(`${label} 값이 너무 큽니다.`);
  }
  return number;
}

function requiredText(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label}을 입력해 주세요.`);
  return trimmed;
}

function sortValue(
  product: AdminProduct,
  field: SortField,
): string | number {
  if (field === "active") return product.active ? 1 : 0;
  if (field === "soldOut") return product.soldOut ? 1 : 0;
  return product[field];
}
