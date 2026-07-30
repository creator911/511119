import {
  adminApiErrorResponse,
  adminJson,
  assertSameOrigin,
  readAdminJson,
  requireAdminApiSession,
} from "@/lib/admin-api";
import {
  deleteAdminClub,
  updateAdminClub,
} from "@/lib/clubs";

interface RouteContext {
  params: Promise<{ clubId: string }>;
}

export async function PATCH(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    assertSameOrigin(request);
    const session = await requireAdminApiSession(request);
    const { clubId } = await context.params;
    const input = await readAdminJson(request, 20_000);
    const club = await updateAdminClub(
      clubId,
      input,
      session.username,
    );
    return adminJson({ ok: true, club });
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
    const { clubId } = await context.params;
    await deleteAdminClub(clubId, session.username);
    return adminJson({ ok: true });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}
