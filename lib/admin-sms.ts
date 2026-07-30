import { env } from "cloudflare:workers";
import { AdminApiError } from "@/lib/admin-api";
import { commerceDb, ensureCommerceSchema } from "@/lib/commerce-db";

export type SmsQueueStatus =
  | "waiting_provider"
  | "queued"
  | "sent"
  | "failed"
  | "cancelled";

export type SmsAdminTool =
  | "sms-settings"
  | "sms-member-sync"
  | "sms-send"
  | "sms-history-message"
  | "sms-history-number"
  | "sms-emoticon-groups"
  | "sms-emoticons"
  | "sms-phone-groups"
  | "sms-phones"
  | "sms-phone-file";

export interface SmsSettings {
  enabled: boolean;
  sender: string;
  providerName: string;
  memo: string;
  providerConfigured: boolean;
  available: boolean;
  unavailableReason: string;
  revision: number;
  updatedAt: string;
}

export interface SmsPhoneGroup {
  id: string;
  name: string;
  totalCount: number;
  memberCount: number;
  nonMemberCount: number;
  receiptCount: number;
  rejectCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface SmsPhone {
  id: string;
  groupId: string | null;
  groupName: string;
  name: string;
  phone: string;
  memberId: string;
  source: "manual" | "member" | "import";
  receipt: boolean;
  memo: string;
  createdAt: string;
  updatedAt: string;
}

export interface SmsTemplateGroup {
  id: string;
  name: string;
  templateCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface SmsTemplate {
  id: string;
  groupId: string | null;
  groupName: string;
  name: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface SmsMessage {
  id: string;
  content: string;
  sender: string;
  recipientCount: number;
  successCount: number;
  failureCount: number;
  duplicateCount: number;
  status: SmsQueueStatus;
  providerName: string;
  requestedBy: string;
  scheduledAt: string | null;
  sentAt: string | null;
  failureReason: string;
  createdAt: string;
  updatedAt: string;
}

export interface SmsMessageRecipient {
  id: string;
  messageId: string;
  groupName: string;
  phoneId: string | null;
  memberId: string;
  name: string;
  phone: string;
  status: SmsQueueStatus;
  lastError: string;
  createdAt: string;
  sentAt: string | null;
  messageContent: string;
  scheduledAt: string | null;
}

export interface SmsSyncState {
  lastSyncedAt: string;
  syncedCount: number;
  skippedCount: number;
}

export interface SmsAdminState {
  tool: SmsAdminTool;
  settings: SmsSettings;
  syncState: SmsSyncState;
  phoneGroups: SmsPhoneGroup[];
  phones: SmsPhone[];
  templateGroups: SmsTemplateGroup[];
  templates: SmsTemplate[];
  messages: SmsMessage[];
  recipients: SmsMessageRecipient[];
}

interface SmsEnvironment {
  SMS_PROVIDER_URL?: string;
}

interface SmsOptions {
  database?: D1Database;
}

interface SmsConfigRow {
  enabled: number;
  sender: string;
  provider_name: string;
  memo: string;
  revision: number;
  updated_at: string;
}

interface SmsPhoneGroupRow {
  id: string;
  name: string;
  total_count: number;
  member_count: number;
  non_member_count: number;
  receipt_count: number;
  reject_count: number;
  created_at: string;
  updated_at: string;
}

interface SmsPhoneRow {
  id: string;
  group_id: string | null;
  group_name: string | null;
  name: string;
  phone: string;
  member_id: string;
  source: SmsPhone["source"];
  receipt: number;
  memo: string;
  created_at: string;
  updated_at: string;
}

interface SmsTemplateGroupRow {
  id: string;
  name: string;
  template_count: number;
  created_at: string;
  updated_at: string;
}

interface SmsTemplateRow {
  id: string;
  group_id: string | null;
  group_name: string | null;
  name: string;
  content: string;
  created_at: string;
  updated_at: string;
}

interface SmsMessageRow {
  id: string;
  content: string;
  sender: string;
  recipient_count: number;
  success_count: number;
  failure_count: number;
  duplicate_count: number;
  status: SmsQueueStatus;
  provider_name: string;
  requested_by: string;
  scheduled_at: string | null;
  sent_at: string | null;
  failure_reason: string;
  created_at: string;
  updated_at: string;
}

interface SmsRecipientRow {
  id: string;
  message_id: string;
  group_name: string | null;
  phone_id: string | null;
  member_id: string;
  name: string;
  phone: string;
  status: SmsQueueStatus;
  last_error: string;
  created_at: string;
  sent_at: string | null;
  message_content: string;
  scheduled_at: string | null;
}

interface SmsSyncRow {
  last_synced_at: string;
  synced_count: number;
  skipped_count: number;
}

interface UserContactRow {
  id: string;
  login_id: string;
  name: string;
  phone: string;
  sms_opt_in: number;
  active: number;
}

const schemaInitializations = new WeakMap<object, Promise<void>>();
const MAX_LIST_ROWS = 1_000;
const MAX_NAME_LENGTH = 80;
const MAX_MEMO_LENGTH = 2_000;
const MAX_MESSAGE_BYTES = 2_000;
const MAX_RECIPIENTS = 1_000;
const phonePattern = /^0\d{8,10}$/u;
const idPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/u;

export function isSmsAdminTool(value: string): value is SmsAdminTool {
  return [
    "sms-settings",
    "sms-member-sync",
    "sms-send",
    "sms-history-message",
    "sms-history-number",
    "sms-emoticon-groups",
    "sms-emoticons",
    "sms-phone-groups",
    "sms-phones",
    "sms-phone-file",
  ].includes(value);
}

export async function ensureSmsAdminSchema(
  database = commerceDb(),
): Promise<void> {
  const cacheKey = database as unknown as object;
  let initialization = schemaInitializations.get(cacheKey);
  if (!initialization) {
    initialization = database
      .batch([
        database.prepare(`CREATE TABLE IF NOT EXISTS sms_config (
          id INTEGER PRIMARY KEY CHECK(id = 1),
          enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0, 1)),
          sender TEXT NOT NULL DEFAULT '',
          provider_name TEXT NOT NULL DEFAULT '',
          memo TEXT NOT NULL DEFAULT '',
          revision INTEGER NOT NULL DEFAULT 1 CHECK(revision >= 1),
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        database.prepare(`INSERT OR IGNORE INTO sms_config (
          id, enabled, sender, provider_name, memo
        ) VALUES (1, 0, '', '', '')`),
        database.prepare(`CREATE TABLE IF NOT EXISTS sms_phone_groups (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL COLLATE NOCASE UNIQUE,
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        database.prepare(`CREATE TABLE IF NOT EXISTS sms_phones (
          id TEXT PRIMARY KEY,
          group_id TEXT,
          name TEXT NOT NULL DEFAULT '',
          phone TEXT NOT NULL,
          member_id TEXT NOT NULL DEFAULT '',
          source TEXT NOT NULL DEFAULT 'manual'
            CHECK(source IN ('manual', 'member', 'import')),
          receipt INTEGER NOT NULL DEFAULT 1 CHECK(receipt IN (0, 1)),
          memo TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        database.prepare("DROP INDEX IF EXISTS sms_phones_phone_uq"),
        database.prepare(
          "CREATE UNIQUE INDEX IF NOT EXISTS sms_phones_member_uq ON sms_phones(member_id) WHERE member_id <> ''",
        ),
        database.prepare(
          "CREATE INDEX IF NOT EXISTS sms_phones_group_idx ON sms_phones(group_id, name)",
        ),
        database.prepare(`CREATE TABLE IF NOT EXISTS sms_template_groups (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL COLLATE NOCASE UNIQUE,
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        database.prepare(`CREATE TABLE IF NOT EXISTS sms_templates (
          id TEXT PRIMARY KEY,
          group_id TEXT,
          name TEXT NOT NULL,
          content TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        database.prepare(
          "CREATE INDEX IF NOT EXISTS sms_templates_group_idx ON sms_templates(group_id, created_at)",
        ),
        database.prepare(`CREATE TABLE IF NOT EXISTS sms_messages (
          id TEXT PRIMARY KEY,
          content TEXT NOT NULL,
          sender TEXT NOT NULL,
          recipient_count INTEGER NOT NULL DEFAULT 0 CHECK(recipient_count >= 0),
          duplicate_count INTEGER NOT NULL DEFAULT 0 CHECK(duplicate_count >= 0),
          status TEXT NOT NULL DEFAULT 'waiting_provider'
            CHECK(status IN (
              'waiting_provider', 'queued', 'sent', 'failed', 'cancelled'
            )),
          provider_name TEXT NOT NULL DEFAULT '',
          requested_by TEXT NOT NULL DEFAULT '',
          scheduled_at TEXT,
          sent_at TEXT,
          failure_reason TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        database.prepare(
          "CREATE INDEX IF NOT EXISTS sms_messages_status_idx ON sms_messages(status, created_at)",
        ),
        database.prepare(`CREATE TABLE IF NOT EXISTS sms_message_recipients (
          id TEXT PRIMARY KEY,
          message_id TEXT NOT NULL,
          phone_id TEXT,
          member_id TEXT NOT NULL DEFAULT '',
          group_name TEXT NOT NULL DEFAULT '',
          name TEXT NOT NULL DEFAULT '',
          phone TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'waiting_provider'
            CHECK(status IN (
              'waiting_provider', 'queued', 'sent', 'failed', 'cancelled'
            )),
          last_error TEXT NOT NULL DEFAULT '',
          sent_at TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        database.prepare(
          "CREATE UNIQUE INDEX IF NOT EXISTS sms_message_recipient_uq ON sms_message_recipients(message_id, phone)",
        ),
        database.prepare(
          "CREATE INDEX IF NOT EXISTS sms_message_recipients_phone_idx ON sms_message_recipients(phone, created_at)",
        ),
        database.prepare(`CREATE TABLE IF NOT EXISTS sms_sync_state (
          id INTEGER PRIMARY KEY CHECK(id = 1),
          last_synced_at TEXT NOT NULL DEFAULT '',
          synced_count INTEGER NOT NULL DEFAULT 0,
          skipped_count INTEGER NOT NULL DEFAULT 0,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        database.prepare(`INSERT OR IGNORE INTO sms_sync_state (
          id, last_synced_at, synced_count, skipped_count
        ) VALUES (1, '', 0, 0)`),
      ])
      .then(() => undefined)
      .catch((error) => {
        schemaInitializations.delete(cacheKey);
        throw error;
      });
    schemaInitializations.set(cacheKey, initialization);
  }
  await initialization;
}

export async function getSmsAdminState(
  tool: SmsAdminTool,
  options: SmsOptions = {},
): Promise<SmsAdminState> {
  const database = options.database ?? commerceDb();
  await ensureCommerceSchema();
  await ensureSmsAdminSchema(database);
  const [
    settings,
    syncState,
    phoneGroups,
    phones,
    templateGroups,
    templates,
    messages,
    recipients,
  ] = await Promise.all([
    getSmsSettings({ database }),
    getSmsSyncState(database),
    listSmsPhoneGroups(database),
    listSmsPhones(database),
    listSmsTemplateGroups(database),
    listSmsTemplates(database),
    listSmsMessages(database),
    listSmsMessageRecipients(database),
  ]);
  return {
    tool,
    settings,
    syncState,
    phoneGroups,
    phones,
    templateGroups,
    templates,
    messages,
    recipients,
  };
}

export async function getSmsSettings(
  options: SmsOptions = {},
): Promise<SmsSettings> {
  const database = options.database ?? commerceDb();
  await ensureSmsAdminSchema(database);
  const row = await database
    .prepare(
      `SELECT enabled, sender, provider_name, memo, revision, updated_at
       FROM sms_config WHERE id = 1`,
    )
    .first<SmsConfigRow>();
  if (!row) throw new Error("SMS 설정을 읽을 수 없습니다.");
  return settingsFromRow(row);
}

export async function updateSmsSettings(
  input: unknown,
  options: SmsOptions = {},
): Promise<SmsSettings> {
  const record = objectInput(input);
  const enabled = booleanInput(record.enabled, "enabled");
  const senderRaw = stringInput(record.sender, "sender", 30);
  const sender = senderRaw ? normalizePhone(senderRaw, "sender") : "";
  const providerName = optionalString(record.providerName, MAX_NAME_LENGTH);
  const memo = optionalString(record.memo, MAX_MEMO_LENGTH);
  const expectedRevision = positiveInteger(record.expectedRevision, "expectedRevision");
  const database = options.database ?? commerceDb();
  await ensureSmsAdminSchema(database);
  const result = await database
    .prepare(
      `UPDATE sms_config
       SET enabled = ?, sender = ?, provider_name = ?, memo = ?,
           revision = revision + 1, updated_at = CURRENT_TIMESTAMP
       WHERE id = 1 AND revision = ?`,
    )
    .bind(enabled ? 1 : 0, sender, providerName, memo, expectedRevision)
    .run();
  if ((result.meta.changes ?? 0) !== 1) {
    throw new AdminApiError(
      409,
      "SMS 설정이 다른 작업에서 변경되었습니다. 새로고침 후 다시 저장해 주세요.",
    );
  }
  return getSmsSettings({ database });
}

export async function syncSmsMembers(
  options: SmsOptions = {},
): Promise<SmsSyncState> {
  const database = options.database ?? commerceDb();
  await ensureCommerceSchema();
  await ensureSmsAdminSchema(database);
  const users = await database
    .prepare(
      `SELECT id, login_id, name, phone, sms_opt_in, active
       FROM users ORDER BY created_at ASC LIMIT ?`,
    )
    .bind(MAX_LIST_ROWS)
    .all<UserContactRow>();
  let syncedCount = 0;
  let skippedCount = 0;
  for (const user of users.results ?? []) {
    if (user.active !== 1) {
      await database
        .prepare("DELETE FROM sms_phones WHERE member_id = ?")
        .bind(user.login_id)
        .run();
      skippedCount += 1;
      continue;
    }
    const phone = normalizePhoneOrNull(user.phone) ?? "";
    if (!phone) skippedCount += 1;
    const id = `member_${safeIdFragment(user.id)}`;
    const result = await database
      .prepare(
        `INSERT INTO sms_phones (
           id, group_id, name, phone, member_id, source, receipt, memo
         ) VALUES (?, NULL, ?, ?, ?, 'member', ?, '')
         ON CONFLICT(member_id) WHERE member_id <> '' DO UPDATE SET
           name = excluded.name,
           phone = excluded.phone,
           source = 'member',
           receipt = excluded.receipt,
           updated_at = CURRENT_TIMESTAMP`,
      )
      .bind(
        id,
        user.name.trim().slice(0, MAX_NAME_LENGTH),
        phone,
        user.login_id,
        phone && user.sms_opt_in === 1 ? 1 : 0,
      )
      .run();
    if ((result.meta.changes ?? 0) === 1) syncedCount += 1;
  }
  await database
    .prepare(
      `UPDATE sms_sync_state
       SET last_synced_at = CURRENT_TIMESTAMP,
           synced_count = ?, skipped_count = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = 1`,
    )
    .bind(syncedCount, skippedCount)
    .run();
  return getSmsSyncState(database);
}

export async function createSmsPhoneGroup(
  input: unknown,
  options: SmsOptions = {},
): Promise<SmsPhoneGroup> {
  const record = objectInput(input);
  const name = requiredTrimmed(record.name, "name", MAX_NAME_LENGTH);
  const database = options.database ?? commerceDb();
  await ensureSmsAdminSchema(database);
  const id = crypto.randomUUID();
  try {
    await database
      .prepare("INSERT INTO sms_phone_groups (id, name) VALUES (?, ?)")
      .bind(id, name)
      .run();
  } catch (error) {
    if (isConstraintError(error)) {
      throw new AdminApiError(409, "같은 이름의 휴대폰번호 그룹이 이미 있습니다.");
    }
    throw error;
  }
  return requirePhoneGroup(id, database);
}

export async function updateSmsPhoneGroup(
  input: unknown,
  options: SmsOptions = {},
): Promise<SmsPhoneGroup> {
  const record = objectInput(input);
  const id = validId(record.id);
  const name = requiredTrimmed(record.name, "name", MAX_NAME_LENGTH);
  const database = options.database ?? commerceDb();
  await ensureSmsAdminSchema(database);
  try {
    const result = await database
      .prepare(
        `UPDATE sms_phone_groups
         SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      )
      .bind(name, id)
      .run();
    if ((result.meta.changes ?? 0) !== 1) {
      throw new AdminApiError(404, "휴대폰번호 그룹을 찾을 수 없습니다.");
    }
  } catch (error) {
    if (isConstraintError(error)) {
      throw new AdminApiError(409, "같은 이름의 휴대폰번호 그룹이 이미 있습니다.");
    }
    throw error;
  }
  return requirePhoneGroup(id, database);
}

export async function deleteSmsPhoneGroup(
  input: unknown,
  options: SmsOptions = {},
): Promise<void> {
  const id = validId(objectInput(input).id);
  const database = options.database ?? commerceDb();
  await ensureSmsAdminSchema(database);
  const result = await database.batch([
    database
      .prepare(
        `UPDATE sms_phones
         SET group_id = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE group_id = ?`,
      )
      .bind(id),
    database.prepare("DELETE FROM sms_phone_groups WHERE id = ?").bind(id),
  ]);
  if ((result[1]?.meta.changes ?? 0) !== 1) {
    throw new AdminApiError(404, "휴대폰번호 그룹을 찾을 수 없습니다.");
  }
}

export async function mutateSmsPhoneGroupContents(
  input: unknown,
  options: SmsOptions = {},
): Promise<void> {
  const record = objectInput(input);
  const id = validId(record.id);
  const action = stringInput(record.action, "action", 20);
  const database = options.database ?? commerceDb();
  await ensureSmsAdminSchema(database);
  await requirePhoneGroup(id, database);
  if (action === "clear") {
    await database
      .prepare("DELETE FROM sms_phones WHERE group_id = ?")
      .bind(id)
      .run();
    return;
  }
  if (action === "move") {
    const targetGroupId = optionalId(record.targetGroupId);
    if (targetGroupId) await requirePhoneGroup(targetGroupId, database);
    if (targetGroupId === id) {
      throw new AdminApiError(400, "현재 그룹과 다른 이동 대상 그룹을 선택해 주세요.");
    }
    await database
      .prepare(
        `UPDATE sms_phones
         SET group_id = ?, updated_at = CURRENT_TIMESTAMP
         WHERE group_id = ?`,
      )
      .bind(targetGroupId, id)
      .run();
    return;
  }
  throw new AdminApiError(400, "지원하지 않는 그룹 작업입니다.");
}

export async function createSmsPhone(
  input: unknown,
  source: SmsPhone["source"] = "manual",
  options: SmsOptions = {},
): Promise<SmsPhone> {
  const record = objectInput(input);
  const name = requiredTrimmed(record.name, "name", MAX_NAME_LENGTH);
  const phone = normalizePhone(stringInput(record.phone, "phone", 30), "phone");
  const groupId = optionalId(record.groupId);
  const receipt =
    record.receipt === undefined ? true : booleanInput(record.receipt, "receipt");
  const memo = optionalString(record.memo, MAX_MEMO_LENGTH);
  const database = options.database ?? commerceDb();
  await ensureSmsAdminSchema(database);
  if (groupId) await requirePhoneGroup(groupId, database);
  const id = crypto.randomUUID();
  try {
    await database
      .prepare(
        `INSERT INTO sms_phones (
           id, group_id, name, phone, member_id, source, receipt, memo
         ) VALUES (?, ?, ?, ?, '', ?, ?, ?)`,
      )
      .bind(id, groupId, name, phone, source, receipt ? 1 : 0, memo)
      .run();
  } catch (error) {
    if (isConstraintError(error)) {
      throw new AdminApiError(409, "같은 휴대폰번호가 이미 등록되어 있습니다.");
    }
    throw error;
  }
  return requirePhone(id, database);
}

export async function updateSmsPhone(
  input: unknown,
  options: SmsOptions = {},
): Promise<SmsPhone> {
  const record = objectInput(input);
  const id = validId(record.id);
  const name = requiredTrimmed(record.name, "name", MAX_NAME_LENGTH);
  const phone = normalizePhone(stringInput(record.phone, "phone", 30), "phone");
  const groupId = optionalId(record.groupId);
  const receipt = booleanInput(record.receipt, "receipt");
  const memo = optionalString(record.memo, MAX_MEMO_LENGTH);
  const database = options.database ?? commerceDb();
  await ensureSmsAdminSchema(database);
  if (groupId) await requirePhoneGroup(groupId, database);
  try {
    const result = await database
      .prepare(
        `UPDATE sms_phones
         SET group_id = ?, name = ?, phone = ?, receipt = ?, memo = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      )
      .bind(groupId, name, phone, receipt ? 1 : 0, memo, id)
      .run();
    if ((result.meta.changes ?? 0) !== 1) {
      throw new AdminApiError(404, "휴대폰번호를 찾을 수 없습니다.");
    }
  } catch (error) {
    if (isConstraintError(error)) {
      throw new AdminApiError(409, "같은 휴대폰번호가 이미 등록되어 있습니다.");
    }
    throw error;
  }
  return requirePhone(id, database);
}

export async function deleteSmsPhone(
  input: unknown,
  options: SmsOptions = {},
): Promise<void> {
  const id = validId(objectInput(input).id);
  const database = options.database ?? commerceDb();
  await ensureSmsAdminSchema(database);
  const result = await database
    .prepare("DELETE FROM sms_phones WHERE id = ?")
    .bind(id)
    .run();
  if ((result.meta.changes ?? 0) !== 1) {
    throw new AdminApiError(404, "휴대폰번호를 찾을 수 없습니다.");
  }
}

export async function bulkUpdateSmsPhones(
  input: unknown,
  options: SmsOptions = {},
): Promise<SmsPhone[]> {
  const record = objectInput(input);
  const ids = idArray(record.ids);
  const action = stringInput(
    record.action === "bulk" ? record.bulkAction : record.action,
    "action",
    20,
  );
  if (!["receipt", "reject", "delete", "move", "copy"].includes(action)) {
    throw new AdminApiError(400, "지원하지 않는 일괄 작업입니다.");
  }
  const database = options.database ?? commerceDb();
  await ensureSmsAdminSchema(database);
  const targetGroupId =
    action === "move" || action === "copy" ? optionalId(record.groupId) : null;
  if ((action === "move" || action === "copy") && targetGroupId) {
    await requirePhoneGroup(targetGroupId, database);
  }
  for (const id of ids) {
    if (action === "delete") {
      await database.prepare("DELETE FROM sms_phones WHERE id = ?").bind(id).run();
    } else if (action === "receipt" || action === "reject") {
      await database
        .prepare(
          `UPDATE sms_phones
           SET receipt = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        )
        .bind(action === "receipt" ? 1 : 0, id)
        .run();
    } else if (action === "move") {
      await database
        .prepare(
          `UPDATE sms_phones
           SET group_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        )
        .bind(targetGroupId, id)
        .run();
    } else {
      const phone = await requirePhone(id, database);
      await database
        .prepare(
          `INSERT INTO sms_phones (
             id, group_id, name, phone, member_id, source, receipt, memo
           ) VALUES (?, ?, ?, ?, '', 'manual', ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          targetGroupId,
          phone.name,
          phone.phone,
          phone.receipt ? 1 : 0,
          phone.memo,
        )
        .run();
    }
  }
  return listSmsPhones(database);
}

export async function createSmsTemplateGroup(
  input: unknown,
  options: SmsOptions = {},
): Promise<SmsTemplateGroup> {
  const name = requiredTrimmed(
    objectInput(input).name,
    "name",
    MAX_NAME_LENGTH,
  );
  const database = options.database ?? commerceDb();
  await ensureSmsAdminSchema(database);
  const id = crypto.randomUUID();
  try {
    await database
      .prepare("INSERT INTO sms_template_groups (id, name) VALUES (?, ?)")
      .bind(id, name)
      .run();
  } catch (error) {
    if (isConstraintError(error)) {
      throw new AdminApiError(409, "같은 이름의 이모티콘 그룹이 이미 있습니다.");
    }
    throw error;
  }
  return requireTemplateGroup(id, database);
}

export async function updateSmsTemplateGroup(
  input: unknown,
  options: SmsOptions = {},
): Promise<SmsTemplateGroup> {
  const record = objectInput(input);
  const id = validId(record.id);
  const name = requiredTrimmed(record.name, "name", MAX_NAME_LENGTH);
  const database = options.database ?? commerceDb();
  await ensureSmsAdminSchema(database);
  try {
    const result = await database
      .prepare(
        `UPDATE sms_template_groups
         SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      )
      .bind(name, id)
      .run();
    if ((result.meta.changes ?? 0) !== 1) {
      throw new AdminApiError(404, "이모티콘 그룹을 찾을 수 없습니다.");
    }
  } catch (error) {
    if (isConstraintError(error)) {
      throw new AdminApiError(409, "같은 이름의 이모티콘 그룹이 이미 있습니다.");
    }
    throw error;
  }
  return requireTemplateGroup(id, database);
}

export async function deleteSmsTemplateGroup(
  input: unknown,
  options: SmsOptions = {},
): Promise<void> {
  const id = validId(objectInput(input).id);
  const database = options.database ?? commerceDb();
  await ensureSmsAdminSchema(database);
  const results = await database.batch([
    database
      .prepare(
        `UPDATE sms_templates
         SET group_id = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE group_id = ?`,
      )
      .bind(id),
    database.prepare("DELETE FROM sms_template_groups WHERE id = ?").bind(id),
  ]);
  if ((results[1]?.meta.changes ?? 0) !== 1) {
    throw new AdminApiError(404, "이모티콘 그룹을 찾을 수 없습니다.");
  }
}

export async function mutateSmsTemplateGroupContents(
  input: unknown,
  options: SmsOptions = {},
): Promise<void> {
  const record = objectInput(input);
  const id = validId(record.id);
  const action = stringInput(record.action, "action", 20);
  const database = options.database ?? commerceDb();
  await ensureSmsAdminSchema(database);
  await requireTemplateGroup(id, database);
  if (action === "clear") {
    await database
      .prepare("DELETE FROM sms_templates WHERE group_id = ?")
      .bind(id)
      .run();
    return;
  }
  if (action === "move") {
    const targetGroupId = optionalId(record.targetGroupId);
    if (targetGroupId) await requireTemplateGroup(targetGroupId, database);
    if (targetGroupId === id) {
      throw new AdminApiError(400, "현재 그룹과 다른 이동 대상 그룹을 선택해 주세요.");
    }
    await database
      .prepare(
        `UPDATE sms_templates
         SET group_id = ?, updated_at = CURRENT_TIMESTAMP
         WHERE group_id = ?`,
      )
      .bind(targetGroupId, id)
      .run();
    return;
  }
  throw new AdminApiError(400, "지원하지 않는 그룹 작업입니다.");
}

export async function createSmsTemplate(
  input: unknown,
  options: SmsOptions = {},
): Promise<SmsTemplate> {
  const record = objectInput(input);
  const name = requiredTrimmed(record.name, "name", MAX_NAME_LENGTH);
  const content = messageContent(record.content);
  const groupId = optionalId(record.groupId);
  const database = options.database ?? commerceDb();
  await ensureSmsAdminSchema(database);
  if (groupId) await requireTemplateGroup(groupId, database);
  const id = crypto.randomUUID();
  await database
    .prepare(
      `INSERT INTO sms_templates (id, group_id, name, content)
       VALUES (?, ?, ?, ?)`,
    )
    .bind(id, groupId, name, content)
    .run();
  return requireTemplate(id, database);
}

export async function updateSmsTemplate(
  input: unknown,
  options: SmsOptions = {},
): Promise<SmsTemplate> {
  const record = objectInput(input);
  const id = validId(record.id);
  const name = requiredTrimmed(record.name, "name", MAX_NAME_LENGTH);
  const content = messageContent(record.content);
  const groupId = optionalId(record.groupId);
  const database = options.database ?? commerceDb();
  await ensureSmsAdminSchema(database);
  if (groupId) await requireTemplateGroup(groupId, database);
  const result = await database
    .prepare(
      `UPDATE sms_templates
       SET group_id = ?, name = ?, content = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
    .bind(groupId, name, content, id)
    .run();
  if ((result.meta.changes ?? 0) !== 1) {
    throw new AdminApiError(404, "이모티콘을 찾을 수 없습니다.");
  }
  return requireTemplate(id, database);
}

export async function deleteSmsTemplate(
  input: unknown,
  options: SmsOptions = {},
): Promise<void> {
  const id = validId(objectInput(input).id);
  const database = options.database ?? commerceDb();
  await ensureSmsAdminSchema(database);
  const result = await database
    .prepare("DELETE FROM sms_templates WHERE id = ?")
    .bind(id)
    .run();
  if ((result.meta.changes ?? 0) !== 1) {
    throw new AdminApiError(404, "이모티콘을 찾을 수 없습니다.");
  }
}

export async function queueSmsMessage(
  input: unknown,
  adminUsername: string,
  options: SmsOptions = {},
): Promise<SmsMessage> {
  const record = objectInput(input);
  const content = messageContent(record.content);
  const scheduledAt = optionalSchedule(record.scheduledAt);
  const phoneIds = Array.isArray(record.phoneIds) ? idArray(record.phoneIds) : [];
  const manualRecipients = parseManualRecipients(record.recipients);
  const database = options.database ?? commerceDb();
  await ensureSmsAdminSchema(database);
  const selectedPhones: SmsPhone[] = [];
  for (const id of phoneIds) selectedPhones.push(await requirePhone(id, database));
  const combined = [
    ...selectedPhones.map((phone) => ({
      phoneId: phone.id,
      memberId: phone.memberId,
      groupName: phone.groupName,
      name: phone.name,
      phone: phone.phone,
      receipt: phone.receipt,
    })),
    ...manualRecipients.map((recipient) => ({
      phoneId: null,
      memberId: "",
      groupName: "없음",
      name: recipient.name,
      phone: recipient.phone,
      receipt: true,
    })),
  ];
  const recipientByPhone = new Map<
    string,
    (typeof combined)[number]
  >();
  let duplicateCount = 0;
  for (const recipient of combined) {
    if (!recipient.receipt) continue;
    if (recipientByPhone.has(recipient.phone)) {
      duplicateCount += 1;
      continue;
    }
    recipientByPhone.set(recipient.phone, recipient);
  }
  const recipients = [...recipientByPhone.values()];
  if (recipients.length === 0) {
    throw new AdminApiError(400, "받는 사람을 한 명 이상 선택해 주세요.");
  }
  if (recipients.length > MAX_RECIPIENTS) {
    throw new AdminApiError(
      413,
      `한 번에 최대 ${MAX_RECIPIENTS.toLocaleString("ko-KR")}명까지 요청할 수 있습니다.`,
    );
  }
  const settings = await getSmsSettings({ database });
  const status: SmsQueueStatus = settings.available
    ? "queued"
    : "waiting_provider";
  const failureReason = settings.available ? "" : settings.unavailableReason;
  const messageId = crypto.randomUUID();
  const sender = settings.sender;
  const statements: D1PreparedStatement[] = [
    database
      .prepare(
        `INSERT INTO sms_messages (
           id, content, sender, recipient_count, duplicate_count, status,
           provider_name, requested_by, scheduled_at, failure_reason
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        messageId,
        content,
        sender,
        recipients.length,
        duplicateCount,
        status,
        settings.providerName,
        adminUsername.trim().slice(0, 128),
        scheduledAt,
        failureReason,
      ),
  ];
  for (const recipient of recipients) {
    statements.push(
      database
        .prepare(
          `INSERT INTO sms_message_recipients (
             id, message_id, phone_id, member_id, group_name,
             name, phone, status, last_error
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          messageId,
          recipient.phoneId,
          recipient.memberId,
          recipient.groupName,
          recipient.name,
          recipient.phone,
          status,
          failureReason,
        ),
    );
  }
  await database.batch(statements);
  return requireMessage(messageId, database);
}

export async function cancelSmsMessage(
  input: unknown,
  options: SmsOptions = {},
): Promise<SmsMessage> {
  const id = validId(objectInput(input).id);
  const database = options.database ?? commerceDb();
  await ensureSmsAdminSchema(database);
  const results = await database.batch([
    database
      .prepare(
        `UPDATE sms_messages
         SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status IN ('waiting_provider', 'queued')`,
      )
      .bind(id),
    database
      .prepare(
        `UPDATE sms_message_recipients
         SET status = 'cancelled', last_error = '관리자 취소'
         WHERE message_id = ?
           AND status IN ('waiting_provider', 'queued')`,
      )
      .bind(id),
  ]);
  if ((results[0]?.meta.changes ?? 0) !== 1) {
    throw new AdminApiError(
      409,
      "대기 또는 전송 준비 상태의 요청만 취소할 수 있습니다.",
    );
  }
  return requireMessage(id, database);
}

export async function importSmsPhoneRows(
  rows: readonly { name: string; phone: string }[],
  groupId: string | null,
  options: SmsOptions = {},
): Promise<{ imported: number; duplicates: number; invalid: number }> {
  if (rows.length === 0) {
    throw new AdminApiError(400, "업로드할 휴대폰번호가 없습니다.");
  }
  if (rows.length > MAX_RECIPIENTS) {
    throw new AdminApiError(
      413,
      `한 파일에서 최대 ${MAX_RECIPIENTS.toLocaleString("ko-KR")}개까지 등록할 수 있습니다.`,
    );
  }
  const database = options.database ?? commerceDb();
  await ensureSmsAdminSchema(database);
  if (groupId) await requirePhoneGroup(groupId, database);
  let imported = 0;
  let duplicates = 0;
  let invalid = 0;
  for (const raw of rows) {
    const name = raw.name.trim().slice(0, MAX_NAME_LENGTH);
    const phone = normalizePhoneOrNull(raw.phone);
    if (!name || !phone) {
      invalid += 1;
      continue;
    }
    const duplicate = await database
      .prepare("SELECT id FROM sms_phones WHERE phone = ? LIMIT 1")
      .bind(phone)
      .first<{ id: string }>();
    if (duplicate) {
      duplicates += 1;
      continue;
    }
    try {
      const result = await database
        .prepare(
          `INSERT INTO sms_phones (
             id, group_id, name, phone, member_id, source, receipt, memo
           ) VALUES (?, ?, ?, ?, '', 'import', 1, '')`,
        )
        .bind(crypto.randomUUID(), groupId, name, phone)
        .run();
      if ((result.meta.changes ?? 0) === 1) imported += 1;
    } catch (error) {
      if (isConstraintError(error)) {
        duplicates += 1;
        continue;
      }
      throw error;
    }
  }
  return { imported, duplicates, invalid };
}

export async function exportSmsPhoneRows(
  groupId: string | null | undefined,
  options: SmsOptions = {},
): Promise<SmsPhone[]> {
  const database = options.database ?? commerceDb();
  await ensureSmsAdminSchema(database);
  const phones = await listSmsPhones(database);
  return groupId === undefined
    ? phones
    : phones.filter((phone) => phone.groupId === groupId);
}

async function getSmsSyncState(database: D1Database): Promise<SmsSyncState> {
  const row = await database
    .prepare(
      `SELECT last_synced_at, synced_count, skipped_count
       FROM sms_sync_state WHERE id = 1`,
    )
    .first<SmsSyncRow>();
  return {
    lastSyncedAt: row?.last_synced_at ?? "",
    syncedCount: row?.synced_count ?? 0,
    skippedCount: row?.skipped_count ?? 0,
  };
}

async function listSmsPhoneGroups(
  database: D1Database,
): Promise<SmsPhoneGroup[]> {
  const rows = await database
    .prepare(
      `SELECT g.id, g.name,
              COUNT(p.id) AS total_count,
              SUM(CASE WHEN p.member_id <> '' THEN 1 ELSE 0 END) AS member_count,
              SUM(CASE WHEN p.member_id = '' THEN 1 ELSE 0 END) AS non_member_count,
              SUM(CASE WHEN p.receipt = 1 THEN 1 ELSE 0 END) AS receipt_count,
              SUM(CASE WHEN p.receipt = 0 THEN 1 ELSE 0 END) AS reject_count,
              g.created_at, g.updated_at
       FROM sms_phone_groups g
       LEFT JOIN sms_phones p ON p.group_id = g.id
       GROUP BY g.id, g.name, g.created_at, g.updated_at
       ORDER BY g.name COLLATE NOCASE ASC
       LIMIT ?`,
    )
    .bind(MAX_LIST_ROWS)
    .all<SmsPhoneGroupRow>();
  return (rows.results ?? []).map(phoneGroupFromRow);
}

async function listSmsPhones(database: D1Database): Promise<SmsPhone[]> {
  const rows = await database
    .prepare(
      `SELECT p.id, p.group_id, g.name AS group_name, p.name, p.phone,
              p.member_id, p.source, p.receipt, p.memo,
              p.created_at, p.updated_at
       FROM sms_phones p
       LEFT JOIN sms_phone_groups g ON g.id = p.group_id
       ORDER BY p.updated_at DESC, p.name COLLATE NOCASE ASC
       LIMIT ?`,
    )
    .bind(MAX_LIST_ROWS)
    .all<SmsPhoneRow>();
  return (rows.results ?? []).map(phoneFromRow);
}

async function listSmsTemplateGroups(
  database: D1Database,
): Promise<SmsTemplateGroup[]> {
  const rows = await database
    .prepare(
      `SELECT g.id, g.name, COUNT(t.id) AS template_count,
              g.created_at, g.updated_at
       FROM sms_template_groups g
       LEFT JOIN sms_templates t ON t.group_id = g.id
       GROUP BY g.id, g.name, g.created_at, g.updated_at
       ORDER BY g.name COLLATE NOCASE ASC
       LIMIT ?`,
    )
    .bind(MAX_LIST_ROWS)
    .all<SmsTemplateGroupRow>();
  return (rows.results ?? []).map(templateGroupFromRow);
}

async function listSmsTemplates(database: D1Database): Promise<SmsTemplate[]> {
  const rows = await database
    .prepare(
      `SELECT t.id, t.group_id, g.name AS group_name, t.name, t.content,
              t.created_at, t.updated_at
       FROM sms_templates t
       LEFT JOIN sms_template_groups g ON g.id = t.group_id
       ORDER BY t.created_at DESC
       LIMIT ?`,
    )
    .bind(MAX_LIST_ROWS)
    .all<SmsTemplateRow>();
  return (rows.results ?? []).map(templateFromRow);
}

async function listSmsMessages(database: D1Database): Promise<SmsMessage[]> {
  const rows = await database
    .prepare(
      `SELECT m.id, m.content, m.sender, m.recipient_count,
              SUM(CASE WHEN r.status = 'sent' THEN 1 ELSE 0 END) AS success_count,
              SUM(CASE WHEN r.status = 'failed' THEN 1 ELSE 0 END) AS failure_count,
              m.duplicate_count, m.status, m.provider_name, m.requested_by,
              m.scheduled_at, m.sent_at, m.failure_reason,
              m.created_at, m.updated_at
       FROM sms_messages m
       LEFT JOIN sms_message_recipients r ON r.message_id = m.id
       GROUP BY m.id, m.content, m.sender, m.recipient_count,
                m.duplicate_count, m.status, m.provider_name, m.requested_by,
                m.scheduled_at, m.sent_at, m.failure_reason,
                m.created_at, m.updated_at
       ORDER BY m.created_at DESC
       LIMIT ?`,
    )
    .bind(MAX_LIST_ROWS)
    .all<SmsMessageRow>();
  return (rows.results ?? []).map(messageFromRow);
}

async function listSmsMessageRecipients(
  database: D1Database,
): Promise<SmsMessageRecipient[]> {
  const rows = await database
    .prepare(
      `SELECT r.id, r.message_id, r.group_name, r.phone_id, r.member_id,
              r.name, r.phone, r.status, r.last_error, r.created_at, r.sent_at,
              m.content AS message_content, m.scheduled_at
       FROM sms_message_recipients r
       JOIN sms_messages m ON m.id = r.message_id
       ORDER BY r.created_at DESC
       LIMIT ?`,
    )
    .bind(MAX_LIST_ROWS)
    .all<SmsRecipientRow>();
  return (rows.results ?? []).map(recipientFromRow);
}

async function requirePhoneGroup(
  id: string,
  database: D1Database,
): Promise<SmsPhoneGroup> {
  const row = await database
    .prepare(
      `SELECT g.id, g.name,
              COUNT(p.id) AS total_count,
              SUM(CASE WHEN p.member_id <> '' THEN 1 ELSE 0 END) AS member_count,
              SUM(CASE WHEN p.member_id = '' THEN 1 ELSE 0 END) AS non_member_count,
              SUM(CASE WHEN p.receipt = 1 THEN 1 ELSE 0 END) AS receipt_count,
              SUM(CASE WHEN p.receipt = 0 THEN 1 ELSE 0 END) AS reject_count,
              g.created_at, g.updated_at
       FROM sms_phone_groups g
       LEFT JOIN sms_phones p ON p.group_id = g.id
       WHERE g.id = ?
       GROUP BY g.id, g.name, g.created_at, g.updated_at`,
    )
    .bind(id)
    .first<SmsPhoneGroupRow>();
  if (!row) throw new AdminApiError(404, "휴대폰번호 그룹을 찾을 수 없습니다.");
  return phoneGroupFromRow(row);
}

async function requirePhone(
  id: string,
  database: D1Database,
): Promise<SmsPhone> {
  const row = await database
    .prepare(
      `SELECT p.id, p.group_id, g.name AS group_name, p.name, p.phone,
              p.member_id, p.source, p.receipt, p.memo,
              p.created_at, p.updated_at
       FROM sms_phones p
       LEFT JOIN sms_phone_groups g ON g.id = p.group_id
       WHERE p.id = ?`,
    )
    .bind(id)
    .first<SmsPhoneRow>();
  if (!row) throw new AdminApiError(404, "휴대폰번호를 찾을 수 없습니다.");
  return phoneFromRow(row);
}

async function requireTemplateGroup(
  id: string,
  database: D1Database,
): Promise<SmsTemplateGroup> {
  const row = await database
    .prepare(
      `SELECT g.id, g.name, COUNT(t.id) AS template_count,
              g.created_at, g.updated_at
       FROM sms_template_groups g
       LEFT JOIN sms_templates t ON t.group_id = g.id
       WHERE g.id = ?
       GROUP BY g.id, g.name, g.created_at, g.updated_at`,
    )
    .bind(id)
    .first<SmsTemplateGroupRow>();
  if (!row) throw new AdminApiError(404, "이모티콘 그룹을 찾을 수 없습니다.");
  return templateGroupFromRow(row);
}

async function requireTemplate(
  id: string,
  database: D1Database,
): Promise<SmsTemplate> {
  const row = await database
    .prepare(
      `SELECT t.id, t.group_id, g.name AS group_name, t.name, t.content,
              t.created_at, t.updated_at
       FROM sms_templates t
       LEFT JOIN sms_template_groups g ON g.id = t.group_id
       WHERE t.id = ?`,
    )
    .bind(id)
    .first<SmsTemplateRow>();
  if (!row) throw new AdminApiError(404, "이모티콘을 찾을 수 없습니다.");
  return templateFromRow(row);
}

async function requireMessage(
  id: string,
  database: D1Database,
): Promise<SmsMessage> {
  const row = await database
    .prepare(
      `SELECT m.id, m.content, m.sender, m.recipient_count,
              SUM(CASE WHEN r.status = 'sent' THEN 1 ELSE 0 END) AS success_count,
              SUM(CASE WHEN r.status = 'failed' THEN 1 ELSE 0 END) AS failure_count,
              m.duplicate_count, m.status, m.provider_name, m.requested_by,
              m.scheduled_at, m.sent_at, m.failure_reason,
              m.created_at, m.updated_at
       FROM sms_messages m
       LEFT JOIN sms_message_recipients r ON r.message_id = m.id
       WHERE m.id = ?
       GROUP BY m.id, m.content, m.sender, m.recipient_count,
                m.duplicate_count, m.status, m.provider_name, m.requested_by,
                m.scheduled_at, m.sent_at, m.failure_reason,
                m.created_at, m.updated_at`,
    )
    .bind(id)
    .first<SmsMessageRow>();
  if (!row) throw new AdminApiError(404, "문자 전송 요청을 찾을 수 없습니다.");
  return messageFromRow(row);
}

function settingsFromRow(row: SmsConfigRow): SmsSettings {
  const providerUrl = (env as unknown as SmsEnvironment).SMS_PROVIDER_URL?.trim();
  const providerConfigured = Boolean(providerUrl);
  let unavailableReason = "";
  if (row.enabled !== 1) {
    unavailableReason =
      "SMS 를 사용하지 않고 있기 때문에, 문자 전송을 할 수 없습니다.";
  } else if (!providerConfigured) {
    unavailableReason =
      "SMS 공급사가 설정되지 않아 문자 전송 서비스를 사용할 수 없습니다.";
  } else if (!row.sender) {
    unavailableReason =
      "회신번호가 설정되지 않아 문자 전송 서비스를 사용할 수 없습니다.";
  }
  return {
    enabled: row.enabled === 1,
    sender: row.sender,
    providerName: row.provider_name,
    memo: row.memo,
    providerConfigured,
    available: unavailableReason.length === 0,
    unavailableReason,
    revision: row.revision,
    updatedAt: row.updated_at,
  };
}

function phoneGroupFromRow(row: SmsPhoneGroupRow): SmsPhoneGroup {
  return {
    id: row.id,
    name: row.name,
    totalCount: Number(row.total_count ?? 0),
    memberCount: Number(row.member_count ?? 0),
    nonMemberCount: Number(row.non_member_count ?? 0),
    receiptCount: Number(row.receipt_count ?? 0),
    rejectCount: Number(row.reject_count ?? 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function phoneFromRow(row: SmsPhoneRow): SmsPhone {
  return {
    id: row.id,
    groupId: row.group_id,
    groupName: row.group_name ?? "미분류",
    name: row.name,
    phone: row.phone,
    memberId: row.member_id,
    source: row.source,
    receipt: row.receipt === 1,
    memo: row.memo,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function templateGroupFromRow(row: SmsTemplateGroupRow): SmsTemplateGroup {
  return {
    id: row.id,
    name: row.name,
    templateCount: Number(row.template_count ?? 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function templateFromRow(row: SmsTemplateRow): SmsTemplate {
  return {
    id: row.id,
    groupId: row.group_id,
    groupName: row.group_name ?? "미분류",
    name: row.name,
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function messageFromRow(row: SmsMessageRow): SmsMessage {
  return {
    id: row.id,
    content: row.content,
    sender: row.sender,
    recipientCount: Number(row.recipient_count ?? 0),
    successCount: Number(row.success_count ?? 0),
    failureCount: Number(row.failure_count ?? 0),
    duplicateCount: Number(row.duplicate_count ?? 0),
    status: row.status,
    providerName: row.provider_name,
    requestedBy: row.requested_by,
    scheduledAt: row.scheduled_at,
    sentAt: row.sent_at,
    failureReason: row.failure_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function recipientFromRow(row: SmsRecipientRow): SmsMessageRecipient {
  return {
    id: row.id,
    messageId: row.message_id,
    groupName: row.group_name ?? "없음",
    phoneId: row.phone_id,
    memberId: row.member_id,
    name: row.name,
    phone: row.phone,
    status: row.status,
    lastError: row.last_error,
    createdAt: row.created_at,
    sentAt: row.sent_at,
    messageContent: row.message_content,
    scheduledAt: row.scheduled_at,
  };
}

function objectInput(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AdminApiError(400, "요청 형식이 올바르지 않습니다.");
  }
  return value as Record<string, unknown>;
}

function stringInput(
  value: unknown,
  field: string,
  maximumLength: number,
): string {
  if (typeof value !== "string" || value.length > maximumLength) {
    throw new AdminApiError(400, "입력값을 확인해 주세요.", {
      [field]: "입력값이 올바르지 않습니다.",
    });
  }
  return value;
}

function requiredTrimmed(
  value: unknown,
  field: string,
  maximumLength: number,
): string {
  const normalized = stringInput(value, field, maximumLength).trim();
  if (!normalized) {
    throw new AdminApiError(400, "필수값을 입력해 주세요.", {
      [field]: "필수 입력 항목입니다.",
    });
  }
  return normalized;
}

function optionalString(value: unknown, maximumLength: number): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string" || value.length > maximumLength) {
    throw new AdminApiError(400, "입력값이 너무 깁니다.");
  }
  return value.trim();
}

function booleanInput(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new AdminApiError(400, "입력값을 확인해 주세요.", {
      [field]: "사용 여부를 선택해 주세요.",
    });
  }
  return value;
}

function positiveInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) {
    throw new AdminApiError(400, "입력값을 확인해 주세요.", {
      [field]: "올바른 버전 정보가 필요합니다.",
    });
  }
  return Number(value);
}

function validId(value: unknown): string {
  if (typeof value !== "string" || !idPattern.test(value)) {
    throw new AdminApiError(400, "식별자가 올바르지 않습니다.");
  }
  return value;
}

function optionalId(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  return validId(value);
}

function idArray(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_RECIPIENTS) {
    throw new AdminApiError(400, "대상을 하나 이상 선택해 주세요.");
  }
  return [...new Set(value.map(validId))];
}

function normalizePhone(value: string, field: string): string {
  const phone = value.replace(/\D/gu, "");
  if (!phonePattern.test(phone)) {
    throw new AdminApiError(400, "휴대폰번호를 확인해 주세요.", {
      [field]: "휴대폰번호 형식이 올바르지 않습니다.",
    });
  }
  return phone;
}

function normalizePhoneOrNull(value: string): string | null {
  const phone = value.replace(/\D/gu, "");
  return phonePattern.test(phone) ? phone : null;
}

function messageContent(value: unknown): string {
  const content = requiredTrimmed(value, "content", MAX_MESSAGE_BYTES);
  const byteLength = new TextEncoder().encode(content).byteLength;
  if (byteLength > MAX_MESSAGE_BYTES) {
    throw new AdminApiError(400, "문자 내용이 너무 깁니다.", {
      content: `문자 내용은 ${MAX_MESSAGE_BYTES.toLocaleString("ko-KR")}바이트 이하여야 합니다.`,
    });
  }
  return content;
}

function parseManualRecipients(
  value: unknown,
): { name: string; phone: string }[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > MAX_RECIPIENTS) {
    throw new AdminApiError(400, "받는 사람 목록이 올바르지 않습니다.");
  }
  return value.map((item) => {
    const record = objectInput(item);
    return {
      name: optionalString(record.name, MAX_NAME_LENGTH) || "비회원",
      phone: normalizePhone(
        stringInput(record.phone, "phone", 30),
        "phone",
      ),
    };
  });
}

function optionalSchedule(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.length > 40) {
    throw new AdminApiError(400, "예약 일시가 올바르지 않습니다.");
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new AdminApiError(400, "예약 일시가 올바르지 않습니다.");
  }
  if (date.getTime() < Date.now() - 60_000) {
    throw new AdminApiError(400, "예약 일시는 현재 이후로 선택해 주세요.");
  }
  return date.toISOString();
}

function safeIdFragment(value: string): string {
  const normalized = value.replace(/[^A-Za-z0-9_-]/gu, "_").slice(0, 48);
  return normalized || crypto.randomUUID();
}

function isConstraintError(error: unknown): boolean {
  return (
    error instanceof Error &&
    /constraint|unique|duplicate/iu.test(error.message)
  );
}
