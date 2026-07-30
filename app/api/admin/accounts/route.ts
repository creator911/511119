import {
  adminApiErrorResponse,
  adminJson,
  assertSameOrigin,
  readAdminJson,
  requireAdminApiSession,
} from "@/lib/admin-api";
import {
  createSecondaryAdminAccount,
  listAdminAccounts,
} from "@/lib/admin-accounts";
import { getPrimaryAdminUsername } from "@/lib/auth";

const MAX_ACCOUNT_BODY_BYTES = 12_000;

export async function GET(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    await requireAdminApiSession(request);
    const accounts = await listAdminAccounts(getPrimaryAdminUsername());
    return adminJson({ ok: true, accounts });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    const session = await requireAdminApiSession(request);
    const input = await readAdminJson(request, MAX_ACCOUNT_BODY_BYTES);
    const account = await createSecondaryAdminAccount(input, {
      actorUsername: session.username,
      actorAdminId: session.accountId,
      primaryUsername: getPrimaryAdminUsername(),
    });
    return adminJson(
      {
        ok: true,
        account,
        message: "보조 관리자 계정을 등록했습니다.",
      },
      201,
    );
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}
