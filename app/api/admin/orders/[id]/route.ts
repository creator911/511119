import {
  adminApiErrorResponse,
  adminJson,
  assertSameOrigin,
  readAdminJson,
  requireAdminApiSession,
} from "@/lib/admin-api";
import {
  getAdminOrderDetail,
  updateAdminOrder,
} from "@/lib/admin-operations";
import { deleteSafeIncompleteOrder } from "@/lib/admin-order-delete";

interface AdminOrderRouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(
  request: Request,
  context: AdminOrderRouteContext,
): Promise<Response> {
  try {
    await requireAdminApiSession(request);
    const { id } = await context.params;
    const order = await getAdminOrderDetail(id);
    if (!order) {
      return adminJson(
        { ok: false, message: "주문을 찾을 수 없습니다." },
        404,
      );
    }
    return adminJson({ ok: true, order });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  context: AdminOrderRouteContext,
): Promise<Response> {
  try {
    assertSameOrigin(request);
    const session = await requireAdminApiSession(request);
    const { id } = await context.params;
    const input = await readAdminJson(request, 10_000);
    const order = await updateAdminOrder(id, input, session.username);
    return adminJson({ ok: true, order });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export async function DELETE(
  request: Request,
  context: AdminOrderRouteContext,
): Promise<Response> {
  try {
    assertSameOrigin(request);
    const session = await requireAdminApiSession(request);
    const { id } = await context.params;
    const input = await readAdminJson(request, 2_000);
    const result = await deleteSafeIncompleteOrder(
      id,
      input,
      session.username,
    );
    return adminJson({ ok: true, ...result });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}
