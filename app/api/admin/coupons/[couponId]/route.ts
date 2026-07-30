import {
  adminApiErrorResponse,
  adminJson,
  assertSameOrigin,
  readAdminJson,
  requireAdminApiSession,
} from "@/lib/admin-api";
import {
  deleteAdminCoupon,
  updateAdminCoupon,
} from "@/lib/commerce-promotions";

interface RouteContext {
  params: Promise<{ couponId: string }>;
}

export async function PATCH(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    assertSameOrigin(request);
    const session = await requireAdminApiSession(request);
    const { couponId } = await context.params;
    const input = await readAdminJson(request, 20_000);
    const coupon = await updateAdminCoupon(
      couponId,
      input,
      session.username,
    );
    return adminJson({ ok: true, coupon });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export async function DELETE(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    assertSameOrigin(request);
    const session = await requireAdminApiSession(request);
    const { couponId } = await context.params;
    await deleteAdminCoupon(couponId, session.username);
    return adminJson({ ok: true });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}
