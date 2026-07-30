import { env } from "cloudflare:workers";
import { AdminApiError } from "@/lib/admin-api";
import {
  defaultLegacyShopValues,
  isLegacyShopNumericControl,
  legacyShopControlMap,
  legacyShopUniqueControls,
  radioOptionsForLegacyShopControl,
  type LegacyShopControl,
  type LegacyShopValue,
  type LegacyShopValues,
} from "@/lib/legacy-shop-config-contract";
import {
  ensureSiteContentSchema,
  getEffectiveSiteSettings,
  siteContentDatabase,
  validateSiteSettings,
  type SiteDisplaySettings,
} from "@/lib/site-content";

export interface LegacyShopProviderState {
  configured: boolean;
  message: string;
}

export interface LegacyShopProviderStatus {
  pg: LegacyShopProviderState;
  sms: LegacyShopProviderState;
}

export interface LegacyShopSettingsSnapshot {
  values: LegacyShopValues;
  revision: number;
  providerStatus: LegacyShopProviderStatus;
}

export interface LegacyShopReadOptions {
  database?: D1Database;
  strict?: boolean;
}

export interface LegacyShopWriteOptions {
  database?: D1Database;
  adminUsername: string;
}

interface LegacyShopSettingsRow {
  values_json: string;
  revision: number;
}

const legacyDomainPattern =
  /(?:^|[./@])(?:www\.)?kiel-gold\.com(?:$|[/:?#])/iu;
const schemaInitializations = new WeakMap<object, Promise<void>>();
const stateId = 1;

export function getLegacyShopProviderStatus(): LegacyShopProviderStatus {
  const bindings = env as unknown as Record<string, unknown>;
  const has = (...names: string[]) =>
    names.some((name) => {
      const value = bindings[name];
      return typeof value === "string" && value.trim().length > 0;
    });
  /*
   * The checkout intentionally has no PG authorization/capture adapter yet.
   * Credentials alone must never make a card-like method look usable.
   */
  const pgConfigured = false;
  const smsConfigured = has("SMS_PROVIDER_TOKEN", "ICODE_TOKEN_KEY");
  return {
    pg: {
      configured: pgConfigured,
      message:
        "PG 승인·매입 연동이 준비되지 않아 무통장입금 외 결제는 사용할 수 없습니다.",
    },
    sms: {
      configured: smsConfigured,
      message: smsConfigured
        ? "SMS 공급자 환경변수가 연결되어 있습니다."
        : "SMS 공급자 토큰이 연결되지 않아 SMS 발송은 사용할 수 없습니다.",
    },
  };
}

export async function ensureLegacyShopSettingsSchema(
  database = siteContentDatabase(),
): Promise<void> {
  const cacheKey = database as unknown as object;
  let initialization = schemaInitializations.get(cacheKey);
  if (!initialization) {
    initialization = database
      .batch([
        database.prepare(`CREATE TABLE IF NOT EXISTS legacy_shop_settings (
          id INTEGER PRIMARY KEY CHECK(id = 1),
          values_json TEXT NOT NULL DEFAULT '{}',
          revision INTEGER NOT NULL DEFAULT 1 CHECK(revision >= 1),
          updated_by TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        database.prepare(`CREATE TABLE IF NOT EXISTS legacy_shop_write_guards (
          operation_id TEXT PRIMARY KEY,
          guard_value INTEGER NOT NULL CHECK(guard_value = 1),
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        database.prepare(`CREATE TABLE IF NOT EXISTS admin_audit_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          admin_id INTEGER,
          action TEXT NOT NULL,
          entity_type TEXT NOT NULL,
          entity_id TEXT NOT NULL DEFAULT '',
          details TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
      ])
      .then(() => undefined)
      .catch((error) => {
        schemaInitializations.delete(cacheKey);
        throw error;
      });
    schemaInitializations.set(cacheKey, initialization);
  }
  await Promise.all([
    initialization,
    ensureSiteContentSchema(database),
  ]);
}

export async function getLegacyShopSettings(
  options: LegacyShopReadOptions = {},
): Promise<LegacyShopSettingsSnapshot> {
  const providerStatus = getLegacyShopProviderStatus();
  try {
    const database = options.database ?? siteContentDatabase();
    await ensureLegacyShopSettingsSchema(database);
    const [row, siteSettings] = await Promise.all([
      database
        .prepare(
          `SELECT values_json, revision
           FROM legacy_shop_settings
           WHERE id = ?`,
        )
        .bind(stateId)
        .first<LegacyShopSettingsRow>(),
      getEffectiveSiteSettings({ database, strict: true }),
    ]);
    const stored = row ? parseStoredValues(row.values_json) : {};
    const values = mergeLegacyShopSiteSettings(
      applySafeSmsPresetDefaults({
        ...defaultLegacyShopValues,
        ...stored,
      }),
      siteSettings,
    );
    return {
      values: applyLegacyShopFailClosed(values, providerStatus),
      revision: row ? Number(row.revision) : 0,
      providerStatus,
    };
  } catch (error) {
    if (options.strict) throw error;
    return {
      values: applyLegacyShopFailClosed(
        { ...defaultLegacyShopValues },
        providerStatus,
      ),
      revision: 0,
      providerStatus,
    };
  }
}

function applySafeSmsPresetDefaults(
  source: LegacyShopValues,
): LegacyShopValues {
  const values = { ...source };
  const keys = [1, 2, 3, 4, 5].map((index) => `de_sms_cont${index}`);
  if (keys.some((key) => String(values[key] ?? "").trim())) return values;
  for (const key of keys) values[key] = defaultLegacyShopValues[key] ?? "";
  return values;
}

export async function saveLegacyShopSettings(
  input: unknown,
  options: LegacyShopWriteOptions,
): Promise<LegacyShopSettingsSnapshot> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new AdminApiError(400, "쇼핑몰설정 저장 형식을 확인해 주세요.");
  }
  const body = input as Record<string, unknown>;
  const expectedRevision = requiredRevision(body.expectedRevision);
  const providerStatus = getLegacyShopProviderStatus();
  const values = validateLegacyShopSettings(body.values, providerStatus);
  const database = options.database ?? siteContentDatabase();
  await ensureLegacyShopSettingsSchema(database);
  const currentSiteSettings = await getEffectiveSiteSettings({
    database,
    strict: true,
  });
  const siteSettings = mapLegacyShopToSiteSettings(
    values,
    currentSiteSettings,
  );
  const updatedBy = options.adminUsername.slice(0, 128);
  const operationId = crypto.randomUUID();
  const serializedValues = JSON.stringify(
    Object.fromEntries(
      Object.entries(values).filter(([key]) => {
        const control = legacyShopControlMap.get(key);
        return control && !control.secret;
      }),
    ),
  );
  const stateStatement =
    expectedRevision === 0
      ? database
          .prepare(
            `INSERT INTO legacy_shop_settings (
               id, values_json, revision, updated_by
             ) VALUES (?, ?, 1, ?)
             ON CONFLICT(id) DO UPDATE SET
               values_json = NULL,
               revision = legacy_shop_settings.revision + 1,
               updated_by = excluded.updated_by,
               updated_at = CURRENT_TIMESTAMP`,
          )
          .bind(stateId, serializedValues, updatedBy)
      : database
          .prepare(
            `UPDATE legacy_shop_settings
             SET values_json = ?,
                 revision = revision + 1,
                 updated_by = ?,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?
               AND revision = ?`,
          )
          .bind(
            serializedValues,
            updatedBy,
            stateId,
            expectedRevision,
          );
  const statements: D1PreparedStatement[] = [
    stateStatement,
    database
      .prepare(
        `INSERT INTO legacy_shop_write_guards (
           operation_id, guard_value
         ) VALUES (?, CASE WHEN changes() = 1 THEN 1 ELSE 0 END)`,
      )
      .bind(operationId),
    ...Object.entries(siteSettings).map(([key, value]) =>
      database
        .prepare(
          `INSERT INTO site_settings(key, value, updated_at)
           VALUES (?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(key) DO UPDATE SET
             value = excluded.value,
             updated_at = CURRENT_TIMESTAMP`,
        )
        .bind(key, serializeSiteSetting(value)),
    ),
    database
      .prepare(
        `INSERT INTO admin_audit_logs (
           action, entity_type, entity_id, details
         ) VALUES ('shop.settings.update', 'settings', 'shop', ?)`,
      )
      .bind(
        JSON.stringify({
          revision: expectedRevision,
          fields: Object.keys(values).filter((key) => {
            const control = legacyShopControlMap.get(key);
            return control && !control.secret;
          }),
          updatedBy,
        }),
      ),
    database
      .prepare(
        "DELETE FROM legacy_shop_write_guards WHERE operation_id = ?",
      )
      .bind(operationId),
  ];

  try {
    await database.batch(statements);
  } catch (error) {
    if (
      error instanceof Error &&
      /legacy_shop_settings|legacy_shop_write_guards|not null|constraint/iu.test(
        error.message,
      )
    ) {
      throw new AdminApiError(
        409,
        "다른 관리자 작업에서 쇼핑몰설정이 변경되었습니다. 최신 설정을 다시 불러와 주세요.",
      );
    }
    throw error;
  }

  const snapshot = await getLegacyShopSettings({
    database,
    strict: true,
  });
  if (snapshot.revision !== expectedRevision + 1) {
    throw new AdminApiError(500, "저장된 쇼핑몰설정 버전을 확인할 수 없습니다.");
  }
  return snapshot;
}

export function validateLegacyShopSettings(
  input: unknown,
  providerStatus = getLegacyShopProviderStatus(),
): LegacyShopValues {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new AdminApiError(400, "쇼핑몰설정 값을 확인해 주세요.");
  }
  const body = input as Record<string, unknown>;
  const errors: Record<string, string> = {};
  for (const key of Object.keys(body)) {
    if (!legacyShopControlMap.has(key)) {
      errors[key] = "저장할 수 없는 쇼핑몰설정 항목입니다.";
    }
  }
  const values: LegacyShopValues = {};
  for (const control of legacyShopUniqueControls) {
    values[control.key] = readControlValue(
      control,
      body[control.key],
      errors,
    );
  }
  if (!providerStatus.pg.configured) {
    for (const control of legacyShopUniqueControls) {
      if (
        control.provider === "pg" &&
        isProviderActivation(control, values[control.key])
      ) {
        errors[control.key] = providerStatus.pg.message;
      }
    }
  }
  if (
    !providerStatus.sms.configured &&
    values.cf_sms_use !== ""
  ) {
    errors.cf_sms_use = providerStatus.sms.message;
  }
  if (
    Number(values.de_settle_min_point) >
    Number(values.de_settle_max_point)
  ) {
    errors.de_settle_min_point =
      "결제 최소포인트는 최대 결제포인트 이하여야 합니다.";
    errors.de_settle_max_point =
      "최대 결제포인트는 결제 최소포인트 이상이어야 합니다.";
  }
  const unit = Number(values.de_settle_point_unit);
  if (
    unit < 1 ||
    Number(values.de_settle_min_point) % unit !== 0 ||
    Number(values.de_settle_max_point) % unit !== 0
  ) {
    errors.de_settle_point_unit =
      "최소·최대 결제포인트가 포인트 단위로 나누어져야 합니다.";
  }
  if (Object.keys(errors).length > 0) {
    throw new AdminApiError(
      400,
      "쇼핑몰설정 값을 확인해 주세요.",
      errors,
    );
  }
  return applyLegacyShopFailClosed(values, providerStatus);
}

export function mergeLegacyShopSiteSettings(
  source: LegacyShopValues,
  siteSettings: SiteDisplaySettings,
): LegacyShopValues {
  return {
    ...source,
    de_admin_company_name: siteSettings.companyName,
    de_admin_company_saupja_no: siteSettings.businessNumber,
    de_admin_company_owner: siteSettings.representative,
    de_admin_company_tel: siteSettings.customerServicePhone,
    de_admin_tongsin_no: siteSettings.mailOrderNumber,
    de_admin_company_addr: siteSettings.address,
    de_admin_info_name: siteSettings.representative,
    de_admin_info_email: siteSettings.email,
    de_bank_use: siteSettings.paymentBankEnabled ? "1" : "0",
    de_bank_account: siteSettings.bankAccount,
    cf_use_point: siteSettings.pointUseEnabled,
    de_settle_min_point: siteSettings.pointUseMinimum,
    de_settle_max_point: siteSettings.pointUseMaximum,
    de_settle_point_unit: String(siteSettings.pointUseUnit),
    de_delivery_company: siteSettings.shippingCarrier,
    de_send_cost_case:
      siteSettings.defaultShippingFee === 0 ? "무료" : "차등",
    de_send_cost_list: siteSettings.defaultShippingFee,
  };
}

function mapLegacyShopToSiteSettings(
  values: LegacyShopValues,
  current: SiteDisplaySettings,
): SiteDisplaySettings {
  const bankAccount = String(values.de_bank_account ?? "").trim();
  const mapped: SiteDisplaySettings = {
    ...current,
    companyName: String(values.de_admin_company_name ?? "").trim(),
    representative: String(values.de_admin_company_owner ?? "").trim(),
    businessNumber: String(
      values.de_admin_company_saupja_no ?? "",
    ).trim(),
    mailOrderNumber: String(values.de_admin_tongsin_no ?? "").trim(),
    address: String(values.de_admin_company_addr ?? "").trim(),
    email: String(values.de_admin_info_email ?? "").trim(),
    customerServicePhone: String(
      values.de_admin_company_tel ?? "",
    ).trim(),
    bankAccount:
      !bankAccount || /^[0-9A-Za-z -]{4,100}$/u.test(bankAccount)
        ? bankAccount
        : current.bankAccount,
    paymentBankEnabled: values.de_bank_use === "1",
    paymentCardEnabled: false,
    paymentTransferEnabled: false,
    paymentVirtualEnabled: false,
    paymentMobileEnabled: false,
    pointUseEnabled: values.cf_use_point === true,
    pointUseMinimum: Number(values.de_settle_min_point),
    pointUseMaximum: Number(values.de_settle_max_point),
    pointUseUnit: Number(values.de_settle_point_unit),
    defaultShippingFee:
      values.de_send_cost_case === "무료"
        ? 0
        : Number(values.de_send_cost_list),
    shippingCarrier: String(values.de_delivery_company ?? "").trim(),
  };
  return validateSiteSettings(mapped);
}

function readControlValue(
  control: LegacyShopControl,
  raw: unknown,
  errors: Record<string, string>,
): LegacyShopValue {
  const fallback = defaultLegacyShopValues[control.key];
  if (control.secret) {
    if (raw !== undefined && raw !== "") {
      errors[control.key] =
        "비밀값은 화면이나 데이터베이스에 저장하지 않습니다. 서버 환경변수로 연결해 주세요.";
    }
    return "";
  }
  if (control.type === "file") {
    const value =
      raw === undefined || raw === null ? String(fallback) : String(raw);
    if (
      value === "" ||
      /^\/api\/media\/[a-f0-9]{32}\.(?:jpg|png|webp|gif)$/u.test(value)
    ) {
      return value;
    }
    errors[control.key] = "업로드된 로컬 이미지 파일을 선택해 주세요.";
    return String(fallback);
  }
  if (control.type === "checkbox") {
    if (typeof raw === "boolean") return raw;
    if (raw === "1" || raw === 1) return true;
    if (raw === "0" || raw === 0 || raw === undefined) return false;
    errors[control.key] = "사용 여부를 선택해 주세요.";
    return Boolean(fallback);
  }
  if (isLegacyShopNumericControl(control)) {
    const value =
      typeof raw === "number"
        ? raw
        : typeof raw === "string" && raw.trim()
          ? Number(raw)
          : Number(fallback);
    if (
      !Number.isSafeInteger(value) ||
      value < 0 ||
      value > 100_000_000
    ) {
      errors[control.key] = "0 이상 100,000,000 이하의 정수를 입력해 주세요.";
      return fallback;
    }
    return value;
  }
  const value =
    raw === undefined || raw === null ? String(fallback) : String(raw);
  if (
    value.length > controlMaximumLength(control) ||
    /[\u0000\u000b\u000c\u007f]/u.test(value) ||
    legacyDomainPattern.test(value)
  ) {
    errors[control.key] =
      "글자 수, 제어문자 또는 기존 도메인 포함 여부를 확인해 주세요.";
    return fallback;
  }
  if (control.type === "select") {
    const selected = control.options?.some(
      (option) => option.value === value,
    );
    if (!selected) {
      errors[control.key] = "목록에서 값을 선택해 주세요.";
      return fallback;
    }
  }
  if (control.type === "radio") {
    const selected = radioOptionsForLegacyShopControl(control.key).some(
      (option) => option.value === value,
    );
    if (!selected) {
      errors[control.key] = "목록에서 값을 선택해 주세요.";
      return fallback;
    }
  }
  return value;
}

function applyLegacyShopFailClosed(
  source: LegacyShopValues,
  providerStatus: LegacyShopProviderStatus,
): LegacyShopValues {
  const values = { ...source };
  for (const control of legacyShopUniqueControls) {
    if (control.secret) {
      values[control.key] = "";
    }
    if (!providerStatus.pg.configured && control.provider === "pg") {
      if (control.type === "checkbox") values[control.key] = false;
      else if (control.type === "radio") values[control.key] = "0";
      else if (control.type === "select") {
        values[control.key] =
          control.options?.some((option) => option.value === "0")
            ? "0"
            : "";
      } else {
        values[control.key] = "";
      }
    }
    if (
      !providerStatus.sms.configured &&
      control.provider === "sms" &&
      control.key !== "de_sms_hp"
    ) {
      values[control.key] = "";
    }
  }
  values.de_iche_use = "0";
  values.de_vbank_use = "0";
  values.de_hp_use = "0";
  values.de_card_use = "0";
  values.de_card_noint_use = "0";
  values.de_easy_pay_use = "0";
  if (!providerStatus.sms.configured) values.cf_sms_use = "";
  return values;
}

function isProviderActivation(
  control: LegacyShopControl,
  value: LegacyShopValue,
): boolean {
  if (control.secret || control.type === "file") return value !== "";
  if (control.type === "checkbox") return value === true;
  if (control.type === "radio") return value !== "0" && value !== "";
  if (control.type === "select") return value !== "0" && value !== "";
  return String(value).trim().length > 0;
}

function parseStoredValues(payload: string): LegacyShopValues {
  try {
    const parsed = JSON.parse(payload) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const values: LegacyShopValues = {};
    for (const [key, value] of Object.entries(
      parsed as Record<string, unknown>,
    )) {
      const control = legacyShopControlMap.get(key);
      if (
        !control ||
        control.secret ||
        !["string", "number", "boolean"].includes(typeof value)
      ) {
        continue;
      }
      values[key] = value as LegacyShopValue;
    }
    return values;
  } catch {
    return {};
  }
}

function controlMaximumLength(control: LegacyShopControl): number {
  const fromSource = Number(control.maxLength);
  if (Number.isSafeInteger(fromSource) && fromSource > 0) {
    return Math.min(fromSource, 30_000);
  }
  return control.type === "textarea" ? 30_000 : 1_000;
}

function requiredRevision(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > 2_147_483_647
  ) {
    throw new AdminApiError(400, "쇼핑몰설정 변경 기준값을 확인해 주세요.");
  }
  return value;
}

function serializeSiteSetting(value: SiteDisplaySettings[keyof SiteDisplaySettings]): string {
  if (typeof value === "boolean") return value ? "1" : "0";
  return String(value);
}
