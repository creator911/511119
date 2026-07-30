import {
  adminApiErrorResponse,
  adminJson,
  assertSameOrigin,
  readAdminJson,
} from "@/lib/admin-api";
import { submitPersonalPaymentNotice } from "@/lib/personal-payments";

interface RouteContext {
  params: Promise<{ token: string }>;
}

export async function POST(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    assertSameOrigin(request);
    const { token } = await context.params;
    const input = await readAdminJson(request, 10_000);
    const result = await submitPersonalPaymentNotice(request, token, input);
    return adminJson({ ok: true, ...result }, 201);
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}
