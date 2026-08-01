import {
  adminApiErrorResponse,
  adminJson,
  assertSameOrigin,
  requireAdminApiSession,
} from "@/lib/admin-api";
import { cloneAdminMember } from "@/lib/admin-member-clone";

interface AdminMemberCloneRouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(
  request: Request,
  context: AdminMemberCloneRouteContext,
): Promise<Response> {
  try {
    assertSameOrigin(request);
    const session = await requireAdminApiSession(request);
    const { id } = await context.params;
    const result = await cloneAdminMember(id, session.username);
    return adminJson({
      ok: true,
      ...result,
      message: `${result.loginId} 계정을 복제했습니다.`,
    });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}
