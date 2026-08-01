import {
  checkAuthRateLimit,
  clearAuthRateLimit,
} from "@/lib/auth-rate";
import { commerceDb, ensureCommerceSchema } from "@/lib/commerce-db";
import {
  clearCustomerSessionCookie,
  createCustomerSessionCookie,
  getCustomerSession,
  hashCustomerPassword,
  verifyCustomerPassword,
} from "@/lib/customer-auth";
import {
  HttpBoundaryError,
  isJsonObject,
  noStoreJson,
  readBoundedJson,
} from "@/lib/http-boundary";

interface ProfileRow {
  id: string;
  login_id: string;
  email: string;
  password_hash: string;
  name: string;
  phone: string;
  postcode: string;
  address1: string;
  address2: string;
  email_opt_in: number;
  sms_opt_in: number;
  active: number;
}

interface ProfileWriteBody {
  name?: string;
  email?: string;
  phone?: string;
  postcode?: string;
  address1?: string;
  address2?: string;
  emailOptIn?: boolean;
  smsOptIn?: boolean;
  currentPassword?: string;
  newPassword?: string;
}

const MAX_PROFILE_BODY_BYTES = 16_384;
const REAUTH_WINDOW_MS = 10 * 60 * 1_000;
const MAX_REAUTH_ATTEMPTS = 8;

export async function GET(request: Request) {
  const session = await getCustomerSession(request);
  if (!session) {
    return noStoreJson({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  await ensureCommerceSchema();
  const profile = await readProfile(session.userId);
  if (!profile?.active) {
    return noStoreJson({ error: "회원 정보를 찾을 수 없습니다." }, { status: 404 });
  }

  return noStoreJson({ profile: publicProfile(profile) });
}

export async function PATCH(request: Request) {
  try {
    if (!isSameOrigin(request)) {
      return noStoreJson({ error: "잘못된 요청입니다." }, { status: 403 });
    }

    const session = await getCustomerSession(request);
    if (!session) {
      return noStoreJson({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const payload = await readBoundedJson<unknown>(
      request,
      MAX_PROFILE_BODY_BYTES,
    );
    if (!isJsonObject(payload) || !isProfileWriteBody(payload)) {
      return noStoreJson(
        { error: "요청 형식을 확인해 주세요." },
        { status: 400 },
      );
    }
    const body = payload;
    const name = body.name?.trim() ?? "";
    const email = body.email?.trim().toLowerCase() ?? "";
    const phone = body.phone?.trim() ?? "";
    const postcode = body.postcode?.trim() ?? "";
    const address1 = body.address1?.trim() ?? "";
    const address2 = body.address2?.trim() ?? "";
    if (
      name.length < 1 ||
      name.length > 80 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      email.length > 254 ||
      phone.length > 30 ||
      postcode.length > 20 ||
      address1.length > 200 ||
      address2.length > 200
    ) {
      return noStoreJson(
        { error: "이름, 이메일, 연락처와 주소를 확인해 주세요." },
        { status: 400 },
      );
    }

    await ensureCommerceSchema();
    const database = commerceDb();
    const profile = await readProfile(session.userId);
    if (!profile?.active) {
      return noStoreJson({ error: "회원 정보를 찾을 수 없습니다." }, { status: 404 });
    }

    const duplicate =
      email === profile.email
        ? null
        : await database
            .prepare("SELECT id FROM users WHERE email = ? AND id <> ? LIMIT 1")
            .bind(email, session.userId)
            .first<{ id: string }>();
    if (duplicate) {
      return noStoreJson(
        { error: "이미 사용 중인 이메일입니다." },
        { status: 409 },
      );
    }

    let newPasswordHash: string | null = null;
    if (body.newPassword) {
      const rateLimit = await checkAuthRateLimit(
        request,
        "customer-profile-reauth",
        REAUTH_WINDOW_MS,
        MAX_REAUTH_ATTEMPTS,
        database,
      );
      if (rateLimit.limited) {
        return noStoreJson(
          { error: "잠시 후 다시 시도해 주세요." },
          {
            status: 429,
            headers: {
              "Retry-After": String(rateLimit.retryAfterSeconds),
            },
          },
        );
      }
      if (
        body.newPassword.length < 8 ||
        body.newPassword.length > 128 ||
        !body.currentPassword ||
        body.currentPassword.length > 128 ||
        !(await verifyCustomerPassword(
          body.currentPassword,
          profile.password_hash,
        ))
      ) {
        return noStoreJson(
          { error: "현재 비밀번호 또는 새 비밀번호를 확인해 주세요." },
          { status: 400 },
        );
      }
      newPasswordHash = await hashCustomerPassword(body.newPassword);
      await clearAuthRateLimit(
        request,
        "customer-profile-reauth",
        database,
      );
    }

    const profileUpdate = newPasswordHash
      ? await database
          .prepare(
            `UPDATE users SET
               email = ?, password_hash = ?, name = ?, phone = ?,
               postcode = ?, address1 = ?, address2 = ?,
               email_opt_in = ?, sms_opt_in = ?,
               updated_at = CURRENT_TIMESTAMP
             WHERE id = ?
               AND password_hash = ?
               AND EXISTS (
                 SELECT 1 FROM user_session_state state
                 WHERE state.user_id = users.id
                   AND state.session_version = ?
               )`,
          )
          .bind(
            email,
            newPasswordHash,
            name,
            phone,
            postcode,
            address1,
            address2,
            body.emailOptIn ? 1 : 0,
            body.smsOptIn ? 1 : 0,
            session.userId,
            profile.password_hash,
            session.sessionVersion,
          )
          .run()
      : await database
          .prepare(
            `UPDATE users SET
               email = ?, name = ?, phone = ?, postcode = ?,
               address1 = ?, address2 = ?, email_opt_in = ?, sms_opt_in = ?,
               updated_at = CURRENT_TIMESTAMP
             WHERE id = ?
               AND EXISTS (
                 SELECT 1 FROM user_session_state state
                 WHERE state.user_id = users.id
                   AND state.session_version = ?
               )`,
          )
          .bind(
            email,
            name,
            phone,
            postcode,
            address1,
            address2,
            body.emailOptIn ? 1 : 0,
            body.smsOptIn ? 1 : 0,
            session.userId,
            session.sessionVersion,
          )
          .run();
    if (!profileUpdate.meta.changes) {
      return noStoreJson(
        {
          error:
            "다른 작업에서 계정 보안 정보가 변경되었습니다. 다시 로그인해 주세요.",
        },
        { status: 409 },
      );
    }

    const response = noStoreJson({
      ok: true,
      profile: {
        ...publicProfile(profile),
        name,
        email,
        phone,
        postcode,
        address1,
        address2,
        emailOptIn: Boolean(body.emailOptIn),
        smsOptIn: Boolean(body.smsOptIn),
      },
    });
    response.headers.set(
      "set-cookie",
      await createCustomerSessionCookie(request, {
        userId: session.userId,
        loginId: session.loginId,
        name,
        sessionVersion:
          session.sessionVersion + (newPasswordHash ? 1 : 0),
        remember: session.remember,
      }),
    );
    return response;
  } catch (error) {
    if (isUserEmailConflict(error)) {
      return noStoreJson(
        { error: "이미 사용 중인 이메일입니다." },
        { status: 409 },
      );
    }
    if (error instanceof HttpBoundaryError) {
      return noStoreJson(
        { error: "JSON 요청 형식을 확인해 주세요." },
        { status: error.status },
      );
    }
    return noStoreJson(
      { error: "회원 정보 저장 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}

function isUserEmailConflict(error: unknown): boolean {
  return (
    error instanceof Error &&
    /UNIQUE constraint failed:\s*users\.email|users_email_uq/iu.test(
      error.message,
    )
  );
}

export async function DELETE(request: Request) {
  try {
    if (!isSameOrigin(request)) {
      return noStoreJson({ error: "잘못된 요청입니다." }, { status: 403 });
    }
    const session = await getCustomerSession(request);
    if (!session) {
      return noStoreJson({ error: "로그인이 필요합니다." }, { status: 401 });
    }
    const payload = await readBoundedJson<unknown>(
      request,
      MAX_PROFILE_BODY_BYTES,
    );
    if (!isJsonObject(payload) || typeof payload.password !== "string") {
      return noStoreJson(
        { error: "요청 형식을 확인해 주세요." },
        { status: 400 },
      );
    }
    const password = payload.password;
    await ensureCommerceSchema();
    const database = commerceDb();
    const rateLimit = await checkAuthRateLimit(
      request,
      "customer-profile-reauth",
      REAUTH_WINDOW_MS,
      MAX_REAUTH_ATTEMPTS,
      database,
    );
    if (rateLimit.limited) {
      return noStoreJson(
        { error: "잠시 후 다시 시도해 주세요." },
        {
          status: 429,
          headers: {
            "Retry-After": String(rateLimit.retryAfterSeconds),
          },
        },
      );
    }
    const profile = await readProfile(session.userId);
    if (
      !profile?.active ||
      !password ||
      password.length > 128 ||
      !(await verifyCustomerPassword(password, profile.password_hash))
    ) {
      return noStoreJson(
        { error: "비밀번호를 확인해 주세요." },
        { status: 400 },
      );
    }
    await clearAuthRateLimit(
      request,
      "customer-profile-reauth",
      database,
    );
    const deactivation = await database
      .prepare(
        `UPDATE users
         SET active = 0, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?
           AND password_hash = ?
           AND EXISTS (
             SELECT 1 FROM user_session_state state
             WHERE state.user_id = users.id
               AND state.session_version = ?
           )`,
      )
      .bind(
        session.userId,
        profile.password_hash,
        session.sessionVersion,
      )
      .run();
    if (!deactivation.meta.changes) {
      return noStoreJson(
        {
          error:
            "다른 작업에서 계정 보안 정보가 변경되었습니다. 다시 로그인해 주세요.",
        },
        { status: 409 },
      );
    }
    const response = noStoreJson({ ok: true });
    response.headers.set("set-cookie", clearCustomerSessionCookie(request));
    return response;
  } catch (error) {
    if (error instanceof HttpBoundaryError) {
      return noStoreJson(
        { error: "JSON 요청 형식을 확인해 주세요." },
        { status: error.status },
      );
    }
    return noStoreJson(
      { error: "회원 탈퇴 처리 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}

async function readProfile(userId: string) {
  return commerceDb()
    .prepare(
      `SELECT id, login_id, email, password_hash, name, phone, postcode,
              address1, address2, email_opt_in, sms_opt_in, active
       FROM users WHERE id = ? LIMIT 1`,
    )
    .bind(userId)
    .first<ProfileRow>();
}

function publicProfile(profile: ProfileRow) {
  return {
    loginId: profile.login_id,
    name: profile.name,
    email: profile.email,
    phone: profile.phone,
    postcode: profile.postcode,
    address1: profile.address1,
    address2: profile.address2,
    emailOptIn: Boolean(profile.email_opt_in),
    smsOptIn: Boolean(profile.sms_opt_in),
  };
}

function isProfileWriteBody(
  value: Record<string, unknown>,
): value is Record<string, unknown> & ProfileWriteBody {
  const stringFields = [
    "name",
    "email",
    "phone",
    "postcode",
    "address1",
    "address2",
    "currentPassword",
    "newPassword",
  ];
  for (const field of stringFields) {
    if (value[field] !== undefined && typeof value[field] !== "string") {
      return false;
    }
  }
  for (const field of ["emailOptIn", "smsOptIn"]) {
    if (value[field] !== undefined && typeof value[field] !== "boolean") {
      return false;
    }
  }
  return true;
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
