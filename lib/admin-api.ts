import { getAdminSession, type AdminSession } from "@/lib/auth";
import {
  adminPermissionModeForMethod,
  canAccessAdminRequirement,
  requiredAdminApiPermission,
} from "@/lib/admin-permissions";
import {
  HttpBoundaryError,
  readBoundedJson,
} from "@/lib/http-boundary";

export class AdminApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: Record<string, string>,
  ) {
    super(message);
    this.name = "AdminApiError";
  }
}

export async function requireAdminApiSession(
  request: Request,
): Promise<AdminSession> {
  const session = await getAdminSession(request);
  if (!session) {
    throw new AdminApiError(401, "관리자 로그인이 필요합니다.");
  }
  const required = requiredAdminApiPermission(
    new URL(request.url).pathname,
  );
  if (
    !canAccessAdminRequirement(session, required) ||
    !canAccessAdminRequirement(
      session,
      required,
      adminPermissionModeForMethod(request.method),
    )
  ) {
    throw new AdminApiError(403, "이 작업을 수행할 관리 권한이 없습니다.");
  }
  return session;
}

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) return;

  let originUrl: URL;
  let requestUrl: URL;
  try {
    originUrl = new URL(origin);
    requestUrl = new URL(request.url);
  } catch {
    throw new AdminApiError(403, "요청을 확인할 수 없습니다.");
  }

  if (originUrl.origin !== requestUrl.origin) {
    throw new AdminApiError(403, "요청을 확인할 수 없습니다.");
  }
}

export async function readAdminJson(
  request: Request,
  maximumBytes = 600_000,
): Promise<unknown> {
  try {
    return await readBoundedJson<unknown>(request, maximumBytes);
  } catch (error) {
    if (error instanceof HttpBoundaryError) {
      const message =
        error.status === 413
          ? "요청 내용이 너무 큽니다."
          : error.status === 415
            ? "JSON 요청만 지원합니다."
            : "요청 형식이 올바르지 않습니다.";
      throw new AdminApiError(error.status, message);
    }
    throw error;
  }
}

export function adminJson(
  body: object,
  status = 200,
  additionalHeaders?: HeadersInit,
): Response {
  const headers = new Headers(additionalHeaders);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store, max-age=0");
  headers.set("X-Content-Type-Options", "nosniff");

  return new Response(JSON.stringify(body), { status, headers });
}

export function adminApiErrorResponse(error: unknown): Response {
  if (error instanceof AdminApiError) {
    return adminJson(
      {
        ok: false,
        message: error.message,
        ...(error.details ? { fieldErrors: error.details } : {}),
      },
      error.status,
    );
  }

  return adminJson(
    { ok: false, message: "요청을 처리하지 못했습니다." },
    500,
  );
}
