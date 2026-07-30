import {
  adminApiErrorResponse,
  adminJson,
  assertSameOrigin,
  readAdminJson,
  requireAdminApiSession,
} from "@/lib/admin-api";
import {
  createManagedCategory,
  getAdminCategoryRecords,
} from "@/lib/admin-categories";

export async function GET(request: Request): Promise<Response> {
  try {
    await requireAdminApiSession(request);
    const records = await getAdminCategoryRecords();
    return adminJson({ ok: true, categories: records });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireAdminApiSession(request);
    assertSameOrigin(request);
    const input = await readAdminJson(request, 32_768);
    const category = await createManagedCategory(input, {
      adminUsername: session.username,
    });
    return adminJson({ ok: true, category }, 201);
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}
