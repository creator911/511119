import {
  CouponApplicationError,
  customerClaimantKey,
  validateCouponForOrder,
} from "@/lib/commerce-promotions";
import { getCustomerSession } from "@/lib/customer-auth";
import {
  HttpBoundaryError,
  isJsonObject,
  noStoreJson,
  readBoundedJson,
} from "@/lib/http-boundary";

const MAX_BODY_BYTES = 8_192;

export async function POST(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) {
    return noStoreJson({ error: "요청을 확인해 주세요." }, { status: 403 });
  }
  try {
    const input = await readBoundedJson<unknown>(request, MAX_BODY_BYTES);
    if (
      !isJsonObject(input) ||
      typeof input.code !== "string" ||
      typeof input.subtotal !== "number" ||
      input.code.length > 40 ||
      !Number.isSafeInteger(input.subtotal) ||
      input.subtotal < 0
    ) {
      return noStoreJson(
        { error: "쿠폰코드와 주문금액을 확인해 주세요." },
        { status: 400 },
      );
    }
    const session = await getCustomerSession(request);
    const application = await validateCouponForOrder({
      code: input.code,
      subtotal: input.subtotal,
      userId: session?.userId,
      claimantKey: session
        ? customerClaimantKey(session.userId)
        : undefined,
    });
    return noStoreJson({
      ok: true,
      coupon: {
        code: application.code,
        name: application.name,
        type: application.type,
        amount: application.amount,
        minimumOrder: application.minimumOrder,
        discount: application.discount,
      },
    });
  } catch (error) {
    if (error instanceof CouponApplicationError) {
      return noStoreJson(
        { error: error.message, reason: error.reason },
        { status: error.status },
      );
    }
    if (error instanceof HttpBoundaryError) {
      return noStoreJson(
        { error: "쿠폰 확인 요청을 다시 확인해 주세요." },
        { status: error.status },
      );
    }
    return noStoreJson(
      { error: "쿠폰 정보를 확인하지 못했습니다." },
      { status: 503 },
    );
  }
}

function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}
