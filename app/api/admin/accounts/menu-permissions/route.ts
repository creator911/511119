import {
  adminApiErrorResponse,
  adminJson,
  assertSameOrigin,
  readAdminJson,
  requireAdminApiSession,
} from "@/lib/admin-api";
import {
  createAdminPermissionChallenge,
  deleteAdminMenuPermissions,
  grantAdminMenuPermission,
  listAdminMenuPermissions,
} from "@/lib/admin-menu-permissions";
import { getPrimaryAdminUsername } from "@/lib/auth";

const MAX_PERMISSION_BODY_BYTES = 24_000;

export async function GET(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    const session = await requireAdminApiSession(request);
    const params = new URL(request.url).searchParams;
    const [page, challenge] = await Promise.all([
      listAdminMenuPermissions({
        page: readPositiveInteger(params.get("page")),
        pageSize: readPositiveInteger(params.get("pageSize")),
        query: params.get("q") ?? "",
      }),
      createAdminPermissionChallenge(session.username),
    ]);
    return adminJson({ ok: true, ...page, challenge });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    const session = await requireAdminApiSession(request);
    const input = await readAdminJson(
      request,
      MAX_PERMISSION_BODY_BYTES,
    );
    const permission = await grantAdminMenuPermission(input, {
      actorUsername: session.username,
      actorAdminId: session.accountId,
      primaryUsername: getPrimaryAdminUsername(),
    });
    return adminJson(
      {
        ok: true,
        permission,
        message: "관리권한을 추가했습니다.",
      },
      201,
    );
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export async function DELETE(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    const session = await requireAdminApiSession(request);
    const input = await readAdminJson(
      request,
      MAX_PERMISSION_BODY_BYTES,
    );
    const deletedIds = await deleteAdminMenuPermissions(input, {
      actorUsername: session.username,
      actorAdminId: session.accountId,
      primaryUsername: getPrimaryAdminUsername(),
    });
    return adminJson({
      ok: true,
      deletedIds,
      message: "선택한 관리권한을 삭제했습니다.",
    });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

function readPositiveInteger(value: string | null): number | undefined {
  if (!value || !/^\d+$/u.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0
    ? parsed
    : undefined;
}

