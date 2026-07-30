import {
  adminApiErrorResponse,
  adminJson,
  assertSameOrigin,
  readAdminJson,
  requireAdminApiSession,
} from "@/lib/admin-api";
import {
  deleteAdminShippingRule,
  updateAdminShippingRule,
} from "@/lib/commerce-promotions";

interface RouteContext {
  params: Promise<{ ruleId: string }>;
}

export async function PATCH(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    assertSameOrigin(request);
    const session = await requireAdminApiSession(request);
    const { ruleId } = await context.params;
    const input = await readAdminJson(request, 20_000);
    const rule = await updateAdminShippingRule(
      ruleId,
      input,
      session.username,
    );
    return adminJson({ ok: true, rule });
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
    const { ruleId } = await context.params;
    await deleteAdminShippingRule(ruleId, session.username);
    return adminJson({ ok: true });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}
