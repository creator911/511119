import {
  adminApiErrorResponse,
  adminJson,
  assertSameOrigin,
  readAdminJson,
  requireAdminApiSession,
} from "@/lib/admin-api";
import {
  deleteContentEntry,
  updateContentEntry,
} from "@/lib/site-content";

interface ContentRouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(
  request: Request,
  context: ContentRouteContext,
) {
  try {
    const session = await requireAdminApiSession(request);
    assertSameOrigin(request);
    const { id } = await context.params;
    const input = await readAdminJson(request, 80_000);
    const entry = await updateContentEntry(decodeURIComponent(id), input, {
      adminUsername: session.username,
    });
    return adminJson({ ok: true, entry });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export async function DELETE(
  request: Request,
  context: ContentRouteContext,
) {
  try {
    const session = await requireAdminApiSession(request);
    assertSameOrigin(request);
    const { id } = await context.params;
    await deleteContentEntry(decodeURIComponent(id), {
      adminUsername: session.username,
    });
    return adminJson({ ok: true });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}
