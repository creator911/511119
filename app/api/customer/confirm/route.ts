import {
  checkAuthRateLimit,
  clearAuthRateLimit,
} from "@/lib/auth-rate";
import { commerceDb, ensureCommerceSchema } from "@/lib/commerce-db";
import {
  getCustomerSession,
  verifyCustomerPassword,
} from "@/lib/customer-auth";
import {
  HttpBoundaryError,
  isJsonObject,
  noStoreJson,
  readBoundedJson,
} from "@/lib/http-boundary";

const MAX_BODY_BYTES = 8_192;
const ATTEMPT_WINDOW_MS = 10 * 60 * 1_000;
const MAX_ATTEMPTS_PER_WINDOW = 8;
const MIN_RESPONSE_TIME_MS = 450;

export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
    if (!isSameOrigin(request)) {
      await waitForMinimumResponseTime(startedAt);
      return noStoreJson({ error: "비밀번호를 확인해 주세요." }, { status: 403 });
    }
    const session = await getCustomerSession(request);
    if (!session) {
      await waitForMinimumResponseTime(startedAt);
      return noStoreJson({ error: "로그인이 필요합니다." }, { status: 401 });
    }
    const payload = await readBoundedJson<unknown>(request, MAX_BODY_BYTES);
    if (
      !isJsonObject(payload) ||
      typeof payload.password !== "string" ||
      payload.password.length > 128
    ) {
      await waitForMinimumResponseTime(startedAt);
      return noStoreJson({ error: "비밀번호를 확인해 주세요." }, { status: 400 });
    }

    await ensureCommerceSchema();
    const database = commerceDb();
    const rateLimit = await checkAuthRateLimit(
      request,
      "customer-confirm",
      ATTEMPT_WINDOW_MS,
      MAX_ATTEMPTS_PER_WINDOW,
      database,
    );
    const user = await database
      .prepare(
        `SELECT password_hash, active
         FROM users WHERE id = ? LIMIT 1`,
      )
      .bind(session.userId)
      .first<{ password_hash: string; active: number }>();
    const matches =
      !rateLimit.limited && user?.active
        ? await verifyCustomerPassword(payload.password, user.password_hash)
        : false;
    await waitForMinimumResponseTime(startedAt);
    if (!matches) {
      return noStoreJson(
        { error: "비밀번호를 확인해 주세요." },
        {
          status: rateLimit.limited ? 429 : 401,
          ...(rateLimit.limited
            ? {
                headers: {
                  "Retry-After": String(rateLimit.retryAfterSeconds),
                },
              }
            : {}),
        },
      );
    }
    await clearAuthRateLimit(request, "customer-confirm", database);
    return noStoreJson({ ok: true });
  } catch (error) {
    await waitForMinimumResponseTime(startedAt);
    if (error instanceof HttpBoundaryError) {
      return noStoreJson(
        { error: "비밀번호를 확인해 주세요." },
        { status: error.status },
      );
    }
    return noStoreJson(
      { error: "비밀번호 확인 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}

function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

async function waitForMinimumResponseTime(startedAt: number) {
  const remaining = MIN_RESPONSE_TIME_MS - (Date.now() - startedAt);
  if (remaining > 0) {
    await new Promise<void>((resolve) => setTimeout(resolve, remaining));
  }
}
