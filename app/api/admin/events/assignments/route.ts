import {
  adminApiErrorResponse,
  adminJson,
  assertSameOrigin,
  readAdminJson,
  requireAdminApiSession,
} from "@/lib/admin-api";
import {
  getAdminEventProductList,
  saveAdminEventProductAssignments,
} from "@/lib/event-product-assignments";

export async function GET(request: Request): Promise<Response> {
  try {
    await requireAdminApiSession(request);
    const url = new URL(request.url);
    const result = await getAdminEventProductList({
      eventId: url.searchParams.get("eventId") ?? "",
      categoryId: url.searchParams.get("categoryId") ?? "",
      searchField: url.searchParams.get("searchField") ?? "",
      query: url.searchParams.get("query") ?? "",
      sortBy: url.searchParams.get("sortBy") ?? "",
      sortDirection: url.searchParams.get("sortDirection") ?? "",
      page: positiveInteger(url.searchParams.get("page")),
    });
    return adminJson({ ok: true, result });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export async function PATCH(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    const session = await requireAdminApiSession(request);
    const input = await readAdminJson(request, 20_000);
    const result = await saveAdminEventProductAssignments(
      input,
      session.username,
    );
    return adminJson({ ok: true, ...result });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

function positiveInteger(value: string | null): number | undefined {
  if (!value || !/^\d+$/u.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}
