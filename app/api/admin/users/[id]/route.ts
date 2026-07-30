import {
  AdminApiError,
  adminApiErrorResponse,
  adminJson,
  assertSameOrigin,
  readAdminJson,
  requireAdminApiSession,
} from "@/lib/admin-api";
import { verifyAdminCredentials } from "@/lib/auth";
import {
  checkAuthRateLimit,
  clearAuthRateLimit,
} from "@/lib/auth-rate";
import {
  deactivateAdminMember,
  getAdminMemberDetail,
  updateAdminMember,
} from "@/lib/admin-operations";

interface AdminMemberRouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(
  request: Request,
  context: AdminMemberRouteContext,
): Promise<Response> {
  try {
    await requireAdminApiSession(request);
    const { id } = await context.params;
    const member = await getAdminMemberDetail(id);
    if (!member) {
      return adminJson(
        { ok: false, message: "회원을 찾을 수 없습니다." },
        404,
      );
    }
    return adminJson({ ok: true, member });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  context: AdminMemberRouteContext,
): Promise<Response> {
  try {
    assertSameOrigin(request);
    const session = await requireAdminApiSession(request);
    const { id } = await context.params;
    const input = await readAdminJson(request, 10_000);
    const prepared = await prepareMemberUpdate(
      input,
      session.username,
      request,
    );
    const member = await updateAdminMember(
      id,
      prepared.input,
      session.username,
      {
        passwordResetAuthorized: prepared.passwordResetAuthorized,
      },
    );
    return adminJson({ ok: true, member });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export async function DELETE(
  request: Request,
  context: AdminMemberRouteContext,
): Promise<Response> {
  try {
    assertSameOrigin(request);
    const session = await requireAdminApiSession(request);
    const { id } = await context.params;
    const member = await deactivateAdminMember(id, session.username);
    return adminJson({
      ok: true,
      member,
      message: "회원 이용을 중지했습니다. 개인정보와 주문 기록은 보존됩니다.",
    });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

async function prepareMemberUpdate(
  input: unknown,
  adminUsername: string,
  request: Request,
): Promise<{
  input: unknown;
  passwordResetAuthorized: boolean;
}> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { input, passwordResetAuthorized: false };
  }

  const sanitizedInput = {
    ...(input as Record<string, unknown>),
  };
  const adminPassword = sanitizedInput.adminPassword;
  delete sanitizedInput.adminPassword;
  const passwordResetRequested =
    typeof sanitizedInput.newPassword === "string" &&
    sanitizedInput.newPassword.length > 0;
  if (!passwordResetRequested) {
    return { input: sanitizedInput, passwordResetAuthorized: false };
  }
  const rateLimit = await checkAuthRateLimit(
    request,
    "admin-reauth",
    10 * 60 * 1_000,
    8,
  );
  if (rateLimit.limited) {
    throw new AdminApiError(
      429,
      "잠시 후 다시 시도해 주세요.",
      { adminPassword: "관리자 재인증 시도 횟수를 초과했습니다." },
    );
  }
  if (
    typeof adminPassword !== "string" ||
    adminPassword.length === 0 ||
    adminPassword.length > 1_024 ||
    !(await verifyAdminCredentials(adminUsername, adminPassword))
  ) {
    throw new AdminApiError(
      403,
      "관리자 비밀번호를 확인해 주세요.",
      { adminPassword: "관리자 재인증이 필요합니다." },
    );
  }
  await clearAuthRateLimit(request, "admin-reauth");

  return { input: sanitizedInput, passwordResetAuthorized: true };
}
