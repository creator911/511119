import {
  adminApiErrorResponse,
  adminJson,
  assertSameOrigin,
  readAdminJson,
  requireAdminApiSession,
} from "@/lib/admin-api";
import { updateManagedProductList } from "@/lib/admin-products";

export async function PATCH(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    const session = await requireAdminApiSession(request);
    const input = await readAdminJson(request);
    const records = await updateManagedProductList(input, {
      adminUsername: session.username,
    });
    return adminJson({
      ok: true,
      products: records.map((record) => ({
        ...record.product,
        revision: record.revision,
        stockControlRevision: record.stockControlRevision,
      })),
      updated: records.length,
    });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export const PUT = PATCH;
