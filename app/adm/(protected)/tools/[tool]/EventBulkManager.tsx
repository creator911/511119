"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import type {
  EventProductListFilters,
  EventProductListResult,
  EventProductSort,
} from "@/lib/event-product-contract";
import type { StoreEvent } from "@/lib/store-events";
import styles from "./event-bulk.module.css";

interface EventBulkApiResult {
  ok?: boolean;
  message?: string;
  result?: EventProductListResult;
  assignedCount?: number;
}

export function EventBulkManager({
  initialEvents,
  initialResult,
}: {
  initialEvents: StoreEvent[];
  initialResult: EventProductListResult;
}) {
  const [result, setResult] = useState(initialResult);
  const [filters, setFilters] = useState(initialResult.filters);
  const [selectedProductIds, setSelectedProductIds] = useState(
    () =>
      new Set(
        initialResult.products
          .filter((product) => product.assigned)
          .map((product) => product.id),
      ),
  );
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const selectedEvent = useMemo(
    () =>
      initialEvents.find((event) => event.id === result.filters.eventId) ??
      null,
    [initialEvents, result.filters.eventId],
  );

  async function load(
    nextFilters: EventProductListFilters,
    page = result.page,
  ) {
    if (loading) return;
    setLoading(true);
    setMessage("");
    setFailed(false);
    try {
      const query = new URLSearchParams({
        eventId: nextFilters.eventId,
        categoryId: nextFilters.categoryId,
        searchField: nextFilters.searchField,
        query: nextFilters.query,
        sortBy: nextFilters.sortBy,
        sortDirection: nextFilters.sortDirection,
        page: String(page),
      });
      const response = await fetch(`/api/admin/events/assignments?${query}`, {
        headers: { Accept: "application/json" },
      });
      const payload = (await response.json()) as EventBulkApiResult;
      if (response.status === 401) {
        window.location.assign("/adm/login");
        return;
      }
      if (!response.ok || !payload.result) {
        setFailed(true);
        setMessage(payload.message ?? "상품 목록을 불러오지 못했습니다.");
        return;
      }
      setResult(payload.result);
      setFilters(payload.result.filters);
      setSelectedProductIds(
        new Set(
          payload.result.products
            .filter((product) => product.assigned)
            .map((product) => product.id),
        ),
      );
      replaceLegacyUrl(payload.result);
    } catch {
      setFailed(true);
      setMessage("네트워크 상태를 확인한 뒤 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    if (!result.filters.eventId) {
      window.alert("이벤트를 선택하세요");
      return;
    }
    if (saving) return;
    setSaving(true);
    setMessage("");
    setFailed(false);
    try {
      const response = await fetch("/api/admin/events/assignments", {
        method: "PATCH",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          eventId: result.filters.eventId,
          visibleProductIds: result.products.map((product) => product.id),
          selectedProductIds: result.products
            .filter((product) => selectedProductIds.has(product.id))
            .map((product) => product.id),
        }),
      });
      const payload = (await response.json()) as EventBulkApiResult;
      if (response.status === 401) {
        window.location.assign("/adm/login");
        return;
      }
      if (!response.ok || typeof payload.assignedCount !== "number") {
        setFailed(true);
        setMessage(payload.message ?? "이벤트 상품을 수정하지 못했습니다.");
        return;
      }
      setResult((current) => ({
        ...current,
        products: current.products.map((product) => ({
          ...product,
          assigned: selectedProductIds.has(product.id),
        })),
      }));
      setMessage("선택한 이벤트의 상품 수정 내용을 반영했습니다.");
    } catch {
      setFailed(true);
      setMessage("네트워크 상태를 확인한 뒤 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  }

  function submitEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void load({ ...filters, eventId: filters.eventId }, 1);
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void load(filters, 1);
  }

  function sort(sortBy: EventProductSort) {
    const sortDirection =
      result.filters.sortBy === sortBy &&
      result.filters.sortDirection === "desc"
        ? "asc"
        : "desc";
    void load(
      {
        ...result.filters,
        sortBy,
        sortDirection,
      },
      1,
    );
  }

  function toggleProduct(productId: string, checked: boolean) {
    setSelectedProductIds((current) => {
      const next = new Set(current);
      if (checked) next.add(productId);
      else next.delete(productId);
      return next;
    });
  }

  return (
    <div className={`legacy-event-bulk-page ${styles.page}`}>
      <div className="local_ov01 local_ov legacy-event-bulk-summary">
        <Link className="ov_listall" href="/adm/tools/event-bulk">
          전체목록
        </Link>
        <span className="btn_ov01">
          <span className="ov_txt">전체 이벤트</span>
          <span className="ov_num">
            {" "}
            {result.total.toLocaleString("ko-KR")}건
          </span>
        </span>
      </div>

      <form
        className="local_sch01 local_sch legacy-event-bulk-event-search"
        autoComplete="off"
        onSubmit={submitEvent}
      >
        <label className="sound_only" htmlFor="event-bulk-event">
          이벤트
        </label>
        <select
          id="event-bulk-event"
          value={filters.eventId}
          onChange={(event) =>
            setFilters((current) => ({
              ...current,
              eventId: event.currentTarget.value,
            }))
          }
        >
          <option value="">이벤트를 선택하세요</option>
          {initialEvents.map((event) => (
            <option key={event.id} value={event.id}>
              {truncate(event.title, 20)}
            </option>
          ))}
        </select>
        <button className="btn_submit" type="submit" disabled={loading}>
          이동
        </button>
      </form>

      <form
        className="local_sch01 local_sch legacy-event-bulk-product-search"
        autoComplete="off"
        onSubmit={submitSearch}
      >
        <label className="sound_only" htmlFor="event-bulk-category">
          분류선택
        </label>
        <select
          id="event-bulk-category"
          value={filters.categoryId}
          onChange={(event) =>
            setFilters((current) => ({
              ...current,
              categoryId: event.currentTarget.value,
            }))
          }
        >
          <option value="">전체분류</option>
          {result.categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.label}
            </option>
          ))}
        </select>
        <label className="sound_only" htmlFor="event-bulk-search-field">
          검색대상
        </label>
        <select
          id="event-bulk-search-field"
          value={filters.searchField}
          onChange={(event) =>
            setFilters((current) => ({
              ...current,
              searchField:
                event.currentTarget.value === "id" ? "id" : "name",
            }))
          }
        >
          <option value="name">상품명</option>
          <option value="id">상품코드</option>
        </select>
        <label className="sound_only" htmlFor="event-bulk-query">
          검색어
          <strong className="sound_only"> 필수</strong>
        </label>
        <input
          className="frm_input required"
          id="event-bulk-query"
          type="text"
          required
          value={filters.query}
          onChange={(event) =>
            setFilters((current) => ({
              ...current,
              query: event.currentTarget.value,
            }))
          }
        />
        <button className="btn_submit" type="submit" disabled={loading}>
          검색
        </button>
      </form>

      <div className="local_desc01 local_desc legacy-event-bulk-intro">
        <p>
          상품을 이벤트별로 일괄 처리합니다.{" "}
          {selectedEvent
            ? `현재 선택된 이벤트는 ${selectedEvent.title}입니다.`
            : "이벤트를 선택해 주세요."}
        </p>
      </div>

      <form
        className="legacy-event-bulk-update"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <div
          className="tbl_head01 tbl_wrap legacy-event-bulk-table-wrap"
          aria-busy={loading}
        >
          <table className="legacy-event-bulk-table">
            <caption>이벤트일괄처리 목록</caption>
            <colgroup>
              <col className="legacy-event-bulk-col-check" />
              <col className="legacy-event-bulk-col-code" />
              <col className="legacy-event-bulk-col-name" />
            </colgroup>
            <thead>
              <tr>
                <th scope="col">이벤트</th>
                <th scope="col">
                  <Link
                    href={legacyEventBulkHref({
                      ...result,
                      filters: nextSortFilters(result.filters, "id"),
                      page: 1,
                    })}
                    onClick={(event) => {
                      event.preventDefault();
                      sort("id");
                    }}
                  >
                    상품코드
                  </Link>
                </th>
                <th scope="col">
                  <Link
                    href={legacyEventBulkHref({
                      ...result,
                      filters: nextSortFilters(result.filters, "name"),
                      page: 1,
                    })}
                    onClick={(event) => {
                      event.preventDefault();
                      sort("name");
                    }}
                  >
                    상품명
                  </Link>
                </th>
              </tr>
            </thead>
            <tbody>
              {result.products.map((product, index) => {
                const href = `/shop/item.php?it_id=${encodeURIComponent(product.id)}`;
                return (
                  <tr className={`bg${index % 2}`} key={product.id}>
                    <td className="td_chk2">
                      <label
                        className="sound_only"
                        htmlFor={`event-product-${index}`}
                      >
                        이벤트 사용
                      </label>
                      <input
                        id={`event-product-${index}`}
                        type="checkbox"
                        checked={selectedProductIds.has(product.id)}
                        onChange={(event) =>
                          toggleProduct(
                            product.id,
                            event.currentTarget.checked,
                          )
                        }
                      />
                    </td>
                    <td className="td_num">
                      <a href={href}>{product.id}</a>
                    </td>
                    <td className="td_left">
                      <a href={href}>
                        {product.image ? (
                          <Image
                            alt={product.name}
                            height={50}
                            src={product.image}
                            unoptimized
                            width={50}
                          />
                        ) : null}{" "}
                        <span>{truncate(product.name, 60)}</span>
                      </a>
                    </td>
                  </tr>
                );
              })}
              {result.products.length === 0 ? (
                <tr>
                  <td className="empty_table" colSpan={3}>
                    자료가 없습니다.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
          {loading ? (
            <span className={styles.loading} role="status">
              상품 목록을 불러오는 중입니다.
            </span>
          ) : null}
        </div>

        <div className="local_desc01 local_desc legacy-event-bulk-warning">
          <p>
            {selectedEvent ? (
              <>
                현재 선택된 이벤트는 <strong>{selectedEvent.title}</strong>
                입니다.
                <br />
                선택된 이벤트의 상품 수정 내용을 반영하시려면 일괄수정 버튼을
                누르십시오.
              </>
            ) : (
              <>
                이벤트를 선택하지 않으셨습니다.{" "}
                <strong>
                  수정 내용을 반영하기 전에 이벤트를 선택해주십시오.
                </strong>
                <br />
                <a className="sound_only" href="#event-bulk-event">
                  이벤트 선택
                </a>
              </>
            )}
          </p>
        </div>

        <div className="btn_fixed_top">
          <button
            className="btn_submit btn"
            type="submit"
            disabled={saving}
            accessKey="s"
          >
            {saving ? "수정 중…" : "일괄수정"}
          </button>
        </div>
      </form>

      {result.totalPages > 1 ? (
        <nav className="pg_wrap legacy-event-bulk-pagination" aria-label="상품 페이지">
          <span className="pg">
            {result.page > 1 ? (
              <>
                <button
                  className="pg_page pg_start"
                  type="button"
                  onClick={() => void load(result.filters, 1)}
                >
                  처음
                </button>
                <button
                  className="pg_page pg_prev"
                  type="button"
                  onClick={() =>
                    void load(result.filters, result.page - 1)
                  }
                >
                  이전
                </button>
              </>
            ) : null}
            {paginationPages(result.page, result.totalPages).map(
              (pageNumber) =>
                pageNumber === result.page ? (
                  <span
                    className="pg_current"
                    aria-current="page"
                    key={pageNumber}
                  >
                    <span className="sound_only">열린</span>
                    {pageNumber}
                  </span>
                ) : (
                  <button
                    className="pg_page"
                    type="button"
                    key={pageNumber}
                    onClick={() => void load(result.filters, pageNumber)}
                  >
                    {pageNumber}
                    <span className="sound_only">페이지</span>
                  </button>
                ),
            )}
            {result.page < result.totalPages ? (
              <>
                <button
                  className="pg_page pg_next"
                  type="button"
                  onClick={() =>
                    void load(result.filters, result.page + 1)
                  }
                >
                  다음
                </button>
                <button
                  className="pg_page pg_end"
                  type="button"
                  onClick={() =>
                    void load(result.filters, result.totalPages)
                  }
                >
                  맨끝
                </button>
              </>
            ) : null}
          </span>
        </nav>
      ) : null}

      {message ? (
        <p
          className={`${styles.status} ${failed ? styles.failed : ""}`}
          role={failed ? "alert" : "status"}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}

function replaceLegacyUrl(result: EventProductListResult) {
  window.history.replaceState(null, "", legacyEventBulkHref(result));
}

function legacyEventBulkHref(result: EventProductListResult): string {
  const query = new URLSearchParams();
  if (result.filters.eventId) query.set("ev_id", result.filters.eventId);
  if (result.filters.categoryId) {
    query.set("sel_ca_id", result.filters.categoryId);
  }
  query.set(
    "sel_field",
    result.filters.searchField === "id" ? "a.it_id" : "it_name",
  );
  if (result.filters.query) query.set("search", result.filters.query);
  query.set("sort1", result.filters.sortBy === "id" ? "a.it_id" : "it_name");
  query.set("sort2", result.filters.sortDirection);
  if (result.page > 1) query.set("page", String(result.page));
  const serialized = query.toString();
  return `/adm/tools/event-bulk${serialized ? `?${serialized}` : ""}`;
}

function nextSortFilters(
  filters: EventProductListFilters,
  sortBy: EventProductSort,
): EventProductListFilters {
  return {
    ...filters,
    sortBy,
    sortDirection:
      filters.sortBy === sortBy && filters.sortDirection === "desc"
        ? "asc"
        : "desc",
  };
}

function paginationPages(page: number, totalPages: number): number[] {
  const start = Math.floor((Math.max(1, page) - 1) / 10) * 10 + 1;
  const end = Math.min(totalPages, start + 9);
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function truncate(value: string, maximumLength: number): string {
  return value.length > maximumLength
    ? `${value.slice(0, maximumLength)}…`
    : value;
}
