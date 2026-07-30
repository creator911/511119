import {
  adminApiErrorResponse,
  adminJson,
  assertSameOrigin,
  readAdminJson,
  requireAdminApiSession,
} from "@/lib/admin-api";
import {
  createAdminCoupon,
  listAdminCoupons,
} from "@/lib/commerce-promotions";

export async function GET(request: Request): Promise<Response> {
  try {
    await requireAdminApiSession(request);
    const zoneOnly =
      new URL(request.url).searchParams.get("zone") === "1";
    const coupons = await listAdminCoupons({ zoneOnly });
    return adminJson({ ok: true, coupons });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    const session = await requireAdminApiSession(request);
    const input = await readAdminJson(request, 20_000);
    const coupon = await createAdminCoupon(input, session.username);
    return adminJson({ ok: true, coupon }, 201);
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}
