import {
  adminApiErrorResponse,
  adminJson,
  assertSameOrigin,
  readAdminJson,
  requireAdminApiSession,
} from "@/lib/admin-api";
import {
  deleteAdminProductInteraction,
  updateAdminProductInteraction,
} from "@/lib/admin-interactions";

interface InteractionRouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(
  request: Request,
  context: InteractionRouteContext,
) {
  try {
    const session = await requireAdminApiSession(request);
    assertSameOrigin(request);
    const { id } = await context.params;
    const input = await readAdminJson(request, 16_384);
    const interaction = await updateAdminProductInteraction(
      decodeURIComponent(id),
      input,
      session.username,
    );
    return adminJson({ ok: true, interaction });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export async function DELETE(
  request: Request,
  context: InteractionRouteContext,
) {
  try {
    const session = await requireAdminApiSession(request);
    assertSameOrigin(request);
    const { id } = await context.params;
    await deleteAdminProductInteraction(
      decodeURIComponent(id),
      session.username,
    );
    return adminJson({ ok: true, deletedId: decodeURIComponent(id) });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}
