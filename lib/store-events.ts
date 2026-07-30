import { AdminApiError } from "@/lib/admin-api";
import { commerceDb } from "@/lib/commerce-db";
import {
  createLegacyAdminToolRecord,
  deleteLegacyAdminToolRecord,
  listLegacyAdminToolRecords,
  runLegacyAdminToolAction,
  updateLegacyAdminToolRecord,
  type LegacyAdminToolRecord,
} from "@/lib/admin-tools";
import { isJsonObject } from "@/lib/http-boundary";

export interface StoreEvent {
  id: string;
  title: string;
  content: string;
  href: string;
  startsAt: string;
  endsAt: string;
  active: boolean;
  linkedProductCount: number;
  createdAt: string;
  updatedAt: string;
}

interface EventInput {
  title: string;
  content: string;
  href: string;
  startsAt: string;
  endsAt: string;
  active: boolean;
  linkedProductCount: number;
}

interface EventDetails {
  content: string;
  href: string;
  startsAt: string;
  endsAt: string;
  linkedProductCount: number;
}

const SOURCE_EVENT_ID = "16881007-7700-4000-8000-000000000001";
const SOURCE_EVENT_MARKER = "source-event-1688100777-v1";
let sourceEventSeedInitialization: Promise<void> | null = null;

export async function listAdminStoreEvents(): Promise<StoreEvent[]> {
  await ensureSourceEventSeed();
  const records = await listLegacyAdminToolRecords("events", 1_000);
  return records.map(mapEventRecord).filter((event): event is StoreEvent =>
    Boolean(event),
  );
}

export async function listPublishedStoreEvents(
  now = new Date(),
): Promise<StoreEvent[]> {
  const today = koreaDate(now);
  return (await listAdminStoreEvents()).filter(
    (event) =>
      event.active &&
      (!event.startsAt || event.startsAt <= today) &&
      (!event.endsAt || event.endsAt >= today),
  );
}

export async function getPublishedStoreEvent(
  eventId: string,
  now = new Date(),
): Promise<StoreEvent | null> {
  const normalizedId = eventId.trim();
  if (!isSafeId(normalizedId)) return null;
  return (
    (await listPublishedStoreEvents(now)).find(
      (event) => event.id === normalizedId,
    ) ?? null
  );
}

export async function createStoreEvent(
  input: unknown,
  adminUsername: string,
): Promise<StoreEvent> {
  const event = parseEventInput(input);
  const record = await createLegacyAdminToolRecord(
    "events",
    toLegacyRecordInput(event),
    adminUsername,
  );
  return requireMappedEvent(record);
}

export async function updateStoreEvent(
  eventId: string,
  input: unknown,
  adminUsername: string,
): Promise<StoreEvent> {
  const event = parseEventInput(input);
  const record = await updateLegacyAdminToolRecord(
    "events",
    eventId,
    toLegacyRecordInput(event),
    adminUsername,
  );
  return requireMappedEvent(record);
}

export async function deleteStoreEvent(
  eventId: string,
  adminUsername: string,
): Promise<void> {
  await deleteLegacyAdminToolRecord("events", eventId, adminUsername);
}

export async function expireStoreEvents(
  adminUsername: string,
  now = new Date(),
): Promise<{ expiredCount: number; checkedCount: number }> {
  const today = koreaDate(now);
  const events = await listAdminStoreEvents();
  const expired = events.filter(
    (event) => event.active && Boolean(event.endsAt) && event.endsAt < today,
  );
  for (const event of expired) {
    await updateLegacyAdminToolRecord(
      "events",
      event.id,
      toLegacyRecordInput({ ...event, active: false }),
      adminUsername,
    );
  }
  await runLegacyAdminToolAction("event-bulk", adminUsername);
  return { expiredCount: expired.length, checkedCount: events.length };
}

function parseEventInput(input: unknown): EventInput {
  if (!isJsonObject(input)) {
    throw new AdminApiError(400, "이벤트 입력 형식을 확인해 주세요.");
  }
  const errors: Record<string, string> = {};
  const title = normalizedText(input.title, 200);
  const content = normalizedText(input.content, 4_000);
  const href = typeof input.href === "string" ? input.href.trim() : "";
  const startsAt = normalizedDate(input.startsAt, "startsAt", errors);
  const endsAt = normalizedDate(input.endsAt, "endsAt", errors);
  if (!title) errors.title = "이벤트 제목을 입력해 주세요.";
  if (!content) errors.content = "이벤트 내용을 입력해 주세요.";
  if (href && !isSafeInternalHref(href)) {
    errors.href = "/로 시작하는 새 사이트 내부 주소를 입력해 주세요.";
  }
  if (startsAt && endsAt && startsAt > endsAt) {
    errors.endsAt = "종료일은 시작일보다 빠를 수 없습니다.";
  }
  if (typeof input.active !== "boolean") {
    errors.active = "사용 여부를 선택해 주세요.";
  }
  if (Object.keys(errors).length > 0) {
    throw new AdminApiError(
      400,
      "이벤트 입력 내용을 확인해 주세요.",
      errors,
    );
  }
  return {
    title,
    content,
    href,
    startsAt,
    endsAt,
    active: input.active as boolean,
    linkedProductCount: normalizedCount(input.linkedProductCount),
  };
}

function mapEventRecord(record: LegacyAdminToolRecord): StoreEvent | null {
  const title = normalizedText(record.title, 200);
  const details = parseEventDetails(record.details);
  if (!title || !details.content) return null;
  return {
    id: record.id,
    title,
    ...details,
    active: record.status === "active",
    linkedProductCount: details.linkedProductCount,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function parseEventDetails(raw: string): EventDetails {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isJsonObject(parsed)) throw new Error("invalid");
    const content = normalizedText(parsed.content, 4_000);
    const href =
      typeof parsed.href === "string" && isSafeInternalHref(parsed.href.trim())
        ? parsed.href.trim()
        : "";
    const startsAt = isDateString(parsed.startsAt) ? parsed.startsAt : "";
    const endsAt = isDateString(parsed.endsAt) ? parsed.endsAt : "";
    const linkedProductCount = normalizedCount(parsed.linkedProductCount);
    return { content, href, startsAt, endsAt, linkedProductCount };
  } catch {
    return {
      content: normalizedText(raw, 4_000),
      href: "",
      startsAt: "",
      endsAt: "",
      linkedProductCount: 0,
    };
  }
}

function toLegacyRecordInput(event: EventInput) {
  return {
    title: event.title,
    details: JSON.stringify({
      content: event.content,
      href: event.href,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      linkedProductCount: event.linkedProductCount,
    }),
    status: event.active ? ("active" as const) : ("inactive" as const),
  };
}

function normalizedCount(value: unknown): number {
  const count = Number(value);
  return Number.isSafeInteger(count) && count >= 0 && count <= 10_000
    ? count
    : 0;
}

function requireMappedEvent(record: LegacyAdminToolRecord): StoreEvent {
  const event = mapEventRecord(record);
  if (!event) throw new Error("저장된 이벤트를 찾지 못했습니다.");
  return event;
}

function normalizedText(value: unknown, maximumLength: number): string {
  return typeof value === "string"
    ? value
        .replace(
          /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu,
          "",
        )
        .trim()
        .slice(0, maximumLength)
    : "";
}

function normalizedDate(
  value: unknown,
  field: string,
  errors: Record<string, string>,
): string {
  if (value === undefined || value === null || value === "") return "";
  if (!isDateString(value)) {
    errors[field] = "날짜를 YYYY-MM-DD 형식으로 입력해 주세요.";
    return "";
  }
  return value;
}

function isDateString(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    return false;
  }
  const [yearText, monthText, dayText] = value.split("-");
  const date = new Date(
    Date.UTC(Number(yearText), Number(monthText) - 1, Number(dayText)),
  );
  return (
    date.getUTCFullYear() === Number(yearText) &&
    date.getUTCMonth() + 1 === Number(monthText) &&
    date.getUTCDate() === Number(dayText)
  );
}

function isSafeInternalHref(value: string): boolean {
  return (
    value.length <= 300 &&
    !/[\u0000-\u001F\u007F\\]/u.test(value) &&
    (value.startsWith("#") ||
      (value.startsWith("/") && !value.startsWith("//")))
  );
}

function isSafeId(value: string): boolean {
  return /^[a-f0-9-]{20,64}$/iu.test(value);
}

function koreaDate(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

async function ensureSourceEventSeed(): Promise<void> {
  if (!sourceEventSeedInitialization) {
    sourceEventSeedInitialization = (async () => {
      // This first read also performs the generic admin-tool schema migration.
      await listLegacyAdminToolRecords("events", 1);
      const database = commerceDb();
      const details = JSON.stringify({
        content: "골드리안 1주년 무료나눔 이벤트",
        href: "/shop",
        startsAt: "",
        endsAt: "",
        linkedProductCount: 2,
      });
      await database.batch([
        database.prepare(`CREATE TABLE IF NOT EXISTS admin_local_bootstrap_markers (
          marker_key TEXT PRIMARY KEY,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        database
          .prepare(
            `INSERT OR IGNORE INTO admin_tool_records (
               id, tool_key, title, details, status, created_by, created_at, updated_at
             )
             SELECT ?, 'events', ?, ?, 'inactive', 'local-bootstrap',
                    '2023-06-30 03:32:57', '2023-06-30 03:32:57'
             WHERE NOT EXISTS (
               SELECT 1 FROM admin_local_bootstrap_markers WHERE marker_key = ?
             )`,
          )
          .bind(
            SOURCE_EVENT_ID,
            "1주년 무료나눔 이벤트",
            details,
            SOURCE_EVENT_MARKER,
          ),
        database
          .prepare(
            "INSERT OR IGNORE INTO admin_local_bootstrap_markers (marker_key) VALUES (?)",
          )
          .bind(SOURCE_EVENT_MARKER),
      ]);
    })().catch((error) => {
      sourceEventSeedInitialization = null;
      throw error;
    });
  }
  await sourceEventSeedInitialization;
}
