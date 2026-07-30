import { commerceDb, ensureCommerceSchema } from "@/lib/commerce-db";
import { ensureAdminOperationsSchema } from "@/lib/admin-operations";
import { getSiteVisitWeek, type SiteVisitDay } from "@/lib/site-visits";

export interface AdminOrderRow {
  id: string;
  createdAt: string;
  buyer: string;
  email: string;
  total: number;
  paymentStatus: string;
  status: string;
  itemName: string;
  itemKinds: number;
  quantity: number;
}

export interface AdminMemberRow {
  id: string;
  joinedAt: string;
  loginId: string;
  name: string;
  nickname: string;
  email: string;
  phone: string;
  telephone: string;
  emailOptIn: boolean;
  smsOptIn: boolean;
  emailVerified: boolean;
  identityMethod: "none" | "phone" | "ipin";
  identityVerified: boolean;
  adultVerified: boolean;
  publicProfile: boolean;
  points: number;
  level: number;
  active: boolean;
  lastLoginAt: string | null;
}

export type AdminSortDirection = "asc" | "desc";
export type AdminOrderSort =
  | "orderNumber"
  | "orderedAt"
  | "totalAmount";
export type AdminMemberSort =
  | "joinedAt"
  | "loginId"
  | "points"
  | "lastLoginAt";

export interface AdminOrderPageOptions {
  page?: number;
  pageSize?: number;
  q?: string;
  status?: string;
  paymentStatus?: string;
  dateStart?: string;
  dateEnd?: string;
  sortBy?: string;
  sortDirection?: string;
}

export interface AdminMemberPageOptions {
  page?: number;
  pageSize?: number;
  q?: string;
  status?: string;
  dateStart?: string;
  dateEnd?: string;
  sortBy?: string;
  sortDirection?: string;
}

export interface AdminOrderListFilters {
  q: string;
  status: string;
  paymentStatus: string;
  dateStart: string;
  dateEnd: string;
  sortBy: AdminOrderSort;
  sortDirection: AdminSortDirection;
}

export interface AdminMemberListFilters {
  q: string;
  status: string;
  dateStart: string;
  dateEnd: string;
  sortBy: AdminMemberSort;
  sortDirection: AdminSortDirection;
}

export interface AdminOrderPageResult {
  rows: AdminOrderRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  filters: AdminOrderListFilters;
}

export interface AdminMemberPageResult {
  rows: AdminMemberRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  filters: AdminMemberListFilters;
}

export interface AdminDashboardData {
  todayOrders: number;
  todaySales: number;
  todayMembers: number;
  totalOrders: number;
  totalMembers: number;
  statusCounts: Record<string, number>;
  recentOrders: AdminOrderRow[];
  weeklySales: Array<{
    date: string;
    label: string;
    orderCount: number;
    sales: number;
  }>;
  paymentMethods: Array<{
    method: string;
    orderCount: number;
    amount: number;
  }>;
  recentMembers: Array<{
    id: string;
    loginId: string;
    name: string;
    joinedAt: string;
    points: number;
  }>;
  points: {
    total: number;
    holders: number;
    pendingCharges: number;
    pendingWithdrawals: number;
  };
  visitors: SiteVisitDay[];
}

const ADMIN_ORDER_STATUSES = new Set([
  "ordered",
  "payment_confirmed",
  "preparing",
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
]);
const ADMIN_PAYMENT_STATUSES = new Set([
  "pending",
  "paid",
  "failed",
  "cancelled",
]);
const KOREA_TIME_ZONE = "Asia/Seoul";
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export async function getAdminOrdersPage(
  options: AdminOrderPageOptions = {},
): Promise<AdminOrderPageResult> {
  await ensureCommerceSchema();
  const database = commerceDb();
  const normalized = normalizeOrderOptions(options);
  const conditions: string[] = [];
  const bindings: Array<string | number> = [];

  if (normalized.filters.q) {
    const pattern = `%${normalized.filters.q}%`;
    conditions.push(`(
      o.id LIKE ? OR o.orderer_name LIKE ? OR o.email LIKE ?
      OR EXISTS (
        SELECT 1 FROM order_items search_items
        WHERE search_items.order_id = o.id
          AND (
            search_items.product_name LIKE ?
            OR search_items.product_id LIKE ?
          )
      )
    )`);
    bindings.push(pattern, pattern, pattern, pattern, pattern);
  }
  if (normalized.filters.status) {
    conditions.push("o.status = ?");
    bindings.push(normalized.filters.status);
  }
  if (normalized.filters.paymentStatus) {
    conditions.push("o.payment_status = ?");
    bindings.push(normalized.filters.paymentStatus);
  }
  addKoreaDateConditions(
    conditions,
    bindings,
    "o.created_at",
    normalized.filters.dateStart,
    normalized.filters.dateEnd,
  );

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const totalRow = await database
    .prepare(`SELECT COUNT(*) AS total FROM orders o ${whereClause}`)
    .bind(...bindings)
    .first<{ total: number }>();
  const total = Number(totalRow?.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / normalized.pageSize));
  const page = Math.min(normalized.page, totalPages);
  const offset = (page - 1) * normalized.pageSize;
  const sortColumn = {
    orderNumber: "o.id",
    orderedAt: "o.created_at",
    totalAmount: "o.total",
  }[normalized.filters.sortBy];

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
      ORDER BY ${sortColumn} ${normalized.filters.sortDirection.toUpperCase()},
               o.id DESC
      LIMIT ? OFFSET ?`,
    )
    .bind(...bindings, normalized.pageSize, offset)
    .all<AdminOrderDatabaseRow>();

  return {
    rows: (result.results ?? []).map(mapAdminOrderRow),
    total,
    page,
    pageSize: normalized.pageSize,
    totalPages,
    filters: normalized.filters,
  };
}

export async function getAdminMembersPage(
  options: AdminMemberPageOptions = {},
): Promise<AdminMemberPageResult> {
  await ensureAdminOperationsSchema();
  const database = commerceDb();
  const normalized = normalizeMemberOptions(options);
  const conditions: string[] = [];
  const bindings: Array<string | number> = [];

  if (normalized.filters.q) {
    const pattern = `%${normalized.filters.q}%`;
    conditions.push(
      "(u.login_id LIKE ? OR u.name LIKE ? OR u.nickname LIKE ? OR u.email LIKE ? OR u.phone LIKE ? OR u.telephone LIKE ?)",
    );
    bindings.push(pattern, pattern, pattern, pattern, pattern, pattern);
  }
  if (normalized.filters.status === "active") {
    conditions.push("u.active = 1");
  } else if (normalized.filters.status === "inactive") {
    conditions.push("u.active = 0");
  }
  addKoreaDateConditions(
    conditions,
    bindings,
    "u.created_at",
    normalized.filters.dateStart,
    normalized.filters.dateEnd,
  );

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const totalRow = await database
    .prepare(`SELECT COUNT(*) AS total FROM users u ${whereClause}`)
    .bind(...bindings)
    .first<{ total: number }>();
  const total = Number(totalRow?.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / normalized.pageSize));
  const page = Math.min(normalized.page, totalPages);
  const offset = (page - 1) * normalized.pageSize;
  const sortColumn = {
    joinedAt: "u.created_at",
    loginId: "u.login_id",
    points: "u.points",
    lastLoginAt: "u.last_login_at",
  }[normalized.filters.sortBy];

  const result = await database
    .prepare(
       `SELECT id, created_at, login_id, name, nickname, email, phone,
               telephone, email_opt_in, sms_opt_in, email_verified,
               identity_method, identity_verified, adult_verified,
               public_profile, points, level, active, last_login_at
       FROM users u
       ${whereClause}
       ORDER BY ${sortColumn} ${normalized.filters.sortDirection.toUpperCase()},
                u.id DESC
       LIMIT ? OFFSET ?`,
    )
    .bind(...bindings, normalized.pageSize, offset)
    .all<AdminMemberDatabaseRow>();

  return {
    rows: (result.results ?? []).map(mapAdminMemberRow),
    total,
    page,
    pageSize: normalized.pageSize,
    totalPages,
    filters: normalized.filters,
  };
}

export async function getAdminDashboardData(
  now = new Date(),
): Promise<AdminDashboardData> {
  await ensureCommerceSchema();
  const database = commerceDb();
  const bounds = koreaDayBounds(now);
  const todayStart = Date.parse(`${bounds.startUtc.replace(" ", "T")}Z`);
  const weekStartUtc = formatSqlUtc(todayStart - 6 * 24 * 60 * 60 * 1_000);
  const monthStartUtc = formatSqlUtc(todayStart - 29 * 24 * 60 * 60 * 1_000);

  const [
    orderMetrics,
    memberMetrics,
    statusResult,
    recentResult,
    weeklyResult,
    paymentMethodResult,
    recentMemberResult,
    pointSummary,
    walletSummary,
    visitors,
  ] =
    await Promise.all([
      database
        .prepare(
          `SELECT
             COUNT(*) AS total_orders,
             COALESCE(SUM(
               CASE WHEN created_at >= ? AND created_at < ? THEN 1 ELSE 0 END
             ), 0) AS today_orders,
             COALESCE(SUM(
                CASE
                  WHEN created_at >= ? AND created_at < ?
                    AND payment_status = 'paid'
                    AND status NOT IN ('cancelled', 'refunded')
                  THEN total
                  ELSE 0
                END
             ), 0) AS today_sales
           FROM orders`,
        )
        .bind(bounds.startUtc, bounds.endUtc, bounds.startUtc, bounds.endUtc)
        .first<{
          total_orders: number;
          today_orders: number;
          today_sales: number;
        }>(),
      database
        .prepare(
          `SELECT
             COUNT(*) AS total_members,
             COALESCE(SUM(
               CASE WHEN created_at >= ? AND created_at < ? THEN 1 ELSE 0 END
             ), 0) AS today_members
           FROM users`,
        )
        .bind(bounds.startUtc, bounds.endUtc)
        .first<{ total_members: number; today_members: number }>(),
      database
        .prepare(
          "SELECT status, COUNT(*) AS count FROM orders GROUP BY status",
        )
        .all<{ status: string; count: number }>(),
      database
        .prepare(
          `SELECT
             o.id, o.created_at, o.orderer_name, o.email, o.total,
             o.payment_status, o.status,
             COALESCE(MIN(oi.product_name), '') AS item_name,
             COUNT(oi.id) AS item_kinds,
             COALESCE(SUM(oi.quantity), 0) AS quantity
           FROM orders o
           LEFT JOIN order_items oi ON oi.order_id = o.id
           GROUP BY o.id
           ORDER BY o.created_at DESC, o.id DESC
           LIMIT 6`,
        )
        .all<AdminOrderDatabaseRow>(),
      database
        .prepare(
          `SELECT
             substr(datetime(created_at, '+9 hours'), 1, 10) AS business_date,
             COUNT(*) AS order_count,
             COALESCE(SUM(total), 0) AS sales
           FROM orders
           WHERE created_at >= ? AND created_at < ?
             AND payment_status = 'paid'
             AND status NOT IN ('cancelled', 'refunded')
           GROUP BY business_date
           ORDER BY business_date ASC`,
        )
        .bind(weekStartUtc, bounds.endUtc)
        .all<{
          business_date: string;
          order_count: number;
          sales: number;
        }>(),
      database
        .prepare(
          `SELECT
             payment_method, COUNT(*) AS order_count,
             COALESCE(SUM(total), 0) AS amount
           FROM orders
           WHERE created_at >= ? AND created_at < ?
             AND payment_status = 'paid'
             AND status NOT IN ('cancelled', 'refunded')
           GROUP BY payment_method
           ORDER BY amount DESC, payment_method ASC`,
        )
        .bind(monthStartUtc, bounds.endUtc)
        .all<{
          payment_method: string;
          order_count: number;
          amount: number;
        }>(),
      database
        .prepare(
          `SELECT id, login_id, name, created_at, points
           FROM users
           ORDER BY created_at DESC, id DESC
           LIMIT 6`,
        )
        .all<{
          id: string;
          login_id: string;
          name: string;
          created_at: string;
          points: number;
        }>(),
      database
        .prepare(
          `SELECT
             COALESCE(SUM(points), 0) AS total_points,
             COALESCE(SUM(CASE WHEN points > 0 THEN 1 ELSE 0 END), 0) AS holders
           FROM users
           WHERE active = 1`,
        )
        .first<{ total_points: number; holders: number }>(),
      database
        .prepare(
          `SELECT
             COALESCE(SUM(
               CASE WHEN kind = 'charge' AND status = 'requested' THEN 1 ELSE 0 END
             ), 0) AS pending_charges,
             COALESCE(SUM(
               CASE WHEN kind = 'withdrawal' AND status = 'requested' THEN 1 ELSE 0 END
             ), 0) AS pending_withdrawals
           FROM (
             SELECT 'charge' AS kind, status FROM charge_requests
             UNION ALL
             SELECT 'withdrawal' AS kind, status FROM withdrawal_requests
           ) wallet_requests`,
        )
        .first<{
          pending_charges: number;
          pending_withdrawals: number;
        }>(),
      getSiteVisitWeek(now),
    ]);

  const weekDates = Array.from({ length: 7 }, (_, index) => {
    const timestamp =
      todayStart - (6 - index) * 24 * 60 * 60 * 1_000 + 9 * 60 * 60 * 1_000;
    return new Date(timestamp).toISOString().slice(0, 10);
  });
  const weeklyByDate = new Map(
    (weeklyResult.results ?? []).map((row) => [row.business_date, row]),
  );

  return {
    todayOrders: Number(orderMetrics?.today_orders ?? 0),
    todaySales: Number(orderMetrics?.today_sales ?? 0),
    todayMembers: Number(memberMetrics?.today_members ?? 0),
    totalOrders: Number(orderMetrics?.total_orders ?? 0),
    totalMembers: Number(memberMetrics?.total_members ?? 0),
    statusCounts: Object.fromEntries(
      (statusResult.results ?? []).map((row) => [
        row.status,
        Number(row.count),
      ]),
    ),
    recentOrders: (recentResult.results ?? []).map(mapAdminOrderRow),
    weeklySales: weekDates.map((date) => {
      const row = weeklyByDate.get(date);
      return {
        date,
        label: `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`,
        orderCount: Number(row?.order_count ?? 0),
        sales: Number(row?.sales ?? 0),
      };
    }),
    paymentMethods: (paymentMethodResult.results ?? []).map((row) => ({
      method: row.payment_method,
      orderCount: Number(row.order_count),
      amount: Number(row.amount),
    })),
    recentMembers: (recentMemberResult.results ?? []).map((row) => ({
      id: row.id,
      loginId: row.login_id,
      name: row.name,
      joinedAt: row.created_at,
      points: Number(row.points),
    })),
    points: {
      total: Number(pointSummary?.total_points ?? 0),
      holders: Number(pointSummary?.holders ?? 0),
      pendingCharges: Number(walletSummary?.pending_charges ?? 0),
      pendingWithdrawals: Number(walletSummary?.pending_withdrawals ?? 0),
    },
    visitors,
  };
}

interface AdminOrderDatabaseRow {
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

interface AdminMemberDatabaseRow {
  id: string;
  created_at: string;
  login_id: string;
  name: string;
  nickname: string;
  email: string;
  phone: string;
  telephone: string;
  email_opt_in: number;
  sms_opt_in: number;
  email_verified: number;
  identity_method: string;
  identity_verified: number;
  adult_verified: number;
  public_profile: number;
  points: number;
  level: number;
  active: number;
  last_login_at: string | null;
}

function mapAdminOrderRow(row: AdminOrderDatabaseRow): AdminOrderRow {
  return {
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
  };
}

function mapAdminMemberRow(row: AdminMemberDatabaseRow): AdminMemberRow {
  return {
    id: row.id,
    joinedAt: row.created_at,
    loginId: row.login_id,
    name: row.name,
    nickname: row.nickname,
    email: row.email,
    phone: row.phone,
    telephone: row.telephone,
    emailOptIn: Boolean(row.email_opt_in),
    smsOptIn: Boolean(row.sms_opt_in),
    emailVerified: Boolean(row.email_verified),
    identityMethod:
      row.identity_method === "phone" || row.identity_method === "ipin"
        ? row.identity_method
        : "none",
    identityVerified: Boolean(row.identity_verified),
    adultVerified: Boolean(row.adult_verified),
    publicProfile: Boolean(row.public_profile),
    points: Number(row.points),
    level: Number(row.level),
    active: Boolean(row.active),
    lastLoginAt: row.last_login_at,
  };
}

function normalizeOrderOptions(options: AdminOrderPageOptions): {
  page: number;
  pageSize: number;
  filters: AdminOrderListFilters;
} {
  const sortBy: AdminOrderSort = [
    "orderNumber",
    "orderedAt",
    "totalAmount",
  ].includes(options.sortBy ?? "")
    ? (options.sortBy as AdminOrderSort)
    : "orderedAt";
  return {
    page: positiveInteger(options.page, 1),
    pageSize: boundedPageSize(options.pageSize),
    filters: {
      q: cleanQuery(options.q),
      status: ADMIN_ORDER_STATUSES.has(options.status ?? "")
        ? (options.status ?? "")
        : "",
      paymentStatus: ADMIN_PAYMENT_STATUSES.has(options.paymentStatus ?? "")
        ? (options.paymentStatus ?? "")
        : "",
      dateStart: cleanDate(options.dateStart),
      dateEnd: cleanDate(options.dateEnd),
      sortBy,
      sortDirection: options.sortDirection === "asc" ? "asc" : "desc",
    },
  };
}

function normalizeMemberOptions(options: AdminMemberPageOptions): {
  page: number;
  pageSize: number;
  filters: AdminMemberListFilters;
} {
  const sortBy: AdminMemberSort = [
    "joinedAt",
    "loginId",
    "points",
    "lastLoginAt",
  ].includes(options.sortBy ?? "")
    ? (options.sortBy as AdminMemberSort)
    : "joinedAt";
  return {
    page: positiveInteger(options.page, 1),
    pageSize: boundedPageSize(options.pageSize),
    filters: {
      q: cleanQuery(options.q),
      status:
        options.status === "active" || options.status === "inactive"
          ? options.status
          : "",
      dateStart: cleanDate(options.dateStart),
      dateEnd: cleanDate(options.dateEnd),
      sortBy,
      sortDirection: options.sortDirection === "asc" ? "asc" : "desc",
    },
  };
}

function addKoreaDateConditions(
  conditions: string[],
  bindings: Array<string | number>,
  column: string,
  dateStart: string,
  dateEnd: string,
): void {
  if (dateStart) {
    conditions.push(`${column} >= ?`);
    bindings.push(koreaDateBoundaryUtc(dateStart));
  }
  if (dateEnd) {
    conditions.push(`${column} < ?`);
    bindings.push(
      formatSqlUtc(
        new Date(koreaDateBoundaryUtc(dateEnd).replace(" ", "T") + "Z").getTime() +
          24 * 60 * 60 * 1_000,
      ),
    );
  }
}

function koreaDayBounds(now: Date): { startUtc: string; endUtc: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: KOREA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const koreaDate = `${byType.year}-${byType.month}-${byType.day}`;
  const start = Date.parse(`${koreaDate}T00:00:00+09:00`);
  return {
    startUtc: formatSqlUtc(start),
    endUtc: formatSqlUtc(start + 24 * 60 * 60 * 1_000),
  };
}

function koreaDateBoundaryUtc(date: string): string {
  return formatSqlUtc(Date.parse(`${date}T00:00:00+09:00`));
}

function formatSqlUtc(value: number): string {
  return new Date(value).toISOString().slice(0, 19).replace("T", " ");
}

function cleanQuery(value: string | undefined): string {
  return (value ?? "").trim().replace(/\0/gu, "").slice(0, 200);
}

function cleanDate(value: string | undefined): string {
  const candidate = (value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/u.test(candidate) &&
    Number.isFinite(Date.parse(`${candidate}T00:00:00Z`))
    ? candidate
    : "";
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isSafeInteger(value) && Number(value) > 0
    ? Number(value)
    : fallback;
}

function boundedPageSize(value: number | undefined): number {
  return Math.min(
    MAX_PAGE_SIZE,
    positiveInteger(value, DEFAULT_PAGE_SIZE),
  );
}
