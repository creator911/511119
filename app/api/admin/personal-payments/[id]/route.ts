import {
  adminApiErrorResponse,
  adminJson,
  assertSameOrigin,
  readAdminJson,
  requireAdminApiSession,
} from "@/lib/admin-api";
import {
  deletePersonalPayments,
  updatePersonalPayment,
} from "@/lib/personal-payments";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    assertSameOrigin(request);
    const session = await requireAdminApiSession(request);
    const { id } = await context.params;
    const input = await readAdminJson(request, 30_000);
    const payment = await updatePersonalPayment(
      id,
      input,
      session.username,
    );
    return adminJson({ ok: true, payment });
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
    const { id } = await context.params;
    const deleted = await deletePersonalPayments([id], session.username);
    return adminJson({ ok: true, deleted });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}
