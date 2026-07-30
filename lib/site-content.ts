import { env } from "cloudflare:workers";
import { AdminApiError } from "@/lib/admin-api";
import { companyInfo } from "@/lib/catalog";
import {
  defaultShopOperationSettings,
  type ShopOperationSettings,
} from "@/lib/shop-settings";
import legacyPoliciesSource from "@/data/legacy-policies.json";

export type ContentEntryType = "page" | "faq";
export type ContentEntryStatus = "draft" | "published";

export interface SiteDisplaySettings extends ShopOperationSettings {
  companyName: string;
  representative: string;
  businessNumber: string;
  mailOrderNumber: string;
  address: string;
  email: string;
  bankName: string;
  bankAccount: string;
  bankHolder: string;
  shippingCarrier: string;
  customerServicePhone: string;
}

export interface ContentEntry {
  id: string;
  entryType: ContentEntryType;
  slug: string;
  title: string;
  body: string;
  category: string;
  status: ContentEntryStatus;
  sortOrder: number;
  showInMenu: boolean;
  seoTitle: string;
  seoDescription: string;
  createdAt: string;
  updatedAt: string;
}

interface ContentEntryRow {
  id: string;
  entry_type: string;
  slug: string;
  title: string;
  body: string;
  category: string;
  status: string;
  sort_order: number;
  show_in_menu: number;
  seo_title: string;
  seo_description: string;
  created_at: string;
  updated_at: string;
}

export interface ContentReadOptions {
  database?: D1Database;
  strict?: boolean;
}

export interface ContentWriteOptions {
  database?: D1Database;
  adminUsername: string;
}

const SETTINGS_SEED_MARKER = "__content_defaults_seeded_v3";
const schemaInitializations = new WeakMap<object, Promise<void>>();
const contentIdPattern = /^(?:page|faq)-[A-Za-z0-9][A-Za-z0-9._-]{0,89}$/u;
const pageSlugPattern = /^[a-z0-9][a-z0-9-]{0,79}$/u;
const categoryPattern = /^[a-z0-9][a-z0-9-]{0,49}$/u;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

export const defaultSiteSettings: SiteDisplaySettings = {
  companyName: companyInfo.companyName,
  representative: companyInfo.representative,
  businessNumber: companyInfo.businessNumber,
  mailOrderNumber: companyInfo.mailOrderNumber,
  address: companyInfo.address,
  email: companyInfo.email,
  bankName: "",
  bankAccount: "",
  bankHolder: "",
  shippingCarrier: "CJ대한통운",
  customerServicePhone: "",
  ...defaultShopOperationSettings,
};

export const defaultContentPages: ReadonlyArray<ContentEntry> = [
  {
    id: "page-company",
    entryType: "page",
    slug: "company",
    title: "회사소개",
    body: "회사소개에 대한 내용을 입력하십시오.",
    category: "company",
    status: "published",
    sortOrder: 10,
    showInMenu: true,
    seoTitle: "회사소개",
    seoDescription: "",
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "page-privacy",
    entryType: "page",
    slug: "privacy",
    title: "개인정보 처리방침",
    body: legacyPoliciesSource.privacy,
    category: "policy",
    status: "published",
    sortOrder: 20,
    showInMenu: true,
    seoTitle: "개인정보 처리방침",
    seoDescription: "",
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "page-provision",
    entryType: "page",
    slug: "provision",
    title: "서비스 이용약관",
    body: legacyPoliciesSource.provision,
    category: "policy",
    status: "published",
    sortOrder: 30,
    showInMenu: true,
    seoTitle: "서비스 이용약관",
    seoDescription: "",
    createdAt: "",
    updatedAt: "",
  },
];

export function siteContentDatabase(): D1Database {
  const database = (env as unknown as { DB?: D1Database }).DB;
  if (!database) {
    throw new AdminApiError(503, "사이트 데이터베이스가 준비되지 않았습니다.");
  }
  return database;
}

export async function ensureSiteContentSchema(
  database = siteContentDatabase(),
): Promise<void> {
  const cacheKey = database as unknown as object;
  let initialization = schemaInitializations.get(cacheKey);
  if (!initialization) {
    initialization = initializeSchema(database).catch((error) => {
      schemaInitializations.delete(cacheKey);
      throw error;
    });
    schemaInitializations.set(cacheKey, initialization);
  }
  await initialization;
}

async function initializeSchema(database: D1Database): Promise<void> {
  await database.batch([
    database.prepare(`CREATE TABLE IF NOT EXISTS site_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    database.prepare(`CREATE TABLE IF NOT EXISTS content_entries (
      id TEXT PRIMARY KEY,
      entry_type TEXT NOT NULL CHECK(entry_type IN ('page', 'faq')),
      slug TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'published')),
      sort_order INTEGER NOT NULL DEFAULT 0,
      show_in_menu INTEGER NOT NULL DEFAULT 0,
      seo_title TEXT NOT NULL DEFAULT '',
      seo_description TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    database.prepare(
      "CREATE INDEX IF NOT EXISTS content_entries_type_status_idx ON content_entries(entry_type, status)",
    ),
    database.prepare(
      "CREATE INDEX IF NOT EXISTS content_entries_sort_idx ON content_entries(entry_type, sort_order, updated_at)",
    ),
    database.prepare(
      "CREATE UNIQUE INDEX IF NOT EXISTS content_entries_page_slug_uq ON content_entries(slug) WHERE entry_type = 'page'",
    ),
  ]);

  const settingStatements = Object.entries(defaultSiteSettings).map(
    ([key, value]) =>
      database
        .prepare(
          "INSERT OR IGNORE INTO site_settings(key, value) VALUES (?, ?)",
        )
        .bind(key, serializeSiteSetting(value)),
  );
  await database.batch(settingStatements);

  const marker = await database
    .prepare("SELECT value FROM site_settings WHERE key = ? LIMIT 1")
    .bind(SETTINGS_SEED_MARKER)
    .first<{ value: string }>();
  if (marker) return;

  const seedStatements = defaultContentPages.map((entry) =>
    database
      .prepare(`INSERT INTO content_entries(
        id, entry_type, slug, title, body, category, status, sort_order,
        show_in_menu, seo_title, seo_description
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        entry_type = excluded.entry_type,
        slug = excluded.slug,
        title = excluded.title,
        body = excluded.body,
        category = excluded.category,
        status = excluded.status,
        sort_order = excluded.sort_order,
        show_in_menu = excluded.show_in_menu,
        seo_title = excluded.seo_title,
        seo_description = excluded.seo_description,
        updated_at = CURRENT_TIMESTAMP`)
      .bind(
        entry.id,
        entry.entryType,
        entry.slug,
        entry.title,
        entry.body,
        entry.category,
        entry.status,
        entry.sortOrder,
        entry.showInMenu ? 1 : 0,
        entry.seoTitle,
        entry.seoDescription,
      ),
  );
  seedStatements.unshift(
    database.prepare(
      `DELETE FROM content_entries
       WHERE id = 'page-noemail'
         AND slug = 'noemail'
         AND title = '이메일무단수집거부'`,
    ),
  );
  seedStatements.push(
    database
      .prepare(
        "INSERT OR REPLACE INTO site_settings(key, value, updated_at) VALUES (?, '1', CURRENT_TIMESTAMP)",
      )
      .bind(SETTINGS_SEED_MARKER),
  );
  await database.batch(seedStatements);
}

export async function getEffectiveSiteSettings(
  options: ContentReadOptions = {},
): Promise<SiteDisplaySettings> {
  try {
    const database = options.database ?? siteContentDatabase();
    await ensureSiteContentSchema(database);
    const result = await database
      .prepare(
        `SELECT key, value FROM site_settings
         WHERE key IN ('companyName', 'representative', 'businessNumber',
                       'mailOrderNumber', 'address', 'email', 'bankName',
                       'bankAccount', 'bankHolder', 'shippingCarrier',
                       'customerServicePhone', 'paymentBankEnabled',
                       'paymentCardEnabled', 'paymentTransferEnabled',
                       'paymentVirtualEnabled', 'paymentMobileEnabled',
                       'pointUseEnabled', 'pointUseMinimum',
                       'pointUseMaximum', 'pointUseUnit',
                       'defaultShippingFee')`,
      )
      .all<{ key: string; value: string }>();
    const values = { ...defaultSiteSettings };
    for (const row of result.results ?? []) {
      if (isSiteSettingKey(row.key)) {
        (values as Record<string, unknown>)[row.key] =
          parseStoredSiteSetting(row.key, row.value);
      }
    }
    return validateSiteSettings(values);
  } catch (error) {
    if (options.strict) throw error;
    return { ...defaultSiteSettings };
  }
}

export async function saveSiteSettings(
  input: unknown,
  options: ContentWriteOptions,
): Promise<SiteDisplaySettings> {
  void options.adminUsername;
  const settings = validateSiteSettings(input);
  const database = options.database ?? siteContentDatabase();
  await ensureSiteContentSchema(database);
  await database.batch(
    Object.entries(settings).map(([key, value]) =>
      database
        .prepare(`INSERT INTO site_settings(key, value, updated_at)
          VALUES (?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(key) DO UPDATE SET
            value = excluded.value,
            updated_at = CURRENT_TIMESTAMP`)
        .bind(key, serializeSiteSetting(value)),
    ),
  );
  return settings;
}

export function validateSiteSettings(input: unknown): SiteDisplaySettings {
  const value = asObject(input);
  const errors: Record<string, string> = {};
  const settings: SiteDisplaySettings = {
    companyName: readText(value, "companyName", 120, errors, true),
    representative: readText(value, "representative", 80, errors, true),
    businessNumber: readText(value, "businessNumber", 40, errors),
    mailOrderNumber: readText(value, "mailOrderNumber", 80, errors),
    address: readText(value, "address", 300, errors, true),
    email: readText(value, "email", 200, errors, true),
    bankName: readText(value, "bankName", 80, errors),
    bankAccount: readText(value, "bankAccount", 100, errors),
    bankHolder: readText(value, "bankHolder", 80, errors),
    shippingCarrier: readText(value, "shippingCarrier", 80, errors),
    customerServicePhone: readText(
      value,
      "customerServicePhone",
      40,
      errors,
    ),
    paymentBankEnabled: readBoolean(
      value.paymentBankEnabled,
      defaultSiteSettings.paymentBankEnabled,
      "paymentBankEnabled",
      errors,
    ),
    paymentCardEnabled: readBoolean(
      value.paymentCardEnabled,
      defaultSiteSettings.paymentCardEnabled,
      "paymentCardEnabled",
      errors,
    ),
    paymentTransferEnabled: readBoolean(
      value.paymentTransferEnabled,
      defaultSiteSettings.paymentTransferEnabled,
      "paymentTransferEnabled",
      errors,
    ),
    paymentVirtualEnabled: readBoolean(
      value.paymentVirtualEnabled,
      defaultSiteSettings.paymentVirtualEnabled,
      "paymentVirtualEnabled",
      errors,
    ),
    paymentMobileEnabled: readBoolean(
      value.paymentMobileEnabled,
      defaultSiteSettings.paymentMobileEnabled,
      "paymentMobileEnabled",
      errors,
    ),
    pointUseEnabled: readBoolean(
      value.pointUseEnabled,
      defaultSiteSettings.pointUseEnabled,
      "pointUseEnabled",
      errors,
    ),
    pointUseMinimum: readInteger(
      value,
      "pointUseMinimum",
      0,
      100_000_000,
      defaultSiteSettings.pointUseMinimum,
      errors,
    ),
    pointUseMaximum: readInteger(
      value,
      "pointUseMaximum",
      1,
      100_000_000,
      defaultSiteSettings.pointUseMaximum,
      errors,
    ),
    pointUseUnit: readInteger(
      value,
      "pointUseUnit",
      1,
      100_000_000,
      defaultSiteSettings.pointUseUnit,
      errors,
    ),
    defaultShippingFee: readInteger(
      value,
      "defaultShippingFee",
      0,
      100_000_000,
      defaultSiteSettings.defaultShippingFee,
      errors,
    ),
  };
  if (settings.email && !emailPattern.test(settings.email)) {
    errors.email = "올바른 이메일 주소를 입력해 주세요.";
  }
  if (
    settings.bankAccount &&
    !/^[0-9A-Za-z -]{4,100}$/u.test(settings.bankAccount)
  ) {
    errors.bankAccount = "계좌번호는 숫자·영문·공백·하이픈만 입력해 주세요.";
  }
  if (
    settings.pointUseMinimum > settings.pointUseMaximum
  ) {
    errors.pointUseMinimum = "최소 사용 포인트는 최대 사용 포인트 이하여야 합니다.";
    errors.pointUseMaximum = "최대 사용 포인트는 최소 사용 포인트 이상이어야 합니다.";
  }
  if (
    settings.pointUseMinimum % settings.pointUseUnit !== 0 ||
    settings.pointUseMaximum % settings.pointUseUnit !== 0
  ) {
    errors.pointUseUnit =
      "최소·최대 사용 포인트가 사용 단위로 정확히 나누어져야 합니다.";
  }
  if (Object.keys(errors).length > 0) {
    throw new AdminApiError(400, "사업자 표시 정보를 확인해 주세요.", errors);
  }
  return settings;
}

export async function listContentEntries(
  entryType: ContentEntryType,
  options: ContentReadOptions = {},
): Promise<ContentEntry[]> {
  try {
    const database = options.database ?? siteContentDatabase();
    await ensureSiteContentSchema(database);
    const result = await database
      .prepare(
        `SELECT id, entry_type, slug, title, body, category, status,
                sort_order, show_in_menu, seo_title, seo_description,
                created_at, updated_at
         FROM content_entries
         WHERE entry_type = ?
         ORDER BY sort_order ASC, updated_at DESC, id ASC`,
      )
      .bind(entryType)
      .all<ContentEntryRow>();
    return (result.results ?? []).flatMap((row) => {
      const parsed = parseContentRow(row);
      return parsed ? [parsed] : [];
    });
  } catch (error) {
    if (options.strict) throw error;
    return entryType === "page"
      ? defaultContentPages.map((entry) => ({ ...entry }))
      : [];
  }
}

export async function getPublishedContentPage(
  slug: string,
  options: ContentReadOptions = {},
): Promise<ContentEntry | null> {
  const fallback =
    defaultContentPages.find((entry) => entry.slug === slug) ?? null;
  try {
    const database = options.database ?? siteContentDatabase();
    await ensureSiteContentSchema(database);
    const row = await database
      .prepare(
        `SELECT id, entry_type, slug, title, body, category, status,
                sort_order, show_in_menu, seo_title, seo_description,
                created_at, updated_at
         FROM content_entries
         WHERE entry_type = 'page' AND slug = ?
         LIMIT 1`,
      )
      .bind(slug)
      .first<ContentEntryRow>();
    if (!row) return null;
    const entry = parseContentRow(row);
    return entry?.status === "published" ? entry : null;
  } catch (error) {
    if (options.strict) throw error;
    return fallback ? { ...fallback } : null;
  }
}

export async function listPublishedFaqs(
  options: ContentReadOptions = {},
): Promise<ContentEntry[]> {
  try {
    const entries = await listContentEntries("faq", {
      ...options,
      strict: true,
    });
    return entries.filter((entry) => entry.status === "published");
  } catch (error) {
    if (options.strict) throw error;
    return [];
  }
}

export async function listPublishedContentPages(
  options: ContentReadOptions = {},
): Promise<ContentEntry[]> {
  try {
    const entries = await listContentEntries("page", {
      ...options,
      strict: true,
    });
    return entries.filter(
      (entry) => entry.status === "published" && entry.showInMenu,
    );
  } catch (error) {
    if (options.strict) throw error;
    return defaultContentPages
      .filter((entry) => entry.status === "published" && entry.showInMenu)
      .map((entry) => ({ ...entry }));
  }
}

export async function createContentEntry(
  input: unknown,
  options: ContentWriteOptions,
): Promise<ContentEntry> {
  void options.adminUsername;
  const value = validateContentInput(input);
  const database = options.database ?? siteContentDatabase();
  await ensureSiteContentSchema(database);
  const id = `${value.entryType}-${crypto.randomUUID()}`;
  try {
    await database
      .prepare(`INSERT INTO content_entries(
        id, entry_type, slug, title, body, category, status, sort_order,
        show_in_menu, seo_title, seo_description, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`)
      .bind(
        id,
        value.entryType,
        value.slug,
        value.title,
        value.body,
        value.category,
        value.status,
        value.sortOrder,
        value.showInMenu ? 1 : 0,
        value.seoTitle,
        value.seoDescription,
      )
      .run();
  } catch (error) {
    if (looksLikeUniqueError(error)) {
      throw new AdminApiError(409, "이미 사용 중인 고유주소입니다.", {
        slug: "다른 고유주소를 입력해 주세요.",
      });
    }
    throw error;
  }
  const created = await getContentEntry(id, database);
  if (!created) throw new AdminApiError(500, "저장된 콘텐츠를 찾지 못했습니다.");
  return created;
}

export async function updateContentEntry(
  id: string,
  input: unknown,
  options: ContentWriteOptions,
): Promise<ContentEntry> {
  void options.adminUsername;
  assertContentId(id);
  const database = options.database ?? siteContentDatabase();
  await ensureSiteContentSchema(database);
  const current = await getContentEntry(id, database);
  if (!current) throw new AdminApiError(404, "콘텐츠를 찾을 수 없습니다.");
  const value = validateContentInput(input, current, current.entryType);
  try {
    await database
      .prepare(`UPDATE content_entries SET
        slug = ?, title = ?, body = ?, category = ?, status = ?,
        sort_order = ?, show_in_menu = ?, seo_title = ?,
        seo_description = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`)
      .bind(
        value.slug,
        value.title,
        value.body,
        value.category,
        value.status,
        value.sortOrder,
        value.showInMenu ? 1 : 0,
        value.seoTitle,
        value.seoDescription,
        id,
      )
      .run();
  } catch (error) {
    if (looksLikeUniqueError(error)) {
      throw new AdminApiError(409, "이미 사용 중인 고유주소입니다.", {
        slug: "다른 고유주소를 입력해 주세요.",
      });
    }
    throw error;
  }
  const updated = await getContentEntry(id, database);
  if (!updated) throw new AdminApiError(500, "수정된 콘텐츠를 찾지 못했습니다.");
  return updated;
}

export async function deleteContentEntry(
  id: string,
  options: ContentWriteOptions,
): Promise<void> {
  void options.adminUsername;
  assertContentId(id);
  const database = options.database ?? siteContentDatabase();
  await ensureSiteContentSchema(database);
  const result = await database
    .prepare("DELETE FROM content_entries WHERE id = ?")
    .bind(id)
    .run();
  if (!result.meta.changes) {
    throw new AdminApiError(404, "콘텐츠를 찾을 수 없습니다.");
  }
}

function validateContentInput(
  input: unknown,
  base?: ContentEntry,
  fixedType?: ContentEntryType,
): Omit<ContentEntry, "id" | "createdAt" | "updatedAt"> {
  const value = asObject(input);
  const errors: Record<string, string> = {};
  const requestedType = String(value.entryType ?? base?.entryType ?? "");
  const entryType =
    requestedType === "page" || requestedType === "faq"
      ? requestedType
      : undefined;
  if (!entryType) errors.entryType = "콘텐츠 종류를 선택해 주세요.";
  if (fixedType && entryType && entryType !== fixedType) {
    errors.entryType = "콘텐츠 종류는 변경할 수 없습니다.";
  }

  const title = readText(value, "title", 200, errors, true, base?.title);
  const body = readText(value, "body", 30_000, errors, true, base?.body, false);
  const slug = readText(value, "slug", 80, errors, false, base?.slug);
  const category = readText(
    value,
    "category",
    50,
    errors,
    false,
    base?.category,
  );
  const rawStatus = String(value.status ?? base?.status ?? "draft");
  const status =
    rawStatus === "draft" || rawStatus === "published"
      ? rawStatus
      : undefined;
  if (!status) errors.status = "게시 상태를 확인해 주세요.";

  if (entryType === "page" && !pageSlugPattern.test(slug)) {
    errors.slug = "영문 소문자, 숫자와 하이픈으로 고유주소를 입력해 주세요.";
  }
  if (
    entryType === "faq" &&
    (!category || !categoryPattern.test(category))
  ) {
    errors.category = "FAQ 분류를 선택해 주세요.";
  }

  const rawSortOrder = value.sortOrder ?? base?.sortOrder ?? 0;
  const sortOrder = Number(rawSortOrder);
  if (
    !Number.isSafeInteger(sortOrder) ||
    sortOrder < 0 ||
    sortOrder > 100_000
  ) {
    errors.sortOrder = "정렬순서는 0 이상 100000 이하의 정수로 입력해 주세요.";
  }
  const showInMenu = readBoolean(
    value.showInMenu,
    base?.showInMenu ?? false,
    "showInMenu",
    errors,
  );
  const seoTitle = readText(
    value,
    "seoTitle",
    100,
    errors,
    false,
    base?.seoTitle,
  );
  const seoDescription = readText(
    value,
    "seoDescription",
    300,
    errors,
    false,
    base?.seoDescription,
  );

  if (Object.keys(errors).length > 0 || !entryType || !status) {
    throw new AdminApiError(400, "콘텐츠 정보를 확인해 주세요.", errors);
  }
  return {
    entryType,
    slug: entryType === "page" ? slug : "",
    title,
    body,
    category: entryType === "faq" ? category : category || "page",
    status,
    sortOrder,
    showInMenu: entryType === "page" && showInMenu,
    seoTitle: entryType === "page" ? seoTitle : "",
    seoDescription: entryType === "page" ? seoDescription : "",
  };
}

async function getContentEntry(
  id: string,
  database: D1Database,
): Promise<ContentEntry | null> {
  const row = await database
    .prepare(
      `SELECT id, entry_type, slug, title, body, category, status,
              sort_order, show_in_menu, seo_title, seo_description,
              created_at, updated_at
       FROM content_entries WHERE id = ? LIMIT 1`,
    )
    .bind(id)
    .first<ContentEntryRow>();
  return row ? parseContentRow(row) : null;
}

function parseContentRow(row: ContentEntryRow): ContentEntry | null {
  if (
    (row.entry_type !== "page" && row.entry_type !== "faq") ||
    (row.status !== "draft" && row.status !== "published")
  ) {
    return null;
  }
  return {
    id: row.id,
    entryType: row.entry_type,
    slug: row.slug,
    title: row.title,
    body: row.body,
    category: row.category,
    status: row.status,
    sortOrder: Number(row.sort_order),
    showInMenu: Boolean(row.show_in_menu),
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AdminApiError(400, "요청 형식이 올바르지 않습니다.");
  }
  return value as Record<string, unknown>;
}

function readText(
  value: Record<string, unknown>,
  field: string,
  maximumLength: number,
  errors: Record<string, string>,
  required = false,
  fallback = "",
  trim = true,
): string {
  const raw = value[field] ?? fallback;
  if (typeof raw !== "string") {
    errors[field] = "문자열로 입력해 주세요.";
    return "";
  }
  const text = (trim ? raw.trim() : raw).replace(/\0/gu, "");
  if (required && !text.trim()) errors[field] = "필수 입력 항목입니다.";
  if (text.length > maximumLength) {
    errors[field] = `${maximumLength}자 이하로 입력해 주세요.`;
  }
  return text;
}

function readBoolean(
  value: unknown,
  fallback: boolean,
  field: string,
  errors: Record<string, string>,
): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") {
    errors[field] = "선택 값을 확인해 주세요.";
    return fallback;
  }
  return value;
}

function readInteger(
  value: Record<string, unknown>,
  field: string,
  minimum: number,
  maximum: number,
  fallback: number,
  errors: Record<string, string>,
): number {
  const raw = value[field] ?? fallback;
  if (
    typeof raw !== "number" ||
    !Number.isSafeInteger(raw) ||
    raw < minimum ||
    raw > maximum
  ) {
    errors[field] =
      `${minimum.toLocaleString("ko-KR")}부터 ${maximum.toLocaleString("ko-KR")}까지의 정수로 입력해 주세요.`;
    return fallback;
  }
  return raw;
}

const booleanSiteSettingKeys = new Set<keyof SiteDisplaySettings>([
  "paymentBankEnabled",
  "paymentCardEnabled",
  "paymentTransferEnabled",
  "paymentVirtualEnabled",
  "paymentMobileEnabled",
  "pointUseEnabled",
]);

const integerSiteSettingKeys = new Set<keyof SiteDisplaySettings>([
  "pointUseMinimum",
  "pointUseMaximum",
  "pointUseUnit",
  "defaultShippingFee",
]);

function parseStoredSiteSetting(
  key: keyof SiteDisplaySettings,
  value: string,
): SiteDisplaySettings[keyof SiteDisplaySettings] {
  if (booleanSiteSettingKeys.has(key)) {
    if (value === "1" || value === "true") return true;
    if (value === "0" || value === "false") return false;
    return defaultSiteSettings[key];
  }
  if (integerSiteSettingKeys.has(key)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : defaultSiteSettings[key];
  }
  return value;
}

function serializeSiteSetting(value: SiteDisplaySettings[keyof SiteDisplaySettings]): string {
  if (typeof value === "boolean") return value ? "1" : "0";
  return String(value);
}

function isSiteSettingKey(key: string): key is keyof SiteDisplaySettings {
  return Object.prototype.hasOwnProperty.call(defaultSiteSettings, key);
}

function assertContentId(id: string): void {
  if (!contentIdPattern.test(id)) {
    throw new AdminApiError(400, "콘텐츠 식별값이 올바르지 않습니다.");
  }
}

function looksLikeUniqueError(error: unknown): boolean {
  return (
    error instanceof Error &&
    /unique|constraint|content_entries_page_slug_uq/iu.test(error.message)
  );
}
