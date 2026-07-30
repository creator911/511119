import { AdminApiError } from "@/lib/admin-api";
import { getEffectiveProducts } from "@/lib/admin-products";
import { commerceDb, ensureCommerceSchema } from "@/lib/commerce-db";
import { ensureSiteVisitSchema } from "@/lib/site-visits";

const MAX_SAVED_ROWS = 5_000;
const MAX_VISIT_RANGE_DAYS = 366;
const DAY_MS = 24 * 60 * 60 * 1_000;

export interface SavedItemReportRow {
  id: number;
  ownerKey: string;
  loginId: string;
  memberName: string;
  productId: string;
  productName: string;
  createdAt: string;
}

export interface SavedItemGroup {
  key: string;
  label: string;
  count: number;
  latestAt: string;
}

export interface SavedItemReport {
  memberQuery: string;
  productQuery: string;
  categoryId: string;
  dateStart: string;
  dateEnd: string;
  categories: Array<{ id: string; label: string }>;
  totalItems: number;
  uniqueMembers: number;
  uniqueProducts: number;
  truncated: boolean;
  items: SavedItemReportRow[];
  members: SavedItemGroup[];
  products: SavedItemGroup[];
}

export interface AdminVisitDay {
  date: string;
  pageViews: number;
  uniqueVisitors: number;
  repeatViews: number;
}

export interface AdminVisitReport {
  from: string;
  to: string;
  totalPageViews: number;
  totalUniqueVisitors: number;
  averageDailyViews: number;
  peakDate: string;
  peakPageViews: number;
  days: AdminVisitDay[];
}

interface SavedItemDatabaseRow {
  id: number;
  owner_key: string;
  login_id: string | null;
  member_name: string | null;
  product_id: string;
  created_at: string;
}

export async function getSavedItemReport(input?: {
  member?: string;
  product?: string;
  categoryId?: string;
  dateStart?: string;
  dateEnd?: string;
}): Promise<SavedItemReport> {
  const memberQuery = normalizedQuery(input?.member, 80);
  const productQuery = normalizedQuery(input?.product, 100);
  const categoryId = normalizedQuery(input?.categoryId, 80);
  const dateStart = parseReportDate(input?.dateStart, "dateStart");
  const dateEnd = parseReportDate(input?.dateEnd, "dateEnd");
  if (dateStart && dateEnd && dateStart > dateEnd) {
    throw new AdminApiError(400, "종료일은 시작일보다 빠를 수 없습니다.", {
      dateEnd: "종료일을 다시 확인해 주세요.",
    });
  }
  await ensureCommerceSchema();
  const memberLike = `%${escapeLike(memberQuery)}%`;
  const result = await commerceDb()
    .prepare(
      `SELECT w.id, w.owner_key, w.product_id, w.created_at,
              u.login_id, u.name AS member_name
       FROM wishlist_items w
       LEFT JOIN users u ON u.id = w.owner_key
       WHERE (
         ? = '' OR
         w.owner_key LIKE ? ESCAPE '\\' OR
         COALESCE(u.login_id, '') LIKE ? ESCAPE '\\' OR
         COALESCE(u.name, '') LIKE ? ESCAPE '\\'
       )
       AND (? = '' OR substr(w.created_at, 1, 10) >= ?)
       AND (? = '' OR substr(w.created_at, 1, 10) <= ?)
       ORDER BY w.created_at DESC, w.id DESC
       LIMIT ?`,
    )
    .bind(
      memberQuery,
      memberLike,
      memberLike,
      memberLike,
      dateStart,
      dateStart,
      dateEnd,
      dateEnd,
      MAX_SAVED_ROWS + 1,
    )
    .all<SavedItemDatabaseRow>();
  const products = await getEffectiveProducts();
  const productNames = new Map(
    products.map((product) => [product.id, product.name]),
  );
  const productCategories = new Map(
    products.map((product) => [product.id, product.categoryId]),
  );
  const categories = [
    ...new Set(products.map((product) => product.categoryId).filter(Boolean)),
  ]
    .sort((left, right) => left.localeCompare(right, "ko-KR"))
    .map((id) => ({ id, label: id }));
  const normalizedProductQuery = productQuery.toLocaleLowerCase("ko-KR");
  const allRows = (result.results ?? []).map((row) => ({
    id: Number(row.id),
    ownerKey: row.owner_key,
    loginId: row.login_id ?? "",
    memberName: row.member_name ?? "",
    productId: row.product_id,
    productName: productNames.get(row.product_id) ?? "상품 정보 없음",
    createdAt: row.created_at,
  }));
  const filtered = allRows
    .filter((row) => {
      if (categoryId && productCategories.get(row.productId) !== categoryId) {
        return false;
      }
      if (!normalizedProductQuery) return true;
      return `${row.productId} ${row.productName}`
        .toLocaleLowerCase("ko-KR")
        .includes(normalizedProductQuery);
    })
    .slice(0, MAX_SAVED_ROWS);
  return {
    memberQuery,
    productQuery,
    categoryId,
    dateStart,
    dateEnd,
    categories,
    totalItems: filtered.length,
    uniqueMembers: new Set(filtered.map((row) => row.ownerKey)).size,
    uniqueProducts: new Set(filtered.map((row) => row.productId)).size,
    truncated: allRows.length > MAX_SAVED_ROWS,
    items: filtered.slice(0, 500),
    members: groupSavedItems(
      filtered,
      (row) => row.ownerKey,
      (row) =>
        row.loginId
          ? `${row.loginId}${row.memberName ? ` (${row.memberName})` : ""}`
          : row.ownerKey,
    ),
    products: groupSavedItems(
      filtered,
      (row) => row.productId,
      (row) => row.productName,
    ),
  };
}

export async function getAdminVisitReport(input?: {
  from?: string;
  to?: string;
}): Promise<AdminVisitReport> {
  const today = koreaDate(new Date());
  const defaultFrom = shiftDate(today, -29);
  const from = parseReportDate(input?.from, "from") || defaultFrom;
  const to = parseReportDate(input?.to, "to") || today;
  if (from > to) {
    throw new AdminApiError(400, "종료일은 시작일보다 빠를 수 없습니다.", {
      to: "종료일을 다시 확인해 주세요.",
    });
  }
  const rangeDays =
    Math.round(
      (Date.parse(`${to}T00:00:00Z`) -
        Date.parse(`${from}T00:00:00Z`)) /
        DAY_MS,
    ) + 1;
  if (rangeDays > MAX_VISIT_RANGE_DAYS) {
    throw new AdminApiError(400, "조회 기간은 최대 366일까지 선택할 수 있습니다.", {
      from: "조회 기간을 줄여 주세요.",
    });
  }

  await ensureSiteVisitSchema();
  const result = await commerceDb()
    .prepare(
      `SELECT business_date, page_views, unique_visitors
       FROM site_visit_daily
       WHERE business_date >= ? AND business_date <= ?
       ORDER BY business_date DESC
       LIMIT ?`,
    )
    .bind(from, to, MAX_VISIT_RANGE_DAYS)
    .all<{
      business_date: string;
      page_views: number;
      unique_visitors: number;
    }>();
  const days = (result.results ?? []).map((row) => {
    const pageViews = safeCount(row.page_views);
    const uniqueVisitors = safeCount(row.unique_visitors);
    return {
      date: row.business_date,
      pageViews,
      uniqueVisitors,
      repeatViews: Math.max(0, pageViews - uniqueVisitors),
    };
  });
  const totalPageViews = days.reduce((total, day) => total + day.pageViews, 0);
  const totalUniqueVisitors = days.reduce(
    (total, day) => total + day.uniqueVisitors,
    0,
  );
  const peak = days.reduce<AdminVisitDay | null>(
    (current, day) =>
      !current || day.pageViews > current.pageViews ? day : current,
    null,
  );
  return {
    from,
    to,
    totalPageViews,
    totalUniqueVisitors,
    averageDailyViews:
      rangeDays > 0 ? Math.round(totalPageViews / rangeDays) : 0,
    peakDate: peak?.date ?? "",
    peakPageViews: peak?.pageViews ?? 0,
    days,
  };
}

function groupSavedItems(
  rows: readonly SavedItemReportRow[],
  keyOf: (row: SavedItemReportRow) => string,
  labelOf: (row: SavedItemReportRow) => string,
): SavedItemGroup[] {
  const groups = new Map<string, SavedItemGroup>();
  for (const row of rows) {
    const key = keyOf(row);
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
      if (existing.latestAt < row.createdAt) existing.latestAt = row.createdAt;
    } else {
      groups.set(key, {
        key,
        label: labelOf(row),
        count: 1,
        latestAt: row.createdAt,
      });
    }
  }
  return [...groups.values()]
    .sort(
      (left, right) =>
        right.count - left.count ||
        right.latestAt.localeCompare(left.latestAt) ||
        left.key.localeCompare(right.key),
    )
    .slice(0, 500);
}

function normalizedQuery(value: unknown, maximumLength: number): string {
  return typeof value === "string"
    ? value
        .replace(
          /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu,
          "",
        )
        .trim()
        .slice(0, maximumLength)
    : "";
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/gu, (match) => `\\${match}`);
}

function parseReportDate(value: unknown, field: string): string {
  if (value === undefined || value === null || value === "") return "";
  const compact =
    typeof value === "string" ? value.trim().replaceAll("-", "") : "";
  const normalized = /^\d{8}$/u.test(compact)
    ? `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`
    : "";
  if (!normalized || !isDateString(normalized)) {
    throw new AdminApiError(400, "조회 날짜 형식을 확인해 주세요.", {
      [field]: "날짜를 YYYY-MM-DD 형식으로 입력해 주세요.",
    });
  }
  return normalized;
}

function isDateString(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const [yearText, monthText, dayText] = value.split("-");
  const date = new Date(
    Date.UTC(Number(yearText), Number(monthText) - 1, Number(dayText)),
  );
  return (
    date.getUTCFullYear() === Number(yearText) &&
    date.getUTCMonth() + 1 === Number(monthText) &&
    date.getUTCDate() === Number(dayText)
  );
}

function safeCount(value: unknown): number {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : 0;
}

function koreaDate(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function shiftDate(date: string, days: number): string {
  const timestamp = Date.parse(`${date}T00:00:00Z`) + days * DAY_MS;
  return new Date(timestamp).toISOString().slice(0, 10);
}
