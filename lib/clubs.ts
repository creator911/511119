import { AdminApiError } from "@/lib/admin-api";
import { getLegacyAdminToolSettings } from "@/lib/admin-tools";
import { commerceDb, ensureCommerceSchema } from "@/lib/commerce-db";
import { isJsonObject } from "@/lib/http-boundary";

export type ClubStatus = "pending" | "approved" | "rejected";
export type ClubSource = "application" | "admin";

export interface Club {
  id: string;
  slug: string;
  name: string;
  description: string;
  contact: string;
  ownerUserId: string;
  ownerName: string;
  source: ClubSource;
  status: ClubStatus;
  adminMemo: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
}

export interface ClubSettings {
  enabled: boolean;
  minimumLevel: number;
  approvalRequired: boolean;
}

interface ClubRow {
  id: string;
  slug: string;
  name: string;
  description: string;
  contact: string;
  owner_user_id: string;
  owner_name: string;
  source: ClubSource;
  status: ClubStatus;
  admin_memo: string;
  revision: number;
  created_at: string;
  updated_at: string;
  approved_at: string | null;
}

let clubSchemaInitialization: Promise<void> | null = null;

export async function ensureClubSchema(): Promise<void> {
  if (!clubSchemaInitialization) {
    clubSchemaInitialization = ensureCommerceSchema()
      .then(async () => {
        const database = commerceDb();
        await database.batch([
          database.prepare(`CREATE TABLE IF NOT EXISTS clubs (
            id TEXT PRIMARY KEY,
            slug TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            contact TEXT NOT NULL DEFAULT '',
            owner_user_id TEXT NOT NULL DEFAULT '',
            owner_name TEXT NOT NULL DEFAULT '',
            source TEXT NOT NULL DEFAULT 'application'
              CHECK(source IN ('application', 'admin')),
            status TEXT NOT NULL DEFAULT 'pending'
              CHECK(status IN ('pending', 'approved', 'rejected')),
            admin_memo TEXT NOT NULL DEFAULT '',
            revision INTEGER NOT NULL DEFAULT 1 CHECK(revision >= 1),
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            approved_at TEXT
          )`),
          database.prepare(
            "CREATE INDEX IF NOT EXISTS clubs_status_created_idx ON clubs(status, created_at)",
          ),
          database.prepare(
            "CREATE INDEX IF NOT EXISTS clubs_owner_idx ON clubs(owner_user_id, created_at)",
          ),
        ]);
      })
      .catch((error) => {
        clubSchemaInitialization = null;
        throw error;
      });
  }
  await clubSchemaInitialization;
}

export async function getClubSettings(): Promise<ClubSettings> {
  const settings = await getLegacyAdminToolSettings("club-settings");
  return {
    enabled: settings.enabled === true,
    minimumLevel: boundedInteger(settings.minimumLevel, 1, 100, 2),
    approvalRequired: settings.approvalRequired !== false,
  };
}

export async function listApprovedClubs(): Promise<Club[]> {
  await ensureClubSchema();
  const result = await commerceDb()
    .prepare(
      `SELECT ${clubColumns()}
       FROM clubs
       WHERE status = 'approved'
       ORDER BY approved_at DESC, created_at DESC
       LIMIT 500`,
    )
    .all<ClubRow>();
  return (result.results ?? []).map(mapClub);
}

export async function listMemberClubApplications(
  ownerUserId: string,
): Promise<Club[]> {
  await ensureClubSchema();
  const result = await commerceDb()
    .prepare(
      `SELECT ${clubColumns()}
       FROM clubs
       WHERE owner_user_id = ? AND source = 'application'
       ORDER BY created_at DESC
       LIMIT 50`,
    )
    .bind(normalizedIdentifier(ownerUserId, "회원"))
    .all<ClubRow>();
  return (result.results ?? []).map(mapClub);
}

export async function listAdminClubs(
  options: { status?: ClubStatus; limit?: number } = {},
): Promise<Club[]> {
  await ensureClubSchema();
  const limit = boundedInteger(options.limit, 1, 1_000, 500);
  const query = options.status
    ? commerceDb()
        .prepare(
          `SELECT ${clubColumns()}
           FROM clubs
           WHERE status = ?
           ORDER BY created_at DESC
           LIMIT ?`,
        )
        .bind(options.status, limit)
    : commerceDb()
        .prepare(
          `SELECT ${clubColumns()}
           FROM clubs
           ORDER BY created_at DESC
           LIMIT ?`,
        )
        .bind(limit);
  const result = await query.all<ClubRow>();
  return (result.results ?? []).map(mapClub);
}

export async function createClubApplication(
  input: unknown,
  member: { userId: string; name: string },
): Promise<Club> {
  if (!isJsonObject(input)) {
    throw new AdminApiError(400, "동호회 신청 형식을 확인해 주세요.");
  }
  const settings = await getClubSettings();
  if (!settings.enabled) {
    throw new AdminApiError(403, "현재 동호회 개설 신청을 받지 않습니다.");
  }

  await ensureClubSchema();
  const database = commerceDb();
  const user = await database
    .prepare("SELECT name, level, active FROM users WHERE id = ? LIMIT 1")
    .bind(normalizedIdentifier(member.userId, "회원"))
    .first<{ name: string; level: number; active: number }>();
  if (!user?.active) {
    throw new AdminApiError(401, "회원 로그인이 필요합니다.");
  }
  if (Number(user.level) < settings.minimumLevel) {
    throw new AdminApiError(
      403,
      `회원 레벨 ${settings.minimumLevel} 이상부터 신청할 수 있습니다.`,
    );
  }
  const existing = await database
    .prepare(
      `SELECT id FROM clubs
       WHERE owner_user_id = ? AND status IN ('pending', 'approved')
       LIMIT 1`,
    )
    .bind(member.userId)
    .first<{ id: string }>();
  if (existing) {
    throw new AdminApiError(
      409,
      "이미 심사 중이거나 승인된 동호회가 있습니다.",
    );
  }

  const values = parseClubInput(input, {
    requireOwnerName: false,
    defaultStatus: settings.approvalRequired ? "pending" : "approved",
  });
  const id = crypto.randomUUID();
  const nowApproved =
    values.status === "approved" ? new Date().toISOString() : null;
  await database
    .prepare(
      `INSERT INTO clubs (
         id, slug, name, description, contact, owner_user_id, owner_name,
         source, status, admin_memo, approved_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, 'application', ?, '', ?)`,
    )
    .bind(
      id,
      uniqueSlug(values.name, id),
      values.name,
      values.description,
      values.contact,
      member.userId,
      user.name || member.name,
      values.status,
      nowApproved,
    )
    .run();
  const created = await findClub(database, id);
  if (!created) throw new Error("등록한 동호회 신청을 찾을 수 없습니다.");
  return created;
}

export async function createAdminClub(
  input: unknown,
  adminUsername: string,
): Promise<Club> {
  const values = parseClubInput(input, {
    requireOwnerName: true,
    defaultStatus: "approved",
  });
  await ensureClubSchema();
  const database = commerceDb();
  const id = crypto.randomUUID();
  await database
    .prepare(
      `INSERT INTO clubs (
         id, slug, name, description, contact, owner_user_id, owner_name,
         source, status, admin_memo, approved_at
       ) VALUES (?, ?, ?, ?, ?, '', ?, 'admin', ?, ?, ?)`,
    )
    .bind(
      id,
      uniqueSlug(values.name, id),
      values.name,
      values.description,
      values.contact,
      values.ownerName,
      values.status,
      values.adminMemo,
      values.status === "approved" ? new Date().toISOString() : null,
    )
    .run();
  await writeClubAudit(
    database,
    adminUsername,
    "club.create",
    id,
    `${values.name} (${values.status})`,
  );
  const created = await findClub(database, id);
  if (!created) throw new Error("등록한 동호회를 찾을 수 없습니다.");
  return created;
}

export async function updateAdminClub(
  clubId: string,
  input: unknown,
  adminUsername: string,
): Promise<Club> {
  if (!isJsonObject(input)) {
    throw new AdminApiError(400, "동호회 수정 형식을 확인해 주세요.");
  }
  const values = parseClubInput(input, {
    requireOwnerName: true,
    defaultStatus: "pending",
  });
  const revision = boundedInteger(input.revision, 1, 2_147_483_647, 0);
  if (!revision) {
    throw new AdminApiError(400, "최신 동호회 자료를 다시 불러와 주세요.");
  }
  const id = normalizedIdentifier(clubId, "동호회");
  await ensureClubSchema();
  const database = commerceDb();
  const result = await database
    .prepare(
      `UPDATE clubs
       SET name = ?, description = ?, contact = ?, owner_name = ?,
           status = ?, admin_memo = ?, revision = revision + 1,
           approved_at = CASE
             WHEN ? = 'approved' THEN COALESCE(approved_at, CURRENT_TIMESTAMP)
             ELSE NULL
           END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND revision = ?`,
    )
    .bind(
      values.name,
      values.description,
      values.contact,
      values.ownerName,
      values.status,
      values.adminMemo,
      values.status,
      id,
      revision,
    )
    .run();
  if (!result.meta.changes) {
    const exists = await database
      .prepare("SELECT id FROM clubs WHERE id = ? LIMIT 1")
      .bind(id)
      .first<{ id: string }>();
    throw new AdminApiError(
      exists ? 409 : 404,
      exists
        ? "다른 관리자가 먼저 수정했습니다. 목록을 새로고침해 주세요."
        : "동호회를 찾을 수 없습니다.",
    );
  }
  await writeClubAudit(
    database,
    adminUsername,
    "club.update",
    id,
    `${values.name} (${values.status})`,
  );
  const updated = await findClub(database, id);
  if (!updated) throw new Error("수정한 동호회를 찾을 수 없습니다.");
  return updated;
}

export async function deleteAdminClub(
  clubId: string,
  adminUsername: string,
): Promise<void> {
  const id = normalizedIdentifier(clubId, "동호회");
  await ensureClubSchema();
  const database = commerceDb();
  const result = await database
    .prepare("DELETE FROM clubs WHERE id = ?")
    .bind(id)
    .run();
  if (!result.meta.changes) {
    throw new AdminApiError(404, "동호회를 찾을 수 없습니다.");
  }
  await writeClubAudit(
    database,
    adminUsername,
    "club.delete",
    id,
    "동호회 삭제",
  );
}

function parseClubInput(
  input: unknown,
  options: { requireOwnerName: boolean; defaultStatus: ClubStatus },
): {
  name: string;
  description: string;
  contact: string;
  ownerName: string;
  status: ClubStatus;
  adminMemo: string;
} {
  if (!isJsonObject(input)) {
    throw new AdminApiError(400, "동호회 입력 형식을 확인해 주세요.");
  }
  const name = textValue(input.name, 100);
  const description = textValue(input.description, 2_000);
  const contact = textValue(input.contact, 200);
  const ownerName = textValue(input.ownerName, 100);
  const adminMemo = textValue(input.adminMemo, 2_000);
  const status = isClubStatus(input.status)
    ? input.status
    : options.defaultStatus;
  const errors: Record<string, string> = {};
  if (!name) errors.name = "동호회 이름을 입력해 주세요.";
  if (!description) errors.description = "동호회 소개를 입력해 주세요.";
  if (options.requireOwnerName && !ownerName) {
    errors.ownerName = "운영자 이름을 입력해 주세요.";
  }
  if (Object.keys(errors).length > 0) {
    throw new AdminApiError(400, "입력 내용을 확인해 주세요.", errors);
  }
  return {
    name,
    description,
    contact,
    ownerName,
    status,
    adminMemo,
  };
}

function clubColumns(): string {
  return `id, slug, name, description, contact, owner_user_id, owner_name,
          source, status, admin_memo, revision, created_at, updated_at,
          approved_at`;
}

async function findClub(
  database: D1Database,
  id: string,
): Promise<Club | null> {
  const row = await database
    .prepare(`SELECT ${clubColumns()} FROM clubs WHERE id = ? LIMIT 1`)
    .bind(id)
    .first<ClubRow>();
  return row ? mapClub(row) : null;
}

function mapClub(row: ClubRow): Club {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    contact: row.contact,
    ownerUserId: row.owner_user_id,
    ownerName: row.owner_name,
    source: row.source,
    status: row.status,
    adminMemo: row.admin_memo,
    revision: Number(row.revision),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    approvedAt: row.approved_at,
  };
}

function textValue(value: unknown, maximum: number): string {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  if (normalized.length > maximum) {
    throw new AdminApiError(
      400,
      `입력 내용은 ${maximum.toLocaleString("ko-KR")}자 이내여야 합니다.`,
    );
  }
  return normalized;
}

function normalizedIdentifier(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9_-]{1,128}$/u.test(value)
  ) {
    throw new AdminApiError(400, `${label} 식별자를 확인해 주세요.`);
  }
  return value;
}

function uniqueSlug(name: string, id: string): string {
  const base = name
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 60);
  return `${base || "club"}-${id.replace(/-/gu, "").slice(0, 12)}`;
}

function isClubStatus(value: unknown): value is ClubStatus {
  return value === "pending" || value === "approved" || value === "rejected";
}

function boundedInteger(
  value: unknown,
  minimum: number,
  maximum: number,
  fallback: number,
): number {
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) &&
    numeric >= minimum &&
    numeric <= maximum
    ? numeric
    : fallback;
}

async function writeClubAudit(
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
       ) VALUES (?, 'club', ?, ?)`,
    )
    .bind(
      action,
      entityId,
      `${adminUsername.trim().slice(0, 128) || "admin"}: ${details}`,
    )
    .run();
}
