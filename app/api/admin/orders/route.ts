import {
  adminApiErrorResponse,
  adminJson,
  requireAdminApiSession,
} from "@/lib/admin-api";
import { getAdminOrderList as getAdminOrdersPage } from "@/lib/admin-order-list";

export async function GET(request: Request): Promise<Response> {
  try {
    await requireAdminApiSession(request);
    const params = new URL(request.url).searchParams;
    const result = await getAdminOrdersPage({
      page: readNumber(params.get("page")),
      pageSize: readNumber(params.get("pageSize")),
      q: params.get("q") ?? "",
      searchField: params.get("searchField") ?? "",
      status: params.get("status") ?? "",
      paymentMethod: params.get("paymentMethod") ?? "",
      paymentStatus: params.get("paymentStatus") ?? "",
      outstandingOnly: params.get("outstandingOnly") ?? "",
      cancelledOnly: params.get("cancelledOnly") ?? "",
      refundedOnly: params.get("refundedOnly") ?? "",
      pointsOrderOnly: params.get("pointsOrderOnly") ?? "",
      couponOnly: params.get("couponOnly") ?? "",
      dateStart: params.get("dateStart") ?? "",
      dateEnd: params.get("dateEnd") ?? "",
      sortBy: params.get("sortBy") ?? "",
      sortDirection: params.get("sortDirection") ?? "",
    });
    return adminJson({ ok: true, ...result });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

function readNumber(value: string | null): number | undefined {
  if (!value || !/^\d+$/u.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}
