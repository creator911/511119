/* eslint-disable @next/next/no-html-link-for-pages -- Legacy administrator navigation intentionally performs full-page requests. */
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AdminPanel, Notice } from "@/app/components/admin";
import {
  getIncompleteOrdersReport,
  getPointReport,
  getProductRankingReport,
  getSalesReport,
  type PointLedgerEventType,
  type PointReportResult,
  type SalesReportResult,
} from "@/lib/admin-reports";
import {
  getEffectiveProducts,
  type ManagedCatalogProduct,
} from "@/lib/admin-products";
import { requireAdminPagePermission } from "@/lib/auth";
import { legacyAdminCategoryOptions } from "@/lib/legacy-admin-category-options";
import adminStyles from "../../admin-routes.module.css";
import styles from "./reports.module.css";
import { IncompleteOrdersManager } from "./IncompleteOrdersManager";
import {
  PointLedgerCreateForm,
  PointLedgerDeleteButton,
} from "./PointLedgerActions";

export const metadata: Metadata = {
  title: "운영 리포트",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type ReportView = "sales" | "ranking" | "incomplete" | "points";

type ReportPayload =
  | { view: "sales"; report: SalesReportResult }
  | {
      view: "ranking";
      report: Awaited<ReturnType<typeof getProductRankingReport>>;
      fallbackProducts: ManagedCatalogProduct[];
      categoryId: string;
      categories: Array<{ id: string; name: string }>;
      rawDateStart: string;
      rawDateEnd: string;
    }
  | {
      view: "incomplete";
      report: Awaited<ReturnType<typeof getIncompleteOrdersReport>>;
    }
  | { view: "points"; report: PointReportResult };

interface ReportsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const reportViews: ReadonlyArray<{
  id: ReportView;
  label: string;
  href: string;
}> = [
  { id: "sales", label: "매출 집계", href: "/adm/reports?view=sales" },
  { id: "ranking", label: "상품 순위", href: "/adm/reports?view=ranking" },
  {
    id: "incomplete",
    label: "미입금·미완료",
    href: "/adm/reports?view=incomplete",
  },
  { id: "points", label: "포인트 원장", href: "/adm/reports?view=points" },
];

export default async function AdminReportsPage({
  searchParams,
}: ReportsPageProps) {
  const params = await searchParams;
  const requestedView = readString(params.view);
  const activeView = reportViews.some((view) => view.id === requestedView)
    ? (requestedView as ReportView)
    : "sales";
  await requireAdminPagePermission(
    activeView === "incomplete"
      ? "orders.manage"
      : activeView === "points"
        ? "members.manage"
        : "reports.view",
  );

  const salesReportMode =
    activeView === "sales" && readString(params.mode) === "report";
  if (activeView === "sales" && !salesReportMode) {
    return <SalesReportLauncher />;
  }

  let reportPayload: ReportPayload | undefined;
  try {
    if (activeView === "ranking") {
      const report = await getProductRankingReport({
        q: readString(params.q),
        dateStart: readString(params.dateStart),
        dateEnd: readString(params.dateEnd),
        sortBy: readString(params.sortBy),
        page: readNumber(params.page),
        pageSize: 15,
      });
      const fallbackProducts =
        report.total === 0 ? await getEffectiveProducts() : [];
      reportPayload = {
        view: "ranking",
        report,
        fallbackProducts,
        categoryId: readString(params.category),
        categories: [...legacyAdminCategoryOptions],
        rawDateStart: readString(params.dateStart),
        rawDateEnd: readString(params.dateEnd),
      };
    } else if (activeView === "incomplete") {
      const report = await getIncompleteOrdersReport({
        q: readString(params.q),
        dateStart: readString(params.dateStart),
        dateEnd: readString(params.dateEnd),
        mode: readString(params.mode),
        page: readNumber(params.page),
      });
      reportPayload = { view: "incomplete", report };
    } else if (activeView === "points") {
      const report = await getPointReport({
        q: readString(params.q),
        eventType: readString(params.eventType),
        dateStart: readString(params.dateStart),
        dateEnd: readString(params.dateEnd),
        balancePage: readNumber(params.balancePage),
        ledgerPage: readNumber(params.ledgerPage),
      });
      reportPayload = { view: "points", report };
    } else {
      const salesRange = resolveSalesDateRange(params);
      const report = await getSalesReport({
        dateStart: salesRange.dateStart,
        dateEnd: salesRange.dateEnd,
        page: readNumber(params.page),
      });
      reportPayload = { view: "sales", report };
    }
  } catch (error) {
    console.error("Failed to load administrator report.", error);
    reportPayload = undefined;
  }

  const reportContent = reportPayload ? (
    <ReportContent payload={reportPayload} />
  ) : (
    <Notice tone="danger">
      운영 리포트 데이터베이스를 불러오지 못했습니다. 잠시 후 다시
      시도하고, 같은 문제가 계속되면 서버 상태를 확인해 주세요.
    </Notice>
  );

  return (
    <div
      className={`${adminStyles.contentStack} ${
        activeView === "points" ? "legacy-point-page" : ""
      }`}
    >
      {activeView !== "points" &&
      activeView !== "incomplete" &&
      activeView !== "ranking" ? (
        <>
          <nav className={adminStyles.sectionNav} aria-label="운영 리포트 구분">
            {reportViews.map((view) => (
              <a
                key={view.id}
                className={`${adminStyles.sectionNavLink} ${
                  activeView === view.id ? adminStyles.sectionNavLinkActive : ""
                }`}
                href={view.href}
                aria-current={activeView === view.id ? "page" : undefined}
              >
                {view.label}
              </a>
            ))}
          </nav>
          <Notice>
            모든 날짜는 한국시간 기준입니다. 개인정보 보호를 위해 리포트
            내보내기는 제공하지 않으며 관리자 화면 안에서만 조회합니다.
          </Notice>
        </>
      ) : null}
      {reportContent}
    </div>
  );
}

function SalesReportLauncher() {
  const today = koreanTodayParts();
  return (
    <div className={styles.salesLauncher}>
      <form
        className={styles.salesLaunchForm}
        method="get"
        action="/adm/reports"
      >
        <strong>일일 매출</strong>
        <input type="hidden" name="view" value="sales" />
        <input type="hidden" name="mode" value="report" />
        <input type="hidden" name="range" value="daily" />
        <input
          id="sales-daily-day"
          name="day"
          className={styles.salesDateInput}
          type="text"
          inputMode="numeric"
          maxLength={8}
          aria-label="조회일 YYYYMMDD"
          defaultValue={today.iso.replaceAll("-", "")}
        />
        <span className={styles.salesDailyUnit}>일 하루</span>
        <input
          className={styles.salesSubmit}
          type="submit"
          value="확인"
        />
      </form>

      <form
        className={styles.salesLaunchForm}
        method="get"
        action="/adm/reports"
      >
        <strong>일간 매출</strong>
        <input type="hidden" name="view" value="sales" />
        <input type="hidden" name="mode" value="report" />
        <input type="hidden" name="range" value="period" />
        <input
          id="sales-period-start"
          name="dateStart"
          className={styles.salesDateInput}
          type="text"
          inputMode="numeric"
          maxLength={8}
          aria-label="시작일 YYYYMMDD"
          defaultValue={`${today.year}${pad2(today.month)}01`}
        />
        <span className={styles.salesRangeSeparator}>일 ~</span>
        <input
          id="sales-period-end"
          name="dateEnd"
          className={styles.salesDateInput}
          type="text"
          inputMode="numeric"
          maxLength={8}
          aria-label="종료일 YYYYMMDD"
          defaultValue={today.iso.replaceAll("-", "")}
        />
        <span className={styles.salesEndUnit}>일</span>
        <input
          className={styles.salesSubmit}
          type="submit"
          value="확인"
        />
      </form>

      <form
        className={styles.salesLaunchForm}
        method="get"
        action="/adm/reports"
      >
        <strong>월간 매출</strong>
        <input type="hidden" name="view" value="sales" />
        <input type="hidden" name="mode" value="report" />
        <input type="hidden" name="range" value="monthly" />
        <input
          id="sales-month-start"
          name="monthStart"
          className={styles.salesMonthInput}
          type="text"
          inputMode="numeric"
          maxLength={6}
          aria-label="시작월 YYYYMM"
          defaultValue={`${today.year}01`}
        />
        <span className={styles.salesRangeSeparator}>월 ~</span>
        <input
          id="sales-month-end"
          name="monthEnd"
          className={styles.salesMonthInput}
          type="text"
          inputMode="numeric"
          maxLength={6}
          aria-label="종료월 YYYYMM"
          defaultValue={`${today.year}${pad2(today.month)}`}
        />
        <span className={styles.salesEndUnit}>월</span>
        <input
          className={styles.salesSubmit}
          type="submit"
          value="확인"
        />
      </form>

      <form
        className={styles.salesLaunchForm}
        method="get"
        action="/adm/reports"
      >
        <strong>연간 매출</strong>
        <input type="hidden" name="view" value="sales" />
        <input type="hidden" name="mode" value="report" />
        <input type="hidden" name="range" value="annual" />
        <input
          id="sales-year-start"
          name="yearStart"
          className={styles.salesYearInput}
          type="text"
          inputMode="numeric"
          maxLength={4}
          aria-label="시작연도 YYYY"
          defaultValue={String(today.year - 1)}
        />
        <span className={styles.salesRangeSeparator}>년 ~</span>
        <input
          id="sales-year-end"
          name="yearEnd"
          className={styles.salesYearInput}
          type="text"
          inputMode="numeric"
          maxLength={4}
          aria-label="종료연도 YYYY"
          defaultValue={String(today.year)}
        />
        <span className={styles.salesEndUnit}>년</span>
        <input
          className={styles.salesSubmit}
          type="submit"
          value="확인"
        />
      </form>
    </div>
  );
}

function ReportContent({ payload }: { payload: ReportPayload }) {
  if (payload.view === "ranking") {
    return (
      <RankingReport
        report={payload.report}
        fallbackProducts={payload.fallbackProducts}
        categoryId={payload.categoryId}
        categories={payload.categories}
        rawDateStart={payload.rawDateStart}
        rawDateEnd={payload.rawDateEnd}
      />
    );
  }
  if (payload.view === "incomplete") {
    return <IncompleteReport report={payload.report} />;
  }
  if (payload.view === "points") {
    return <PointsReport report={payload.report} />;
  }
  return <SalesReport report={payload.report} />;
}

function resolveSalesDateRange(
  params: Record<string, string | string[] | undefined>,
): { dateStart: string; dateEnd: string } {
  const range = readString(params.range);
  if (range === "daily") {
    const day = compactDate(readString(params.day));
    return { dateStart: day, dateEnd: day };
  }
  if (range === "monthly") {
    const today = koreanTodayParts();
    const start = compactMonth(
      readString(params.monthStart),
      today.year,
      today.month,
    );
    const end = compactMonth(
      readString(params.monthEnd),
      today.year,
      today.month,
    );
    const first = start.key <= end.key ? start : end;
    const last = start.key <= end.key ? end : start;
    const lastDay = new Date(Date.UTC(last.year, last.month, 0)).getUTCDate();
    return {
      dateStart: `${first.year}-${pad2(first.month)}-01`,
      dateEnd: `${last.year}-${pad2(last.month)}-${pad2(lastDay)}`,
    };
  }
  if (range === "annual") {
    const today = koreanTodayParts();
    const first = clampWholeNumber(
      readString(params.yearStart),
      2000,
      2200,
      today.year,
    );
    const last = clampWholeNumber(
      readString(params.yearEnd),
      2000,
      2200,
      today.year,
    );
    const dateStartYear = Math.min(first, last);
    const dateEndYear = Math.max(first, last);
    return {
      dateStart: `${dateStartYear}-01-01`,
      dateEnd: `${dateEndYear}-12-31`,
    };
  }
  return {
    dateStart: compactDate(readString(params.dateStart)),
    dateEnd: compactDate(readString(params.dateEnd)),
  };
}

function compactDate(value: string): string {
  const digits = value.replaceAll("-", "");
  if (!/^\d{8}$/u.test(digits)) return "";
  const formatted = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  const parsed = new Date(`${formatted}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === formatted
    ? formatted
    : "";
}

function compactMonth(
  value: string,
  fallbackYear: number,
  fallbackMonth: number,
): { year: number; month: number; key: number } {
  const digits = value.replaceAll("-", "");
  const match = /^(\d{4})(\d{2})$/u.exec(digits);
  const year = match
    ? clampWholeNumber(match[1], 2000, 2200, fallbackYear)
    : fallbackYear;
  const month = match
    ? clampWholeNumber(match[2], 1, 12, fallbackMonth)
    : fallbackMonth;
  return { year, month, key: year * 100 + month };
}

function koreanTodayParts(): { year: number; month: number; day: number; iso: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");
  const year = value("year");
  const month = value("month");
  const day = value("day");
  return {
    year,
    month,
    day,
    iso: `${year}-${pad2(month)}-${pad2(day)}`,
  };
}

function clampWholeNumber(
  value: string,
  minimum: number,
  maximum: number,
  fallback: number,
): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, parsed));
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function SalesReport({ report }: { report: SalesReportResult }) {
  const params = {
    view: "sales",
    dateStart: report.filters.dateStart,
    dateEnd: report.filters.dateEnd,
  };
  return (
    <>
      <ReportFilterForm view="sales">
        <DateFields
          dateStart={report.filters.dateStart}
          dateEnd={report.filters.dateEnd}
        />
      </ReportFilterForm>
      <MetricGrid
        items={[
          { label: "전체 주문", value: `${formatNumber(report.summary.orderCount)}건` },
          {
            label: "결제완료 주문",
            value: `${formatNumber(report.summary.paidOrderCount)}건`,
          },
          {
            label: "결제완료 매출",
            value: formatMoney(report.summary.salesAmount),
            tone: "positive",
          },
          {
            label: "취소 주문",
            value: `${formatNumber(report.summary.cancelledCount)}건`,
          },
          {
            label: "반품·환불",
            value: `${formatNumber(report.summary.refundedCount)}건`,
            tone: "negative",
          },
          {
            label: "환불 주문금액",
            value: formatMoney(report.summary.refundedAmount),
            tone: "negative",
          },
          {
            label: "사용 포인트",
            value: `${formatNumber(report.summary.pointsUsed)}P`,
          },
        ]}
      />
      <AdminPanel
        title="일자별 매출"
        subtitle={`${report.filters.dateStart} ~ ${report.filters.dateEnd} · ${formatNumber(report.total)}일`}
        flush
      >
        <ReportTable
          headers={[
            "일자",
            "주문",
            "결제완료",
            "매출",
            "취소",
            "반품·환불",
            "환불 주문금액",
            "사용 포인트",
          ]}
          rows={report.rows.map((row) => [
            row.businessDate,
            `${formatNumber(row.orderCount)}건`,
            `${formatNumber(row.paidOrderCount)}건`,
            formatMoney(row.salesAmount),
            `${formatNumber(row.cancelledCount)}건`,
            `${formatNumber(row.refundedCount)}건`,
            formatMoney(row.refundedAmount),
            `${formatNumber(row.pointsUsed)}P`,
          ])}
          empty="선택한 기간에 주문이 없습니다."
        />
        <Pagination
          page={report.page}
          totalPages={report.totalPages}
          params={params}
        />
      </AdminPanel>
    </>
  );
}

function RankingReport({
  report,
  fallbackProducts,
  categoryId,
  categories,
  rawDateStart,
  rawDateEnd,
}: {
  report: Awaited<ReturnType<typeof getProductRankingReport>>;
  fallbackProducts: ManagedCatalogProduct[];
  categoryId: string;
  categories: Array<{ id: string; name: string }>;
  rawDateStart: string;
  rawDateEnd: string;
}) {
  const params = {
    view: "ranking",
    q: report.filters.q,
    dateStart: report.filters.dateStart,
    dateEnd: report.filters.dateEnd,
    sortBy: report.filters.sortBy,
    category: categoryId,
  };
  const activeFallbackProducts = fallbackProducts.filter(
    (product) =>
      product.active &&
      (!categoryId || product.categoryId.startsWith(categoryId)),
  );
  const usingFallback =
    report.rows.length === 0 && activeFallbackProducts.length > 0;
  const fallbackPage = Math.max(1, report.page);
  const fallbackRows = activeFallbackProducts.slice(
    (fallbackPage - 1) * 15,
    fallbackPage * 15,
  );
  const displayRows = usingFallback
    ? fallbackRows.map((product) => ({
        productId: product.id,
        productName: product.name,
        image: product.images[0] ?? "",
        statuses: [0, 0, 0, 0, 0, 0, 0, 0, 0] as const,
        total: 0,
      }))
    : report.rows.map((row) => ({
        productId: row.productId,
        productName: row.productName,
        image: "",
        statuses: [
          0,
          row.orderCount,
          0,
          0,
          0,
          row.quantity,
          0,
          0,
          0,
        ] as const,
        total: row.quantity,
      }));
  const total = usingFallback ? activeFallbackProducts.length : report.total;
  const totalPages = Math.max(1, Math.ceil(total / 15));
  return (
    <div className={styles.legacyRanking}>
      <div className="btn_fixed_top">
        <a className="btn btn_02" href="/adm/products?view=stock">
          상품재고관리
        </a>{" "}
        <a className="btn btn_01" href="/adm/products/new">
          상품등록
        </a>
      </div>
      <div className={`local_ov01 local_ov ${styles.legacyRankingSummary}`}>
        <a className="ov_listall" href="/adm/reports?view=ranking">
          전체목록
        </a>{" "}
        <span className="btn_ov01">
          <span className="ov_txt">등록상품</span>
          <span className="ov_num">{formatNumber(total)}건</span>
        </span>
      </div>
      <form
        className={`local_sch01 local_sch ${styles.legacyRankingSearch}`}
        method="get"
        action="/adm/reports"
      >
        <input type="hidden" name="view" value="ranking" />
        <label className="sound_only" htmlFor="ranking-category">
          검색대상
        </label>
        <select
          id="ranking-category"
          name="category"
          defaultValue={categoryId}
        >
          <option value="">전체분류</option>
          {categories.map((option) => (
            <option value={option.id} key={option.id}>
              {option.name}
            </option>
          ))}
        </select>
        <span className={styles.rankingPeriodLabel}>기간설정</span>
        <label className="sound_only" htmlFor="ranking-start">
          시작일
        </label>
        <input
          id="ranking-start"
          className="required frm_input"
          name="dateStart"
          type="text"
          defaultValue={rawDateStart.replaceAll("-", "")}
        />
        <span className={styles.rankingMiddleLabel}>에서</span>
        <label className="sound_only" htmlFor="ranking-end">
          종료일
        </label>
        <input
          id="ranking-end"
          className="required frm_input"
          name="dateEnd"
          type="text"
          defaultValue={(rawDateEnd || report.filters.dateEnd).replaceAll("-", "")}
        />
        <span className={styles.rankingEndLabel}>까지</span>
        <input className="btn_submit" type="submit" value="검색" />
      </form>
      <div className={`local_desc01 local_desc ${styles.legacyRankingDesc}`}>
        <p>판매량을 합산하여 상품판매순위를 집계합니다.</p>
      </div>
      <div className={`tbl_head01 tbl_wrap ${styles.legacyRankingTable}`}>
          <table>
            <colgroup>
              <col style={{ width: 60 }} />
              <col style={{ width: 344 }} />
              {Array.from({ length: 10 }, (_, index) => (
                <col key={index} style={{ width: 60 }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th>순위</th>
                <th>상품명</th>
                {[
                  "쇼핑",
                  "주문",
                  "입금",
                  "준비",
                  "배송",
                  "완료",
                  "취소",
                  "반품",
                  "품절",
                  "합계",
                ].map((label) => (
                  <th key={label}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayRows.map((row, index) => (
                <tr key={row.productId}>
                  <td className="td_num">
                    {(fallbackPage - 1) * 15 + index + 1}
                  </td>
                  <td className="td_left">
                    <a
                      href={`/shop/item.php?it_id=${encodeURIComponent(row.productId)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {row.image ? (
                        <img src={row.image} alt="" width={50} height={50} />
                      ) : null}{" "}
                      {row.productName}
                    </a>
                  </td>
                  {row.statuses.map((value, index) => (
                    <td className="td_num" key={index}>
                      {value}
                    </td>
                  ))}
                  <td className="td_num">{row.total}</td>
                </tr>
              ))}
              {displayRows.length === 0 ? (
                <tr>
                  <td className="empty_table" colSpan={12}>
                    자료가 없습니다.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
      </div>
      <LegacyRankingPagination
        page={fallbackPage}
        totalPages={totalPages}
        params={params}
      />
    </div>
  );
}

function LegacyRankingPagination({
  page,
  totalPages,
  params,
}: {
  page: number;
  totalPages: number;
  params: Record<string, string | number | undefined>;
}) {
  if (totalPages <= 1) return null;
  const firstVisible = Math.floor((page - 1) / 10) * 10 + 1;
  const lastVisible = Math.min(totalPages, firstVisible + 9);
  const pages = Array.from(
    { length: lastVisible - firstVisible + 1 },
    (_, index) => firstVisible + index,
  );
  return (
    <nav
      className={`pg_wrap ${styles.legacyRankingPager}`}
      aria-label="상품판매순위 페이지 이동"
    >
      <span className="pg">
        {page > 1 ? (
          <>
            <a
              className="pg_page pg_start"
              href={reportHref(params, "page", 1)}
            >
              처음
            </a>
            <a
              className="pg_page pg_prev"
              href={reportHref(params, "page", Math.max(1, page - 1))}
            >
              이전
            </a>
          </>
        ) : null}
        {pages.map((item) =>
          item === page ? (
            <strong className="pg_current" aria-current="page" key={item}>
              <span className="sound_only">열린</span>
              {item}
              <span className="sound_only">페이지</span>
            </strong>
          ) : (
            <a
              className="pg_page"
              href={reportHref(params, "page", item)}
              key={item}
            >
              {item}
              <span className="sound_only">페이지</span>
            </a>
          ),
        )}
        {page < totalPages ? (
          <>
            <a
              className="pg_page pg_end"
              href={reportHref(params, "page", totalPages)}
            >
              맨끝
            </a>
          </>
        ) : null}
      </span>
    </nav>
  );
}

function IncompleteReport({
  report,
}: {
  report: Awaited<ReturnType<typeof getIncompleteOrdersReport>>;
}) {
  const params = {
    view: "incomplete",
    q: report.filters.q,
    dateStart: report.filters.dateStart,
    dateEnd: report.filters.dateEnd,
    mode: report.filters.mode,
  };
  return (
    <>
      <div className={`local_ov01 local_ov ${styles.legacyIncompleteSummary}`}>
        <a className="ov_listall" href="/adm/reports?view=incomplete">
          전체목록
        </a>{" "}
        <span className="btn_ov01">
          <span className="ov_txt">전체</span>
          <span className="ov_num">{formatNumber(report.total)}건</span>
        </span>
      </div>
      <form
        className={`local_sch01 local_sch ${styles.legacyIncompleteSearch}`}
        method="get"
        action="/adm/reports"
      >
        <input type="hidden" name="view" value="incomplete" />
        <input type="hidden" name="mode" value={report.filters.mode} />
        <input type="hidden" name="dateStart" value={report.filters.dateStart} />
        <input type="hidden" name="dateEnd" value={report.filters.dateEnd} />
        <label className="sound_only" htmlFor="incomplete-field">
          검색대상
        </label>
        <select id="incomplete-field" name="field" defaultValue="order">
          <option value="order">주문번호</option>
        </select>
        <label className="sound_only" htmlFor="incomplete-query">
          검색어
        </label>
        <input
          id="incomplete-query"
          className="frm_input"
          name="q"
          defaultValue={report.filters.q}
        />
        <input className="btn_submit" type="submit" value="검색" />
      </form>
      <IncompleteOrdersManager report={report} />
      <Pagination
        page={report.page}
        totalPages={report.totalPages}
        params={params}
      />
    </>
  );
}

function PointsReport({ report }: { report: PointReportResult }) {
  const commonParams = {
    view: "points",
    q: report.filters.q,
    eventType: report.filters.eventType,
    dateStart: report.filters.dateStart,
    dateEnd: report.filters.dateEnd,
  };
  const balanceByUser = new Map(
    report.balances.rows.map((row) => [row.userId, row.points]),
  );
  return (
    <>
      <PointLedgerDeleteButton />
      <div className="local_ov legacy-point-summary">
        <span className="legacy-summary-label">전체목록</span>
        <span className="legacy-summary-count">
          전체 <strong>{formatNumber(report.ledger.total)}</strong>건
        </span>
        <span className="legacy-summary-total">
          전체 합계{" "}
          <strong>{formatNumber(report.balanceSummary.totalPoints)}</strong>점
        </span>
      </div>
      <form
        className="legacy-point-search"
        method="get"
        action="/adm/reports"
      >
        <input type="hidden" name="view" value="points" />
        <select aria-label="검색 기준" defaultValue="member">
          <option value="member">회원아이디</option>
          <option value="name">이름</option>
          <option value="order">주문번호</option>
        </select>
        <input
          type="search"
          name="q"
          defaultValue={report.filters.q}
          aria-label="검색어"
        />
        <button type="submit">검색</button>
      </form>
      <div className="legacy-point-table">
        <ReportTable
          headers={[
            "",
            "회원아이디",
            "이름",
            "닉네임",
            "포인트 내용",
            "포인트",
            "일시",
            "만료일",
            "포인트합",
          ]}
          rows={report.ledger.rows.map((row) => [
            <input
              key={`${row.eventType}-${row.orderId}-${row.occurredAt}-check`}
              type="checkbox"
              data-admin-point-entry={row.deletable ? "true" : undefined}
              data-entry-id={row.entryId ?? undefined}
              data-revision={row.revision ?? undefined}
              disabled={!row.deletable}
              title={
                row.deletable
                  ? "관리자 조정 내역 선택"
                  : "주문·충전 정산 내역은 직접 삭제할 수 없습니다."
              }
              aria-label={`${row.loginId} 포인트 내역 선택`}
            />,
            <a
              key={`${row.userId}-member`}
              className={styles.primaryLink}
              href={`/adm/users?q=${encodeURIComponent(row.loginId)}`}
            >
              {row.loginId}
            </a>,
            row.name,
            row.loginId,
            row.reason ||
            (row.orderId
              ? `주문번호 ${row.orderId} ${pointEventLabel(row.eventType)}`
              : pointEventLabel(row.eventType)),
            <strong
              key={`${row.eventType}-${row.orderId}-points`}
              className={row.points >= 0 ? styles.positive : styles.negative}
            >
              {row.points > 0 ? "+" : ""}
              {formatNumber(row.points)}
            </strong>,
            formatKoreaDateTime(row.occurredAt),
            row.expiresAt ?? "-",
            formatNumber(
              row.balanceAfter ?? balanceByUser.get(row.userId) ?? 0,
            ),
          ])}
          empty="자료가 없습니다."
        />
        <Pagination
          page={report.ledger.page}
          totalPages={report.ledger.totalPages}
          params={{
            ...commonParams,
            balancePage: report.balances.page,
          }}
          pageKey="ledgerPage"
        />
      </div>
      <PointLedgerCreateForm />
    </>
  );
}

function ReportFilterForm({
  view,
  children,
}: {
  view: ReportView;
  children: ReactNode;
}) {
  return (
    <form className={styles.filters} method="get" action="/adm/reports">
      <input type="hidden" name="view" value={view} />
      <div className={styles.filterFields}>{children}</div>
      <div className={styles.filterActions}>
        <button className={styles.primaryButton} type="submit">
          조회
        </button>
        <a className={styles.secondaryButton} href={`/adm/reports?view=${view}`}>
          초기화
        </a>
      </div>
    </form>
  );
}

function SearchField({
  defaultValue,
  placeholder,
}: {
  defaultValue: string;
  placeholder: string;
}) {
  return (
    <label className={`${styles.field} ${styles.fieldWide}`}>
      <span>검색</span>
      <input
        type="search"
        name="q"
        defaultValue={defaultValue}
        maxLength={200}
        placeholder={placeholder}
      />
    </label>
  );
}

function DateFields({
  dateStart,
  dateEnd,
}: {
  dateStart: string;
  dateEnd: string;
}) {
  return (
    <fieldset className={styles.dateFields}>
      <legend>조회기간</legend>
      <input
        type="date"
        name="dateStart"
        defaultValue={dateStart}
        aria-label="조회 시작일"
      />
      <span aria-hidden="true">~</span>
      <input
        type="date"
        name="dateEnd"
        defaultValue={dateEnd}
        aria-label="조회 종료일"
      />
    </fieldset>
  );
}

function MetricGrid({
  items,
}: {
  items: Array<{
    label: string;
    value: string;
    tone?: "positive" | "negative";
  }>;
}) {
  return (
    <section className={styles.metrics} aria-label="리포트 요약">
      {items.map((item) => (
        <article className={styles.metric} key={item.label}>
          <span>{item.label}</span>
          <strong
            className={
              item.tone === "positive"
                ? styles.positive
                : item.tone === "negative"
                  ? styles.negative
                  : undefined
            }
          >
            {item.value}
          </strong>
        </article>
      ))}
    </section>
  );
}

function ReportTable({
  headers,
  rows,
  empty,
}: {
  headers: string[];
  rows: ReactNode[][];
  empty: string;
}) {
  return (
    <div className={styles.tableScroll}>
      <table className={styles.table}>
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 ? <p className={styles.empty}>{empty}</p> : null}
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  params,
  pageKey = "page",
}: {
  page: number;
  totalPages: number;
  params: Record<string, string | number | undefined>;
  pageKey?: string;
}) {
  if (totalPages <= 1) return null;
  const pages = pageWindow(page, totalPages);
  return (
    <nav className={styles.pagination} aria-label="리포트 페이지 이동">
      <a
        aria-disabled={page <= 1}
        className={page <= 1 ? styles.pageDisabled : styles.pageLink}
        href={reportHref(params, pageKey, Math.max(1, page - 1))}
      >
        이전
      </a>
      {pages.map((item, index) =>
        item === "gap" ? (
          <span className={styles.pageGap} key={`gap-${index}`}>
            …
          </span>
        ) : (
          <a
            className={
              item === page ? styles.pageCurrent : styles.pageLink
            }
            href={reportHref(params, pageKey, item)}
            aria-current={item === page ? "page" : undefined}
            key={item}
          >
            {item}
          </a>
        ),
      )}
      <a
        aria-disabled={page >= totalPages}
        className={
          page >= totalPages ? styles.pageDisabled : styles.pageLink
        }
        href={reportHref(params, pageKey, Math.min(totalPages, page + 1))}
      >
        다음
      </a>
    </nav>
  );
}

function reportHref(
  values: Record<string, string | number | undefined>,
  pageKey: string,
  page: number,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...values, [pageKey]: page })) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  return `/adm/reports?${params.toString()}`;
}

function pageWindow(page: number, totalPages: number): Array<number | "gap"> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }
  const candidates = new Set([
    1,
    2,
    page - 1,
    page,
    page + 1,
    totalPages - 1,
    totalPages,
  ]);
  const pages = [...candidates]
    .filter((value) => value >= 1 && value <= totalPages)
    .sort((left, right) => left - right);
  const result: Array<number | "gap"> = [];
  pages.forEach((value, index) => {
    if (index > 0 && value - pages[index - 1] > 1) result.push("gap");
    result.push(value);
  });
  return result;
}

function pointEventLabel(eventType: PointLedgerEventType): string {
  return {
    used: "주문 사용",
    restored: "취소 복원",
    restore_pending: "취소 복원 대기",
    earned: "배송완료 적립",
    reversed: "환불 회수",
    charged: "충전 승인",
    withdrawn: "출금 승인",
    adjusted: "관리자 조정",
  }[eventType];
}

function formatKoreaDateTime(value: string): string {
  const date = new Date(
    value.includes("T") ? value : `${value.replace(" ", "T")}Z`,
  );
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function formatMoney(value: number): string {
  return `${formatNumber(value)}원`;
}

function formatNumber(value: number): string {
  return value.toLocaleString("ko-KR");
}

function readString(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function readNumber(
  value: string | string[] | undefined,
): number | undefined {
  const candidate = readString(value);
  if (!/^\d+$/u.test(candidate)) return undefined;
  const parsed = Number(candidate);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}
