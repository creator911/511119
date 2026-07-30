import {
  adminApiErrorResponse,
  adminJson,
  assertSameOrigin,
  readAdminJson,
  requireAdminApiSession,
} from "@/lib/admin-api";
import {
  commitProductCsvImport,
  dryRunProductCsvImport,
  exportManagedProductsCsv,
} from "@/lib/admin-product-bulk";

interface ProductBulkBody {
  mode?: unknown;
  csv?: unknown;
  token?: unknown;
}

export async function GET(request: Request): Promise<Response> {
  try {
    await requireAdminApiSession(request);
    const csv = await exportManagedProductsCsv();
    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition":
          'attachment; filename="kiel-products.csv"',
        "Cache-Control": "no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    const session = await requireAdminApiSession(request);
    const body = (await readAdminJson(request, 600_000)) as ProductBulkBody;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return adminJson(
        { ok: false, message: "요청 형식이 올바르지 않습니다." },
        400,
      );
    }
    if (typeof body.csv !== "string") {
      return adminJson(
        { ok: false, message: "CSV 내용을 확인해 주세요." },
        400,
      );
    }

    if (body.mode === "dry-run") {
      const result = await dryRunProductCsvImport(
        body.csv,
        session.username,
      );
      return adminJson({ ok: true, ...result });
    }
    if (body.mode === "commit") {
      if (typeof body.token !== "string") {
        return adminJson(
          { ok: false, message: "먼저 dry-run 검증을 완료해 주세요." },
          400,
        );
      }
      const result = await commitProductCsvImport(
        body.csv,
        body.token,
        session.username,
      );
      return adminJson({ ok: true, ...result }, 201);
    }
    return adminJson(
      { ok: false, message: "dry-run 또는 commit 모드를 선택해 주세요." },
      400,
    );
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}
