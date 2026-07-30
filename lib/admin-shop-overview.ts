import { ensureAdminCommunitySchema } from "@/lib/admin-community";
import {
  getEffectiveProducts,
  type ManagedCatalogProduct,
} from "@/lib/admin-products";
import { commerceDb, ensureCommerceSchema } from "@/lib/commerce-db";
import { ensureProductOptionSchema } from "@/lib/product-options";

export interface ShopOverviewDay {
  date: string;
  label: string;
  orderCount: number;
  orderAmount: number;
  cancelCount: number;
  cancelAmount: number;
}

export interface ShopOverviewPaymentRow {
  key:
    | "card"
    | "transfer"
    | "virtual"
    | "bank"
    | "mobile"
    | "points"
    | "coupon";
  label: string;
  days: Array<{ count: number; amount: number }>;
}

export interface ShopOverviewFeedItem {
  id: string;
  title: string;
  author: string;
  createdAt: string;
}

export interface AdminShopOverviewData {
  graphDays: ShopOverviewDay[];
  paymentDays: ShopOverviewDay[];
  paymentRows: ShopOverviewPaymentRow[];
  transitions: Array<{
    key: "ordered" | "paid" | "preparing" | "shipped";
    label: string;
    count: number;
    amount: number;
    href: string;
  }>;
  lowStockProducts: number;
  lowStockOptions: number;
  smsBalance: number;
  inquiries: ShopOverviewFeedItem[];
  productQuestions: ShopOverviewFeedItem[];
  reviews: ShopOverviewFeedItem[];
}

interface DailyOrderRow {
  business_date: string;
  status: string;
  payment_status: string;
  payment_method: string;
  order_count: number;
  amount: number;
}

interface TransitionRow {
  ordered_count: number;
  ordered_amount: number;
  paid_count: number;
  paid_amount: number;
  preparing_count: number;
  preparing_amount: number;
  shipped_count: number;
  shipped_amount: number;
}

interface FeedRow {
  id: string;
  title: string;
  author: string;
  created_at: string;
}

const PAYMENT_ROWS: ReadonlyArray<{
  key: ShopOverviewPaymentRow["key"];
  label: string;
}> = [
  { key: "card", label: "신용카드" },
  { key: "transfer", label: "계좌이체" },
  { key: "virtual", label: "가상계좌" },
  { key: "bank", label: "무통장" },
  { key: "mobile", label: "휴대폰" },
  { key: "points", label: "포인트" },
  { key: "coupon", label: "쿠폰" },
];

export async function getAdminShopOverviewData(
  now = new Date(),
): Promise<AdminShopOverviewData> {
  await Promise.all([
    ensureCommerceSchema(),
    ensureAdminCommunitySchema(),
    ensureProductOptionSchema(),
  ]);

  const database = commerceDb();
  const graphDates = koreaDateRange(now, 7);
  const paymentDates = graphDates.slice(-3);
  const startUtc = koreaDateStartUtc(graphDates[0].date);
  const endUtc = koreaDateStartUtc(addDays(graphDates.at(-1)!.date, 1));

  const [
    dailyResult,
    transition,
    lowOptionResult,
    inquiryResult,
    questionResult,
    reviewResult,
    products,
  ] = await Promise.all([
    database
      .prepare(
        `SELECT
           substr(datetime(created_at, '+9 hours'), 1, 10) AS business_date,
           status, payment_status, payment_method,
           COUNT(*) AS order_count,
           COALESCE(SUM(total), 0) AS amount
         FROM orders
         WHERE created_at >= ? AND created_at < ?
         GROUP BY business_date, status, payment_status, payment_method
         ORDER BY business_date ASC`,
      )
      .bind(startUtc, endUtc)
      .all<DailyOrderRow>(),
    database
      .prepare(
        `SELECT
           COALESCE(SUM(CASE
             WHEN payment_status = 'pending' AND status = 'ordered' THEN 1 ELSE 0
           END), 0) AS ordered_count,
           COALESCE(SUM(CASE
             WHEN payment_status = 'pending' AND status = 'ordered' THEN total ELSE 0
           END), 0) AS ordered_amount,
           COALESCE(SUM(CASE
             WHEN payment_status = 'paid'
               AND status IN ('ordered', 'payment_confirmed') THEN 1 ELSE 0
           END), 0) AS paid_count,
           COALESCE(SUM(CASE
             WHEN payment_status = 'paid'
               AND status IN ('ordered', 'payment_confirmed') THEN total ELSE 0
           END), 0) AS paid_amount,
           COALESCE(SUM(CASE WHEN status = 'preparing' THEN 1 ELSE 0 END), 0)
             AS preparing_count,
           COALESCE(SUM(CASE WHEN status = 'preparing' THEN total ELSE 0 END), 0)
             AS preparing_amount,
           COALESCE(SUM(CASE WHEN status = 'shipped' THEN 1 ELSE 0 END), 0)
             AS shipped_count,
           COALESCE(SUM(CASE WHEN status = 'shipped' THEN total ELSE 0 END), 0)
             AS shipped_amount
         FROM orders`,
      )
      .first<TransitionRow>(),
    database
      .prepare(
        `SELECT COUNT(*) AS count
         FROM product_options
         WHERE deleted = 0 AND (stock <= 0 OR sold_out = 1)`,
      )
      .first<{ count: number }>(),
    database
      .prepare(
        `SELECT id, title, author_name AS author, created_at
         FROM one_to_one_inquiries
         ORDER BY created_at DESC, id DESC
         LIMIT 5`,
      )
      .all<FeedRow>(),
    database
      .prepare(
        `SELECT id, title, author_name AS author, created_at
         FROM product_interactions
         WHERE kind = 'question'
         ORDER BY created_at DESC, id DESC
         LIMIT 5`,
      )
      .all<FeedRow>(),
    database
      .prepare(
        `SELECT id, title, author_name AS author, created_at
         FROM product_interactions
         WHERE kind = 'review'
         ORDER BY created_at DESC, id DESC
         LIMIT 5`,
      )
      .all<FeedRow>(),
    getEffectiveProducts({ strict: true }),
  ]);

  const dailyRows = dailyResult.results ?? [];
  const graphDays = graphDates.map((day) => {
    const rows = dailyRows.filter((row) => row.business_date === day.date);
    const completed = rows.filter(
      (row) =>
        row.payment_status === "paid" &&
        row.status !== "cancelled" &&
        row.status !== "refunded",
    );
    const cancelled = rows.filter(
      (row) => row.status === "cancelled" || row.status === "refunded",
    );
    return {
      ...day,
      orderCount: sum(completed, "order_count"),
      orderAmount: sum(completed, "amount"),
      cancelCount: sum(cancelled, "order_count"),
      cancelAmount: sum(cancelled, "amount"),
    };
  });

  const byDateAndMethod = new Map<string, { count: number; amount: number }>();
  for (const row of dailyRows) {
    if (
      row.payment_status !== "paid" ||
      row.status === "cancelled" ||
      row.status === "refunded"
    ) {
      continue;
    }
    const key = `${row.business_date}:${paymentKey(row.payment_method)}`;
    const current = byDateAndMethod.get(key) ?? { count: 0, amount: 0 };
    current.count += Number(row.order_count) || 0;
    current.amount += Number(row.amount) || 0;
    byDateAndMethod.set(key, current);
  }

  return {
    graphDays,
    paymentDays: graphDays.slice(-3),
    paymentRows: PAYMENT_ROWS.map((payment) => ({
      ...payment,
      days: paymentDates.map(
        (day) =>
          byDateAndMethod.get(`${day.date}:${payment.key}`) ?? {
            count: 0,
            amount: 0,
          },
      ),
    })),
    transitions: [
      {
        key: "ordered",
        label: "주문 -> 입금",
        count: Number(transition?.ordered_count ?? 0),
        amount: Number(transition?.ordered_amount ?? 0),
        href: "/adm/orders?status=ordered&paymentStatus=pending",
      },
      {
        key: "paid",
        label: "입금 -> 준비",
        count: Number(transition?.paid_count ?? 0),
        amount: Number(transition?.paid_amount ?? 0),
        href: "/adm/orders?status=payment_confirmed&paymentStatus=paid",
      },
      {
        key: "preparing",
        label: "준비 -> 배송",
        count: Number(transition?.preparing_count ?? 0),
        amount: Number(transition?.preparing_amount ?? 0),
        href: "/adm/orders?status=preparing",
      },
      {
        key: "shipped",
        label: "배송 -> 완료",
        count: Number(transition?.shipped_count ?? 0),
        amount: Number(transition?.shipped_amount ?? 0),
        href: "/adm/orders?status=shipped",
      },
    ],
    lowStockProducts: products.filter(isLowStock).length,
    lowStockOptions: Number(lowOptionResult?.count ?? 0),
    smsBalance: 0,
    inquiries: mapFeed(inquiryResult.results),
    productQuestions: mapFeed(questionResult.results),
    reviews: mapFeed(reviewResult.results),
  };
}

function isLowStock(product: ManagedCatalogProduct): boolean {
  return (
    product.stock <= product.stockNotificationQuantity ||
    product.stock <= 0 ||
    product.soldOut
  );
}

function mapFeed(rows: FeedRow[] | undefined): ShopOverviewFeedItem[] {
  return (rows ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    author: row.author,
    createdAt: row.created_at,
  }));
}

function paymentKey(value: string): ShopOverviewPaymentRow["key"] {
  const normalized = value.toLowerCase().replace(/[-_\s]/gu, "");
  if (["card", "creditcard", "credit"].includes(normalized)) return "card";
  if (["transfer", "accounttransfer", "directbank"].includes(normalized)) {
    return "transfer";
  }
  if (["virtual", "virtualaccount", "vbank"].includes(normalized)) {
    return "virtual";
  }
  if (["mobile", "phone", "hp"].includes(normalized)) return "mobile";
  if (["point", "points"].includes(normalized)) return "points";
  if (["coupon", "coupons"].includes(normalized)) return "coupon";
  return "bank";
}

function sum(
  rows: DailyOrderRow[],
  key: "order_count" | "amount",
): number {
  return rows.reduce((total, row) => total + (Number(row[key]) || 0), 0);
}

function koreaDateRange(
  now: Date,
  length: number,
): Array<{ date: string; label: string }> {
  const currentDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return Array.from({ length }, (_, index) => {
    const date = addDays(currentDate, index - length + 1);
    return { date, label: legacyDateLabel(date) };
  });
}

function legacyDateLabel(date: string): string {
  const weekday = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    weekday: "short",
  })
    .format(new Date(`${date}T12:00:00+09:00`))
    .replace("요일", "");
  return `${date.slice(5)} (${weekday})`;
}

function addDays(date: string, amount: number): string {
  const timestamp = Date.parse(`${date}T00:00:00+09:00`);
  return new Date(timestamp + amount * 86_400_000).toLocaleDateString("en-CA", {
    timeZone: "Asia/Seoul",
  });
}

function koreaDateStartUtc(date: string): string {
  return new Date(`${date}T00:00:00+09:00`)
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");
}
