import { env } from "cloudflare:workers";
import { AdminApiError } from "@/lib/admin-api";
import {
  defaultLegacyConfigValues,
  legacyConfigControlMap,
  legacyConfigControls,
  type LegacyConfigControl,
  type LegacyConfigValue,
  type LegacyConfigValues,
} from "@/lib/legacy-config-contract";
import {
  ensureSiteContentSchema,
  siteContentDatabase,
  type SiteDisplaySettings,
} from "@/lib/site-content";

const SETTING_PREFIX = "legacy.config.";
const legacyDomainPattern =
  /(?:^|[./@])(?:www\.)?kiel-gold\.com(?:$|[/:?#])/iu;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

export interface LegacyProviderState {
  configured: boolean;
  message: string;
}

export interface LegacyProviderStatus {
  email: LegacyProviderState;
  identity: LegacyProviderState;
  shortUrl: LegacyProviderState;
  sms: LegacyProviderState;
  sns: LegacyProviderState;
}

export interface LegacySettingsReadOptions {
  database?: D1Database;
  strict?: boolean;
}

export interface LegacySettingsWriteOptions {
  database?: D1Database;
  adminUsername: string;
}

export function mergeLegacyStorefrontSettings(
  legacySettings: LegacyConfigValues,
  siteSettings: SiteDisplaySettings,
): LegacyConfigValues {
  return {
    ...legacySettings,
    cf_title: siteSettings.companyName,
    cf_admin_email: siteSettings.email,
    cf_admin_email_name: siteSettings.representative,
    cf_use_point: siteSettings.pointUseEnabled,
  };
}

export function getLegacyProviderStatus(): LegacyProviderStatus {
  const bindings = env as unknown as Record<string, unknown>;
  const has = (...names: string[]) =>
    names.some((name) => {
      const value = bindings[name];
      return typeof value === "string" && value.trim().length > 0;
    });
  const email = has("RESEND_API_KEY", "MAIL_PROVIDER_TOKEN", "SMTP_PASSWORD");
  const identity = has(
    "IDENTITY_PROVIDER_SECRET",
    "KCB_CERT_KEY",
    "KCP_CERT_KEY",
    "INICIS_CERT_API_KEY",
  );
  const shortUrl = has("SHORT_URL_API_KEY");
  const sms = has("SMS_PROVIDER_TOKEN", "ICODE_TOKEN_KEY");
  const sns = has(
    "NAVER_CLIENT_SECRET",
    "KAKAO_CLIENT_SECRET",
    "GOOGLE_CLIENT_SECRET",
    "FACEBOOK_APP_SECRET",
    "TWITTER_CLIENT_SECRET",
    "PAYCO_CLIENT_SECRET",
  );
  return {
    email: providerState(email, "메일 발송 공급자가 연결되지 않았습니다."),
    identity: providerState(
      identity,
      "본인확인 공급자 환경변수가 연결되지 않았습니다.",
    ),
    shortUrl: providerState(
      shortUrl,
      "짧은주소 공급자 환경변수가 연결되지 않았습니다.",
    ),
    sms: providerState(sms, "SMS 공급자 토큰이 연결되지 않았습니다."),
    sns: providerState(sns, "SNS 공급자 비밀키가 연결되지 않았습니다."),
  };
}

export async function getLegacyAdminSettings(
  options: LegacySettingsReadOptions = {},
): Promise<LegacyConfigValues> {
  try {
    const database = options.database ?? siteContentDatabase();
    await ensureSiteContentSchema(database);
    const result = await database
      .prepare(
        `SELECT key, value
         FROM site_settings
         WHERE key LIKE ?
         ORDER BY key ASC`,
      )
      .bind(`${SETTING_PREFIX}%`)
      .all<{ key: string; value: string }>();
    const values: LegacyConfigValues = { ...defaultLegacyConfigValues };
    for (const row of result.results ?? []) {
      const key = row.key.slice(SETTING_PREFIX.length);
      const control = legacyConfigControlMap.get(key);
      if (!control || control.secret) continue;
      values[key] = parseStoredValue(control, row.value);
    }
    return applyFailClosedValues(values, getLegacyProviderStatus());
  } catch (error) {
    if (options.strict) throw error;
    return applyFailClosedValues(
      { ...defaultLegacyConfigValues },
      getLegacyProviderStatus(),
    );
  }
}

export async function saveLegacyAdminSettings(
  input: unknown,
  options: LegacySettingsWriteOptions,
): Promise<LegacyConfigValues> {
  void options.adminUsername;
  const providerStatus = getLegacyProviderStatus();
  const values = validateLegacyAdminSettings(input, providerStatus);
  const database = options.database ?? siteContentDatabase();
  await ensureSiteContentSchema(database);
  const uniqueControls = uniqueLegacyControls();
  await database.batch(
    uniqueControls
      .filter((control) => !control.secret)
      .map((control) =>
        database
          .prepare(
            `INSERT INTO site_settings(key, value, updated_at)
             VALUES (?, ?, CURRENT_TIMESTAMP)
             ON CONFLICT(key) DO UPDATE SET
               value = excluded.value,
               updated_at = CURRENT_TIMESTAMP`,
          )
          .bind(
            `${SETTING_PREFIX}${control.key}`,
            serializeValue(values[control.key]),
          ),
      ),
  );
  return values;
}

export function validateLegacyAdminSettings(
  input: unknown,
  providerStatus = getLegacyProviderStatus(),
): LegacyConfigValues {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new AdminApiError(400, "기본환경설정 형식을 확인해 주세요.");
  }
  const body = input as Record<string, unknown>;
  const errors: Record<string, string> = {};
  for (const key of Object.keys(body)) {
    if (!legacyConfigControlMap.has(key)) {
      errors[key] = "저장할 수 없는 환경설정 항목입니다.";
    }
  }
  const values: LegacyConfigValues = {};
  for (const control of uniqueLegacyControls()) {
    values[control.key] = readControlValue(
      control,
      body[control.key],
      errors,
    );
  }

  assertProviderActivation(values, providerStatus, errors);
  const failClosed = applyFailClosedValues(values, providerStatus);
  if (Object.keys(errors).length > 0) {
    throw new AdminApiError(
      400,
      "기본환경설정 값을 확인해 주세요.",
      errors,
    );
  }
  return failClosed;
}

function readControlValue(
  control: LegacyConfigControl,
  raw: unknown,
  errors: Record<string, string>,
): LegacyConfigValue {
  if (control.secret) {
    if (raw !== undefined && raw !== "") {
      errors[control.key] =
        "비밀키는 화면에 저장하지 않습니다. 서버 환경변수로 연결해 주세요.";
    }
    return "";
  }
  const fallback = control.defaultValue;
  if (control.kind === "checkbox") {
    if (typeof raw === "boolean") return raw;
    if (raw === "1" || raw === 1) return true;
    if (raw === "0" || raw === 0 || raw === undefined) return false;
    errors[control.key] = "사용 여부를 선택해 주세요.";
    return Boolean(fallback);
  }
  if (control.kind === "number") {
    const value =
      typeof raw === "number"
        ? raw
        : typeof raw === "string" && raw.trim()
          ? Number(raw)
          : Number(fallback);
    if (
      !Number.isSafeInteger(value) ||
      (control.min !== undefined && value < control.min) ||
      (control.max !== undefined && value > control.max)
    ) {
      errors[control.key] = "허용 범위의 정수를 입력해 주세요.";
      return fallback;
    }
    return value;
  }
  const value =
    raw === undefined || raw === null ? String(fallback) : String(raw);
  const maxLength = control.maxLength ?? 1000;
  if (
    value.length > maxLength ||
    /[\u0000\u000b\u000c\u007f]/u.test(value) ||
    legacyDomainPattern.test(value)
  ) {
    errors[control.key] =
      "글자 수, 제어문자 또는 기존 도메인 포함 여부를 확인해 주세요.";
    return fallback;
  }
  if (control.required && !value.trim()) {
    errors[control.key] = "필수 항목입니다.";
  }
  if (control.kind === "email" && value && !emailPattern.test(value)) {
    errors[control.key] = "올바른 메일 주소를 입력해 주세요.";
  }
  if (
    (control.kind === "select" || control.kind === "radio") &&
    control.options
  ) {
    const selected = control.options.find(
      (option) => String(option.value) === value,
    );
    if (!selected) {
      errors[control.key] = "목록에서 값을 선택해 주세요.";
      return fallback;
    }
    return selected.value;
  }
  return value;
}

function assertProviderActivation(
  values: LegacyConfigValues,
  status: LegacyProviderStatus,
  errors: Record<string, string>,
): void {
  if (!status.identity.configured && values.cf_cert_use !== "0") {
    errors.cf_cert_use = status.identity.message;
  }
  if (!status.shortUrl.configured && values.cf_bbs_rewrite !== "0") {
    errors.cf_bbs_rewrite = status.shortUrl.message;
  }
  if (!status.email.configured && values.cf_email_use === true) {
    errors.cf_email_use = status.email.message;
  }
  if (!status.sns.configured && values.cf_social_login_use === true) {
    errors.cf_social_login_use = status.sns.message;
  }
  if (!status.sms.configured && values.cf_sms_use !== "0") {
    errors.cf_sms_use = status.sms.message;
  }
}

function applyFailClosedValues(
  source: LegacyConfigValues,
  status: LegacyProviderStatus,
): LegacyConfigValues {
  const values = { ...source };
  for (const control of uniqueLegacyControls()) {
    if (control.secret) values[control.key] = "";
  }
  if (!status.identity.configured) {
    values.cf_cert_use = "0";
    values.cf_cert_find = false;
    values.cf_cert_simple = "none";
    values.cf_cert_hp = "none";
    values.cf_cert_ipin = "none";
    values.cf_cert_req = false;
  }
  if (!status.shortUrl.configured) values.cf_bbs_rewrite = "0";
  if (!status.email.configured) values.cf_email_use = false;
  if (!status.sns.configured) {
    values.cf_social_login_use = false;
    for (const provider of [
      "naver",
      "kakao",
      "facebook",
      "google",
      "twitter",
      "payco",
    ]) {
      values[`cf_social_${provider}`] = false;
    }
  }
  if (!status.sms.configured) values.cf_sms_use = "0";
  return values;
}

function parseStoredValue(
  control: LegacyConfigControl,
  value: string,
): LegacyConfigValue {
  if (control.kind === "checkbox") return value === "1";
  if (control.kind === "number") {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : control.defaultValue;
  }
  if (
    (control.kind === "select" || control.kind === "radio") &&
    control.options
  ) {
    return (
      control.options.find(
        (option) => String(option.value) === value,
      )?.value ?? control.defaultValue
    );
  }
  return value;
}

function serializeValue(value: LegacyConfigValue): string {
  if (typeof value === "boolean") return value ? "1" : "0";
  return String(value);
}

function uniqueLegacyControls(): LegacyConfigControl[] {
  const controls = new Map<string, LegacyConfigControl>();
  for (const control of legacyConfigControls) {
    const existing = controls.get(control.key);
    if (!existing) {
      controls.set(control.key, control);
      continue;
    }
    const options = [
      ...(existing.options ?? []),
      ...(control.options ?? []),
    ].filter(
      (option, index, all) =>
        all.findIndex(
          (candidate) => String(candidate.value) === String(option.value),
        ) === index,
    );
    controls.set(control.key, {
      ...existing,
      ...(options.length ? { options } : {}),
    });
  }
  return Array.from(controls.values());
}

function providerState(
  configured: boolean,
  missingMessage: string,
): LegacyProviderState {
  return {
    configured,
    message: configured ? "서버 공급자가 연결되어 있습니다." : missingMessage,
  };
}
