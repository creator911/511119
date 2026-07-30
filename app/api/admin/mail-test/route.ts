import {
  adminApiErrorResponse,
  adminJson,
  assertSameOrigin,
  readAdminJson,
  requireAdminApiSession,
} from "@/lib/admin-api";
import {
  getAdminMailTestState,
  sendAdminTestMail,
} from "@/lib/admin-mail";

export async function GET(request: Request): Promise<Response> {
  try {
    await requireAdminApiSession(request);
    return adminJson({
      ok: true,
      state: await getAdminMailTestState(),
    });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    const session = await requireAdminApiSession(request);
    const input = await readAdminJson(request, 12_000);
    const run = await sendAdminTestMail(input, session.username);
    return adminJson({ ok: true, run }, 201);
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}
