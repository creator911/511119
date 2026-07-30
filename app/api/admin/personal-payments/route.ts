import {
  adminApiErrorResponse,
  adminJson,
  assertSameOrigin,
  readAdminJson,
  requireAdminApiSession,
} from "@/lib/admin-api";
import {
  createPersonalPayment,
  deletePersonalPayments,
  listAdminPersonalPayments,
} from "@/lib/personal-payments";

export async function GET(request: Request): Promise<Response> {
  try {
    await requireAdminApiSession(request);
    const search = new URL(request.url).searchParams;
    const payments = await listAdminPersonalPayments({
      field: search.get("field") ?? "",
      query: search.get("query") ?? "",
    });
    return adminJson({ ok: true, payments });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    const session = await requireAdminApiSession(request);
    const input = await readAdminJson(request, 30_000);
    const payment = await createPersonalPayment(input, session.username);
    return adminJson({ ok: true, payment }, 201);
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export async function DELETE(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    const session = await requireAdminApiSession(request);
    const input = (await readAdminJson(request, 10_000)) as {
      ids?: unknown;
    };
    const deleted = await deletePersonalPayments(
      input && typeof input === "object" ? input.ids : undefined,
      session.username,
    );
    return adminJson({
      ok: true,
      deleted,
      message: `개인결제 ${deleted}건을 삭제했습니다.`,
    });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}
