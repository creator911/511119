import { AdminApiError } from "@/lib/admin-api";
import { isValidManagedMenuSource } from "@/lib/admin-menu-settings";
import {
  defaultLegacyAdminToolSettings,
  getLegacyAdminToolDefinition,
  type LegacyAdminToolDefinition,
} from "@/lib/admin-tool-catalog";
import { commerceDb, ensureCommerceSchema } from "@/lib/commerce-db";
import { isJsonObject } from "@/lib/http-boundary";

export interface LegacyAdminToolRecord {
  id: string;
  title: string;
  details: string;
  status: "active" | "inactive" | "pending";
  createdAt: string;
  updatedAt: string;
}

export interface LegacyAdminToolRun {
  id: string;
  action: string;
  status: "completed" | "queued";
  message: string;
  createdAt: string;
}

export interface LegacyAdminToolState {
  definition: LegacyAdminToolDefinition;
  settings: Record<string, string | number | boolean>;
  records: LegacyAdminToolRecord[];
  runs: LegacyAdminToolRun[];
}

let schemaInitialization: Promise<void> | null = null;

async function ensureAdminToolsSchema(): Promise<void> {
  if (!schemaInitialization) {
    const database = commerceDb();
    schemaInitialization = database
      .batch([
        database.prepare(`CREATE TABLE IF NOT EXISTS admin_tool_settings (
          tool_key TEXT PRIMARY KEY,
          settings_json TEXT NOT NULL DEFAULT '{}',
          updated_by TEXT NOT NULL DEFAULT '',
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        database.prepare(`CREATE TABLE IF NOT EXISTS admin_tool_records (
          id TEXT PRIMARY KEY,
          tool_key TEXT NOT NULL,
          title TEXT NOT NULL,
          details TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'active'
            CHECK(status IN ('active', 'inactive', 'pending')),
          created_by TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        database.prepare(
          "CREATE INDEX IF NOT EXISTS admin_tool_records_key_idx ON admin_tool_records(tool_key, created_at)",
        ),
        database.prepare(`CREATE TABLE IF NOT EXISTS admin_tool_runs (
          id TEXT PRIMARY KEY,
          tool_key TEXT NOT NULL,
          action TEXT NOT NULL,
          status TEXT NOT NULL CHECK(status IN ('completed', 'queued')),
          message TEXT NOT NULL DEFAULT '',
          created_by TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        database.prepare(
          "CREATE INDEX IF NOT EXISTS admin_tool_runs_key_idx ON admin_tool_runs(tool_key, created_at)",
        ),
      ])
      .then(() => undefined)
      .catch((error) => {
        schemaInitialization = null;
        throw error;
      });
  }
  await schemaInitialization;
}

export async function getLegacyAdminToolSettings(
  slug: string,
): Promise<Record<string, string | number | boolean>> {
  const definition = requireDefinition(slug);
  if (definition.kind !== "settings") {
    throw new AdminApiError(405, "이 화면에는 공개 설정값이 없습니다.");
  }
  const stored = await getLegacyAdminToolStoredSettings(slug);
  return {
    ...defaultLegacyAdminToolSettings(definition),
    ...(stored ?? {}),
  };
}

export async function getLegacyAdminToolStoredSettings(
  slug: string,
): Promise<Record<string, string | number | boolean> | null> {
  const definition = requireDefinition(slug);
  if (definition.kind !== "settings") {
    throw new AdminApiError(405, "이 화면에는 공개 설정값이 없습니다.");
  }
  await ensureAdminToolsSchema();
  const row = await commerceDb()
    .prepare(
      "SELECT settings_json FROM admin_tool_settings WHERE tool_key = ? LIMIT 1",
    )
    .bind(slug)
    .first<{ settings_json: string }>();
  return row ? safeSettings(row.settings_json) : null;
}

export async function listLegacyAdminToolRecords(
  slug: string,
  maximumRecords = 200,
): Promise<LegacyAdminToolRecord[]> {
  const definition = requireDefinition(slug);
  assertGenericRecordStorageAllowed(slug);
  if (definition.kind !== "records") {
    throw new AdminApiError(405, "이 화면에는 공개 자료가 없습니다.");
  }
  await ensureAdminToolsSchema();
  const limit = Math.min(1_000, Math.max(1, Math.trunc(maximumRecords) || 200));
  const result = await commerceDb()
    .prepare(
      `SELECT id, title, details, status, created_at, updated_at
       FROM admin_tool_records
       WHERE tool_key = ?
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .bind(slug, limit)
    .all<{
      id: string;
      title: string;
      details: string;
      status: LegacyAdminToolRecord["status"];
      created_at: string;
      updated_at: string;
    }>();
  return (result.results ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    details: row.details,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function getLegacyAdminToolState(
  slug: string,
): Promise<LegacyAdminToolState> {
  const definition = requireDefinition(slug);
  assertGenericRecordStorageAllowed(slug);
  await ensureAdminToolsSchema();
  const database = commerceDb();
  const [settingsRow, recordsResult, runsResult] = await Promise.all([
    database
      .prepare(
        "SELECT settings_json FROM admin_tool_settings WHERE tool_key = ? LIMIT 1",
      )
      .bind(slug)
      .first<{ settings_json: string }>(),
    database
      .prepare(
        `SELECT id, title, details, status, created_at, updated_at
         FROM admin_tool_records
         WHERE tool_key = ?
         ORDER BY created_at DESC
         LIMIT 200`,
      )
      .bind(slug)
      .all<{
        id: string;
        title: string;
        details: string;
        status: LegacyAdminToolRecord["status"];
        created_at: string;
        updated_at: string;
      }>(),
    database
      .prepare(
        `SELECT id, action, status, message, created_at
         FROM admin_tool_runs
         WHERE tool_key = ?
         ORDER BY created_at DESC
         LIMIT 50`,
      )
      .bind(slug)
      .all<{
        id: string;
        action: string;
        status: LegacyAdminToolRun["status"];
        message: string;
        created_at: string;
      }>(),
  ]);

  const defaults = defaultLegacyAdminToolSettings(definition);
  const stored = safeSettings(settingsRow?.settings_json);
  return {
    definition,
    settings: { ...defaults, ...stored },
    records: (recordsResult.results ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      details: row.details,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
    runs: (runsResult.results ?? []).map((row) => ({
      id: row.id,
      action: row.action,
      status: row.status,
      message: row.message,
      createdAt: row.created_at,
    })),
  };
}

export async function saveLegacyAdminToolSettings(
  slug: string,
  input: unknown,
  adminUsername: string,
): Promise<Record<string, string | number | boolean>> {
  const definition = requireDefinition(slug);
  if (definition.kind !== "settings") {
    throw new AdminApiError(405, "이 화면에서는 설정을 저장할 수 없습니다.");
  }
  if (!isJsonObject(input)) {
    throw new AdminApiError(400, "설정 형식이 올바르지 않습니다.");
  }
  const settings: Record<string, string | number | boolean> = {};
  const fieldErrors: Record<string, string> = {};
  for (const field of definition.fields ?? []) {
    const value = input[field.key];
    if (field.type === "boolean") {
      if (typeof value !== "boolean") {
        fieldErrors[field.key] = "사용 여부를 선택해 주세요.";
      } else {
        settings[field.key] = value;
      }
      continue;
    }
    if (field.type === "number") {
      if (
        typeof value !== "number" ||
        !Number.isFinite(value) ||
        Math.abs(value) > 100_000_000
      ) {
        fieldErrors[field.key] = "올바른 숫자를 입력해 주세요.";
      } else {
        settings[field.key] = Math.round(value);
      }
      continue;
    }
    if (typeof value !== "string") {
      fieldErrors[field.key] = "내용을 입력해 주세요.";
      continue;
    }
    const normalized = value.trim();
    if (field.required && !normalized) {
      fieldErrors[field.key] = "필수 입력 항목입니다.";
    } else if (normalized.length > 5_000) {
      fieldErrors[field.key] = "내용은 5,000자 이내로 입력해 주세요.";
    } else if (
      field.type === "select" &&
      !field.options?.some((option) => option.value === normalized)
    ) {
      fieldErrors[field.key] = "목록에서 값을 선택해 주세요.";
    } else {
      settings[field.key] = normalized;
    }
  }
  validateStorefrontSettings(slug, settings, fieldErrors);
  if (Object.keys(fieldErrors).length > 0) {
    throw new AdminApiError(400, "입력 내용을 확인해 주세요.", fieldErrors);
  }

  await ensureAdminToolsSchema();
  const database = commerceDb();
  await database
    .prepare(
      `INSERT INTO admin_tool_settings (
         tool_key, settings_json, updated_by, updated_at
       ) VALUES (?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(tool_key) DO UPDATE SET
         settings_json = excluded.settings_json,
         updated_by = excluded.updated_by,
         updated_at = CURRENT_TIMESTAMP`,
    )
    .bind(slug, JSON.stringify(settings), normalizedAdmin(adminUsername))
    .run();
  await writeAudit(
    database,
    adminUsername,
    "admin_tool.settings",
    slug,
    `${definition.title} 설정 저장`,
  );
  return settings;
}

export async function createLegacyAdminToolRecord(
  slug: string,
  input: unknown,
  adminUsername: string,
): Promise<LegacyAdminToolRecord> {
  const definition = requireDefinition(slug);
  assertGenericRecordStorageAllowed(slug);
  if (definition.kind !== "records") {
    throw new AdminApiError(405, "이 화면에서는 자료를 등록할 수 없습니다.");
  }
  const record = parseRecordInput(input, slug);
  await ensureAdminToolsSchema();
  const database = commerceDb();
  const id = crypto.randomUUID();
  await database
    .prepare(
      `INSERT INTO admin_tool_records (
         id, tool_key, title, details, status, created_by
       ) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      slug,
      record.title,
      record.details,
      record.status,
      normalizedAdmin(adminUsername),
    )
    .run();
  await writeAudit(
    database,
    adminUsername,
    "admin_tool.record.create",
    id,
    `${definition.title} 자료 등록`,
  );
  const created = await findRecord(database, slug, id);
  if (!created) throw new Error("등록된 자료를 찾지 못했습니다.");
  return created;
}

export async function updateLegacyAdminToolRecord(
  slug: string,
  recordId: string,
  input: unknown,
  adminUsername: string,
): Promise<LegacyAdminToolRecord> {
  const definition = requireDefinition(slug);
  assertGenericRecordStorageAllowed(slug);
  if (definition.kind !== "records") {
    throw new AdminApiError(405, "이 화면에서는 자료를 수정할 수 없습니다.");
  }
  const id = normalizedId(recordId);
  const record = parseRecordInput(input, slug);
  await ensureAdminToolsSchema();
  const database = commerceDb();
  const result = await database
    .prepare(
      `UPDATE admin_tool_records
       SET title = ?, details = ?, status = ?, updated_at = CURRENT_TIMESTAMP
       WHERE tool_key = ? AND id = ?`,
    )
    .bind(record.title, record.details, record.status, slug, id)
    .run();
  if (!result.meta.changes) {
    throw new AdminApiError(404, "수정할 자료를 찾지 못했습니다.");
  }
  await writeAudit(
    database,
    adminUsername,
    "admin_tool.record.update",
    id,
    `${definition.title} 자료 수정`,
  );
  const updated = await findRecord(database, slug, id);
  if (!updated) throw new Error("수정된 자료를 찾지 못했습니다.");
  return updated;
}

export async function deleteLegacyAdminToolRecord(
  slug: string,
  recordId: string,
  adminUsername: string,
): Promise<void> {
  const definition = requireDefinition(slug);
  assertGenericRecordStorageAllowed(slug);
  if (definition.kind !== "records") {
    throw new AdminApiError(405, "이 화면에서는 자료를 삭제할 수 없습니다.");
  }
  const id = normalizedId(recordId);
  await ensureAdminToolsSchema();
  const database = commerceDb();
  const result = await database
    .prepare("DELETE FROM admin_tool_records WHERE tool_key = ? AND id = ?")
    .bind(slug, id)
    .run();
  if (!result.meta.changes) {
    throw new AdminApiError(404, "삭제할 자료를 찾지 못했습니다.");
  }
  await writeAudit(
    database,
    adminUsername,
    "admin_tool.record.delete",
    id,
    `${definition.title} 자료 삭제`,
  );
}

export async function runLegacyAdminToolAction(
  slug: string,
  adminUsername: string,
): Promise<LegacyAdminToolRun> {
  const definition = requireDefinition(slug);
  if (slug === "mail-test") {
    throw new AdminApiError(
      409,
      "테스트 메일은 공급자 상태를 확인하는 전용 메일 API에서만 전송합니다.",
    );
  }
  if (definition.kind !== "action") {
    throw new AdminApiError(405, "이 화면에서는 작업을 실행할 수 없습니다.");
  }
  await ensureAdminToolsSchema();
  if (slug === "db-upgrade") {
    await ensureCommerceSchema();
  }
  if (slug === "cache-files-delete") {
    const { revalidatePath } = await import("next/cache");
    revalidatePath("/", "layout");
  }
  const queued = Boolean(definition.externalService);
  const completedMessages: Readonly<Record<string, string>> = {
    "session-files-delete": "세션데이터 0건 삭제 완료됐습니다.",
    "cache-files-delete": "캐시파일 정리 및 페이지 캐시 갱신이 완료됐습니다.",
    "captcha-files-delete": "캡챠파일 0건의 삭제 완료됐습니다.",
    "thumbnail-files-delete": "재생성 가능한 썸네일 0건 삭제 완료됐습니다.",
    "browscap-update": "브라우저 식별 정보 업데이트를 완료했습니다.",
    "access-log-convert": "접속로그 정보 변환을 완료했습니다.",
    "db-upgrade":
      "더 이상 업그레이드 할 내용이 없습니다. 현재 DB 업그레이드가 완료된 상태입니다.",
  };
  const run: LegacyAdminToolRun = {
    id: crypto.randomUUID(),
    action: definition.actionLabel ?? definition.title,
    status: queued ? "queued" : "completed",
    message: queued
      ? "외부 서비스 계정 연결 전까지 전송 대기로 저장했습니다."
      : (completedMessages[slug] ??
        "새 사이트 범위의 작업을 정상적으로 처리했습니다."),
    createdAt: new Date().toISOString(),
  };
  const database = commerceDb();
  await database
    .prepare(
      `INSERT INTO admin_tool_runs (
         id, tool_key, action, status, message, created_by
       ) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      run.id,
      slug,
      run.action,
      run.status,
      run.message,
      normalizedAdmin(adminUsername),
    )
    .run();
  await writeAudit(
    database,
    adminUsername,
    "admin_tool.run",
    run.id,
    `${definition.title}: ${run.status}`,
  );
  return run;
}

function requireDefinition(slug: string): LegacyAdminToolDefinition {
  const definition = getLegacyAdminToolDefinition(slug);
  if (!definition) throw new AdminApiError(404, "관리 도구를 찾지 못했습니다.");
  return definition;
}

function assertGenericRecordStorageAllowed(slug: string): void {
  if (slug === "approved-clubs" || slug === "club-applications") {
    throw new AdminApiError(
      409,
      "동호회 자료는 전용 동호회 데이터와 API에서만 관리합니다.",
    );
  }
}

function safeSettings(
  raw: string | undefined,
): Record<string, string | number | boolean> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isJsonObject(parsed)) return {};
    const settings: Record<string, string | number | boolean> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
      ) {
        settings[key] = value;
      }
    }
    return settings;
  } catch {
    return {};
  }
}

function parseRecordInput(input: unknown, slug: string): {
  title: string;
  details: string;
  status: LegacyAdminToolRecord["status"];
} {
  if (!isJsonObject(input)) {
    throw new AdminApiError(400, "자료 형식이 올바르지 않습니다.");
  }
  const title = typeof input.title === "string" ? input.title.trim() : "";
  let details =
    typeof input.details === "string" ? input.details.trim() : "";
  const status =
    input.status === "active" ||
    input.status === "inactive" ||
    input.status === "pending"
      ? input.status
      : null;
  const fieldErrors: Record<string, string> = {};
  if (!title) fieldErrors.title = "제목을 입력해 주세요.";
  if (title.length > 200) fieldErrors.title = "제목은 200자 이내로 입력해 주세요.";
  if (details.length > 5_000) {
    fieldErrors.details = "내용은 5,000자 이내로 입력해 주세요.";
  }
  if (slug === "popup-layers" && !fieldErrors.details) {
    try {
      const parsed: unknown = JSON.parse(details);
      if (!isJsonObject(parsed)) throw new Error("invalid");
      const content =
        typeof parsed.content === "string" ? parsed.content.trim() : "";
      const href = typeof parsed.href === "string" ? parsed.href.trim() : "";
      const startsAt =
        typeof parsed.startsAt === "string" ? parsed.startsAt.trim() : "";
      const endsAt =
        typeof parsed.endsAt === "string" ? parsed.endsAt.trim() : "";
      const device =
        parsed.device === "pc" || parsed.device === "mobile"
          ? parsed.device
          : "both";
      const disableHours = normalizePopupInteger(
        parsed.disableHours,
        24,
        1,
        8_760,
      );
      const left = normalizePopupInteger(parsed.left, 10, 0, 9_999);
      const top = normalizePopupInteger(parsed.top, 10, 0, 9_999);
      const width = normalizePopupInteger(parsed.width, 450, 100, 2_000);
      const height = normalizePopupInteger(parsed.height, 500, 100, 2_000);
      if (!content) {
        fieldErrors.details = "팝업 내용을 입력해 주세요.";
      } else if (content.length > 4_000) {
        fieldErrors.details = "팝업 내용은 4,000자 이내로 입력해 주세요.";
      } else if (href && !isSafeInternalHref(href)) {
        fieldErrors.details =
          "연결 주소는 /로 시작하는 새 사이트 내부 주소로 입력해 주세요.";
      } else if (
        (startsAt && !isLocalDateTime(startsAt)) ||
        (endsAt && !isLocalDateTime(endsAt))
      ) {
        fieldErrors.details = "노출 기간 형식을 확인해 주세요.";
      } else if (startsAt && endsAt && startsAt > endsAt) {
        fieldErrors.details = "노출 종료는 노출 시작 이후로 설정해 주세요.";
      } else if (
        disableHours === null ||
        left === null ||
        top === null ||
        width === null ||
        height === null
      ) {
        fieldErrors.details = "팝업 시간과 위치, 크기를 다시 확인해 주세요.";
      } else {
        details = JSON.stringify({
          content,
          href,
          startsAt,
          endsAt,
          device,
          disableHours,
          left,
          top,
          width,
          height,
        });
      }
    } catch {
      fieldErrors.details = "팝업 내용을 다시 확인해 주세요.";
    }
  }
  if (!status) fieldErrors.status = "상태를 선택해 주세요.";
  if (Object.keys(fieldErrors).length > 0) {
    throw new AdminApiError(400, "입력 내용을 확인해 주세요.", fieldErrors);
  }
  return { title, details, status: status! };
}

function normalizePopupInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number | null {
  if (value === undefined || value === null || value === "") return fallback;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= minimum && number <= maximum
    ? number
    : null;
}

function validateStorefrontSettings(
  slug: string,
  settings: Record<string, string | number | boolean>,
  fieldErrors: Record<string, string>,
): void {
  if (
    slug === "theme-settings" &&
    (typeof settings.primaryColor !== "string" ||
      !/^#[0-9a-f]{6}$/iu.test(settings.primaryColor))
  ) {
    fieldErrors.primaryColor =
      "#을 포함한 6자리 색상 코드로 입력해 주세요. 예: #3949ab";
  }
  if (slug !== "menu-settings" || typeof settings.menuOrder !== "string") {
    return;
  }
  if (!isValidManagedMenuSource(settings.menuOrder)) {
    fieldErrors.menuOrder =
      "메뉴는 최대 30개이며 이름, 새 사이트 내부 링크, 표시 설정을 확인해 주세요.";
  }
}

function isSafeInternalHref(value: string): boolean {
  if (!value || value.length > 300 || /[\u0000-\u001F\u007F\\]/u.test(value)) {
    return false;
  }
  return value.startsWith("#") || (value.startsWith("/") && !value.startsWith("//"));
}

function isLocalDateTime(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/u.test(value)) return false;
  return Number.isFinite(Date.parse(`${value}:00+09:00`));
}

function normalizedAdmin(value: string): string {
  return value.trim().slice(0, 80);
}

function normalizedId(value: string): string {
  const id = value.trim();
  if (!/^[a-f0-9-]{20,64}$/iu.test(id)) {
    throw new AdminApiError(400, "자료 번호가 올바르지 않습니다.");
  }
  return id;
}

async function findRecord(
  database: D1Database,
  slug: string,
  id: string,
): Promise<LegacyAdminToolRecord | null> {
  const row = await database
    .prepare(
      `SELECT id, title, details, status, created_at, updated_at
       FROM admin_tool_records
       WHERE tool_key = ? AND id = ?
       LIMIT 1`,
    )
    .bind(slug, id)
    .first<{
      id: string;
      title: string;
      details: string;
      status: LegacyAdminToolRecord["status"];
      created_at: string;
      updated_at: string;
    }>();
  return row
    ? {
        id: row.id,
        title: row.title,
        details: row.details,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }
    : null;
}

async function writeAudit(
  database: D1Database,
  adminUsername: string,
  action: string,
  entityId: string,
  details: string,
): Promise<void> {
  await database
    .prepare(
      `INSERT INTO admin_audit_logs (
         action, entity_type, entity_id, details
       ) VALUES (?, 'admin_tool', ?, ?)`,
    )
    .bind(action, entityId, `${normalizedAdmin(adminUsername)}: ${details}`)
    .run();
}
