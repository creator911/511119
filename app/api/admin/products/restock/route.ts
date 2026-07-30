import {
  adminApiErrorResponse,
  adminJson,
  assertSameOrigin,
  readAdminJson,
  requireAdminApiSession,
} from "@/lib/admin-api";
import {
  deleteAdminRestockRequests,
  listAdminRestockRequests,
  updateAdminRestockRequest,
} from "@/lib/restock-notifications";

export async function GET(request: Request): Promise<Response> {
  try {
    await requireAdminApiSession(request);
    const url = new URL(request.url);
    const result = await listAdminRestockRequests({
      status: url.searchParams.get("status") ?? "",
      query: url.searchParams.get("q") ?? "",
    });
    return adminJson({ ok: true, ...result });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export async function PATCH(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    const session = await requireAdminApiSession(request);
    const input = await readAdminJson(request, 32_000);
    const updated = await updateAdminRestockRequest(
      input,
      session.username,
    );
    return adminJson({
      ok: true,
      request: updated,
      message: "재입고 알림 처리 상태를 저장했습니다.",
    });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export async function DELETE(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    const session = await requireAdminApiSession(request);
    const input = await readAdminJson(request, 32_000);
    const result = await deleteAdminRestockRequests(
      input,
      session.username,
    );
    return adminJson({
      ok: true,
      ...result,
      message: "선택한 재입고 알림 신청을 삭제했습니다.",
    });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}
