import {
  claimCouponForCustomer,
  CouponApplicationError,
} from "@/lib/commerce-promotions";
import { getCustomerSession } from "@/lib/customer-auth";
import { noStoreJson } from "@/lib/http-boundary";

export async function POST(
  request: Request,
  context: { params: Promise<{ couponId: string }> },
): Promise<Response> {
  if (!isSameOrigin(request)) {
    return noStoreJson({ error: "요청을 확인해 주세요." }, { status: 403 });
  }
  const session = await getCustomerSession(request);
  if (!session) {
    return noStoreJson(
      { error: "쿠폰 다운로드는 로그인 후 이용할 수 있습니다." },
      { status: 401 },
    );
  }
  try {
    const { couponId } = await context.params;
    const result = await claimCouponForCustomer(
      couponId,
      session.userId,
    );
    return noStoreJson({ ok: true, ...result });
  } catch (error) {
    if (error instanceof CouponApplicationError) {
      return noStoreJson(
        { error: error.message, reason: error.reason },
        { status: error.status },
      );
    }
    return noStoreJson(
      { error: "쿠폰을 다운로드하지 못했습니다." },
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
