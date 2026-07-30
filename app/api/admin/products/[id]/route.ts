import {
  adminApiErrorResponse,
  adminJson,
  assertSameOrigin,
  readAdminJson,
  requireAdminApiSession,
} from "@/lib/admin-api";
import {
  deleteManagedProduct,
  getAdminProductRecords,
  updateManagedProduct,
} from "@/lib/admin-products";

interface ProductRouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(
  request: Request,
  context: ProductRouteContext,
): Promise<Response> {
  try {
    await requireAdminApiSession(request);
    const { id } = await context.params;
    const record = (
      await getAdminProductRecords({ strict: true })
    ).find((entry) => entry.product.id === id);
    if (!record) {
      return adminJson(
        { ok: false, message: "상품을 찾을 수 없습니다." },
        404,
      );
    }
    return adminJson({
      ok: true,
      product: {
        ...record.product,
        revision: record.revision,
        stockControlRevision: record.stockControlRevision,
      },
      revision: record.revision,
      stockControlRevision: record.stockControlRevision,
    });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  context: ProductRouteContext,
): Promise<Response> {
  try {
    assertSameOrigin(request);
    const session = await requireAdminApiSession(request);
    const { id } = await context.params;
    const input = await readAdminJson(request);
    const record = await updateManagedProduct(id, input, {
      adminUsername: session.username,
    });
    return adminJson({
      ok: true,
      product: {
        ...record.product,
        revision: record.revision,
        stockControlRevision: record.stockControlRevision,
      },
      revision: record.revision,
      stockControlRevision: record.stockControlRevision,
    });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export const PUT = PATCH;

export async function DELETE(
  request: Request,
  context: ProductRouteContext,
): Promise<Response> {
  try {
    assertSameOrigin(request);
    const session = await requireAdminApiSession(request);
    const { id } = await context.params;
    await deleteManagedProduct(id, {
      adminUsername: session.username,
    });
    return adminJson({ ok: true, deletedId: id });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}
