import {
  adminApiErrorResponse,
  adminJson,
  assertSameOrigin,
  readAdminJson,
  requireAdminApiSession,
} from "@/lib/admin-api";
import {
  deleteSecondaryAdminAccount,
  updateSecondaryAdminAccount,
} from "@/lib/admin-accounts";
import { getPrimaryAdminUsername } from "@/lib/auth";

interface AdminAccountRouteContext {
  params: Promise<{ id: string }>;
}

const MAX_ACCOUNT_BODY_BYTES = 12_000;

export async function PATCH(
  request: Request,
  context: AdminAccountRouteContext,
): Promise<Response> {
  try {
    assertSameOrigin(request);
    const session = await requireAdminApiSession(request);
    const { id } = await context.params;
    const input = await readAdminJson(request, MAX_ACCOUNT_BODY_BYTES);
    const account = await updateSecondaryAdminAccount(id, input, {
      actorUsername: session.username,
      actorAdminId: session.accountId,
      primaryUsername: getPrimaryAdminUsername(),
    });
    return adminJson({
      ok: true,
      account,
      message: "관리자 계정 정보를 저장했습니다.",
    });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export async function DELETE(
  request: Request,
  context: AdminAccountRouteContext,
): Promise<Response> {
  try {
    assertSameOrigin(request);
    const session = await requireAdminApiSession(request);
    const { id } = await context.params;
    await deleteSecondaryAdminAccount(id, {
      actorUsername: session.username,
      actorAdminId: session.accountId,
      primaryUsername: getPrimaryAdminUsername(),
    });
    return adminJson({
      ok: true,
      deletedId: id,
      message: "보조 관리자 계정을 삭제했습니다.",
    });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}
