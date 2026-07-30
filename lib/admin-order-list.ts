import { commerceDb, ensureCommerceSchema } from "@/lib/commerce-db";
import { ensurePromotionSchema } from "@/lib/commerce-promotions";

export type AdminOrderListSort =
  | "orderNumber"
  | "orderedAt"
  | "totalAmount"
  | "receiptAmount"
  | "cancelAmount"
  | "couponAmount"
  | "outstandingAmount";

export type AdminOrderListSortDirection = "asc" | "desc";

export type AdminOrderSearchField =
  | "orderNumber"
  | "memberId"
  | "buyer"
  | "buyerPhone"
  | "recipient"
  | "recipientPhone"
  | "depositor"
  | "invoice";

export type AdminOrderLegacyStatus =
  | ""
  | "ordered"
  | "payment_confirmed"
  | "preparing"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "refunded"
  | "partial_cancelled";

export type AdminOrderPaymentMethod =
  | ""
  | "bank"
  | "virtual"
  | "transfer"
  | "mobile"
  | "card"
  | "easy"
  | "kakao";

export interface AdminOrderListFilters {
  q: string;
  searchField: AdminOrderSearchField;
  status: AdminOrderLegacyStatus;
  paymentMethod: AdminOrderPaymentMethod;
  paymentStatus: string;
  outstandingOnly: boolean;
  cancelledOnly: boolean;
  refundedOnly: boolean;
  pointsOrderOnly: boolean;
  couponOnly: boolean;
  dateStart: string;
  dateEnd: string;
  sortBy: AdminOrderListSort;
  sortDirection: AdminOrderListSortDirection;
}

export interface AdminOrderListOptions {
  page?: number;
  pageSize?: number;
  q?: string;
  searchField?: string;
  status?: string;
  paymentMethod?: string;
  paymentStatus?: string;
  outstandingOnly?: boolean | string;
  cancelledOnly?: boolean | string;
  refundedOnly?: boolean | string;
  pointsOrderOnly?: boolean | string;
  couponOnly?: boolean | string;
  dateStart?: string;
  dateEnd?: string;
  sortBy?: string;
  sortDirection?: string;
}

export interface AdminOrderListRow {
  id: string;
  createdAt: string;
  updatedAt: string;
  buyer: string;
  buyerPhone: string;
  email: string;
  memberId: string;
  recipient: string;
  recipientPhone: string;
  itemName: string;
  itemKinds: number;
  quantity: number;
  cumulativeOrders: number;
  total: number;
  receiptAmount: number;
  cancelAmount: number;
  couponAmount: number;
  outstandingAmount: number;
  pointsUsed: number;
  paymentMethod: string;
  paymentStatus: string;
  status: string;
  shippingCarrier: string;
  trackingNumber: string;
  shippingAt: string;
}

export interface AdminOrderListResult {
  rows: AdminOrderListRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  filters: AdminOrderListFilters;
  pageTotals: {
    itemKinds: number;
    orderAmount: number;
    receiptAmount: number;
    cancelAmount: number;
    couponAmount: number;
    outstandingAmount: number;
  };
}

interface AdminOrderListDatabaseRow {
  id: string;
  created_at: string;
  updated_at: string;
  orderer_name: string;
  orderer_phone: string;
  email: string;
  member_id: string | null;
  recipient_name: string;
  recipient_phone: string;
  item_name: string;
  item_kinds: number;
  quantity: number;
  cumulative_orders: number;
  total: number;
  receipt_amount: number;
  cancel_amount: number;
  coupon_amount: number;
  outstanding_amount: number;
  points_used: number;
  payment_method: string;
  payment_status: string;
  status: string;
  shipping_carrier: string;
  tracking_number: string;
  shipping_at: string;
}

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const ORDER_STATUSES = new Set<AdminOrderLegacyStatus>([
  "",
  "ordered",
  "payment_confirmed",
  "preparing",
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
  "partial_cancelled",
]);
const PAYMENT_METHODS = new Set<AdminOrderPaymentMethod>([
  "",
  "bank",
  "virtual",
  "transfer",
  "mobile",
  "card",
  "easy",
  "kakao",
]);
const PAYMENT_STATUSES = new Set([
  "",
  "pending",
  "paid",
  "failed",
  "cancelled",
]);
const SEARCH_FIELDS = new Set<AdminOrderSearchField>([
  "orderNumber",
  "memberId",
  "buyer",
  "buyerPhone",
  "recipient",
  "recipientPhone",
  "depositor",
  "invoice",
]);
const SORTS = new Set<AdminOrderListSort>([
  "orderNumber",
  "orderedAt",
  "totalAmount",
  "receiptAmount",
  "cancelAmount",
  "couponAmount",
  "outstandingAmount",
]);

export async function getAdminOrderList(
  options: AdminOrderListOptions = {},
): Promise<AdminOrderListResult> {
  await Promise.all([ensureCommerceSchema(), ensurePromotionSchema()]);
  const database = commerceDb();
  const normalized = normalizeOptions(options);
  const conditions: string[] = [];
  const bindings: Array<string | number> = [];

  if (normalized.filters.q) {
    const searchColumn = {
      orderNumber: "o.id",
      memberId: "u.login_id",
      buyer: "o.orderer_name",
      buyerPhone: "o.orderer_phone",
      recipient: "o.recipient_name",
      recipientPhone: "o.recipient_phone",
      depositor: "opd.depositor",
      invoice: "o.tracking_number",
    }[normalized.filters.searchField];
    conditions.push(`${searchColumn} LIKE ?`);
    bindings.push(`%${normalized.filters.q}%`);
  }

  if (normalized.filters.status === "cancelled") {
    conditions.push("o.status IN ('cancelled', 'refunded')");
  } else if (normalized.filters.status === "refunded") {
    conditions.push("o.status = 'refunded'");
  } else if (normalized.filters.status === "partial_cancelled") {
    conditions.push(
      "o.refund_amount > 0 AND o.status NOT IN ('cancelled', 'refunded')",
    );
  } else if (normalized.filters.status) {
    conditions.push("o.status = ?");
    bindings.push(normalized.filters.status);
  }

  if (normalized.filters.paymentMethod === "virtual") {
    conditions.push("o.payment_method IN ('virtual', 'virtual_account')");
  } else if (normalized.filters.paymentMethod === "easy") {
    conditions.push(
      "LOWER(o.payment_method) IN ('easy', 'easy_pay', 'pg', 'payco', 'naverpay', 'samsungpay', 'lpay', 'inicis_kakaopay')",
    );
  } else if (normalized.filters.paymentMethod === "kakao") {
    conditions.push(
      "LOWER(o.payment_method) IN ('kakao', 'kakaopay')",
    );
  } else if (normalized.filters.paymentMethod) {
    conditions.push("o.payment_method = ?");
    bindings.push(normalized.filters.paymentMethod);
  }

  if (normalized.filters.paymentStatus) {
    conditions.push("o.payment_status = ?");
    bindings.push(normalized.filters.paymentStatus);
  }
  if (normalized.filters.outstandingOnly) {
    conditions.push(
      "o.payment_status = 'pending' AND MAX(o.total - o.refund_amount, 0) > 0",
    );
  }
  if (normalized.filters.cancelledOnly) {
    conditions.push("o.refund_amount > 0");
  }
  if (normalized.filters.refundedOnly) {
    conditions.push("o.status = 'refunded'");
  }
  if (normalized.filters.pointsOrderOnly) {
    conditions.push(
      "(o.payment_method = 'points' OR EXISTS (SELECT 1 FROM order_point_debits point_filter WHERE point_filter.order_id = o.id AND point_filter.points_used > 0))",
    );
  }
  if (normalized.filters.couponOnly) {
    conditions.push(
      "EXISTS (SELECT 1 FROM coupon_redemptions coupon_filter WHERE coupon_filter.order_id = o.id AND coupon_filter.discount_amount > 0)",
    );
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
  const joinClause = `
    LEFT JOIN users u ON u.id = o.user_id
    LEFT JOIN order_payment_details opd ON opd.order_id = o.id
  `;
  const totalRow = await database
    .prepare(
      `SELECT COUNT(DISTINCT o.id) AS total
       FROM orders o
       ${joinClause}
       ${whereClause}`,
    )
    .bind(...bindings)
    .first<{ total: number }>();
  const total = Math.max(0, Number(totalRow?.total ?? 0));
  const totalPages = Math.max(1, Math.ceil(total / normalized.pageSize));
  const page = Math.min(normalized.page, totalPages);
  const offset = (page - 1) * normalized.pageSize;

  const sortColumn = {
    orderNumber: "o.id",
    orderedAt: "o.created_at",
    totalAmount: "o.total",
    receiptAmount:
      "CASE WHEN o.payment_status = 'paid' OR o.refund_amount > 0 THEN o.total ELSE 0 END",
    cancelAmount: "o.refund_amount",
    couponAmount: "COALESCE(cr.discount_amount, 0)",
    outstandingAmount:
      "CASE WHEN o.payment_status = 'pending' THEN MAX(o.total - o.refund_amount, 0) ELSE 0 END",
  }[normalized.filters.sortBy];

  const result = await database
    .prepare(
      `SELECT
         o.id,
         o.created_at,
         o.updated_at,
         o.orderer_name,
         o.orderer_phone,
         o.email,
         u.login_id AS member_id,
         o.recipient_name,
         o.recipient_phone,
         COALESCE(MIN(oi.product_name), '') AS item_name,
         COUNT(oi.id) AS item_kinds,
         COALESCE(SUM(oi.quantity), 0) AS quantity,
         CASE
           WHEN o.user_id IS NULL OR o.user_id = '' THEN 0
           ELSE (
             SELECT COUNT(*)
             FROM orders member_orders
             WHERE member_orders.user_id = o.user_id
           )
         END AS cumulative_orders,
         o.total,
         CASE
           WHEN o.payment_status = 'paid' OR o.refund_amount > 0
             THEN o.total
           ELSE 0
         END AS receipt_amount,
         o.refund_amount AS cancel_amount,
         COALESCE(cr.discount_amount, 0) AS coupon_amount,
         CASE
           WHEN o.payment_status = 'pending'
             THEN MAX(o.total - o.refund_amount, 0)
           ELSE 0
         END AS outstanding_amount,
         COALESCE(opd_points.points_used, 0) AS points_used,
         o.payment_method,
         o.payment_status,
         o.status,
         o.shipping_carrier,
         o.tracking_number,
         CASE
           WHEN (o.shipping_carrier <> '' OR o.tracking_number <> '')
             AND o.status IN ('shipped', 'delivered')
             THEN o.updated_at
           ELSE ''
         END AS shipping_at
       FROM orders o
       ${joinClause}
       LEFT JOIN order_items oi ON oi.order_id = o.id
       LEFT JOIN coupon_redemptions cr ON cr.order_id = o.id
       LEFT JOIN order_point_debits opd_points ON opd_points.order_id = o.id
       ${whereClause}
       GROUP BY o.id
       ORDER BY ${sortColumn} ${normalized.filters.sortDirection.toUpperCase()},
                o.id DESC
       LIMIT ? OFFSET ?`,
    )
    .bind(...bindings, normalized.pageSize, offset)
    .all<AdminOrderListDatabaseRow>();

  const rows = (result.results ?? []).map(mapRow);
  return {
    rows,
    total,
    page,
    pageSize: normalized.pageSize,
    totalPages,
    filters: normalized.filters,
    pageTotals: {
      itemKinds: rows.reduce((sum, row) => sum + row.itemKinds, 0),
      orderAmount: rows.reduce((sum, row) => sum + row.total, 0),
      receiptAmount: rows.reduce(
        (sum, row) => sum + row.receiptAmount,
        0,
      ),
      cancelAmount: rows.reduce((sum, row) => sum + row.cancelAmount, 0),
      couponAmount: rows.reduce((sum, row) => sum + row.couponAmount, 0),
      outstandingAmount: rows.reduce(
        (sum, row) => sum + row.outstandingAmount,
        0,
      ),
    },
  };
}

function normalizeOptions(options: AdminOrderListOptions): {
  page: number;
  pageSize: number;
  filters: AdminOrderListFilters;
} {
  const searchField = SEARCH_FIELDS.has(
    options.searchField as AdminOrderSearchField,
  )
    ? (options.searchField as AdminOrderSearchField)
    : "orderNumber";
  const status = ORDER_STATUSES.has(options.status as AdminOrderLegacyStatus)
    ? (options.status as AdminOrderLegacyStatus)
    : "";
  const paymentMethod = PAYMENT_METHODS.has(
    options.paymentMethod as AdminOrderPaymentMethod,
  )
    ? (options.paymentMethod as AdminOrderPaymentMethod)
    : "";
  const sortBy = SORTS.has(options.sortBy as AdminOrderListSort)
    ? (options.sortBy as AdminOrderListSort)
    : "orderedAt";
  return {
    page: positiveInteger(options.page, 1),
    pageSize: Math.min(
      MAX_PAGE_SIZE,
      positiveInteger(options.pageSize, DEFAULT_PAGE_SIZE),
    ),
    filters: {
      q: cleanText(options.q, 200),
      searchField,
      status,
      paymentMethod,
      paymentStatus: PAYMENT_STATUSES.has(options.paymentStatus ?? "")
        ? (options.paymentStatus ?? "")
        : "",
      outstandingOnly: readBoolean(options.outstandingOnly),
      cancelledOnly: readBoolean(options.cancelledOnly),
      refundedOnly: readBoolean(options.refundedOnly),
      pointsOrderOnly: readBoolean(options.pointsOrderOnly),
      couponOnly: readBoolean(options.couponOnly),
      dateStart: cleanDate(options.dateStart),
      dateEnd: cleanDate(options.dateEnd),
      sortBy,
      sortDirection: options.sortDirection === "asc" ? "asc" : "desc",
    },
  };
}

function mapRow(row: AdminOrderListDatabaseRow): AdminOrderListRow {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    buyer: row.orderer_name,
    buyerPhone: row.orderer_phone,
    email: row.email,
    memberId: row.member_id ?? "",
    recipient: row.recipient_name,
    recipientPhone: row.recipient_phone,
    itemName: row.item_name,
    itemKinds: Number(row.item_kinds) || 0,
    quantity: Number(row.quantity) || 0,
    cumulativeOrders: Number(row.cumulative_orders) || 0,
    total: Number(row.total) || 0,
    receiptAmount: Number(row.receipt_amount) || 0,
    cancelAmount: Number(row.cancel_amount) || 0,
    couponAmount: Number(row.coupon_amount) || 0,
    outstandingAmount: Number(row.outstanding_amount) || 0,
    pointsUsed: Number(row.points_used) || 0,
    paymentMethod: row.payment_method,
    paymentStatus: row.payment_status,
    status: row.status,
    shippingCarrier: row.shipping_carrier,
    trackingNumber: row.tracking_number,
    shippingAt: row.shipping_at,
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
    const end =
      new Date(`${dateEnd}T00:00:00+09:00`).getTime() +
      24 * 60 * 60 * 1_000;
    bindings.push(formatSqlUtc(end));
  }
}

function koreaDateBoundaryUtc(date: string): string {
  return formatSqlUtc(new Date(`${date}T00:00:00+09:00`).getTime());
}

function formatSqlUtc(value: number): string {
  return new Date(value).toISOString().slice(0, 19).replace("T", " ");
}

function cleanDate(value: string | undefined): string {
  const candidate = (value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/u.test(candidate) &&
    Number.isFinite(Date.parse(`${candidate}T00:00:00Z`))
    ? candidate
    : "";
}

function cleanText(value: string | undefined, maximum: number): string {
  return (value ?? "")
    .replace(/\0/gu, "")
    .trim()
    .slice(0, maximum);
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isSafeInteger(value) && Number(value) > 0
    ? Number(value)
    : fallback;
}

function readBoolean(value: boolean | string | undefined): boolean {
  return value === true || value === "1" || value === "true" || value === "Y";
}
