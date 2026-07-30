import { AdminApiError } from "@/lib/admin-api";
import type { AdminOrderRow } from "@/lib/admin-data";
import { commerceDb, ensureCommerceSchema } from "@/lib/commerce-db";

export type AdminOrderPrintFormat = "html" | "xls" | "csv";
export type AdminOrderPrintCase = "date" | "number";

export interface AdminOrderPrintCriteria {
  printCase: AdminOrderPrintCase;
  format: AdminOrderPrintFormat;
  legacyStatus: string;
  status: string;
  fromDate: string;
  toDate: string;
  fromOrderId: string;
  toOrderId: string;
}

interface AdminOrderPrintDatabaseRow {
  id: string;
  created_at: string;
  orderer_name: string;
  email: string;
  total: number;
  payment_status: string;
  status: string;
  item_name: string;
  item_kinds: number;
  quantity: number;
}

const MAX_PRINT_ROWS = 20_000;
const LEGACY_STATUS_TO_CURRENT = new Map([
  ["", ""],
  ["주문", "ordered"],
  ["입금", "payment_confirmed"],
  ["준비", "preparing"],
  ["배송", "shipped"],
  ["완료", "delivered"],
  ["취소", "cancelled"],
  ["반품", "refunded"],
  // The independent store has no order-level sold-out state. Keep the
  // original selector and return an empty result instead of widening it.
  ["품절", "__soldout__"],
]);

export function parseAdminOrderPrintCriteria(
  params: URLSearchParams,
): AdminOrderPrintCriteria {
  const printCase =
    params.get("case") === "1"
      ? "date"
      : params.get("case") === "2"
        ? "number"
        : null;
  if (!printCase) {
    throw new AdminApiError(400, "출력 구분을 확인해 주세요.");
  }

  const requestedFormat = params.get("csv") ?? "";
  if (
    requestedFormat !== "" &&
    requestedFormat !== "xls" &&
    requestedFormat !== "csv"
  ) {
    throw new AdminApiError(400, "출력 파일 형식을 확인해 주세요.");
  }
  const format: AdminOrderPrintFormat =
    requestedFormat === "xls" || requestedFormat === "csv"
      ? requestedFormat
      : "html";

  const legacyStatus = params.get("ct_status") ?? "";
  const status = LEGACY_STATUS_TO_CURRENT.get(legacyStatus);
  if (status === undefined) {
    throw new AdminApiError(400, "출력할 주문상태를 확인해 주세요.");
  }

  if (printCase === "date") {
    const fromDate = parseYmd(params.get("fr_date"), "기간 시작일");
    const toDate = parseYmd(params.get("to_date"), "기간 종료일");
    if (fromDate > toDate) {
      throw new AdminApiError(
        400,
        "기간 시작일은 종료일보다 늦을 수 없습니다.",
      );
    }
    return {
      printCase,
      format,
      legacyStatus,
      status,
      fromDate,
      toDate,
      fromOrderId: "",
      toOrderId: "",
    };
  }

  const fromOrderId = parseOrderId(
    params.get("fr_od_id"),
    "주문번호 구간 시작",
  );
  const toOrderId = parseOrderId(
    params.get("to_od_id"),
    "주문번호 구간 종료",
  );
  if (fromOrderId > toOrderId) {
    throw new AdminApiError(
      400,
      "주문번호 구간 시작값은 종료값보다 클 수 없습니다.",
    );
  }
  return {
    printCase,
    format,
    legacyStatus,
    status,
    fromDate: "",
    toDate: "",
    fromOrderId,
    toOrderId,
  };
}

export async function listAdminOrdersForPrint(
  criteria: AdminOrderPrintCriteria,
): Promise<AdminOrderRow[]> {
  if (criteria.status === "__soldout__") return [];

  await ensureCommerceSchema();
  const database = commerceDb();
  const conditions: string[] = [];
  const bindings: Array<string | number> = [];

  if (criteria.status) {
    conditions.push("o.status = ?");
    bindings.push(criteria.status);
  }
  if (criteria.printCase === "date") {
    conditions.push("o.created_at >= ?", "o.created_at < ?");
    bindings.push(
      koreaDateBoundaryUtc(criteria.fromDate),
      koreaDateBoundaryUtc(criteria.toDate, true),
    );
  } else {
    conditions.push("o.id >= ?", "o.id <= ?");
    bindings.push(criteria.fromOrderId, criteria.toOrderId);
  }

  const whereClause = `WHERE ${conditions.join(" AND ")}`;
  const count = await database
    .prepare(`SELECT COUNT(*) AS total FROM orders o ${whereClause}`)
    .bind(...bindings)
    .first<{ total: number }>();
  const total = Number(count?.total ?? 0);
  if (!Number.isSafeInteger(total) || total < 0) {
    throw new AdminApiError(500, "주문 출력 건수를 확인하지 못했습니다.");
  }
  if (total > MAX_PRINT_ROWS) {
    throw new AdminApiError(
      413,
      `한 번에 최대 ${MAX_PRINT_ROWS.toLocaleString("ko-KR")}건까지 출력할 수 있습니다. 기간이나 주문번호 구간을 나눠 주세요.`,
    );
  }

  const result = await database
    .prepare(
      `SELECT
         o.id, o.created_at, o.orderer_name, o.email, o.total,
         o.payment_status, o.status,
         COALESCE(MIN(oi.product_name), '') AS item_name,
         COUNT(oi.id) AS item_kinds,
         COALESCE(SUM(oi.quantity), 0) AS quantity
       FROM orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id
       ${whereClause}
       GROUP BY o.id
       ORDER BY o.id ASC
       LIMIT ?`,
    )
    .bind(...bindings, MAX_PRINT_ROWS)
    .all<AdminOrderPrintDatabaseRow>();

  return (result.results ?? []).map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    buyer: row.orderer_name,
    email: row.email,
    total: Number(row.total),
    paymentStatus: row.payment_status,
    status: row.status,
    itemName: row.item_name,
    itemKinds: Number(row.item_kinds),
    quantity: Number(row.quantity),
  }));
}

export function adminOrderPrintCsv(rows: readonly AdminOrderRow[]): string {
  const header = [
    "주문번호",
    "주문일시",
    "주문자",
    "이메일",
    "상품",
    "수량",
    "주문금액",
    "결제상태",
    "주문상태",
  ];
  const lines = rows.map((row) =>
    orderPrintCells(row).map(csvCell).join(","),
  );
  return `\uFEFF${header.map(csvCell).join(",")}\r\n${lines.join("\r\n")}\r\n`;
}

export function adminOrderPrintExcelHtml(
  rows: readonly AdminOrderRow[],
  criteria: AdminOrderPrintCriteria,
): string {
  return `\uFEFF${adminOrderPrintHtml(rows, criteria, false)}`;
}

export function adminOrderPrintHtml(
  rows: readonly AdminOrderRow[],
  criteria: AdminOrderPrintCriteria,
  interactive = true,
): string {
  const headers = [
    "주문번호",
    "주문일시",
    "주문자",
    "이메일",
    "상품",
    "수량",
    "주문금액",
    "결제상태",
    "주문상태",
  ];
  const body = rows.length
    ? rows
        .map(
          (row) =>
            `<tr>${orderPrintCells(row)
              .map((cell) => `<td>${escapeHtml(cell)}</td>`)
              .join("")}</tr>`,
        )
        .join("")
    : `<tr><td colspan="${headers.length}" class="empty">자료가 없습니다.</td></tr>`;
  const action = interactive
    ? '<div class="actions"><button type="button" onclick="window.print()">인쇄</button><button type="button" onclick="window.close()">닫기</button></div>'
    : "";

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>주문내역출력</title>
<style>
*{box-sizing:border-box}
body{margin:20px;color:#333;font:12px/1.5 "Malgun Gothic","맑은 고딕",sans-serif}
h1{margin:0 0 15px;font-size:22px}
.summary{margin:0 0 10px;padding:10px 12px;background:#e9ebf9}
.actions{margin:0 0 10px;text-align:right}
button{height:30px;margin-left:4px;padding:0 12px;border:0;background:#3f51b5;color:#fff;font-weight:bold;cursor:pointer}
table{width:100%;border-collapse:collapse}
th{padding:8px 5px;border:1px solid #5b6b83;background:#6f809a;color:#fff;white-space:nowrap}
td{padding:7px 5px;border:1px solid #d6dce7;white-space:nowrap}
tbody tr:nth-child(even){background:#eff3f9}
td:nth-child(6),td:nth-child(7){text-align:right}
.empty{height:100px;text-align:center}
@media print{body{margin:0}.actions{display:none}}
</style>
</head>
<body>
<h1>주문내역</h1>
<p class="summary">${escapeHtml(orderPrintCriteriaLabel(criteria))} · 총 ${rows.length.toLocaleString("ko-KR")}건</p>
${action}
<table>
<thead><tr>${headers.map((header) => `<th>${header}</th>`).join("")}</tr></thead>
<tbody>${body}</tbody>
</table>
</body>
</html>`;
}

export function adminOrderPrintFilename(
  criteria: AdminOrderPrintCriteria,
): string {
  const range =
    criteria.printCase === "date"
      ? `${criteria.fromDate}-${criteria.toDate}`
      : `${safeFilenamePart(criteria.fromOrderId)}-${safeFilenamePart(criteria.toOrderId)}`;
  return `goldrian-orders-${range}.${criteria.format}`;
}

function orderPrintCells(row: AdminOrderRow): string[] {
  const item =
    row.itemKinds > 1
      ? `${row.itemName} 외 ${row.itemKinds - 1}종`
      : row.itemName;
  return [
    row.id,
    formatKoreaDateTime(row.createdAt),
    row.buyer,
    row.email,
    item,
    String(row.quantity),
    String(row.total),
    paymentStatusLabel(row.paymentStatus),
    orderStatusLabel(row.status),
  ];
}

function orderPrintCriteriaLabel(criteria: AdminOrderPrintCriteria): string {
  const range =
    criteria.printCase === "date"
      ? `${displayYmd(criteria.fromDate)} ~ ${displayYmd(criteria.toDate)}`
      : `${criteria.fromOrderId} ~ ${criteria.toOrderId}`;
  return `${criteria.printCase === "date" ? "기간별 출력" : "주문번호구간별 출력"} · ${range} · 출력대상 ${criteria.legacyStatus || "전체"}`;
}

function parseYmd(value: string | null, label: string): string {
  if (!value || !/^\d{8}$/u.test(value)) {
    throw new AdminApiError(400, `${label}을 YYYYMMDD 형식으로 입력해 주세요.`);
  }
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    throw new AdminApiError(400, `${label}이 올바른 날짜가 아닙니다.`);
  }
  return value;
}

function parseOrderId(value: string | null, label: string): string {
  const normalized = value?.trim() ?? "";
  if (
    !normalized ||
    normalized.length > 20 ||
    /[\u0000-\u0020\u007f]/u.test(normalized)
  ) {
    throw new AdminApiError(400, `${label}을 20자 이내로 입력해 주세요.`);
  }
  return normalized;
}

function koreaDateBoundaryUtc(value: string, nextDay = false): string {
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));
  const milliseconds =
    Date.UTC(year, month - 1, day + (nextDay ? 1 : 0)) -
    9 * 60 * 60 * 1_000;
  return new Date(milliseconds).toISOString().slice(0, 19).replace("T", " ");
}

function formatKoreaDateTime(value: string): string {
  const normalized = /(?:Z|[+-]\d{2}:\d{2})$/u.test(value)
    ? value
    : `${value.replace(" ", "T")}Z`;
  const date = new Date(normalized);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function displayYmd(value: string): string {
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

function paymentStatusLabel(status: string): string {
  return (
    {
      pending: "입금확인중",
      paid: "결제완료",
      failed: "결제실패",
      cancelled: "결제취소",
    }[status] ?? status
  );
}

function orderStatusLabel(status: string): string {
  return (
    {
      ordered: "주문",
      payment_confirmed: "입금",
      preparing: "준비",
      shipped: "배송",
      delivered: "완료",
      cancelled: "취소",
      refunded: "반품",
    }[status] ?? status
  );
}

function csvCell(value: string): string {
  const protectedValue = /^[\t\r\n ]*[=+\-@]/u.test(value)
    ? `'${value}`
    : value;
  return `"${protectedValue.replace(/"/gu, '""')}"`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&#39;");
}

function safeFilenamePart(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/gu, "_").slice(0, 20) || "orders";
}
