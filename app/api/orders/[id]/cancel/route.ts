import { AdminApiError } from "@/lib/admin-api";
import { updateAdminOrder } from "@/lib/admin-operations";
import { commerceDb, ensureCommerceSchema } from "@/lib/commerce-db";
import {
  getCustomerSession,
  verifyOrderLookupToken,
} from "@/lib/customer-auth";
import {
  HttpBoundaryError,
  isJsonObject,
  noStoreJson,
  readBoundedJson,
} from "@/lib/http-boundary";

const MAX_BODY_BYTES = 8_192;
const orderIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/u;

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!isSameOrigin(request)) {
    return noStoreJson({ error: "요청을 확인해 주세요." }, { status: 403 });
  }
  const { id } = await context.params;
  if (!orderIdPattern.test(id)) {
    return noStoreJson({ error: "주문번호를 확인해 주세요." }, { status: 400 });
  }
  try {
    const payload = await readBoundedJson<unknown>(request, MAX_BODY_BYTES);
    if (
      !isJsonObject(payload) ||
      (payload.token !== undefined && typeof payload.token !== "string")
    ) {
      return noStoreJson({ error: "요청을 확인해 주세요." }, { status: 400 });
    }
    const token = typeof payload.token === "string" ? payload.token : "";
    const session = await getCustomerSession(request);
    const tokenPayload = token
      ? await verifyOrderLookupToken(request, token, id)
      : null;
    await ensureCommerceSchema();
    const current = await commerceDb()
      .prepare(
        `SELECT user_id, status, payment_status
         FROM orders WHERE id = ? LIMIT 1`,
      )
      .bind(id)
      .first<{
        user_id: string | null;
        status: string;
        payment_status: string;
      }>();
    const permitted =
      current &&
      ((session?.userId && current.user_id === session.userId) ||
        Boolean(tokenPayload));
    if (!current || !permitted) {
      return noStoreJson(
        { error: "주문을 찾을 수 없습니다." },
        { status: 404 },
      );
    }
    if (current.status !== "ordered" || current.payment_status !== "pending") {
      return noStoreJson(
        { error: "입금확인 전 주문만 바로 취소할 수 있습니다." },
        { status: 409 },
      );
    }
    const updated = await updateAdminOrder(
      id,
      {
        status: "cancelled",
        paymentStatus: "cancelled",
        trackingNumber: "",
      },
      session ? `customer:${session.userId}` : "guest-order-token",
    );
    return noStoreJson({
      ok: true,
      status: updated.status,
      paymentStatus: updated.paymentStatus,
    });
  } catch (error) {
    if (error instanceof HttpBoundaryError) {
      return noStoreJson(
        { error: "요청을 확인해 주세요." },
        { status: error.status },
      );
    }
    if (error instanceof AdminApiError) {
      return noStoreJson({ error: error.message }, { status: error.status });
    }
    return noStoreJson(
      { error: "주문 취소를 처리하지 못했습니다." },
      { status: 503 },
    );
  }
}

function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}
