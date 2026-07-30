import {
  AdminApiError,
  adminApiErrorResponse,
  adminJson,
  assertSameOrigin,
  readAdminJson,
  requireAdminApiSession,
} from "@/lib/admin-api";
import {
  createCommunityResource,
  deleteCommunityResource,
  listCommunityResource,
  updateCommunityResource,
  type CommunityResource,
} from "@/lib/admin-community";

const RESOURCES = new Set<CommunityResource>([
  "groups",
  "boards",
  "posts",
  "comments",
  "inquiry-settings",
  "inquiries",
]);

export async function GET(request: Request): Promise<Response> {
  try {
    await requireAdminApiSession(request);
    const url = new URL(request.url);
    const resource = readResource(url.searchParams.get("resource"));
    const result = await listCommunityResource(resource, {
      page: positiveInteger(url.searchParams.get("page")),
      pageSize: positiveInteger(url.searchParams.get("pageSize")),
      query: url.searchParams.get("q") ?? "",
    });
    if ("items" in result) {
      const { items, ...pagination } = result;
      return adminJson({
        ok: true,
        resource,
        data: items,
        pagination,
      });
    }
    return adminJson({ ok: true, resource, data: result });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireAdminApiSession(request);
    assertSameOrigin(request);
    const payload = await readAdminJson(request, 80_000);
    const { resource, input } = readMutationPayload(payload);
    if (resource === "inquiry-settings") {
      return adminJson(
        { ok: false, message: "설정은 수정 요청을 사용해 주세요." },
        405,
        { Allow: "GET, PATCH" },
      );
    }
    const data = await createCommunityResource(
      resource,
      input,
      session.username,
    );
    return adminJson({ ok: true, resource, data }, 201);
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export async function PATCH(request: Request): Promise<Response> {
  try {
    const session = await requireAdminApiSession(request);
    assertSameOrigin(request);
    const payload = await readAdminJson(request, 500_000);
    const { resource, id, input } = readMutationPayload(payload, true);
    const data = await updateCommunityResource(
      resource,
      id ?? "default",
      input,
      session.username,
    );
    return adminJson({ ok: true, resource, data });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export async function DELETE(request: Request): Promise<Response> {
  try {
    const session = await requireAdminApiSession(request);
    assertSameOrigin(request);
    const url = new URL(request.url);
    const resource = readResource(url.searchParams.get("resource"));
    if (resource === "inquiry-settings") {
      return adminJson(
        { ok: false, message: "1:1 문의 설정은 삭제할 수 없습니다." },
        405,
        { Allow: "GET, PATCH" },
      );
    }
    const id = url.searchParams.get("id") ?? "";
    await deleteCommunityResource(resource, id, session.username);
    return adminJson({ ok: true, resource, deletedId: id });
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

function readResource(value: string | null): CommunityResource {
  if (!value || !RESOURCES.has(value as CommunityResource)) {
    throw new AdminApiError(400, "지원하지 않는 관리 항목입니다.");
  }
  return value as CommunityResource;
}

function readMutationPayload(
  input: unknown,
  allowSettings = false,
): {
  resource: CommunityResource;
  id?: string;
  input: unknown;
} {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new AdminApiError(400, "요청 형식이 올바르지 않습니다.");
  }
  const payload = input as Record<string, unknown>;
  const resource = readResource(
    typeof payload.resource === "string" ? payload.resource : null,
  );
  if (!allowSettings && resource === "inquiry-settings") {
    throw new AdminApiError(400, "지원하지 않는 관리 항목입니다.");
  }
  if (
    payload.id !== undefined &&
    typeof payload.id !== "string"
  ) {
    throw new AdminApiError(400, "식별값이 올바르지 않습니다.");
  }
  return { resource, id: payload.id, input: payload.input };
}
