import {
  adminApiErrorResponse,
  adminJson,
  assertSameOrigin,
  requireAdminApiSession,
} from "@/lib/admin-api";
import { expireStoreEvents } from "@/lib/store-events";

export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    const session = await requireAdminApiSession(request);
    const result = await expireStoreEvents(session.username);
    return adminJson({ ok: true, ...result });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}
