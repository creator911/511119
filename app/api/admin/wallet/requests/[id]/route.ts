import {
  AdminApiError,
  adminApiErrorResponse,
  adminJson,
  assertSameOrigin,
  readAdminJson,
  requireAdminApiSession,
} from "@/lib/admin-api";
import {
  editAdminWalletRequest,
  processWalletRequest,
} from "@/lib/wallet";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, context: RouteContext) {
  return processDecision(request, context, "approve");
}

export async function DELETE(request: Request, context: RouteContext) {
  return processDecision(request, context, "reject");
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    assertSameOrigin(request);
    const session = await requireAdminApiSession(request);
    const input = await readAdminJson(request, 24_576);
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new AdminApiError(400, "수정 요청 형식이 올바르지 않습니다.");
    }
    const value = input as Record<string, unknown>;
    const kind = value.kind;
    if (kind !== "charge" && kind !== "withdrawal") {
      throw new AdminApiError(400, "충전·출금 종류가 올바르지 않습니다.");
    }
    const { id } = await context.params;
    const walletRequest = await editAdminWalletRequest(
      kind,
      id,
      value,
      session.username,
    );
    return adminJson({
      ok: true,
      request: walletRequest,
      message: "충전·출금 내역을 수정했습니다.",
    });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

async function processDecision(
  request: Request,
  context: RouteContext,
  expectedDecision: "approve" | "reject",
) {
  try {
    assertSameOrigin(request);
    const session = await requireAdminApiSession(request);
    const input = await readAdminJson(request, 16_384);
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new AdminApiError(400, "요청 형식이 올바르지 않습니다.");
    }
    const value = input as Record<string, unknown>;
    const kind = value.kind;
    const decision = value.decision;
    const adminMemo = value.adminMemo ?? "";
    if (kind !== "charge" && kind !== "withdrawal") {
      throw new AdminApiError(400, "요청 종류가 올바르지 않습니다.");
    }
    if (decision !== expectedDecision) {
      throw new AdminApiError(400, "처리 결과가 올바르지 않습니다.");
    }
    if (typeof adminMemo !== "string") {
      throw new AdminApiError(400, "관리자 메모 형식이 올바르지 않습니다.");
    }
    const { id } = await context.params;
    const walletRequest = await processWalletRequest(
      kind,
      id,
      expectedDecision,
      adminMemo,
      session.username,
    );
    return adminJson({ ok: true, request: walletRequest });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}
