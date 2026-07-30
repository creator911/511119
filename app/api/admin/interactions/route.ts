import {
  AdminApiError,
  adminApiErrorResponse,
  adminJson,
  assertSameOrigin,
  requireAdminApiSession,
} from "@/lib/admin-api";
import {
  listAdminProductInteractions,
  type ProductInteractionKind,
} from "@/lib/admin-interactions";

function readKind(url: string): ProductInteractionKind {
  const value = new URL(url).searchParams.get("kind") ?? "question";
  if (value !== "question" && value !== "review") {
    throw new AdminApiError(400, "후기·문의 종류가 올바르지 않습니다.");
  }
  return value;
}

export async function GET(request: Request) {
  try {
    await requireAdminApiSession(request);
    assertSameOrigin(request);
    const url = new URL(request.url);
    const result = await listAdminProductInteractions(readKind(request.url), {
      page: positiveInteger(url.searchParams.get("page")),
      pageSize: positiveInteger(url.searchParams.get("pageSize")),
      query: url.searchParams.get("q") ?? "",
    });
    const { items, ...pagination } = result;
    return adminJson({ ok: true, interactions: items, pagination });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

function positiveInteger(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0
    ? Math.trunc(parsed)
    : undefined;
}
