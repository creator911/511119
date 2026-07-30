import {
  adminApiErrorResponse,
  adminJson,
  assertSameOrigin,
  readAdminJson,
  requireAdminApiSession,
} from "@/lib/admin-api";
import {
  getAdminProductOptionProducts,
  saveAdminProductOptions,
} from "@/lib/product-options";

export async function GET(request: Request): Promise<Response> {
  try {
    await requireAdminApiSession(request);
    const products = await getAdminProductOptionProducts();
    return adminJson({ ok: true, products, total: products.length });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export async function PUT(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    const session = await requireAdminApiSession(request);
    const input = await readAdminJson(request, 300_000);
    const product = await saveAdminProductOptions(
      input,
      session.username,
    );
    return adminJson({
      ok: true,
      product,
      message: `${product.name} 상품의 옵션을 저장했습니다.`,
    });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export const PATCH = PUT;
