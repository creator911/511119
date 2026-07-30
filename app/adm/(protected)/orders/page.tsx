import type { Metadata } from "next";
import { getAdminOrderList as getAdminOrdersPage } from "@/lib/admin-order-list";
import { requireAdminPagePermission } from "@/lib/auth";
import { OrderPrintManager } from "./OrderPrintManager";
import { OrdersManager } from "./OrdersManager";
import styles from "../../admin-routes.module.css";

export const metadata: Metadata = {
  title: "주문내역",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

interface AdminOrdersPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AdminOrdersPage({
  searchParams,
}: AdminOrdersPageProps) {
  await requireAdminPagePermission("orders.manage");
  const params = await searchParams;
  const printMode = readString(params.print) === "1";
  if (printMode) {
    return <OrderPrintManager today={koreaTodayYmd()} />;
  }

  const initialResult = await getAdminOrdersPage({
    page: readNumber(params.page),
    q: readString(params.q) || readString(params.search),
    searchField: normalizeOrderSearchField(
      readString(params.searchField) || readString(params.sel_field),
    ),
    status: readString(params.status),
    paymentMethod: readString(params.paymentMethod),
    paymentStatus: readString(params.paymentStatus),
    outstandingOnly: readBoolean(params.outstandingOnly),
    cancelledOnly: readBoolean(params.cancelledOnly),
    refundedOnly: readBoolean(params.refundedOnly),
    pointsOrderOnly: readBoolean(params.pointsOrderOnly),
    couponOnly: readBoolean(params.couponOnly),
    dateStart: readString(params.dateStart),
    dateEnd: readString(params.dateEnd),
    sortBy: readString(params.sortBy),
    sortDirection: readString(params.sortDirection),
  });

  return (
    <div className={`${styles.contentStack} legacy-order-page`}>
      <OrdersManager initialResult={initialResult} />
    </div>
  );
}

function koreaTodayYmd(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: "year" | "month" | "day") =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}${part("month")}${part("day")}`;
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

function readBoolean(
  value: string | string[] | undefined,
): boolean {
  const candidate = readString(value);
  return candidate === "1" || candidate === "true" || candidate === "Y";
}

function normalizeOrderSearchField(value: string): string {
  const legacyFields: Record<string, string> = {
    od_id: "orderNumber",
    mb_id: "memberId",
    od_name: "buyer",
    od_tel: "buyerPhone",
    od_hp: "buyerPhone",
    od_b_name: "recipient",
    od_b_tel: "recipientPhone",
    od_b_hp: "recipientPhone",
    od_deposit_name: "depositor",
    od_invoice: "invoice",
  };
  return legacyFields[value] ?? value;
}
