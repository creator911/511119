import {
  adminApiErrorResponse,
  adminJson,
  assertSameOrigin,
  readAdminJson,
  requireAdminApiSession,
} from "@/lib/admin-api";
import {
  getLegacyShopSettings,
  saveLegacyShopSettings,
} from "@/lib/legacy-shop-settings";

export async function GET(request: Request): Promise<Response> {
  try {
    await requireAdminApiSession(request);
    assertSameOrigin(request);
    const snapshot = await getLegacyShopSettings({ strict: true });
    return adminJson({ ok: true, ...snapshot });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export async function PATCH(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    const session = await requireAdminApiSession(request);
    const input = await readAdminJson(request, 512_000);
    const snapshot = await saveLegacyShopSettings(input, {
      adminUsername: session.username,
    });
    return adminJson({ ok: true, ...snapshot });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export const PUT = PATCH;
