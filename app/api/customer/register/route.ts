import { checkAuthRateLimit } from "@/lib/auth-rate";
import { commerceDb, ensureCommerceSchema } from "@/lib/commerce-db";
import {
  createCustomerSessionCookie,
  hashCustomerPassword,
} from "@/lib/customer-auth";
import {
  HttpBoundaryError,
  isJsonObject,
  noStoreJson,
  readBoundedJson,
} from "@/lib/http-boundary";
import { scorePasswordStrength } from "@/lib/password-strength";

interface RegistrationBody {
  userId?: string;
  password?: string;
  name?: string;
  nickname?: string;
  birthYear?: string;
  email?: string;
  phone?: string;
  postcode?: string;
  address1?: string;
  address2?: string;
  agreeTerms?: boolean;
  agreePrivacy?: boolean;
  agreeMarketing?: boolean;
  publicProfile?: boolean;
}

const REGISTRATION_WINDOW_MS = 60 * 60 * 1_000;
const MAX_REGISTRATIONS_PER_WINDOW = 5;
const MAX_REGISTRATION_BODY_BYTES = 16_384;

export async function GET(request: Request) {
  try {
    if (!isSameOrigin(request)) {
      return noStoreJson({ error: "잘못된 요청입니다." }, { status: 403 });
    }
    const url = new URL(request.url);
    const field = url.searchParams.get("field") ?? "";
    const rawValue = url.searchParams.get("value")?.trim() ?? "";
    const value = field === "email" ? rawValue.toLowerCase() : rawValue;
    const columns = {
      userId: "login_id",
      nickname: "nickname",
      email: "email",
    } as const;
    if (!(field in columns) || !validAvailabilityValue(field, value)) {
      return noStoreJson(
        { error: "확인할 정보를 올바르게 입력해 주세요." },
        { status: 400 },
      );
    }
    await ensureCommerceSchema();
    const column = columns[field as keyof typeof columns];
    const existing = await commerceDb()
      .prepare(`SELECT id FROM users WHERE ${column} = ? LIMIT 1`)
      .bind(value)
      .first<{ id: string }>();
    return noStoreJson({
      available: !existing,
      ...(existing ? { error: "이미 사용 중인 정보입니다." } : {}),
    });
  } catch {
    return noStoreJson(
      { error: "중복 여부를 확인하지 못했습니다." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    if (!isSameOrigin(request)) {
      return noStoreJson(
        { error: "잘못된 요청입니다." },
        { status: 403 },
      );
    }
    const rateLimit = await checkAuthRateLimit(
      request,
      "customer-register",
      REGISTRATION_WINDOW_MS,
      MAX_REGISTRATIONS_PER_WINDOW,
    );
    if (rateLimit.limited) {
      return noStoreJson(
        { error: "잠시 후 다시 시도해 주세요." },
        {
          status: 429,
          headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
        },
      );
    }
    const payload = await readBoundedJson<unknown>(
      request,
      MAX_REGISTRATION_BODY_BYTES,
    );
    if (!isJsonObject(payload) || !isRegistrationBody(payload)) {
      return noStoreJson(
        { error: "요청 형식을 확인해 주세요." },
        { status: 400 },
      );
    }
    const body = payload;
    const loginId = body.userId?.trim() ?? "";
    const email = body.email?.trim().toLowerCase() ?? "";
    const name = body.name?.trim() ?? "";
    const nickname = body.nickname?.trim() ?? "";
    const birthYear = body.birthYear?.trim() ?? "";
    const password = body.password ?? "";
    const phone = body.phone?.trim() ?? "";
    const postcode = body.postcode?.trim() ?? "";
    const address1 = body.address1?.trim() ?? "";
    const address2 = body.address2?.trim() ?? "";

    if (!/^[a-z0-9_-]{4,30}$/i.test(loginId)) {
      return noStoreJson(
        { error: "아이디는 영문·숫자 4~30자로 입력해 주세요." },
        { status: 400 },
      );
    }
    if (password.length < 8 || password.length > 128) {
      return noStoreJson(
        { error: "비밀번호는 8자 이상으로 입력해 주세요." },
        { status: 400 },
      );
    }
    if (scorePasswordStrength(password) < 2) {
      return noStoreJson(
        { error: "비밀번호의 강도는 보통 이상이어야 합니다." },
        { status: 400 },
      );
    }
    if (
      !name ||
      name.length > 80 ||
      !/^[가-힣a-z0-9_-]{2,80}$/iu.test(nickname) ||
      !validBirthYear(birthYear) ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      email.length > 254 ||
      phone.length > 30 ||
      postcode.length > 20 ||
      address1.length > 200 ||
      address2.length > 200
    ) {
      return noStoreJson(
        { error: "이름과 이메일을 확인해 주세요." },
        { status: 400 },
      );
    }
    if (!body.agreeTerms || !body.agreePrivacy) {
      return noStoreJson(
        { error: "필수 약관에 동의해 주세요." },
        { status: 400 },
      );
    }

    await ensureCommerceSchema();
    const database = commerceDb();
    const existing = await database
      .prepare(
        `SELECT id
         FROM users
         WHERE login_id = ? OR email = ? OR nickname = ?
         LIMIT 1`,
      )
      .bind(loginId, email, nickname)
      .first<{ id: string }>();
    if (existing) {
      return noStoreJson(
        { error: "이미 사용 중인 아이디·닉네임 또는 이메일입니다." },
        { status: 409 },
      );
    }

    const userId = crypto.randomUUID();
    const passwordHash = await hashCustomerPassword(password);
    await database.batch([
      database
        .prepare(
          `INSERT INTO users (
            id, login_id, email, password_hash, name, nickname, phone,
            postcode, address1, address2, email_opt_in, public_profile, extra1
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          userId,
          loginId,
          email,
          passwordHash,
          name,
          nickname,
          phone,
          postcode,
          address1,
          address2,
          body.agreeMarketing ? 1 : 0,
          body.publicProfile ? 1 : 0,
          birthYear,
        ),
      database
        .prepare(
          `INSERT INTO user_session_state (user_id, session_version)
           VALUES (?, 1)`,
        )
        .bind(userId),
    ]);

    const response = noStoreJson({ ok: true }, { status: 201 });
    response.headers.set(
      "set-cookie",
      await createCustomerSessionCookie(request, {
        userId,
        loginId,
        name,
        sessionVersion: 1,
        remember: true,
      }),
    );
    return response;
  } catch (error) {
    if (isUserIdentityConflict(error)) {
      return noStoreJson(
        { error: "이미 사용 중인 아이디·닉네임 또는 이메일입니다." },
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
      { error: "회원가입 처리 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}

function isUserIdentityConflict(error: unknown): boolean {
  return (
    error instanceof Error &&
    /UNIQUE constraint failed:\s*users\.(?:login_id|email)|users_(?:login_id|email)_uq/iu.test(
      error.message,
    )
  );
}

function isRegistrationBody(
  value: Record<string, unknown>,
): value is Record<string, unknown> & RegistrationBody {
  for (const field of [
    "userId",
    "password",
    "name",
    "nickname",
    "birthYear",
    "email",
    "phone",
    "postcode",
    "address1",
    "address2",
  ]) {
    if (value[field] !== undefined && typeof value[field] !== "string") {
      return false;
    }
  }
  for (const field of [
    "agreeTerms",
    "agreePrivacy",
    "agreeMarketing",
    "publicProfile",
  ]) {
    if (value[field] !== undefined && typeof value[field] !== "boolean") {
      return false;
    }
  }
  return true;
}

function validAvailabilityValue(field: string, value: string) {
  if (field === "userId") return /^[a-z0-9_-]{4,30}$/iu.test(value);
  if (field === "nickname") {
    return /^[가-힣a-z0-9_-]{2,80}$/iu.test(value);
  }
  if (field === "email") {
    return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value);
  }
  return false;
}

function validBirthYear(value: string) {
  const year = Number(value);
  return (
    /^\d{4}$/u.test(value) &&
    Number.isInteger(year) &&
    year >= 1900 &&
    year <= new Date().getFullYear()
  );
}

function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}
