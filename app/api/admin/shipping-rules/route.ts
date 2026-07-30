import {
  adminApiErrorResponse,
  adminJson,
  assertSameOrigin,
  readAdminJson,
  requireAdminApiSession,
} from "@/lib/admin-api";
import {
  createAdminShippingRule,
  listAdminShippingRules,
} from "@/lib/commerce-promotions";

export async function GET(request: Request): Promise<Response> {
  try {
    await requireAdminApiSession(request);
    const rules = await listAdminShippingRules();
    return adminJson({ ok: true, rules });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    const session = await requireAdminApiSession(request);
    const input = await readAdminJson(request, 20_000);
    const rule = await createAdminShippingRule(
      input,
      session.username,
    );
    return adminJson({ ok: true, rule }, 201);
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}
