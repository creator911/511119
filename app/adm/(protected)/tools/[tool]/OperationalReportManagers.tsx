"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import type {
  AdminVisitReport,
  SavedItemReport,
} from "@/lib/admin-operational-reports";
import styles from "./legacy-tool.module.css";

interface SavedItemsApiResult {
  message?: string;
  report?: SavedItemReport;
}

interface VisitorsApiResult {
  message?: string;
  fieldErrors?: Record<string, string>;
  report?: AdminVisitReport;
}

export function SavedItemsManager({
  initialReport,
}: {
  initialReport: SavedItemReport;
}) {
  const [report, setReport] = useState(initialReport);
  const [categoryId, setCategoryId] = useState(initialReport.categoryId);
  const [dateStart, setDateStart] = useState(initialReport.dateStart);
  const [dateEnd, setDateEnd] = useState(initialReport.dateEnd);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setMessage("");
    setFailed(false);
    try {
      const params = new URLSearchParams();
      if (categoryId) params.set("categoryId", categoryId);
      if (dateStart) params.set("dateStart", dateStart);
      if (dateEnd) params.set("dateEnd", dateEnd);
      const response = await fetch(`/api/admin/saved-items?${params}`);
      const result = (await response.json()) as SavedItemsApiResult;
      if (response.status === 401) {
        window.location.assign("/adm/login");
        return;
      }
      if (!response.ok || !result.report) {
        setFailed(true);
        setMessage(result.message ?? "보관함 현황을 조회하지 못했습니다.");
        return;
      }
      setReport(result.report);
      setMessage("");
    } catch {
      setFailed(true);
      setMessage("네트워크 상태를 확인한 뒤 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.savedItemsManager}>
      <div className={`local_ov01 local_ov ${styles.savedItemsSummary}`}>
        <span className={styles.savedItemsSummaryLabel}>전체목록</span>
        <span className={styles.savedItemsSummaryCount}>
          전체 <strong>{report.totalItems.toLocaleString("ko-KR")}</strong>건
        </span>
      </div>
      <form
        className={`local_sch01 local_sch ${styles.savedItemsSearch}`}
        onSubmit={search}
      >
        <label className="sound_only" htmlFor="saved-category">
          상품분류
        </label>
        <select
          id="saved-category"
          value={categoryId}
          onChange={(event) => setCategoryId(event.currentTarget.value)}
        >
          <option value="">전체분류</option>
          {report.categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.label}
            </option>
          ))}
        </select>{" "}
        <label className="sound_only" htmlFor="saved-date-start">
          시작일
        </label>
        <input
          id="saved-date-start"
          className={`frm_input ${styles.savedItemsDate}`}
          type="text"
          inputMode="numeric"
          maxLength={10}
          placeholder="YYYY-MM-DD"
          value={dateStart}
          onChange={(event) => setDateStart(event.currentTarget.value)}
        />{" "}
        <span className={styles.savedItemsDateSeparator} aria-hidden="true">
          ~
        </span>
        <label className="sound_only" htmlFor="saved-date-end">
          종료일
        </label>
        <input
          id="saved-date-end"
          className={`frm_input ${styles.savedItemsDate}`}
          type="text"
          inputMode="numeric"
          maxLength={10}
          placeholder="YYYY-MM-DD"
          value={dateEnd}
          onChange={(event) => setDateEnd(event.currentTarget.value)}
        />{" "}
        <input
          className={`btn_submit ${styles.savedItemsSubmit}`}
          type="submit"
          value={loading ? "조회 중…" : "검색"}
          disabled={loading}
        />
      </form>
      <StatusMessage message={message} failed={failed} />
      <div className={`tbl_head01 tbl_wrap ${styles.savedItemsTable}`}>
        <table>
          <caption>상품별 보관 순위</caption>
          <thead>
            <tr>
              <th scope="col">순위</th>
              <th scope="col">상품평</th>
              <th scope="col">건수</th>
            </tr>
          </thead>
          <tbody>
            {report.products.map((group, index) => (
              <tr key={group.key}>
                <td className="td_num">{index + 1}</td>
                <td className="td_left">
                  <a
                    href={`/shop/item.php?it_id=${encodeURIComponent(group.key)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {group.label}
                  </a>
                </td>
                <td>{group.count.toLocaleString("ko-KR")}</td>
              </tr>
            ))}
            {report.products.length === 0 ? (
              <tr>
                <td
                  className={`empty_table ${styles.savedItemsEmpty}`}
                  colSpan={3}
                >
                  자료가 없습니다.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function VisitorSearchManager({
  initialReport,
  initialQuery = "",
  initialSearchField = "ip",
}: {
  initialReport: AdminVisitReport;
  initialQuery?: string;
  initialSearchField?: "ip" | "path" | "date";
}) {
  const [report, setReport] = useState(initialReport);
  const [from, setFrom] = useState(initialReport.from);
  const [to, setTo] = useState(initialReport.to);
  const [searchField, setSearchField] = useState<"ip" | "path" | "date">(
    initialSearchField,
  );
  const [query, setQuery] = useState(initialQuery);
  const [showAggregate, setShowAggregate] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setMessage("");
    setFailed(false);
    setFieldErrors({});
    if (searchField !== "date") {
      setShowAggregate(false);
      setLoading(false);
      return;
    }
    try {
      const compact = query.trim().replaceAll("-", "");
      const searchedDate = /^\d{8}$/u.test(compact)
        ? `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`
        : "";
      const params = new URLSearchParams({
        from: searchedDate || from,
        to: searchedDate || to,
      });
      const response = await fetch(`/api/admin/visitors?${params}`);
      const result = (await response.json()) as VisitorsApiResult;
      if (response.status === 401) {
        window.location.assign("/adm/login");
        return;
      }
      if (!response.ok || !result.report) {
        setFieldErrors(result.fieldErrors ?? {});
        setFailed(true);
        setMessage(result.message ?? "접속 현황을 조회하지 못했습니다.");
        return;
      }
      setReport(result.report);
      setFrom(result.report.from);
      setTo(result.report.to);
      setShowAggregate(true);
      setMessage("");
    } catch {
      setFailed(true);
      setMessage("네트워크 상태를 확인한 뒤 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.visitorManager}>
      <form
        className={`local_sch01 local_sch ${styles.visitorSearch}`}
        onSubmit={search}
      >
        <Link
          className={styles.visitorFirst}
          href="/adm/tools/visitor-search"
          onClick={() => {
            setQuery("");
            setSearchField("ip");
            setShowAggregate(false);
            setMessage("");
            setFailed(false);
          }}
        >
          처음
        </Link>
        <label className="sound_only" htmlFor="visitor-search-field">
          검색분류
        </label>
        <select
          id="visitor-search-field"
          name="sfl"
          value={searchField}
          onChange={(event) =>
            setSearchField(
              event.currentTarget.value as "ip" | "path" | "date",
            )
          }
        >
          <option value="ip">IP</option>
          <option value="path">접속경로</option>
          <option value="date">날짜</option>
        </select>
        <label className="sound_only" htmlFor="visitor-query">
          검색어
        </label>
        <input
          id="visitor-query"
          className="frm_input"
          type="text"
          name="stx"
          value={query}
          maxLength={100}
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
        <input
          className={`btn_submit ${styles.visitorSubmit}`}
          type="submit"
          value={loading ? "조회 중…" : "검색"}
          disabled={loading}
        />
        <FieldError value={fieldErrors.from || fieldErrors.to} />
      </form>
      <StatusMessage message={message} failed={failed} />
      {!showAggregate ? (
        <div className={`tbl_head01 tbl_wrap ${styles.visitorTable}`}>
          <table>
            <caption>접속자 검색 목록</caption>
            <colgroup>
              <col className={styles.visitorColIp} />
              <col className={styles.visitorColPath} />
              <col className={styles.visitorColBrowser} />
              <col className={styles.visitorColOs} />
              <col className={styles.visitorColDevice} />
              <col className={styles.visitorColDate} />
            </colgroup>
            <thead>
              <tr>
                <th scope="col">IP</th>
                <th scope="col">접속 경로</th>
                <th scope="col">브라우저</th>
                <th scope="col">OS</th>
                <th scope="col">접속기기</th>
                <th scope="col">일시</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td
                  className={`empty_table ${styles.visitorEmpty}`}
                  colSpan={6}
                >
                  자료가 없습니다.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <div className={styles.visitorAggregate}>
          <div className="local_ov">
            익명 집계 {report.from} ~ {report.to} · 페이지 조회{" "}
            {report.totalPageViews.toLocaleString("ko-KR")}회 · 방문자{" "}
            {report.totalUniqueVisitors.toLocaleString("ko-KR")}명
          </div>
          <div className="tbl_head01 tbl_wrap">
        <table>
          <caption>일자별 접속 현황</caption>
          <thead>
            <tr>
              <th scope="col">일자</th>
              <th scope="col">페이지 조회</th>
              <th scope="col">방문자</th>
              <th scope="col">재조회</th>
            </tr>
          </thead>
          <tbody>
            {report.days.map((day) => (
              <tr key={day.date}>
                <td>{day.date}</td>
                <td>{day.pageViews.toLocaleString("ko-KR")}회</td>
                <td>{day.uniqueVisitors.toLocaleString("ko-KR")}명</td>
                <td>{day.repeatViews.toLocaleString("ko-KR")}회</td>
              </tr>
            ))}
            {report.days.length === 0 ? (
              <tr>
                <td className="empty_table" colSpan={4}>
                  선택한 기간의 접속 자료가 없습니다.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
          </div>
        </div>
      )}
    </div>
  );
}

function FieldError({ value }: { value?: string }) {
  return value ? <span className={styles.fieldError}>{value}</span> : null;
}

function StatusMessage({
  message,
  failed,
}: {
  message: string;
  failed: boolean;
}) {
  return message ? (
    <p
      className={`${styles.statusMessage} ${
        failed ? styles.statusError : styles.statusSuccess
      }`}
      role={failed ? "alert" : "status"}
    >
      {message}
    </p>
  ) : null;
}
