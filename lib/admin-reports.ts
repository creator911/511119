import { commerceDb, ensureCommerceSchema } from "@/lib/commerce-db";
import { ensureAdminPointSchema } from "@/lib/admin-points";

const KOREA_TIME_ZONE = "Asia/Seoul";
const DAY_MS = 24 * 60 * 60 * 1_000;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export interface ReportPage<T, F> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  filters: F;
}

export interface SalesReportRow {
  businessDate: string;
  orderCount: number;
  paidOrderCount: number;
  salesAmount: number;
  cancelledCount: number;
  refundedCount: number;
  refundedAmount: number;
  pointsUsed: number;
}

export interface SalesReportSummary {
  orderCount: number;
  paidOrderCount: number;
  salesAmount: number;
  cancelledCount: number;
  refundedCount: number;
  refundedAmount: number;
  pointsUsed: number;
}

export interface SalesReportFilters {
  dateStart: string;
  dateEnd: string;
}

export interface SalesReportResult
  extends ReportPage<SalesReportRow, SalesReportFilters> {
  summary: SalesReportSummary;
}

export interface ProductRankingRow {
  productId: string;
  productName: string;
  orderCount: number;
  quantity: number;
  revenue: number;
}

export type ProductRankingSort = "quantity" | "revenue";

export interface ProductRankingFilters {
  q: string;
  dateStart: string;
  dateEnd: string;
  sortBy: ProductRankingSort;
}

export type IncompleteOrderMode = "unpaid" | "processing" | "all";

export interface IncompleteOrderFilters {
  q: string;
  dateStart: string;
  dateEnd: string;
  mode: IncompleteOrderMode;
}

export interface IncompleteOrderRow {
  id: string;
  createdAt: string;
  updatedAt: string;
  buyer: string;
  email: string;
  itemName: string;
  itemKinds: number;
  quantity: number;
  total: number;
  paymentStatus: string;
  status: string;
}

export type PointLedgerEventType =
  | "used"
  | "restored"
  | "restore_pending"
  | "earned"
  | "reversed"
  | "charged"
  | "withdrawn"
  | "adjusted";

export interface PointReportFilters {
  q: string;
  eventType: "" | PointLedgerEventType;
  dateStart: string;
  dateEnd: string;
}

export interface PointBalanceRow {
  userId: string;
  loginId: string;
  name: string;
  points: number;
  active: boolean;
  updatedAt: string;
}

export interface PointLedgerRow {
  eventType: PointLedgerEventType;
  orderId: string;
  entryId: string | null;
  userId: string;
  loginId: string;
  name: string;
  points: number;
  reason: string;
  expiresAt: string | null;
  balanceAfter: number | null;
  revision: number | null;
  deletable: boolean;
  occurredAt: string;
}

export interface PointReportResult {
  filters: PointReportFilters;
  balanceSummary: {
    memberCount: number;
    totalPoints: number;
  };
  balances: ReportPage<PointBalanceRow, PointReportFilters>;
  ledger: ReportPage<PointLedgerRow, PointReportFilters>;
}

interface PageOptions {
  page?: number;
  pageSize?: number;
}

interface DateOptions {
  dateStart?: string;
  dateEnd?: string;
}

export async function getSalesReport(
  options: PageOptions & DateOptions = {},
): Promise<SalesReportResult> {
  await ensureCommerceSchema();
  const database = commerceDb();
  const pageSize = normalizePageSize(options.pageSize);
  const dateRange = normalizeDateRange(options);
  const [summaryRow, totalRow] = await Promise.all([
    database
      .prepare(
        `SELECT
           COUNT(*) AS order_count,
           COALESCE(SUM(CASE WHEN payment_status = 'paid' THEN 1 ELSE 0 END), 0)
             AS paid_order_count,
           COALESCE(SUM(CASE WHEN payment_status = 'paid' THEN total ELSE 0 END), 0)
             AS sales_amount,
           COALESCE(SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END), 0)
             AS cancelled_count,
           COALESCE(SUM(CASE WHEN status = 'refunded' THEN 1 ELSE 0 END), 0)
             AS refunded_count,
           COALESCE(SUM(CASE WHEN status = 'refunded' THEN total ELSE 0 END), 0)
             AS refunded_amount,
           COALESCE(SUM(discount), 0) AS points_used
         FROM orders
         WHERE created_at >= ? AND created_at < ?`,
      )
      .bind(dateRange.startUtc, dateRange.endUtc)
      .first<SalesSummaryDatabaseRow>(),
    database
      .prepare(
        `SELECT COUNT(DISTINCT date(datetime(created_at, '+9 hours'))) AS total
         FROM orders
         WHERE created_at >= ? AND created_at < ?`,
      )
      .bind(dateRange.startUtc, dateRange.endUtc)
      .first<{ total: number }>(),
  ]);

  const total = Number(totalRow?.total ?? 0);
  const pageState = normalizePage(options.page, pageSize, total);
  const result = await database
    .prepare(
      `SELECT
         date(datetime(created_at, '+9 hours')) AS business_date,
         COUNT(*) AS order_count,
         COALESCE(SUM(CASE WHEN payment_status = 'paid' THEN 1 ELSE 0 END), 0)
           AS paid_order_count,
         COALESCE(SUM(CASE WHEN payment_status = 'paid' THEN total ELSE 0 END), 0)
           AS sales_amount,
         COALESCE(SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END), 0)
           AS cancelled_count,
         COALESCE(SUM(CASE WHEN status = 'refunded' THEN 1 ELSE 0 END), 0)
           AS refunded_count,
         COALESCE(SUM(CASE WHEN status = 'refunded' THEN total ELSE 0 END), 0)
           AS refunded_amount,
         COALESCE(SUM(discount), 0) AS points_used
       FROM orders
       WHERE created_at >= ? AND created_at < ?
       GROUP BY business_date
       ORDER BY business_date DESC
       LIMIT ? OFFSET ?`,
    )
    .bind(
      dateRange.startUtc,
      dateRange.endUtc,
      pageSize,
      pageState.offset,
    )
    .all<SalesReportDatabaseRow>();

  return {
    rows: (result.results ?? []).map(mapSalesReportRow),
    total,
    page: pageState.page,
    pageSize,
    totalPages: pageState.totalPages,
    filters: {
      dateStart: dateRange.dateStart,
      dateEnd: dateRange.dateEnd,
    },
    summary: mapSalesSummary(summaryRow),
  };
}

export async function getProductRankingReport(
  options: PageOptions &
    DateOptions & { q?: string; sortBy?: string } = {},
): Promise<ReportPage<ProductRankingRow, ProductRankingFilters>> {
  await ensureCommerceSchema();
  const database = commerceDb();
  const pageSize = normalizePageSize(options.pageSize);
  const dateRange = normalizeDateRange(options);
  const q = cleanQuery(options.q);
  const sortBy: ProductRankingSort =
    options.sortBy === "revenue" ? "revenue" : "quantity";
  const conditions = [
    "o.created_at >= ?",
    "o.created_at < ?",
    "o.payment_status = 'paid'",
    "o.status NOT IN ('cancelled', 'refunded')",
  ];
  const bindings: Array<string | number> = [
    dateRange.startUtc,
    dateRange.endUtc,
  ];
  if (q) {
    const pattern = `%${q}%`;
    conditions.push("(oi.product_id LIKE ? OR oi.product_name LIKE ?)");
    bindings.push(pattern, pattern);
  }
  const whereClause = `WHERE ${conditions.join(" AND ")}`;
  const totalRow = await database
    .prepare(
      `SELECT COUNT(*) AS total
       FROM (
         SELECT oi.product_id
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         ${whereClause}
         GROUP BY oi.product_id
       ) ranked_products`,
    )
    .bind(...bindings)
    .first<{ total: number }>();
  const total = Number(totalRow?.total ?? 0);
  const pageState = normalizePage(options.page, pageSize, total);
  const orderColumn =
    sortBy === "revenue" ? "revenue" : "quantity";
  const result = await database
    .prepare(
      `SELECT
         oi.product_id,
         MIN(oi.product_name) AS product_name,
         COUNT(DISTINCT oi.order_id) AS order_count,
         COALESCE(SUM(oi.quantity), 0) AS quantity,
         COALESCE(SUM(oi.line_total), 0) AS revenue
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       ${whereClause}
       GROUP BY oi.product_id
       ORDER BY ${orderColumn} DESC, oi.product_id ASC
       LIMIT ? OFFSET ?`,
    )
    .bind(...bindings, pageSize, pageState.offset)
    .all<ProductRankingDatabaseRow>();

  return {
    rows: (result.results ?? []).map((row) => ({
      productId: row.product_id,
      productName: row.product_name,
      orderCount: Number(row.order_count),
      quantity: Number(row.quantity),
      revenue: Number(row.revenue),
    })),
    total,
    page: pageState.page,
    pageSize,
    totalPages: pageState.totalPages,
    filters: {
      q,
      dateStart: dateRange.dateStart,
      dateEnd: dateRange.dateEnd,
      sortBy,
    },
  };
}

export async function getIncompleteOrdersReport(
  options: PageOptions &
    DateOptions & { q?: string; mode?: string } = {},
): Promise<ReportPage<IncompleteOrderRow, IncompleteOrderFilters>> {
  await ensureCommerceSchema();
  const database = commerceDb();
  const pageSize = normalizePageSize(options.pageSize);
  const dateRange = normalizeDateRange(options);
  const q = cleanQuery(options.q);
  const mode: IncompleteOrderMode =
    options.mode === "processing" || options.mode === "all"
      ? options.mode
      : "unpaid";
  const conditions = ["o.created_at >= ?", "o.created_at < ?"];
  const bindings: Array<string | number> = [
    dateRange.startUtc,
    dateRange.endUtc,
  ];
  if (mode === "unpaid") {
    conditions.push("o.payment_status = 'pending'");
  } else if (mode === "processing") {
    conditions.push(
      "o.payment_status = 'paid' AND o.status IN ('payment_confirmed', 'preparing', 'shipped')",
    );
  } else {
    conditions.push(`(
      o.payment_status = 'pending'
      OR (
        o.payment_status = 'paid'
        AND o.status IN ('payment_confirmed', 'preparing', 'shipped')
      )
    )`);
  }
  if (q) {
    const pattern = `%${q}%`;
    conditions.push(`(
      o.id LIKE ? OR o.orderer_name LIKE ? OR o.email LIKE ?
      OR EXISTS (
        SELECT 1 FROM order_items search_items
        WHERE search_items.order_id = o.id
          AND (
            search_items.product_id LIKE ?
            OR search_items.product_name LIKE ?
          )
      )
    )`);
    bindings.push(pattern, pattern, pattern, pattern, pattern);
  }
  const whereClause = `WHERE ${conditions.join(" AND ")}`;
  const totalRow = await database
    .prepare(`SELECT COUNT(*) AS total FROM orders o ${whereClause}`)
    .bind(...bindings)
    .first<{ total: number }>();
  const total = Number(totalRow?.total ?? 0);
  const pageState = normalizePage(options.page, pageSize, total);
  const result = await database
    .prepare(
      `SELECT
         o.id, o.created_at, o.updated_at, o.orderer_name, o.email, o.total,
         o.payment_status, o.status,
         COALESCE(MIN(oi.product_name), '') AS item_name,
         COUNT(oi.id) AS item_kinds,
         COALESCE(SUM(oi.quantity), 0) AS quantity
       FROM orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id
       ${whereClause}
       GROUP BY o.id
       ORDER BY o.created_at DESC, o.id DESC
       LIMIT ? OFFSET ?`,
    )
    .bind(...bindings, pageSize, pageState.offset)
    .all<IncompleteOrderDatabaseRow>();

  return {
    rows: (result.results ?? []).map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      buyer: row.orderer_name,
      email: row.email,
      itemName: row.item_name,
      itemKinds: Number(row.item_kinds),
      quantity: Number(row.quantity),
      total: Number(row.total),
      paymentStatus: row.payment_status,
      status: row.status,
    })),
    total,
    page: pageState.page,
    pageSize,
    totalPages: pageState.totalPages,
    filters: {
      q,
      dateStart: dateRange.dateStart,
      dateEnd: dateRange.dateEnd,
      mode,
    },
  };
}

export async function getPointReport(
  options: PageOptions &
    DateOptions & {
      q?: string;
      eventType?: string;
      balancePage?: number;
      ledgerPage?: number;
    } = {},
): Promise<PointReportResult> {
  await ensureAdminPointSchema();
  const database = commerceDb();
  const pageSize = normalizePageSize(options.pageSize);
  const dateRange = normalizeDateRange(options);
  const q = cleanQuery(options.q);
  const eventType = isPointLedgerEventType(options.eventType)
    ? options.eventType
    : "";
  const filters: PointReportFilters = {
    q,
    eventType,
    dateStart: dateRange.dateStart,
    dateEnd: dateRange.dateEnd,
  };

  const balanceConditions: string[] = [];
  const balanceBindings: Array<string | number> = [];
  if (q) {
    const pattern = `%${q}%`;
    balanceConditions.push(
      "(u.login_id LIKE ? OR u.name LIKE ? OR u.email LIKE ?)",
    );
    balanceBindings.push(pattern, pattern, pattern);
  }
  const balanceWhere =
    balanceConditions.length > 0
      ? `WHERE ${balanceConditions.join(" AND ")}`
      : "";
  const balanceSummary = await database
    .prepare(
      `SELECT COUNT(*) AS member_count, COALESCE(SUM(points), 0) AS total_points
       FROM users u ${balanceWhere}`,
    )
    .bind(...balanceBindings)
    .first<{ member_count: number; total_points: number }>();
  const balanceTotal = Number(balanceSummary?.member_count ?? 0);
  const balancePageState = normalizePage(
    options.balancePage ?? options.page,
    pageSize,
    balanceTotal,
  );
  const balanceResult = await database
    .prepare(
      `SELECT id, login_id, name, points, active, updated_at
       FROM users u
       ${balanceWhere}
       ORDER BY points DESC, login_id ASC
       LIMIT ? OFFSET ?`,
    )
    .bind(...balanceBindings, pageSize, balancePageState.offset)
    .all<PointBalanceDatabaseRow>();

  const ledgerConditions = [
    "ledger.occurred_at >= ?",
    "ledger.occurred_at < ?",
  ];
  const ledgerBindings: Array<string | number> = [
    dateRange.startUtc,
    dateRange.endUtc,
  ];
  if (eventType) {
    ledgerConditions.push("ledger.event_type = ?");
    ledgerBindings.push(eventType);
  }
  if (q) {
    const pattern = `%${q}%`;
    ledgerConditions.push(
      "(u.login_id LIKE ? OR u.name LIKE ? OR ledger.order_id LIKE ? OR ledger.reason LIKE ?)",
    );
    ledgerBindings.push(pattern, pattern, pattern, pattern);
  }
  const ledgerWhere = `WHERE ${ledgerConditions.join(" AND ")}`;
  const ledgerUnion = pointLedgerUnionSql();
  const ledgerTotalRow = await database
    .prepare(
      `SELECT COUNT(*) AS total
       FROM (${ledgerUnion}) ledger
       JOIN users u ON u.id = ledger.user_id
       ${ledgerWhere}`,
    )
    .bind(...ledgerBindings)
    .first<{ total: number }>();
  const ledgerTotal = Number(ledgerTotalRow?.total ?? 0);
  const ledgerPageState = normalizePage(
    options.ledgerPage ?? options.page,
    pageSize,
    ledgerTotal,
  );
  const ledgerResult = await database
    .prepare(
      `SELECT
         ledger.event_type, ledger.order_id, ledger.user_id,
         ledger.entry_id, u.login_id, u.name, ledger.points,
         ledger.reason, ledger.expires_at, ledger.balance_after,
         ledger.revision, ledger.deletable, ledger.occurred_at
       FROM (${ledgerUnion}) ledger
       JOIN users u ON u.id = ledger.user_id
       ${ledgerWhere}
       ORDER BY ledger.occurred_at DESC, ledger.order_id DESC
       LIMIT ? OFFSET ?`,
    )
    .bind(...ledgerBindings, pageSize, ledgerPageState.offset)
    .all<PointLedgerDatabaseRow>();

  return {
    filters,
    balanceSummary: {
      memberCount: balanceTotal,
      totalPoints: Number(balanceSummary?.total_points ?? 0),
    },
    balances: {
      rows: (balanceResult.results ?? []).map((row) => ({
        userId: row.id,
        loginId: row.login_id,
        name: row.name,
        points: Number(row.points),
        active: Boolean(row.active),
        updatedAt: row.updated_at,
      })),
      total: balanceTotal,
      page: balancePageState.page,
      pageSize,
      totalPages: balancePageState.totalPages,
      filters,
    },
    ledger: {
      rows: (ledgerResult.results ?? []).flatMap((row) =>
        isPointLedgerEventType(row.event_type)
          ? [
              {
                eventType: row.event_type,
                orderId: row.order_id,
                entryId: row.entry_id,
                userId: row.user_id,
                loginId: row.login_id,
                name: row.name,
                points: Number(row.points),
                reason: row.reason,
                expiresAt: row.expires_at,
                balanceAfter:
                  row.balance_after === null
                    ? null
                    : Number(row.balance_after),
                revision:
                  row.revision === null ? null : Number(row.revision),
                deletable: Boolean(row.deletable),
                occurredAt: row.occurred_at,
              },
            ]
          : [],
      ),
      total: ledgerTotal,
      page: ledgerPageState.page,
      pageSize,
      totalPages: ledgerPageState.totalPages,
      filters,
    },
  };
}

interface SalesSummaryDatabaseRow {
  order_count: number;
  paid_order_count: number;
  sales_amount: number;
  cancelled_count: number;
  refunded_count: number;
  refunded_amount: number;
  points_used: number;
}

interface SalesReportDatabaseRow extends SalesSummaryDatabaseRow {
  business_date: string;
}

interface ProductRankingDatabaseRow {
  product_id: string;
  product_name: string;
  order_count: number;
  quantity: number;
  revenue: number;
}

interface IncompleteOrderDatabaseRow {
  id: string;
  created_at: string;
  updated_at: string;
  orderer_name: string;
  email: string;
  total: number;
  payment_status: string;
  status: string;
  item_name: string;
  item_kinds: number;
  quantity: number;
}

interface PointBalanceDatabaseRow {
  id: string;
  login_id: string;
  name: string;
  points: number;
  active: number;
  updated_at: string;
}

interface PointLedgerDatabaseRow {
  event_type: string;
  order_id: string;
  entry_id: string | null;
  user_id: string;
  login_id: string;
  name: string;
  points: number;
  reason: string;
  expires_at: string | null;
  balance_after: number | null;
  revision: number | null;
  deletable: number;
  occurred_at: string;
}

function mapSalesReportRow(row: SalesReportDatabaseRow): SalesReportRow {
  return {
    businessDate: row.business_date,
    ...mapSalesSummary(row),
  };
}

function mapSalesSummary(
  row: SalesSummaryDatabaseRow | null,
): SalesReportSummary {
  return {
    orderCount: Number(row?.order_count ?? 0),
    paidOrderCount: Number(row?.paid_order_count ?? 0),
    salesAmount: Number(row?.sales_amount ?? 0),
    cancelledCount: Number(row?.cancelled_count ?? 0),
    refundedCount: Number(row?.refunded_count ?? 0),
    refundedAmount: Number(row?.refunded_amount ?? 0),
    pointsUsed: Number(row?.points_used ?? 0),
  };
}

function pointLedgerUnionSql(): string {
  return `
    SELECT event_type, order_id, entry_id, user_id, points, reason,
           expires_at, balance_after, revision, deletable, occurred_at
    FROM (
      SELECT
        'used' AS event_type,
        opd.order_id AS order_id,
        NULL AS entry_id,
        opd.user_id AS user_id,
        -opd.points_used AS points,
        '' AS reason,
        NULL AS expires_at,
        NULL AS balance_after,
        NULL AS revision,
        0 AS deletable,
        opd.created_at AS occurred_at
      FROM order_point_debits opd
      UNION ALL
      SELECT
        'restored' AS event_type,
        opd.order_id AS order_id,
        NULL AS entry_id,
        opd.user_id AS user_id,
        opd.points_used AS points,
        '' AS reason,
        NULL AS expires_at,
        NULL AS balance_after,
        NULL AS revision,
        0 AS deletable,
        adjustment.created_at AS occurred_at
      FROM order_inventory_adjustments adjustment
      JOIN order_point_debits opd ON opd.order_id = adjustment.order_id
      WHERE adjustment.adjustment_type = 'points_restore'
      UNION ALL
      SELECT
        'restore_pending' AS event_type,
        opd.order_id AS order_id,
        NULL AS entry_id,
        opd.user_id AS user_id,
        opd.points_used AS points,
        '' AS reason,
        NULL AS expires_at,
        NULL AS balance_after,
        NULL AS revision,
        0 AS deletable,
        adjustment.created_at AS occurred_at
      FROM order_inventory_adjustments adjustment
      JOIN order_point_debits opd ON opd.order_id = adjustment.order_id
      WHERE adjustment.adjustment_type = 'points_restore_pending'
        AND NOT EXISTS (
          SELECT 1
          FROM order_inventory_adjustments completed
          WHERE completed.order_id = adjustment.order_id
            AND completed.adjustment_type = 'points_restore'
        )
      UNION ALL
      SELECT
        'earned' AS event_type,
        credit.order_id AS order_id,
        NULL AS entry_id,
        credit.user_id AS user_id,
        credit.points_earned AS points,
        '' AS reason,
        NULL AS expires_at,
        NULL AS balance_after,
        NULL AS revision,
        0 AS deletable,
        credit.created_at AS occurred_at
      FROM order_point_credits credit
    ) order_events
    UNION ALL
    SELECT event_type, order_id, entry_id, user_id, points, reason,
           expires_at, balance_after, revision, deletable, occurred_at
    FROM (
      SELECT
        'reversed' AS event_type,
        reversal.order_id AS order_id,
        NULL AS entry_id,
        reversal.user_id AS user_id,
        -reversal.points_reversed AS points,
        '' AS reason,
        NULL AS expires_at,
        NULL AS balance_after,
        NULL AS revision,
        0 AS deletable,
        reversal.created_at AS occurred_at
      FROM order_point_reversals reversal
      UNION ALL
      SELECT
        CASE ledger.request_type
          WHEN 'charge' THEN 'charged'
          ELSE 'withdrawn'
        END AS event_type,
        ledger.request_id AS order_id,
        NULL AS entry_id,
        ledger.user_id AS user_id,
        ledger.delta AS points,
        '' AS reason,
        NULL AS expires_at,
        ledger.balance_after AS balance_after,
        NULL AS revision,
        0 AS deletable,
        ledger.created_at AS occurred_at
      FROM wallet_ledger ledger
      UNION ALL
      SELECT
        'adjusted' AS event_type,
        'admin-' || adjustment.id AS order_id,
        NULL AS entry_id,
        adjustment.user_id AS user_id,
        adjustment.after_points - adjustment.before_points AS points,
        '' AS reason,
        NULL AS expires_at,
        adjustment.after_points AS balance_after,
        NULL AS revision,
        0 AS deletable,
        adjustment.created_at AS occurred_at
      FROM (
        SELECT
          id,
          entity_id AS user_id,
          created_at,
          CASE
            WHEN json_valid(details) = 1
            THEN CAST(json_extract(details, '$.before.points') AS INTEGER)
            ELSE NULL
          END AS before_points,
          CASE
            WHEN json_valid(details) = 1
            THEN CAST(json_extract(details, '$.after.points') AS INTEGER)
            ELSE NULL
          END AS after_points
        FROM admin_audit_logs
        WHERE action = 'member.update'
          AND entity_type = 'member'
      ) adjustment
      WHERE adjustment.before_points IS NOT NULL
        AND adjustment.after_points IS NOT NULL
        AND adjustment.after_points <> adjustment.before_points
      UNION ALL
      SELECT
        'adjusted' AS event_type,
        entry.id AS order_id,
        entry.id AS entry_id,
        entry.user_id AS user_id,
        entry.delta AS points,
        entry.reason AS reason,
        entry.expires_at AS expires_at,
        entry.balance_after AS balance_after,
        entry.revision AS revision,
        1 AS deletable,
        entry.created_at AS occurred_at
      FROM admin_point_ledger entry
      WHERE entry.deleted_at IS NULL
    ) account_events
  `;
}

function normalizeDateRange(options: DateOptions): {
  dateStart: string;
  dateEnd: string;
  startUtc: string;
  endUtc: string;
} {
  const today = koreaDate(new Date());
  const defaultEndStart = Date.parse(`${today}T00:00:00+09:00`);
  const defaultStart = koreaDate(new Date(defaultEndStart - 29 * DAY_MS));
  let dateStart = cleanDate(options.dateStart) || defaultStart;
  let dateEnd = cleanDate(options.dateEnd) || today;
  if (dateStart > dateEnd) {
    [dateStart, dateEnd] = [dateEnd, dateStart];
  }
  const start = Date.parse(`${dateStart}T00:00:00+09:00`);
  const end = Date.parse(`${dateEnd}T00:00:00+09:00`) + DAY_MS;
  return {
    dateStart,
    dateEnd,
    startUtc: formatSqlUtc(start),
    endUtc: formatSqlUtc(end),
  };
}

function koreaDate(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: KOREA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

function formatSqlUtc(value: number): string {
  return new Date(value).toISOString().slice(0, 19).replace("T", " ");
}

function cleanDate(value: string | undefined): string {
  const candidate = (value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(candidate)) return "";
  const parsed = Date.parse(`${candidate}T00:00:00Z`);
  if (!Number.isFinite(parsed)) return "";
  return new Date(parsed).toISOString().slice(0, 10) === candidate
    ? candidate
    : "";
}

function cleanQuery(value: string | undefined): string {
  return (value ?? "").trim().replace(/\0/gu, "").slice(0, 200);
}

function normalizePageSize(value: number | undefined): number {
  return Math.min(MAX_PAGE_SIZE, positiveInteger(value, DEFAULT_PAGE_SIZE));
}

function normalizePage(
  requestedPage: number | undefined,
  pageSize: number,
  total: number,
): { page: number; totalPages: number; offset: number } {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(positiveInteger(requestedPage, 1), totalPages);
  return {
    page,
    totalPages,
    offset: (page - 1) * pageSize,
  };
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isSafeInteger(value) && Number(value) > 0
    ? Number(value)
    : fallback;
}

function isPointLedgerEventType(
  value: string | undefined,
): value is PointLedgerEventType {
  return (
    value === "used" ||
    value === "restored" ||
    value === "restore_pending" ||
    value === "earned" ||
    value === "reversed" ||
    value === "charged" ||
    value === "withdrawn" ||
    value === "adjusted"
  );
}
