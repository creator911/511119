import {
  checkAuthRateLimit,
  clearAuthRateLimit,
} from "@/lib/auth-rate";
import {
  authenticateAdminCredentials,
  createAdminSessionCookie,
  getPrimaryAdminUsername,
} from "@/lib/auth";
import { commerceDb, ensureCommerceSchema } from "@/lib/commerce-db";
import { countAvailableCustomerCoupons } from "@/lib/commerce-promotions";
import {
  clearCustomerSessionCookie,
  createCustomerSessionCookie,
  getCustomerSession,
  verifyCustomerPassword,
} from "@/lib/customer-auth";
import {
  HttpBoundaryError,
  isJsonObject,
  noStoreJson,
  readBoundedJson,
} from "@/lib/http-boundary";
import { publicOrderStatusLabel } from "@/lib/order-status";

interface UserRow {
  id: string;
  login_id: string;
  password_hash: string;
  name: string;
  active: number;
  session_version: number;
}

const MIN_RESPONSE_TIME_MS = 450;
const ATTEMPT_WINDOW_MS = 10 * 60 * 1_000;
const MAX_ATTEMPTS_PER_WINDOW = 8;
const MAX_LOGIN_BODY_BYTES = 16_384;

export async function GET(request: Request) {
  const session = await getCustomerSession(request);
  if (!session) return noStoreJson({ user: null, orders: [] });
  try {
    await ensureCommerceSchema();
    const database = commerceDb();
    const [currentUser, orders, couponCount] = await Promise.all([
      database
        .prepare(
          `SELECT points
           FROM users WHERE id = ? AND active = 1 LIMIT 1`,
        )
        .bind(session.userId)
        .first<{ points: number }>(),
      database
        .prepare(
          `SELECT id, created_at, total, status
           FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 20`,
        )
        .bind(session.userId)
        .all<{
          id: string;
          created_at: string;
          total: number;
          status: string;
        }>(),
      countAvailableCustomerCoupons(session.userId),
    ]);
    if (!currentUser) {
      return noStoreJson({ user: null, orders: [] });
    }
    return noStoreJson({
      user: {
        id: session.userId,
        loginId: session.loginId,
        name: session.name,
        points: Math.max(0, Math.trunc(Number(currentUser.points) || 0)),
        coupons: couponCount,
      },
      orders: (orders.results ?? []).map((order) => ({
        id: order.id,
        orderedAt: order.created_at,
        label: "골드리안 주문",
        amount: order.total,
        status: publicOrderStatusLabel(order.status),
        href: `/shop/orderinquiry.php?order_id=${encodeURIComponent(order.id)}`,
      })),
    });
  } catch {
    return noStoreJson({ user: null, orders: [] }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
    if (!isSameOrigin(request)) {
      await waitForMinimumResponseTime(startedAt);
      return noStoreJson(
        { error: "아이디 또는 비밀번호를 확인해 주세요." },
        { status: 403 },
      );
    }

    const payload = await readBoundedJson<unknown>(
      request,
      MAX_LOGIN_BODY_BYTES,
    );
    if (
      !isJsonObject(payload) ||
      typeof payload.userId !== "string" ||
      typeof payload.password !== "string" ||
      (payload.remember !== undefined && typeof payload.remember !== "boolean") ||
      payload.userId.length > 30 ||
      payload.password.length > 128
    ) {
      await waitForMinimumResponseTime(startedAt);
      return noStoreJson(
        { error: "아이디 또는 비밀번호를 확인해 주세요." },
        { status: 400 },
      );
    }
    const loginId = payload.userId.trim();
    const password = payload.password;
    await ensureCommerceSchema();
    const database = commerceDb();
    const preliminaryUser = await database
      .prepare(
        `SELECT id FROM users WHERE login_id = ? LIMIT 1`,
      )
      .bind(loginId)
      .first<{ id: string }>();
    if (preliminaryUser) {
      await database
        .prepare(
          `INSERT OR IGNORE INTO user_session_state (
             user_id, session_version
           ) VALUES (?, 1)`,
        )
        .bind(preliminaryUser.id)
        .run();
    }
    const user = await database
      .prepare(
        `SELECT u.id, u.login_id, u.password_hash, u.name, u.active,
                state.session_version
         FROM users u
         JOIN user_session_state state ON state.user_id = u.id
         WHERE u.login_id = ?
         LIMIT 1`,
      )
      .bind(loginId)
      .first<UserRow>();
    const rateLimit = await checkAuthRateLimit(
      request,
      "customer-login",
      ATTEMPT_WINDOW_MS,
      MAX_ATTEMPTS_PER_WINDOW,
      database,
    );
    const adminIdentity = !rateLimit.limited
      ? await authenticateAdminCredentials(
          loginId,
          password,
          undefined,
          database,
        )
      : null;
    if (adminIdentity) {
      await waitForMinimumResponseTime(startedAt);
      const response = noStoreJson({ ok: true, role: "admin" });
      response.headers.set(
        "set-cookie",
        await createAdminSessionCookie(
          undefined,
          new URL(request.url).protocol === "https:",
          adminIdentity,
        ),
      );
      await clearAuthRateLimit(request, "customer-login", database);
      return response;
    }

    // The primary administrator identifier is reserved and must never fall
    // through to an ordinary customer account with the same login id.
    const primaryAdminUsername = getPrimaryAdminUsername();
    const requestedPrimaryAdmin =
      primaryAdminUsername.length > 0 && loginId === primaryAdminUsername;
    const passwordMatches =
      !rateLimit.limited && !requestedPrimaryAdmin && user && user.active
        ? await verifyCustomerPassword(password, user.password_hash)
        : false;
    await waitForMinimumResponseTime(startedAt);
    if (
      !user ||
      !user.active ||
      !passwordMatches ||
      rateLimit.limited
    ) {
      return noStoreJson(
        { error: "아이디 또는 비밀번호를 확인해 주세요." },
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
    const loginUpdate = await database
      .prepare(
        `UPDATE users
         SET last_login_at = CURRENT_TIMESTAMP
         WHERE id = ?
           AND password_hash = ?
           AND EXISTS (
             SELECT 1 FROM user_session_state state
             WHERE state.user_id = users.id
               AND state.session_version = ?
           )`,
      )
      .bind(user.id, user.password_hash, user.session_version)
      .run();
    if (!loginUpdate.meta.changes) {
      return noStoreJson(
        { error: "아이디 또는 비밀번호를 확인해 주세요." },
        { status: 401 },
      );
    }
    const response = noStoreJson({ ok: true, role: "member" });
    response.headers.set(
      "set-cookie",
      await createCustomerSessionCookie(request, {
        userId: user.id,
        loginId: user.login_id,
        name: user.name,
        sessionVersion: Number(user.session_version),
        remember: payload.remember === true,
      }, { remember: payload.remember === true }),
    );
    await clearAuthRateLimit(request, "customer-login", database);
    return response;
  } catch (error) {
    await waitForMinimumResponseTime(startedAt);
    if (error instanceof HttpBoundaryError) {
      return noStoreJson(
        { error: "아이디 또는 비밀번호를 확인해 주세요." },
        { status: error.status },
      );
    }
    return noStoreJson(
      { error: "로그인 처리 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  if (!isSameOrigin(request)) {
    return noStoreJson({ ok: false }, { status: 403 });
  }
  let invalidated = true;
  const session = await getCustomerSession(request);
  if (session) {
    try {
      await ensureCommerceSchema();
      await commerceDb()
        .prepare(
          `INSERT INTO user_session_state (
             user_id, session_version, updated_at
           ) VALUES (?, 2, CURRENT_TIMESTAMP)
           ON CONFLICT(user_id) DO UPDATE SET
             session_version = user_session_state.session_version + 1,
             updated_at = CURRENT_TIMESTAMP`,
        )
        .bind(session.userId)
        .run();
    } catch {
      invalidated = false;
    }
  }
  const response = noStoreJson(
    { ok: invalidated },
    { status: invalidated ? 200 : 503 },
  );
  response.headers.set("set-cookie", clearCustomerSessionCookie(request));
  return response;
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
