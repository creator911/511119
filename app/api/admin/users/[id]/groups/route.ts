import {
  adminApiErrorResponse,
  adminJson,
  assertSameOrigin,
  readAdminJson,
  requireAdminApiSession,
} from "@/lib/admin-api";
import {
  getAdminMemberAccessGroups,
  updateAdminMemberAccessGroups,
} from "@/lib/admin-member-groups";

interface MemberGroupsRouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(
  request: Request,
  context: MemberGroupsRouteContext,
): Promise<Response> {
  try {
    await requireAdminApiSession(request);
    const { id } = await context.params;
    const result = await getAdminMemberAccessGroups(id);
    return adminJson({ ok: true, ...result });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export async function PUT(
  request: Request,
  context: MemberGroupsRouteContext,
): Promise<Response> {
  try {
    assertSameOrigin(request);
    const session = await requireAdminApiSession(request);
    const input = await readAdminJson(request, 20_000);
    const { id } = await context.params;
    const result = await updateAdminMemberAccessGroups(
      id,
      input,
      session.username,
    );
    return adminJson({
      ok: true,
      ...result,
      message: "회원 접근그룹을 저장했습니다.",
    });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}
