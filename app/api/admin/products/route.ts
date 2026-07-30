import {
  adminApiErrorResponse,
  adminJson,
  assertSameOrigin,
  readAdminJson,
  requireAdminApiSession,
} from "@/lib/admin-api";
import {
  createManagedProduct,
  getAdminProductRecords,
} from "@/lib/admin-products";

export async function GET(request: Request): Promise<Response> {
  try {
    await requireAdminApiSession(request);
    const url = new URL(request.url);
    const includeDeleted = url.searchParams.get("includeDeleted") === "true";
    const query = url.searchParams.get("q")?.trim().toLocaleLowerCase("ko-KR");
    const categoryId = url.searchParams.get("categoryId")?.trim();
    const records = await getAdminProductRecords({
      strict: true,
      includeDeleted,
    });

    const filtered = records.filter(({ product, deleted }) => {
      if (!includeDeleted && deleted) return false;
      if (categoryId && product.categoryId !== categoryId) return false;
      if (
        query &&
        ![
          product.id,
          product.name,
          product.basic,
          product.model,
          product.brand,
        ]
          .join(" ")
          .toLocaleLowerCase("ko-KR")
          .includes(query)
      ) {
        return false;
      }
      return true;
    });

    return adminJson({
      ok: true,
      products: filtered.map((record) => ({
        ...record.product,
        revision: record.revision,
        stockControlRevision: record.stockControlRevision,
      })),
      total: filtered.length,
    });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    const session = await requireAdminApiSession(request);
    const input = await readAdminJson(request);
    const record = await createManagedProduct(input, {
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
