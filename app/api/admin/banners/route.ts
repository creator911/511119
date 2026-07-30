import {
  adminApiErrorResponse,
  adminJson,
  assertSameOrigin,
  readAdminJson,
  requireAdminApiSession,
} from "@/lib/admin-api";
import {
  createManagedBanner,
  getAdminBannerRecords,
} from "@/lib/admin-banners";

export async function GET(request: Request): Promise<Response> {
  try {
    await requireAdminApiSession(request);
    const records = await getAdminBannerRecords({ strict: true });
    return adminJson({
      ok: true,
      banners: records,
      total: records.length,
    });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    const session = await requireAdminApiSession(request);
    const input = await readAdminJson(request, 25_000);
    const record = await createManagedBanner(input, {
      adminUsername: session.username,
    });
    return adminJson({ ok: true, banner: record }, 201);
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}
