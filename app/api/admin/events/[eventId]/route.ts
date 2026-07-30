import {
  adminApiErrorResponse,
  adminJson,
  assertSameOrigin,
  readAdminJson,
  requireAdminApiSession,
} from "@/lib/admin-api";
import {
  deleteStoreEvent,
  updateStoreEvent,
} from "@/lib/store-events";

interface RouteContext {
  params: Promise<{ eventId: string }>;
}

export async function PATCH(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    assertSameOrigin(request);
    const session = await requireAdminApiSession(request);
    const { eventId } = await context.params;
    const input = await readAdminJson(request, 20_000);
    const event = await updateStoreEvent(
      eventId,
      input,
      session.username,
    );
    return adminJson({ ok: true, event });
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
    const { eventId } = await context.params;
    await deleteStoreEvent(eventId, session.username);
    return adminJson({ ok: true });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}
