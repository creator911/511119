import {
  adminApiErrorResponse,
  adminJson,
  assertSameOrigin,
  readAdminJson,
  requireAdminApiSession,
} from "@/lib/admin-api";
import {
  getAdminProductStockRows,
  updateAdminProductStockRows,
} from "@/lib/admin-product-stock";

export async function GET(request: Request): Promise<Response> {
  try {
    await requireAdminApiSession(request);
    const rows = await getAdminProductStockRows();
    return adminJson({ ok: true, rows, total: rows.length });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export async function PUT(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    const session = await requireAdminApiSession(request);
    const input = await readAdminJson(request, 150_000);
    const rows = await updateAdminProductStockRows(
      input,
      session.username,
    );
    return adminJson({
      ok: true,
      rows,
      updated: rows.length,
      message: `${rows.length.toLocaleString("ko-KR")}개 상품의 재고 정보를 저장했습니다.`,
    });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export const PATCH = PUT;
