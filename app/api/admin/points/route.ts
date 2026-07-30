import {
  adminApiErrorResponse,
  adminJson,
  assertSameOrigin,
  readAdminJson,
  requireAdminApiSession,
} from "@/lib/admin-api";
import {
  createAdminPointEntry,
  deleteAdminPointEntries,
} from "@/lib/admin-points";

export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    const session = await requireAdminApiSession(request);
    const input = await readAdminJson(request, 20_000);
    const entry = await createAdminPointEntry(input, session.username);
    return adminJson(
      {
        ok: true,
        entry,
        message: "회원 포인트 내역을 등록했습니다.",
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
    const input = await readAdminJson(request, 30_000);
    const result = await deleteAdminPointEntries(
      input,
      session.username,
    );
    return adminJson({
      ok: true,
      ...result,
      message: `${result.deletedIds.length.toLocaleString("ko-KR")}건의 관리자 포인트 내역을 삭제하고 잔액을 되돌렸습니다.`,
    });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}
