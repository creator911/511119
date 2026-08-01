import {
  adminApiErrorResponse,
  adminJson,
  assertSameOrigin,
  readAdminJson,
  requireAdminApiSession,
} from "@/lib/admin-api";
import {
  getAdminMemberOrders,
  updateAdminMemberOrderItem,
} from "@/lib/admin-member-orders";

interface AdminMemberOrdersRouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(
  request: Request,
  context: AdminMemberOrdersRouteContext,
): Promise<Response> {
  try {
    await requireAdminApiSession(request);
    const { id } = await context.params;
    const result = await getAdminMemberOrders(id);
    return adminJson({ ok: true, ...result });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export async function PUT(
  request: Request,
  context: AdminMemberOrdersRouteContext,
): Promise<Response> {
  try {
    assertSameOrigin(request);
    const session = await requireAdminApiSession(request);
    const { id } = await context.params;
    const input = await readAdminJson(request, 12_288);
    const result = await updateAdminMemberOrderItem(
      id,
      input,
      session.username,
    );
    return adminJson({
      ok: true,
      ...result,
      message: "회원 구매상품을 수정했습니다.",
    });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}
