import {
  AdminApiError,
  adminApiErrorResponse,
  adminJson,
  assertSameOrigin,
  readAdminJson,
  requireAdminApiSession,
} from "@/lib/admin-api";
import {
  canAccessAdminRequirement,
} from "@/lib/admin-permissions";
import {
  deleteM3CronRunsByPeriod,
  listM3CronRuns,
} from "@/lib/admin-m3cron";
import { verifyAdminCredentials } from "@/lib/auth";

export async function GET(request: Request): Promise<Response> {
  try {
    await requireAdminApiSession(request);
    const jobId = new URL(request.url).searchParams.get("job") ?? "";
    return adminJson({
      ok: true,
      runs: await listM3CronRuns({ jobId }),
    });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export async function DELETE(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    const session = await requireAdminApiSession(request);
    if (!canAccessAdminRequirement(session, "settings.manage")) {
      throw new AdminApiError(
        403,
        "m3cron 로그를 삭제할 관리 권한이 없습니다.",
      );
    }
    const input = (await readAdminJson(request, 10_000)) as {
      password?: unknown;
    };
    const password =
      input && typeof input.password === "string" ? input.password : "";
    if (
      !password ||
      !(await verifyAdminCredentials(session.username, password))
    ) {
      throw new AdminApiError(400, "관리자 비밀번호가 올바르지 않습니다.");
    }
    const sourceIp =
      request.headers.get("cf-connecting-ip") ??
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      "";
    const result = await deleteM3CronRunsByPeriod(
      input,
      session.username,
      sourceIp,
    );
    return adminJson({ ok: true, ...result });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}
