"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { AdminProductStockRow } from "@/lib/admin-product-stock";
import type { AdminProductCategory } from "./product-contract";
import styles from "./product-stock.module.css";

interface ProductStockManagerProps {
  initialRows: AdminProductStockRow[];
  categories: AdminProductCategory[];
}

interface StockDraft {
  stock: number;
  notificationQuantity: number;
  saleEnabled: boolean;
  soldOut: boolean;
  restockNotification: boolean;
}

interface StockApiPayload {
  rows?: AdminProductStockRow[];
  message?: string;
}

const PAGE_SIZE = 15;

export function ProductStockManager({
  initialRows,
  categories,
}: ProductStockManagerProps) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [drafts, setDrafts] = useState<Record<string, StockDraft>>({});
  const [categoryId, setCategoryId] = useState("");
  const [searchField, setSearchField] = useState<"name" | "code">("name");
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);

  const filteredRows = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("ko-KR");
    return rows.filter((row) => {
      if (categoryId && row.categoryId !== categoryId) return false;
      if (!needle) return true;
      const haystack = searchField === "code" ? row.id : row.name;
      return haystack.toLocaleLowerCase("ko-KR").includes(needle);
    });
  }, [categoryId, query, rows, searchField]);
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visibleRows = filteredRows.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );
  const pageWindowStart = Math.floor((safePage - 1) / 10) * 10 + 1;
  const pageWindowEnd = Math.min(totalPages, pageWindowStart + 9);
  const pageNumbers = Array.from(
    { length: pageWindowEnd - pageWindowStart + 1 },
    (_, index) => pageWindowStart + index,
  );

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setQuery(queryInput);
    setPage(1);
  }

  function draftFor(row: AdminProductStockRow): StockDraft {
    return (
      drafts[row.id] ?? {
        stock: row.stockQuantity,
        notificationQuantity: row.notificationQuantity,
        saleEnabled: row.saleEnabled,
        soldOut: row.soldOut,
        restockNotification: row.restockNotification,
      }
    );
  }

  function updateDraft(
    row: AdminProductStockRow,
    patch: Partial<StockDraft>,
  ) {
    setDrafts((current) => ({
      ...current,
      [row.id]: { ...draftFor(row), ...patch },
    }));
    setFeedback(null);
  }

  function isChanged(row: AdminProductStockRow): boolean {
    const draft = drafts[row.id];
    return Boolean(
      draft &&
        (draft.stock !== row.stockQuantity ||
          draft.notificationQuantity !== row.notificationQuantity ||
          draft.saleEnabled !== row.saleEnabled ||
          draft.soldOut !== row.soldOut ||
          draft.restockNotification !== row.restockNotification),
    );
  }

  async function saveVisibleRows() {
    const changedRows = visibleRows.filter(isChanged);
    if (changedRows.length === 0) {
      setFeedback({
        tone: "error",
        message: "현재 목록에서 수정한 상품이 없습니다.",
      });
      return;
    }

    setSaving(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/admin/products/stock", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          rows: changedRows.map((row) => {
            const draft = draftFor(row);
            return {
              id: row.id,
              expectedStock: row.stockQuantity,
              expectedControlRevision: row.controlRevision,
              stock: draft.stock,
              notificationQuantity: draft.notificationQuantity,
              saleEnabled: draft.saleEnabled,
              soldOut: draft.soldOut,
              restockNotification: draft.restockNotification,
            };
          }),
        }),
      });
      if (response.status === 401) {
        router.replace("/adm/login");
        return;
      }
      const payload = (await response.json().catch(() => null)) as
        | StockApiPayload
        | null;
      if (!response.ok || !Array.isArray(payload?.rows)) {
        throw new Error(
          payload?.message?.trim() ||
            "상품 재고 정보를 저장하지 못했습니다.",
        );
      }

      const updatedById = new Map(
        payload.rows.map((row) => [row.id, row]),
      );
      setRows((current) =>
        current.map((row) => updatedById.get(row.id) ?? row),
      );
      setDrafts((current) => {
        const next = { ...current };
        for (const id of updatedById.keys()) delete next[id];
        return next;
      });
      setFeedback({
        tone: "success",
        message:
          payload.message?.trim() ||
          `${updatedById.size.toLocaleString("ko-KR")}개 상품의 재고 정보를 저장했습니다.`,
      });
      router.refresh();
    } catch (error) {
      setFeedback({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "상품 재고 정보를 저장하지 못했습니다.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={`${styles.page} legacy-product-stock-page`}>
      <div className={`btn_fixed_top ${styles.fixedActions}`}>
        <Link className="btn btn_02" href="/adm/tools/product-option-stock">
          상품옵션재고
        </Link>
        <Link className="btn btn_02" href="/adm/tools/product-ranking">
          상품판매순위
        </Link>
        <button
          className="btn btn_submit"
          type="button"
          disabled={saving}
          onClick={() => void saveVisibleRows()}
        >
          {saving ? "저장 중..." : "일괄수정"}
        </button>
      </div>

      {feedback ? (
        <p
          className={
            feedback.tone === "success"
              ? styles.successMessage
              : styles.errorMessage
          }
          role={feedback.tone === "success" ? "status" : "alert"}
        >
          {feedback.message}
        </p>
      ) : null}

      <div className={`local_ov ${styles.summary}`}>
        <span>전체목록</span>
        <span aria-hidden="true">|</span>
        <span>
          전체 상품{" "}
          <strong>{filteredRows.length.toLocaleString("ko-KR")}</strong>개
        </span>
      </div>

      <form
        className={`local_sch ${styles.search}`}
        onSubmit={submitSearch}
      >
        <label className="sound_only" htmlFor="stock-category">
          상품분류
        </label>
        <select
          id="stock-category"
          value={categoryId}
          onChange={(event) => {
            setCategoryId(event.currentTarget.value);
            setPage(1);
          }}
        >
          <option value="">전체분류</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.label}
            </option>
          ))}
        </select>
        <label className="sound_only" htmlFor="stock-search-field">
          검색 기준
        </label>
        <select
          id="stock-search-field"
          value={searchField}
          onChange={(event) =>
            setSearchField(event.currentTarget.value as "name" | "code")
          }
        >
          <option value="name">상품명</option>
          <option value="code">상품코드</option>
        </select>
        <label className="sound_only" htmlFor="stock-query">
          검색어
        </label>
        <input
          id="stock-query"
          type="search"
          value={queryInput}
          onChange={(event) => setQueryInput(event.currentTarget.value)}
        />
        <button type="submit">검색</button>
      </form>

      <div className={`local_desc ${styles.description}`}>
        재고수정의 수치를 수정하시면 창고재고의 수치가 변경됩니다.
      </div>

      <div className={styles.tableScroll}>
        <table>
          <caption>상품재고관리 목록</caption>
          <colgroup>
            <col className={styles.codeColumn} />
            <col className={styles.nameColumn} />
            <col className={styles.numberColumn} />
            <col className={styles.numberColumn} />
            <col className={styles.numberColumn} />
            <col className={styles.inputColumn} />
            <col className={styles.inputColumn} />
            <col className={styles.toggleColumn} />
            <col className={styles.toggleColumn} />
            <col className={styles.restockColumn} />
            <col className={styles.manageColumn} />
          </colgroup>
          <thead>
            <tr>
              <th className={styles.codeColumn}>상품코드</th>
              <th className={styles.nameColumn}>상품명</th>
              <th className={styles.numberColumn}>창고재고</th>
              <th className={styles.numberColumn}>주문대기</th>
              <th className={styles.numberColumn}>가재고</th>
              <th className={styles.inputColumn}>재고수정</th>
              <th className={styles.inputColumn}>통보수량</th>
              <th className={styles.toggleColumn}>판매</th>
              <th className={styles.toggleColumn}>품절</th>
              <th className={styles.restockColumn}>재입고 알림</th>
              <th className={styles.manageColumn}>관리</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr>
                <td className={styles.empty} colSpan={11}>
                  검색된 상품이 없습니다.
                </td>
              </tr>
            ) : (
              visibleRows.map((row) => {
                const draft = draftFor(row);
                const lowStock =
                  row.stockQuantity <= draft.notificationQuantity;
                return (
                  <tr
                    key={row.id}
                    className={isChanged(row) ? styles.changedRow : undefined}
                  >
                    <td className={styles.center}>{row.id}</td>
                    <td>
                      <div className={styles.productCell}>
                        <Link
                          className={styles.productName}
                          href={`/shop/item.php?it_id=${encodeURIComponent(row.id)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={row.name}
                        >
                          <Image
                            className={styles.productImage}
                            src={row.image}
                            alt=""
                            width={50}
                            height={50}
                            unoptimized
                          />{" "}
                          {row.name} 요약정보 및 구매
                        </Link>
                      </div>
                    </td>
                    <td
                      className={`${styles.number} ${
                        lowStock ? styles.lowStock : ""
                      }`}
                    >
                      {row.warehouseStock.toLocaleString("ko-KR")}
                      {lowStock ? " !" : ""}
                    </td>
                    <td className={styles.number}>
                      {row.pendingStock.toLocaleString("ko-KR")}
                    </td>
                    <td
                      className={`${styles.number} ${
                        row.availableStock < 0 ? styles.negativeStock : ""
                      }`}
                    >
                      {row.availableStock.toLocaleString("ko-KR")}
                    </td>
                    <td className={styles.center}>
                      <input
                        className={styles.numberInput}
                        type="number"
                        min={0}
                        max={10_000_000}
                        step={1}
                        aria-label={`${row.name} 재고수정`}
                        value={draft.stock}
                        onChange={(event) =>
                          updateDraft(row, {
                            stock: clampQuantity(event.currentTarget.value),
                          })
                        }
                      />
                    </td>
                    <td className={styles.center}>
                      <input
                        className={styles.numberInput}
                        type="number"
                        min={0}
                        max={10_000_000}
                        step={1}
                        aria-label={`${row.name} 통보수량`}
                        value={draft.notificationQuantity}
                        onChange={(event) =>
                          updateDraft(row, {
                            notificationQuantity: clampQuantity(
                              event.currentTarget.value,
                            ),
                          })
                        }
                      />
                    </td>
                    <td className={styles.center}>
                      <input
                        type="checkbox"
                        aria-label={`${row.name} 판매`}
                        checked={draft.saleEnabled}
                        onChange={(event) =>
                          updateDraft(row, {
                            saleEnabled: event.currentTarget.checked,
                          })
                        }
                      />
                    </td>
                    <td className={styles.center}>
                      <input
                        type="checkbox"
                        aria-label={`${row.name} 품절`}
                        checked={draft.soldOut}
                        onChange={(event) =>
                          updateDraft(row, {
                            soldOut: event.currentTarget.checked,
                          })
                        }
                      />
                    </td>
                    <td className={styles.center}>
                      <input
                        type="checkbox"
                        aria-label={`${row.name} 재입고 알림`}
                        checked={draft.restockNotification}
                        onChange={(event) =>
                          updateDraft(row, {
                            restockNotification:
                              event.currentTarget.checked,
                          })
                        }
                      />
                    </td>
                    <td className={styles.center}>
                      <Link
                        className={styles.manageLink}
                        href={`/adm/products/${encodeURIComponent(row.id)}`}
                      >
                        수정
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 ? (
        <nav className="pg_wrap" aria-label="상품재고 페이지">
          <span className="pg">
            {pageWindowStart > 1 ? (
              <>
                <a
                  className="pg_page pg_start"
                  href="#stock-page-1"
                  onClick={(event) => {
                    event.preventDefault();
                    setPage(1);
                  }}
                >
                  처음
                </a>
                <a
                  className="pg_page pg_prev"
                  href={`#stock-page-${pageWindowStart - 1}`}
                  onClick={(event) => {
                    event.preventDefault();
                    setPage(pageWindowStart - 1);
                  }}
                >
                  이전
                </a>
              </>
            ) : null}
            {pageNumbers.map((pageNumber) =>
              pageNumber === safePage ? (
                <strong className="pg_current" key={pageNumber}>
                  <span className="sound_only">열린</span>
                  {pageNumber}
                  <span className="sound_only">페이지</span>
                </strong>
              ) : (
                <a
                  className="pg_page"
                  href={`#stock-page-${pageNumber}`}
                  key={pageNumber}
                  onClick={(event) => {
                    event.preventDefault();
                    setPage(pageNumber);
                  }}
                >
                  {pageNumber}
                  <span className="sound_only">페이지</span>
                </a>
              ),
            )}
            {pageWindowEnd < totalPages ? (
              <>
                <a
                  className="pg_page pg_next"
                  href={`#stock-page-${pageWindowEnd + 1}`}
                  onClick={(event) => {
                    event.preventDefault();
                    setPage(pageWindowEnd + 1);
                  }}
                >
                  다음
                </a>
                <a
                  className="pg_page pg_end"
                  href={`#stock-page-${totalPages}`}
                  onClick={(event) => {
                    event.preventDefault();
                    setPage(totalPages);
                  }}
                >
                  맨끝
                </a>
              </>
            ) : null}
          </span>
        </nav>
      ) : null}

    </div>
  );
}

function clampQuantity(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(10_000_000, Math.max(0, Math.trunc(parsed)));
}
