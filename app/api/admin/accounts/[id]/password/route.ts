import {
  adminApiErrorResponse,
  adminJson,
  assertSameOrigin,
  readAdminJson,
  requireAdminApiSession,
} from "@/lib/admin-api";
import { resetSecondaryAdminPassword } from "@/lib/admin-accounts";
import { getPrimaryAdminUsername } from "@/lib/auth";

interface AdminAccountPasswordRouteContext {
  params: Promise<{ id: string }>;
}

const MAX_PASSWORD_BODY_BYTES = 4_096;

export async function PATCH(
  request: Request,
  context: AdminAccountPasswordRouteContext,
): Promise<Response> {
  try {
    assertSameOrigin(request);
    const session = await requireAdminApiSession(request);
    const { id } = await context.params;
    const input = await readAdminJson(request, MAX_PASSWORD_BODY_BYTES);
    const account = await resetSecondaryAdminPassword(id, input, {
      actorUsername: session.username,
      actorAdminId: session.accountId,
      primaryUsername: getPrimaryAdminUsername(),
    });
    return adminJson({
      ok: true,
      account,
      message: "관리자 비밀번호를 재설정했습니다. 기존 세션은 만료됩니다.",
    });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}
