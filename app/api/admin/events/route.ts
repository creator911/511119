import {
  adminApiErrorResponse,
  adminJson,
  assertSameOrigin,
  readAdminJson,
  requireAdminApiSession,
} from "@/lib/admin-api";
import {
  createStoreEvent,
  listAdminStoreEvents,
} from "@/lib/store-events";

export async function GET(request: Request): Promise<Response> {
  try {
    await requireAdminApiSession(request);
    return adminJson({ ok: true, events: await listAdminStoreEvents() });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    const session = await requireAdminApiSession(request);
    const input = await readAdminJson(request, 20_000);
    const event = await createStoreEvent(input, session.username);
    return adminJson({ ok: true, event }, 201);
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}
