"use client";

/* eslint-disable @next/next/no-img-element -- local catalog thumbnails are supplied at runtime */
/* eslint-disable @next/next/no-html-link-for-pages -- Legacy administrator navigation intentionally performs full-page requests. */

import { useMemo, useState } from "react";
import type { AdminProductTypeRow } from "@/lib/admin-product-types";
import type {
  AdminProductOptionProduct,
  ProductOptionRow,
} from "@/lib/product-options";
import type { AdminRestockRequest } from "@/lib/restock-notifications";
import { mergeLegacyAdminCategoryOptions } from "@/lib/legacy-admin-category-options";
import styles from "./catalog-operation-tools.module.css";

interface AdminApiResult {
  message?: string;
}

const PRODUCT_TYPE_PAGE_SIZE = 15;

export function ProductTypeManager({
  initialRows,
}: {
  initialRows: AdminProductTypeRow[];
}) {
  const [rows, setRows] = useState(initialRows);
  const [query, setQuery] = useState("");
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("ko-KR");
    if (!needle) return rows;
    return rows.filter((row) =>
      `${row.id} ${row.name}`.toLocaleLowerCase("ko-KR").includes(needle),
    );
  }, [query, rows]);
  const pageCount = Math.max(
    1,
    Math.ceil(filtered.length / PRODUCT_TYPE_PAGE_SIZE),
  );
  const safePage = Math.min(page, pageCount);
  const pageRows = filtered.slice(
    (safePage - 1) * PRODUCT_TYPE_PAGE_SIZE,
    safePage * PRODUCT_TYPE_PAGE_SIZE,
  );
  const pageWindowStart =
    Math.floor((safePage - 1) / 10) * 10 + 1;
  const pageWindowEnd = Math.min(pageCount, pageWindowStart + 9);
  const pageNumbers = Array.from(
    { length: pageWindowEnd - pageWindowStart + 1 },
    (_, index) => pageWindowStart + index,
  );

  function toggle(
    id: string,
    flag: keyof AdminProductTypeRow["flags"],
    checked: boolean,
  ) {
    setRows((current) =>
      current.map((row) =>
        row.id === id
          ? { ...row, flags: { ...row.flags, [flag]: checked } }
          : row,
      ),
    );
    setDirtyIds((current) => new Set(current).add(id));
  }

  async function save() {
    if (!dirtyIds.size || saving) return;
    setSaving(true);
    setMessage("");
    setFailed(false);
    try {
      const response = await fetch("/api/admin/products/types", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          rows: rows
            .filter((row) => dirtyIds.has(row.id))
            .map((row) => ({
              id: row.id,
              expectedRevision: row.revision,
              flags: row.flags,
            })),
        }),
      });
      const result = (await response.json()) as AdminApiResult & {
        rows?: AdminProductTypeRow[];
      };
      if (response.status === 401) {
        window.location.assign("/adm/login");
        return;
      }
      if (!response.ok || !result.rows) {
        setFailed(true);
        setMessage(result.message ?? "상품유형을 저장하지 못했습니다.");
        return;
      }
      const updated = new Map(result.rows.map((row) => [row.id, row]));
      setRows((current) =>
        current.map((row) => updated.get(row.id) ?? row),
      );
      setDirtyIds(new Set());
      setMessage(result.message ?? "상품유형을 저장했습니다.");
    } catch {
      setFailed(true);
      setMessage("네트워크 상태를 확인한 뒤 다시 저장해 주세요.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="local_ov01 local_ov">
        전체{" "}
        <span className="btn_ov01">
          <span className="ov_txt">상품수</span>
          <span className="ov_num">{rows.length.toLocaleString("ko-KR")}개</span>
        </span>
      </div>
      <div className="local_sch01 local_sch">
        <label htmlFor="product-type-query" className={styles.srOnly}>
          상품 검색
        </label>
        <input
          id="product-type-query"
          className="frm_input"
          value={query}
          placeholder="상품코드 또는 상품명"
          onChange={(event) => {
            setQuery(event.currentTarget.value);
            setPage(1);
          }}
        />
      </div>
      <div className="tbl_head01 tbl_wrap">
        <table className={styles.typeTable}>
          <caption>상품유형 관리</caption>
          <thead>
            <tr>
              <th scope="col">상품코드</th>
              <th scope="col">상품명</th>
              <th scope="col">히트상품</th>
              <th scope="col">추천상품</th>
              <th scope="col">신규상품</th>
              <th scope="col">인기상품</th>
              <th scope="col">할인상품</th>
              <th scope="col">관리</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row) => (
              <tr key={row.id}>
                <td className="td_num">{row.id}</td>
                <td className="td_left">
                  <img src={row.image} alt="" />
                  <a
                    href={`/shop/item.php?it_id=${encodeURIComponent(row.id)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {row.name}
                  </a>
                </td>
                {(
                  ["hit", "recommend", "new", "popular", "sale"] as const
                ).map((flag) => (
                  <td key={flag}>
                    <input
                      type="checkbox"
                      checked={row.flags[flag]}
                      aria-label={`${row.name} ${flag}`}
                      onChange={(event) =>
                        toggle(row.id, flag, event.currentTarget.checked)
                      }
                    />
                  </td>
                ))}
                <td className="td_mng">
                  <a
                    className="btn btn_03"
                    href={`/adm/products/${encodeURIComponent(row.id)}`}
                  >
                    수정
                  </a>
                </td>
              </tr>
            ))}
            {!pageRows.length ? (
              <tr>
                <td className="empty_table" colSpan={8}>
                  검색된 상품이 없습니다.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {pageCount > 1 ? (
        <nav
          className={`pg_wrap ${styles.typePager}`}
          aria-label="상품유형 목록 페이지"
        >
          <span className="pg">
            {pageWindowStart > 1 ? (
              <button
                className="pg_page pg_prev"
                type="button"
                onClick={() => setPage(pageWindowStart - 1)}
              >
                이전
              </button>
            ) : null}
            {pageNumbers.map((pageNumber) => (
              <button
                className={
                  pageNumber === safePage ? "pg_current" : "pg_page"
                }
                type="button"
                aria-current={
                  pageNumber === safePage ? "page" : undefined
                }
                key={pageNumber}
                onClick={() => setPage(pageNumber)}
              >
                {pageNumber}
              </button>
            ))}
            {pageWindowEnd < pageCount ? (
              <>
                <button
                  className="pg_page pg_next"
                  type="button"
                  onClick={() => setPage(pageWindowEnd + 1)}
                >
                  다음
                </button>
                <button
                  className="pg_page pg_end"
                  type="button"
                  onClick={() => setPage(pageCount)}
                >
                  맨끝
                </button>
              </>
            ) : null}
          </span>
        </nav>
      ) : null}
      {dirtyIds.size > 0 ? (
        <div className={styles.typeSaveActions}>
          <button
            className="btn_submit btn"
            type="button"
            disabled={saving}
            onClick={() => void save()}
          >
            {saving ? "저장 중" : `선택변경 저장 (${dirtyIds.size})`}
          </button>
        </div>
      ) : null}
      <ToolMessage message={message} failed={failed} />
    </>
  );
}

interface EditableOption extends ProductOptionRow {
  temporary?: boolean;
}

export function ProductOptionStockManager({
  initialProducts,
  initialCategories,
}: {
  initialProducts: AdminProductOptionProduct[];
  initialCategories: Array<{ id: string; name: string }>;
}) {
  const [products, setProducts] = useState(initialProducts);
  const [selectedId, setSelectedId] = useState(initialProducts[0]?.id ?? "");
  const [drafts, setDrafts] = useState<Record<string, EditableOption[]>>({});
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const selected = products.find((product) => product.id === selectedId);
  const options = selected
    ? (drafts[selected.id] ?? selected.options)
    : [];

  function setOptions(next: EditableOption[]) {
    if (!selected) return;
    setDrafts((current) => ({ ...current, [selected.id]: next }));
  }

  function updateOption(
    id: string,
    field: keyof EditableOption,
    value: string | number | boolean,
  ) {
    setOptions(
      options.map((option) =>
        option.id === id ? { ...option, [field]: value } : option,
      ),
    );
  }

  function addOption() {
    if (!selected || options.length >= 100) return;
    const id = `new:${crypto.randomUUID()}`;
    setOptions([
      ...options,
      {
        id,
        productId: selected.id,
        optionName: options.at(-1)?.optionName ?? "옵션",
        optionValue: "",
        priceDelta: 0,
        stock: 0,
        saleEnabled: true,
        soldOut: false,
        sortOrder: options.length,
        revision: 0,
        createdAt: "",
        updatedAt: "",
        temporary: true,
      },
    ]);
  }

  async function save() {
    if (!selected || saving) return;
    setSaving(true);
    setMessage("");
    setFailed(false);
    try {
      const response = await fetch("/api/admin/products/options", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          productId: selected.id,
          expectedSetRevision: selected.setRevision,
          rows: options.map((option) => ({
            ...(option.temporary ? {} : { id: option.id }),
            expectedRevision: option.revision,
            expectedStock:
              selected.options.find((current) => current.id === option.id)
                ?.stock ?? 0,
            optionName: option.optionName,
            optionValue: option.optionValue,
            priceDelta: option.priceDelta,
            stock: option.stock,
            saleEnabled: option.saleEnabled,
            soldOut: option.soldOut,
            sortOrder: option.sortOrder,
          })),
        }),
      });
      const result = (await response.json()) as AdminApiResult & {
        product?: AdminProductOptionProduct;
      };
      if (response.status === 401) {
        window.location.assign("/adm/login");
        return;
      }
      if (!response.ok || !result.product) {
        setFailed(true);
        setMessage(result.message ?? "상품 옵션을 저장하지 못했습니다.");
        return;
      }
      setProducts((current) =>
        current.map((product) =>
          product.id === result.product!.id ? result.product! : product,
        ),
      );
      setDrafts((current) => {
        const next = { ...current };
        delete next[result.product!.id];
        return next;
      });
      setMessage(result.message ?? "상품 옵션을 저장했습니다.");
    } catch {
      setFailed(true);
      setMessage("네트워크 상태를 확인한 뒤 다시 저장해 주세요.");
    } finally {
      setSaving(false);
    }
  }

  if (products.every((product) => product.options.length === 0)) {
    return (
      <EmptyProductOptionStockPage
        categories={initialCategories}
        onSave={() => void save()}
      />
    );
  }

  return (
    <>
      <div className="local_ov01 local_ov">
        전체{" "}
        <span className="btn_ov01">
          <span className="ov_txt">상품수</span>
          <span className="ov_num">
            {products.length.toLocaleString("ko-KR")}개
          </span>
        </span>
      </div>
      <div className="local_sch01 local_sch">
        <label htmlFor="option-product">상품 선택</label>{" "}
        <select
          id="option-product"
          value={selectedId}
          onChange={(event) => {
            setSelectedId(event.currentTarget.value);
            setMessage("");
          }}
        >
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              [{product.id}] {product.name}
            </option>
          ))}
        </select>
      </div>
      <div className="local_desc01 local_desc">
        <p>
          옵션명별로 옵션값을 등록합니다. 추가금과 재고는 상품 상세,
          장바구니와 주문 처리에서 서버 기준으로 다시 계산됩니다.
        </p>
      </div>
      {selected ? (
        <>
          <div className={styles.selectedProductHeading}>
            <img src={selected.image} alt="" />
            <div>
              <strong>{selected.name}</strong>
              <span>
                상품코드 {selected.id} · 기본가{" "}
                {selected.basePrice.toLocaleString("ko-KR")}원
              </span>
            </div>
          </div>
          <div className="tbl_head01 tbl_wrap">
            <table className={styles.optionTable}>
              <caption>{selected.name} 옵션재고</caption>
              <thead>
                <tr>
                  <th scope="col">옵션명</th>
                  <th scope="col">옵션값</th>
                  <th scope="col">추가금</th>
                  <th scope="col">재고</th>
                  <th scope="col">판매</th>
                  <th scope="col">품절</th>
                  <th scope="col">순서</th>
                  <th scope="col">관리</th>
                </tr>
              </thead>
              <tbody>
                {options.map((option) => (
                  <tr key={option.id}>
                    <td>
                      <input
                        className="frm_input"
                        value={option.optionName}
                        maxLength={80}
                        onChange={(event) =>
                          updateOption(
                            option.id,
                            "optionName",
                            event.currentTarget.value,
                          )
                        }
                      />
                    </td>
                    <td>
                      <input
                        className="frm_input"
                        value={option.optionValue}
                        maxLength={120}
                        onChange={(event) =>
                          updateOption(
                            option.id,
                            "optionValue",
                            event.currentTarget.value,
                          )
                        }
                      />
                    </td>
                    {(["priceDelta", "stock"] as const).map(
                      (field) => (
                        <td key={field}>
                          <input
                            className="frm_input"
                            type="number"
                            value={option[field]}
                            onChange={(event) =>
                              updateOption(
                                option.id,
                                field,
                                Number(event.currentTarget.value),
                              )
                            }
                          />
                        </td>
                      ),
                    )}
                    <td>
                      <input
                        type="checkbox"
                        checked={option.saleEnabled}
                        aria-label={`${option.optionValue} 판매`}
                        onChange={(event) =>
                          updateOption(
                            option.id,
                            "saleEnabled",
                            event.currentTarget.checked,
                          )
                        }
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        checked={option.soldOut}
                        aria-label={`${option.optionValue} 품절`}
                        onChange={(event) =>
                          updateOption(
                            option.id,
                            "soldOut",
                            event.currentTarget.checked,
                          )
                        }
                      />
                    </td>
                    <td>
                      <input
                        className="frm_input"
                        type="number"
                        value={option.sortOrder}
                        onChange={(event) =>
                          updateOption(
                            option.id,
                            "sortOrder",
                            Number(event.currentTarget.value),
                          )
                        }
                      />
                    </td>
                    <td className="td_mng">
                      <button
                        className="btn btn_02"
                        type="button"
                        onClick={() =>
                          setOptions(
                            options.filter((item) => item.id !== option.id),
                          )
                        }
                      >
                        삭제
                      </button>
                    </td>
                  </tr>
                ))}
                {!options.length ? (
                  <tr>
                    <td className="empty_table" colSpan={8}>
                      등록된 옵션이 없습니다. 옵션이 없으면 기존 일반 상품
                      구매 방식이 유지됩니다.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <div className={styles.optionActions}>
            <button className="btn btn_02" type="button" onClick={addOption}>
              옵션 추가
            </button>
            <button
              className="btn_submit btn"
              type="button"
              disabled={saving}
              onClick={() => void save()}
            >
              {saving ? "저장 중" : "옵션 일괄저장"}
            </button>
          </div>
        </>
      ) : (
        <div className="local_desc01 local_desc">
          <p>관리할 상품이 없습니다.</p>
        </div>
      )}
      <ToolMessage message={message} failed={failed} />
    </>
  );
}

function EmptyProductOptionStockPage({
  categories,
  onSave,
}: {
  categories: Array<{ id: string; name: string }>;
  onSave: () => void;
}) {
  const categoryOptions = mergeLegacyAdminCategoryOptions(categories);
  return (
    <div className={styles.optionStockEmptyPage}>
      <div className={`local_ov01 local_ov ${styles.optionStockEmptySummary}`}>
        <a className="ov_listall" href="/adm/tools/product-option-stock">
          전체목록
        </a>{" "}
        <span className="btn_ov01">
          <span className="ov_txt">전체 옵션</span>
          <span className="ov_num">0개</span>
        </span>
      </div>
      <form
        className={`local_sch01 local_sch ${styles.optionStockEmptySearch}`}
        onSubmit={(event) => event.preventDefault()}
      >
        <label className="sound_only" htmlFor="empty-option-category">
          분류선택
        </label>
        <select id="empty-option-category" defaultValue="">
          <option value="">전체분류</option>
          {categoryOptions.map((category) => (
            <option value={category.id} key={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        <label className="sound_only" htmlFor="empty-option-field">
          검색대상
        </label>
        <select id="empty-option-field" defaultValue="name">
          <option value="name">상품명</option>
          <option value="code">상품코드</option>
        </select>
        <label className="sound_only" htmlFor="empty-option-query">
          검색어
        </label>
        <input
          id="empty-option-query"
          className={`frm_input required ${styles.optionStockSearchInput}`}
          required
        />
        <input className="btn_submit" type="submit" value="검색" />
      </form>
      <form
        id="empty-option-list"
        onSubmit={(event) => {
          event.preventDefault();
          onSave();
        }}
      >
      <div className="btn_fixed_top">
        <a className="btn btn_02" href="/adm/products?view=stock">
          상품재고관리
        </a>{" "}
        <a className="btn btn_02" href="/adm/reports?view=ranking">
          상품판매순위
        </a>{" "}
        <button
          className="btn_submit btn"
          type="submit"
        >
          일괄수정
        </button>
      </div>
      <div className={`tbl_head01 tbl_wrap ${styles.optionStockEmptyTable}`}>
        <table>
          <caption>상품옵션재고관리 목록</caption>
          <colgroup>
            {[
              91.25, 114.09375, 114.09375, 114.09375, 114.09375, 91.25,
              114.09375, 114.09375, 68.4375, 68.5,
            ].map((width, index) => (
              <col key={index} style={{ width }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th>상품명</th>
              <th>옵션항목</th>
              <th>옵션타입</th>
              <th>창고재고</th>
              <th>주문대기</th>
              <th>가재고</th>
              <th>재고수정</th>
              <th>통보수량</th>
              <th>판매</th>
              <th>관리</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td
                className={`empty_table ${styles.optionStockEmptyCell}`}
                colSpan={10}
              >
                <span>자료가 없습니다.</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      </form>
      <div
        className={`local_desc01 local_desc ${styles.optionStockEmptyDescription}`}
      >
        <p>
          재고수정의 수치를 수정하시면 창고재고의 수치가 변경됩니다.
          <br />
          창고재고가 부족한 경우 재고수량 뒤에 ! 혹은 재고부족으로
          표시됩니다.
        </p>
      </div>
    </div>
  );
}

export function RestockSmsManager({
  initialRequests,
  providerConfigured,
}: {
  initialRequests: AdminRestockRequest[];
  providerConfigured: boolean;
}) {
  const [requests, setRequests] = useState(initialRequests);
  const [query, setQuery] = useState("");
  const [searchField, setSearchField] = useState<"product" | "phone">(
    "product",
  );
  const [memos] = useState<Record<string, string>>(
    Object.fromEntries(
      initialRequests.map((request) => [request.id, request.adminMemo]),
    ),
  );
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [selectedRequestIds, setSelectedRequestIds] = useState<Set<string>>(
    () => new Set(),
  );
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("ko-KR");
    return requests.filter(
      (request) =>
        !needle ||
          (searchField === "phone"
            ? request.phone
            : `${request.productId} ${request.productName}`)
            .toLocaleLowerCase("ko-KR")
            .includes(needle),
    );
  }, [query, requests, searchField]);

  async function deleteSelectedRequests() {
    const targets = requests.filter((request) =>
      selectedRequestIds.has(request.id),
    );
    if (targets.length === 0) {
      window.alert("선택삭제 하실 항목을 하나 이상 선택하세요.");
      return;
    }
    if (!window.confirm("선택한 자료를 정말 삭제하시겠습니까?")) return;
    setBusyId("bulk");
    setMessage("");
    setFailed(false);
    try {
      const response = await fetch("/api/admin/products/restock", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          requests: targets.map((request) => ({
            id: request.id,
            expectedRevision: request.revision,
            expectedQueueRevision: request.queueRevision,
          })),
        }),
      });
      const result = (await response.json()) as AdminApiResult & {
        deletedCount?: number;
      };
      if (response.status === 401) {
        window.location.assign("/adm/login");
        return;
      }
      if (!response.ok || typeof result.deletedCount !== "number") {
        throw new Error(
          result.message ?? "재입고 알림 신청을 삭제하지 못했습니다.",
        );
      }
      const deletedIds = new Set(targets.map((request) => request.id));
      setRequests((current) =>
        current.filter((request) => !deletedIds.has(request.id)),
      );
      setSelectedRequestIds(new Set());
      setMessage(result.message ?? "선택한 재입고 알림 신청을 삭제했습니다.");
    } catch (cause) {
      setFailed(true);
      setMessage(
        cause instanceof Error
          ? cause.message
          : "재입고 알림 신청을 삭제하지 못했습니다.",
      );
    } finally {
      setBusyId("");
    }
  }

  async function sendSelectedRequests() {
    const targets = requests.filter((request) =>
      selectedRequestIds.has(request.id),
    );
    if (targets.length === 0) {
      window.alert("선택SMS전송 하실 항목을 하나 이상 선택하세요.");
      return;
    }
    if (
      !window.confirm(
        "선택한 자료에 대해서 SMS로 재입고 알림을 전송하시겠습니까?",
      )
    ) {
      return;
    }
    setBusyId("bulk");
    setMessage("");
    setFailed(false);
    try {
      const updated = new Map<string, AdminRestockRequest>();
      for (const request of targets) {
        const response = await fetch("/api/admin/products/restock", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            id: request.id,
            expectedRevision: request.revision,
            expectedQueueRevision: request.queueRevision,
            action: request.status === "failed" ? "retry" : "queue",
            adminMemo: memos[request.id] ?? "",
          }),
        });
        const result = (await response.json()) as AdminApiResult & {
          request?: AdminRestockRequest;
        };
        if (response.status === 401) {
          window.location.assign("/adm/login");
          return;
        }
        if (!response.ok || !result.request) {
          throw new Error(
            result.message ?? "SMS 전송대기 상태를 저장하지 못했습니다.",
          );
        }
        updated.set(result.request.id, result.request);
      }
      setRequests((current) =>
        current.map((request) => updated.get(request.id) ?? request),
      );
      setSelectedRequestIds(new Set());
      setMessage(
        providerConfigured
          ? "선택한 재입고 알림을 SMS 발송대기에 등록했습니다."
          : "SMS 발송사 연결 전까지 선택한 알림을 안전한 대기열에 보관합니다.",
      );
    } catch (cause) {
      setFailed(true);
      setMessage(
        cause instanceof Error
          ? cause.message
          : "SMS 전송대기 상태를 저장하지 못했습니다.",
      );
    } finally {
      setBusyId("");
    }
  }

  if (requests.length === 0) {
    return (
      <div className={styles.restockEmptyPage}>
        <div className={`local_ov01 local_ov ${styles.restockEmptySummary}`}>
          <a className="ov_listall" href="/adm/tools/restock-sms">
            전체목록
          </a>{" "}
          <span className="btn_ov01">
            <span className="ov_txt">전체</span>
            <span className="ov_num">0건</span>
          </span>
          <span className="btn_ov01">
            <span className="ov_txt">미전송</span>
            <span className="ov_num">0건</span>
          </span>
        </div>
        <form
          className={`local_sch01 local_sch ${styles.restockEmptySearch}`}
          onSubmit={(event) => event.preventDefault()}
        >
          <label className="sound_only" htmlFor="restock-empty-field">
            검색대상
          </label>
          <select
            id="restock-empty-field"
            value={searchField}
            onChange={(event) =>
              setSearchField(
                event.currentTarget.value === "phone" ? "phone" : "product",
              )
            }
          >
            <option value="product">상품코드</option>
            <option value="phone">휴대폰번호</option>
          </select>
          <label className="sound_only" htmlFor="restock-empty-query">
            검색어
          </label>
          <input
            id="restock-empty-query"
            className={`required frm_input ${styles.restockSearchInput}`}
            required
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
          <input className="btn_submit" type="submit" value="검색" />
        </form>
        <form
          id="restock-empty-list"
          onSubmit={(event) => {
            event.preventDefault();
            window.alert("선택 하실 항목을 하나 이상 선택하세요.");
          }}
        >
        <div className={`tbl_head01 tbl_wrap ${styles.restockEmptyTable}`}>
          <table>
            <caption>재입고 SMS 알림 신청</caption>
            <colgroup>
              {[
                74.828125, 137.578125, 206.421875, 172.125, 240.96875,
                172.078125,
              ].map((width, index) => (
                <col key={index} style={{ width }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th>
                  <label
                    className="sound_only"
                    htmlFor="restock-empty-check-all"
                  >
                    알림요청 전체
                  </label>
                  <input id="restock-empty-check-all" type="checkbox" />
                </th>
                <th>상품명</th>
                <th>휴대폰번호</th>
                <th>SMS전송</th>
                <th>SMS전송일시</th>
                <th>등록일시</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td
                  className={`empty_table ${styles.restockEmptyCell}`}
                  colSpan={6}
                >
                  <span>자료가 없습니다.</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="btn_fixed_top">
          <input
            className="btn btn_02 legacy-wide-fixed-action"
            form="restock-empty-list"
            type="submit"
            value="선택삭제"
          />{" "}
          <input
            className="btn_submit btn legacy-wide-fixed-action"
            form="restock-empty-list"
            type="submit"
            value="선택SMS전송"
          />
        </div>
        </form>
      </div>
    );
  }

  const unsentCount = requests.filter(
    (request) => request.status !== "sent",
  ).length;
  return (
    <div className={styles.restockEmptyPage}>
      <div className={`local_ov01 local_ov ${styles.restockEmptySummary}`}>
        <a className="ov_listall" href="/adm/tools/restock-sms">
          전체목록
        </a>{" "}
        <span className="btn_ov01">
          <span className="ov_txt">전체</span>
          <span className="ov_num">
            {requests.length.toLocaleString("ko-KR")}건
          </span>
        </span>{" "}
        <span className="btn_ov01">
          <span className="ov_txt">미전송</span>
          <span className="ov_num">
            {unsentCount.toLocaleString("ko-KR")}건
          </span>
        </span>
      </div>
      <form
        className={`local_sch01 local_sch ${styles.restockEmptySearch}`}
        onSubmit={(event) => event.preventDefault()}
      >
        <label className="sound_only" htmlFor="restock-field">
          검색대상
        </label>
        <select
          id="restock-field"
          value={searchField}
          onChange={(event) =>
            setSearchField(
              event.currentTarget.value === "phone" ? "phone" : "product",
            )
          }
        >
          <option value="product">상품코드</option>
          <option value="phone">휴대폰번호</option>
        </select>
        <label className="sound_only" htmlFor="restock-query">
          검색어
        </label>
        <input
          id="restock-query"
          className={`required frm_input ${styles.restockSearchInput}`}
          required
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
        <input className="btn_submit" type="submit" value="검색" />
      </form>
      <form
        id="restock-list"
        onSubmit={(event) => event.preventDefault()}
      >
        <div className={`tbl_head01 tbl_wrap ${styles.restockEmptyTable}`}>
          <table>
            <caption>재입고 SMS 알림 신청</caption>
            <colgroup>
              {[
                74.828125, 137.578125, 206.421875, 172.125, 240.96875,
                172.078125,
              ].map((width, index) => (
                <col key={index} style={{ width }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th>
                  <label className="sound_only" htmlFor="restock-check-all">
                    알림요청 전체
                  </label>
                  <input
                    id="restock-check-all"
                    type="checkbox"
                    checked={
                      filtered.length > 0 &&
                      filtered.every((request) =>
                        selectedRequestIds.has(request.id),
                      )
                    }
                    onChange={(event) =>
                      setSelectedRequestIds(
                        event.currentTarget.checked
                          ? new Set(filtered.map((request) => request.id))
                          : new Set(),
                      )
                    }
                  />
                </th>
                <th>상품명</th>
                <th>휴대폰번호</th>
                <th>SMS전송</th>
                <th>SMS전송일시</th>
                <th>등록일시</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((request, index) => (
                <tr className={`bg${index % 2}`} key={request.id}>
                  <td className="td_chk">
                    <label
                      className="sound_only"
                      htmlFor={`restock-check-${index}`}
                    >
                      {request.productName} 알림요청
                    </label>
                    <input
                      id={`restock-check-${index}`}
                      type="checkbox"
                      checked={selectedRequestIds.has(request.id)}
                      onChange={(event) =>
                        setSelectedRequestIds((current) => {
                          const next = new Set(current);
                          if (event.currentTarget.checked) {
                            next.add(request.id);
                          } else {
                            next.delete(request.id);
                          }
                          return next;
                        })
                      }
                    />
                  </td>
                  <td className="td_left">{request.productName}</td>
                  <td>{request.phone}</td>
                  <td>{request.status === "sent" ? "전송완료" : "전송전"}</td>
                  <td>
                    {request.sentAt ? formatDateTime(request.sentAt) : ""}
                  </td>
                  <td>{formatDateTime(request.createdAt)}</td>
                </tr>
              ))}
              {filtered.length === 0 ? (
                <tr>
                  <td
                    className={`empty_table ${styles.restockEmptyCell}`}
                    colSpan={6}
                  >
                    <span>자료가 없습니다.</span>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="btn_fixed_top">
          <button
            className="btn btn_02 legacy-wide-fixed-action"
            type="button"
            disabled={Boolean(busyId)}
            onClick={() => void deleteSelectedRequests()}
          >
            선택삭제
          </button>{" "}
          <button
            className="btn_submit btn legacy-wide-fixed-action"
            type="button"
            disabled={Boolean(busyId)}
            onClick={() => void sendSelectedRequests()}
          >
            선택SMS전송
          </button>
        </div>
      </form>
      <ToolMessage message={message} failed={failed} />
    </div>
  );
}

function ToolMessage({
  message,
  failed,
}: {
  message: string;
  failed: boolean;
}) {
  if (!message) return null;
  return (
    <p
      className={failed ? styles.errorMessage : styles.successMessage}
      role={failed ? "alert" : "status"}
    >
      {message}
    </p>
  );
}

function formatDateTime(value: string): string {
  const parsed = new Date(value.replace(" ", "T") + (value.endsWith("Z") ? "" : "Z"));
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
