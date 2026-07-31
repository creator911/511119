import {
  authenticateAdminCredentials,
  clearAdminSessionCookie,
  createAdminSessionCookie,
  getAdminSession,
} from "@/lib/auth";
import { clearCustomerSessionCookie } from "@/lib/customer-auth";
import {
  checkAuthRateLimit,
  clearAuthRateLimit,
} from "@/lib/auth-rate";
import {
  HttpBoundaryError,
  isJsonObject,
  readBoundedJson,
} from "@/lib/http-boundary";
import { isRequestSameOrigin } from "@/lib/request-origin";

const MIN_RESPONSE_TIME_MS = 450;
const ATTEMPT_WINDOW_MS = 10 * 60 * 1_000;
const MAX_ATTEMPTS_PER_WINDOW = 8;
const MAX_LOGIN_BODY_BYTES = 16_384;

export async function GET(request: Request): Promise<Response> {
  const session = await getAdminSession(request);
  return jsonResponse(
    session
      ? {
          ok: true,
          authenticated: true,
          user: {
            username: session.username,
            role: session.role,
            accountType: session.accountType,
            permissions: session.permissions,
          },
          expiresAt: new Date(session.expiresAt * 1_000).toISOString(),
        }
      : { ok: true, authenticated: false },
    200,
  );
}

export async function POST(request: Request): Promise<Response> {
  const startedAt = Date.now();

  try {
    if (!isRequestSameOrigin(request)) {
      await waitForMinimumResponseTime(startedAt);
      return genericLoginFailure(400);
    }

    const credentials = await readCredentials(request);
    const rateLimit = await checkAuthRateLimit(
      request,
      "admin-login",
      ATTEMPT_WINDOW_MS,
      MAX_ATTEMPTS_PER_WINDOW,
    );
    const identity =
      !rateLimit.limited && credentials !== null
        ? await authenticateAdminCredentials(
            credentials.username,
            credentials.password,
          )
        : null;

    await waitForMinimumResponseTime(startedAt);
    if (rateLimit.limited || !identity) {
      return genericLoginFailure(
        rateLimit.limited ? 429 : 401,
        rateLimit.limited ? rateLimit.retryAfterSeconds : undefined,
      );
    }

    let cookie: string;
    try {
      cookie = await createAdminSessionCookie(
        undefined,
        new URL(request.url).protocol === "https:",
        identity,
      );
    } catch {
      return genericLoginFailure(503);
    }

    await clearAuthRateLimit(request, "admin-login");
    const response = jsonResponse(
      { ok: true, authenticated: true },
      200,
      { "Set-Cookie": cookie },
    );
    response.headers.append(
      "Set-Cookie",
      clearCustomerSessionCookie(request),
    );
    return response;
  } catch (error) {
    await waitForMinimumResponseTime(startedAt);
    if (error instanceof HttpBoundaryError) {
      return genericLoginFailure(error.status);
    }
    return genericLoginFailure(400);
  }
}

export async function DELETE(request: Request): Promise<Response> {
  if (!isRequestSameOrigin(request)) {
    return jsonResponse({ ok: false }, 403);
  }

  const response = jsonResponse(
    { ok: true, authenticated: false },
    200,
    {
      "Set-Cookie": clearAdminSessionCookie(
        new URL(request.url).protocol === "https:",
      ),
    },
  );
  response.headers.append("Set-Cookie", clearAdminSessionCookie(true));
  response.headers.append("Set-Cookie", clearAdminSessionCookie(false));
  return response;
}

async function readCredentials(
  request: Request,
): Promise<{ username: string; password: string } | null> {
  const payload = await readBoundedJson<unknown>(
    request,
    MAX_LOGIN_BODY_BYTES,
  );
  if (!isJsonObject(payload)) return null;
  const username = payload.username;
  const password = payload.password;

  if (
    typeof username !== "string" ||
    typeof password !== "string" ||
    username.length === 0 ||
    username.length > 128 ||
    password.length === 0 ||
    password.length > 1_024
  ) {
    return null;
  }

  return { username, password };
}

async function waitForMinimumResponseTime(startedAt: number): Promise<void> {
  const elapsed = Date.now() - startedAt;
  const remaining = MIN_RESPONSE_TIME_MS - elapsed;
  if (remaining > 0) {
    await new Promise<void>((resolve) => setTimeout(resolve, remaining));
  }
}

function genericLoginFailure(
  status: number,
  retryAfterSeconds?: number,
): Response {
  return jsonResponse(
    {
      ok: false,
      authenticated: false,
      message: "아이디 또는 비밀번호를 확인해 주세요.",
    },
    status,
    retryAfterSeconds
      ? { "Retry-After": String(retryAfterSeconds) }
      : undefined,
  );
}

function jsonResponse(
  body: object,
  status: number,
  headers?: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
}
