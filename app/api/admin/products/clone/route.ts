import {
  adminApiErrorResponse,
  adminJson,
  assertSameOrigin,
  readAdminJson,
  requireAdminApiSession,
} from "@/lib/admin-api";
import { cloneManagedProduct } from "@/lib/admin-products";

export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    const session = await requireAdminApiSession(request);
    const input = await readAdminJson(request);
    const record = await cloneManagedProduct(input, {
      adminUsername: session.username,
    });
    return adminJson(
      {
        ok: true,
        product: {
          ...record.product,
          revision: record.revision,
          stockControlRevision: record.stockControlRevision,
        },
        revision: record.revision,
        stockControlRevision: record.stockControlRevision,
      },
      201,
    );
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}
