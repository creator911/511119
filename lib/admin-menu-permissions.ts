import { env } from "cloudflare:workers";
import { AdminApiError } from "@/lib/admin-api";
import {
  adminAccountsDatabase,
  ensureAdminAccountsSchema,
} from "@/lib/admin-accounts";
import {
  ADMIN_LEGACY_MENU_OPTIONS,
  adminLegacyMenuOption,
} from "@/lib/admin-menu-catalog";
import { ensureCommerceSchema } from "@/lib/commerce-db";

export interface AdminMenuPermissionRecord {
  id: string;
  accountId: string;
  username: string;
  nickname: string;
  menuCode: string;
  menuLabel: string;
  auth: string;
  revision: number;
  updatedAt: string;
}

export interface AdminMenuPermissionPage {
  rows: AdminMenuPermissionRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  query: string;
}

export interface AdminPermissionChallenge {
  id: string;
  code: string;
  expiresAt: string;
}

interface PermissionDatabaseRow {
  id: number;
  admin_id: number;
  username: string;
  nickname: string | null;
  member_name: string | null;
  menu_code: string;
  auth_flags: string;
  revision: number;
  updated_at: string;
}

interface PermissionTargetRow {
  id: number;
  admin_id: number;
  username: string;
  member_user_id: string | null;
  menu_code: string;
  revision: number;
}

interface LinkedMember {
  id: string;
  login_id: string;
  nickname: string;
  name: string;
  active: number;
}

interface LinkedAdmin {
  id: number;
  username: string;
  member_user_id: string | null;
}

interface PermissionWriteOptions {
  actorUsername: string;
  actorAdminId?: number | null;
  primaryUsername: string;
  database?: D1Database;
}

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const MAX_QUERY_LENGTH = 100;
const CAPTCHA_TTL_MS = 5 * 60 * 1_000;
const MAX_DELETE_RECORDS = 100;
const MEMBER_LINK_PASSWORD_SENTINEL = "!member-password-hash-not-copied!";
const usernamePattern =
  /^[A-Za-z0-9](?:[A-Za-z0-9._-]{1,62}[A-Za-z0-9])$/u;

export async function listAdminMenuPermissions(
  input: {
    page?: number;
    pageSize?: number;
    query?: string;
    database?: D1Database;
  } = {},
): Promise<AdminMenuPermissionPage> {
  const database = input.database ?? adminAccountsDatabase();
  await ensurePermissionSchema(database, !input.database);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    positiveInteger(input.pageSize, DEFAULT_PAGE_SIZE),
  );
  const requestedPage = positiveInteger(input.page, 1);
  const query = cleanQuery(input.query);
  const where = query
    ? "WHERE lower(a.username) LIKE lower(?)"
    : "";
  const bindings = query ? [`%${query}%`] : [];
  const count = await database
    .prepare(
      `SELECT COUNT(*) AS total
       FROM admin_menu_permissions p
       JOIN admins a ON a.id = p.admin_id
       ${where}`,
    )
    .bind(...bindings)
    .first<{ total: number }>();
  const total = Math.max(0, Number(count?.total ?? 0));
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const offset = (page - 1) * pageSize;
  const result = await database
    .prepare(
      `SELECT
         p.id, p.admin_id, a.username, u.nickname, u.name AS member_name,
         p.menu_code, p.auth_flags, p.revision, p.updated_at
       FROM admin_menu_permissions p
       JOIN admins a ON a.id = p.admin_id
       LEFT JOIN users u ON u.id = a.member_user_id
       ${where}
       ORDER BY a.username COLLATE NOCASE ASC, p.menu_code ASC, p.id ASC
       LIMIT ? OFFSET ?`,
    )
    .bind(...bindings, pageSize, offset)
    .all<PermissionDatabaseRow>();

  return {
    rows: (result.results ?? []).flatMap((row) => {
      const menu = adminLegacyMenuOption(row.menu_code);
      return menu
        ? [
            {
              id: String(row.id),
              accountId: String(row.admin_id),
              username: row.username,
              nickname: row.nickname || row.member_name || row.username,
              menuCode: row.menu_code,
              menuLabel: menu.label,
              auth: normalizeAuthFlags(row.auth_flags),
              revision: safeRevision(row.revision),
              updatedAt: row.updated_at,
            },
          ]
        : [];
    }),
    total,
    page,
    pageSize,
    totalPages,
    query,
  };
}

export async function createAdminPermissionChallenge(
  adminUsername: string,
  databaseOverride?: D1Database,
): Promise<AdminPermissionChallenge> {
  const database = databaseOverride ?? adminAccountsDatabase();
  await ensurePermissionSchema(database, !databaseOverride);
  const id = crypto.randomUUID();
  const code = randomCaptchaCode();
  const now = Date.now();
  const expiresAt = now + CAPTCHA_TTL_MS;
  const answerHash = await challengeHash(id, code);
  await database.batch([
    database
      .prepare(
        "DELETE FROM admin_permission_challenges WHERE expires_at < ? OR admin_username = ?",
      )
      .bind(now, adminUsername.slice(0, 128)),
    database
      .prepare(
        `INSERT INTO admin_permission_challenges (
           id, admin_username, answer_hash, expires_at
         ) VALUES (?, ?, ?, ?)`,
      )
      .bind(
        id,
        adminUsername.slice(0, 128),
        answerHash,
        expiresAt,
      ),
  ]);
  return {
    id,
    code,
    expiresAt: new Date(expiresAt).toISOString(),
  };
}

export async function grantAdminMenuPermission(
  input: unknown,
  options: PermissionWriteOptions,
): Promise<AdminMenuPermissionRecord> {
  const value = validateGrantInput(input);
  const database = options.database ?? adminAccountsDatabase();
  await ensurePermissionSchema(database, !options.database);
  await consumeChallenge(
    database,
    options.actorUsername,
    value.captchaId,
    value.captchaAnswer,
  );
  if (
    options.primaryUsername &&
    value.username.toLocaleLowerCase("en-US") ===
      options.primaryUsername.toLocaleLowerCase("en-US")
  ) {
    throw new AdminApiError(
      409,
      "최고관리자는 관리권한 목록에 추가할 수 없습니다.",
      { username: "다른 회원아이디를 입력해 주세요." },
    );
  }

  const member = await findActiveMember(database, value.username);
  if (!member) {
    throw new AdminApiError(
      404,
      "등록된 회원아이디를 찾을 수 없습니다.",
      { username: "회원관리에서 사용 중인 회원아이디를 입력해 주세요." },
    );
  }
  let admin = await findAdminByUsername(database, member.login_id);
  if (!admin) {
    const inserted = await database
      .prepare(
        `INSERT INTO admins (
           username, password_hash, member_user_id, active,
           permissions_json, session_version, updated_at
         ) VALUES (?, ?, ?, 1, '[]', 1, CURRENT_TIMESTAMP)
         RETURNING id, username, member_user_id`,
      )
      .bind(
        member.login_id,
        MEMBER_LINK_PASSWORD_SENTINEL,
        member.id,
      )
      .first<LinkedAdmin>();
    if (!inserted) {
      throw new AdminApiError(500, "보조관리자 연결을 만들지 못했습니다.");
    }
    admin = inserted;
  } else if (
    admin.member_user_id &&
    admin.member_user_id !== member.id
  ) {
    throw new AdminApiError(
      409,
      "다른 회원과 연결된 관리자 아이디입니다.",
    );
  }

  const current = await database
    .prepare(
      `SELECT id, revision
       FROM admin_menu_permissions
       WHERE admin_id = ? AND menu_code = ?
       LIMIT 1`,
    )
    .bind(admin.id, value.menuCode)
    .first<{ id: number; revision: number }>();
  if (current && safeRevision(current.revision) !== value.expectedRevision) {
    throw stalePermission();
  }
  if (!current && value.expectedRevision !== 0) {
    throw stalePermission();
  }

  let permissionId: number;
  if (current) {
    const update = await database
      .prepare(
        `UPDATE admin_menu_permissions
         SET auth_flags = ?, revision = revision + 1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND revision = ?
         RETURNING id`,
      )
      .bind(value.auth, current.id, value.expectedRevision)
      .first<{ id: number }>();
    if (!update) throw stalePermission();
    permissionId = update.id;
  } else {
    const inserted = await database
      .prepare(
        `INSERT INTO admin_menu_permissions (
           admin_id, menu_code, auth_flags, revision, updated_at
         ) VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP)
         RETURNING id`,
      )
      .bind(admin.id, value.menuCode, value.auth)
      .first<{ id: number }>();
    if (!inserted) {
      throw new AdminApiError(500, "관리권한을 추가하지 못했습니다.");
    }
    permissionId = inserted.id;
  }

  await writeAudit(database, options, "admin.menu-permission.grant", {
    permissionId,
    targetUsername: admin.username,
    menuCode: value.menuCode,
    auth: value.auth,
  });
  const record = await findPermissionRecord(database, permissionId);
  if (!record) {
    throw new AdminApiError(500, "저장된 관리권한을 찾지 못했습니다.");
  }
  return record;
}

export async function deleteAdminMenuPermissions(
  input: unknown,
  options: PermissionWriteOptions,
): Promise<string[]> {
  const records = validateDeleteInput(input);
  const database = options.database ?? adminAccountsDatabase();
  await ensurePermissionSchema(database, !options.database);
  const ids = records.map((record) => record.id);
  const placeholders = ids.map(() => "?").join(", ");
  const current = await database
    .prepare(
      `SELECT
         p.id, p.admin_id, a.username, a.member_user_id,
         p.menu_code, p.revision
       FROM admin_menu_permissions p
       JOIN admins a ON a.id = p.admin_id
       WHERE p.id IN (${placeholders})
       ORDER BY p.id`,
    )
    .bind(...ids)
    .all<PermissionTargetRow>();
  const currentById = new Map(
    (current.results ?? []).map((record) => [record.id, record]),
  );
  for (const requested of records) {
    const found = currentById.get(requested.id);
    if (!found) {
      throw new AdminApiError(404, "삭제할 관리권한을 찾을 수 없습니다.");
    }
    if (safeRevision(found.revision) !== requested.revision) {
      throw stalePermission();
    }
  }

  const statements: D1PreparedStatement[] = records.map((record) =>
    database
      .prepare(
        "DELETE FROM admin_menu_permissions WHERE id = ? AND revision = ?",
      )
      .bind(record.id, record.revision),
  );
  for (const record of current.results ?? []) {
    statements.push(
      auditStatement(
        database,
        options,
        "admin.menu-permission.delete",
        {
          permissionId: record.id,
          targetUsername: record.username,
          menuCode: record.menu_code,
        },
      ),
    );
  }
  const results = await database.batch(statements);
  for (let index = 0; index < records.length; index += 1) {
    if (!results[index]?.meta.changes) throw stalePermission();
  }

  const linkedAdminIds = [
    ...new Set(
      (current.results ?? [])
        .filter((record) => record.member_user_id)
        .map((record) => record.admin_id),
    ),
  ];
  for (const adminId of linkedAdminIds) {
    await database
      .prepare(
        `DELETE FROM admins
         WHERE id = ? AND member_user_id IS NOT NULL
           AND NOT EXISTS (
             SELECT 1 FROM admin_menu_permissions
             WHERE admin_id = admins.id
           )`,
      )
      .bind(adminId)
      .run();
  }
  return ids.map(String);
}

async function ensurePermissionSchema(
  database: D1Database,
  usesApplicationDatabase: boolean,
): Promise<void> {
  if (usesApplicationDatabase) {
    await ensureCommerceSchema();
  }
  await ensureAdminAccountsSchema(database);
}

async function findActiveMember(
  database: D1Database,
  username: string,
): Promise<LinkedMember | null> {
  return database
    .prepare(
      `SELECT id, login_id, nickname, name, active
       FROM users
       WHERE lower(login_id) = lower(?) AND active = 1
       LIMIT 1`,
    )
    .bind(username)
    .first<LinkedMember>();
}

async function findAdminByUsername(
  database: D1Database,
  username: string,
): Promise<LinkedAdmin | null> {
  return database
    .prepare(
      `SELECT id, username, member_user_id
       FROM admins
       WHERE lower(username) = lower(?)
       LIMIT 1`,
    )
    .bind(username)
    .first<LinkedAdmin>();
}

async function findPermissionRecord(
  database: D1Database,
  id: number,
): Promise<AdminMenuPermissionRecord | null> {
  const row = await database
    .prepare(
      `SELECT
         p.id, p.admin_id, a.username, u.nickname, u.name AS member_name,
         p.menu_code, p.auth_flags, p.revision, p.updated_at
       FROM admin_menu_permissions p
       JOIN admins a ON a.id = p.admin_id
       LEFT JOIN users u ON u.id = a.member_user_id
       WHERE p.id = ?
       LIMIT 1`,
    )
    .bind(id)
    .first<PermissionDatabaseRow>();
  if (!row) return null;
  const menu = adminLegacyMenuOption(row.menu_code);
  if (!menu) return null;
  return {
    id: String(row.id),
    accountId: String(row.admin_id),
    username: row.username,
    nickname: row.nickname || row.member_name || row.username,
    menuCode: row.menu_code,
    menuLabel: menu.label,
    auth: normalizeAuthFlags(row.auth_flags),
    revision: safeRevision(row.revision),
    updatedAt: row.updated_at,
  };
}

async function consumeChallenge(
  database: D1Database,
  adminUsername: string,
  id: string,
  answer: string,
): Promise<void> {
  const hash = await challengeHash(id, answer);
  const consumed = await database
    .prepare(
      `DELETE FROM admin_permission_challenges
       WHERE id = ? AND admin_username = ?
       RETURNING id, answer_hash, expires_at`,
    )
    .bind(id, adminUsername.slice(0, 128))
    .first<{
      id: string;
      answer_hash: string;
      expires_at: number;
    }>();
  if (
    !consumed ||
    Number(consumed.expires_at) < Date.now() ||
    !timingSafeHexEqual(consumed.answer_hash, hash)
  ) {
    throw new AdminApiError(
      400,
      "자동등록방지 문자가 올바르지 않거나 만료되었습니다.",
      { captcha: "새 문자를 확인한 뒤 다시 입력해 주세요." },
    );
  }
}

function timingSafeHexEqual(left: string, right: string): boolean {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    difference |=
      (left.charCodeAt(index) || 0) ^
      (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

async function challengeHash(id: string, answer: string): Promise<string> {
  const secret = (
    env as unknown as { SESSION_SECRET?: string }
  ).SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new AdminApiError(
      503,
      "자동등록방지 검증키가 준비되지 않았습니다.",
    );
  }
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(`admin-permission\0${id}\0${answer}`),
    ),
  );
  return [...digest]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function randomCaptchaCode(): string {
  const values = crypto.getRandomValues(new Uint32Array(1));
  return String(10_000 + (values[0] % 90_000));
}

function validateGrantInput(input: unknown): {
  username: string;
  menuCode: string;
  auth: string;
  expectedRevision: number;
  captchaId: string;
  captchaAnswer: string;
} {
  const value = inputObject(input);
  const username =
    typeof value.username === "string" ? value.username.trim() : "";
  const menuCode =
    typeof value.menuCode === "string" ? value.menuCode : "";
  const flags = Array.isArray(value.auth)
    ? value.auth.map(String)
    : typeof value.auth === "string"
      ? value.auth.split("")
      : [];
  const auth = normalizeAuthFlags(flags.join(""));
  const expectedRevision = Number(value.expectedRevision ?? 0);
  const captchaId =
    typeof value.captchaId === "string" ? value.captchaId : "";
  const captchaAnswer =
    typeof value.captchaAnswer === "string"
      ? value.captchaAnswer.trim()
      : "";
  if (
    username.length < 3 ||
    username.length > 64 ||
    !usernamePattern.test(username)
  ) {
    throw new AdminApiError(400, "회원아이디를 확인해 주세요.", {
      username: "영문, 숫자, 점, 밑줄, 하이픈으로 3~64자를 입력해 주세요.",
    });
  }
  if (!adminLegacyMenuOption(menuCode)) {
    throw new AdminApiError(400, "접근가능메뉴를 선택해 주세요.", {
      menuCode: "목록에 있는 관리 메뉴만 선택할 수 있습니다.",
    });
  }
  if (!auth) {
    throw new AdminApiError(400, "권한을 하나 이상 지정해 주세요.", {
      auth: "r, w, d 중 하나 이상 선택해 주세요.",
    });
  }
  if (
    !Number.isSafeInteger(expectedRevision) ||
    expectedRevision < 0
  ) {
    throw new AdminApiError(400, "관리권한 변경 기준값이 올바르지 않습니다.");
  }
  if (
    !/^[0-9a-f-]{36}$/iu.test(captchaId) ||
    !/^\d{5}$/u.test(captchaAnswer)
  ) {
    throw new AdminApiError(400, "자동등록방지 문자를 확인해 주세요.", {
      captcha: "화면에 표시된 숫자 5자리를 입력해 주세요.",
    });
  }
  return {
    username,
    menuCode,
    auth,
    expectedRevision,
    captchaId,
    captchaAnswer,
  };
}

function validateDeleteInput(
  input: unknown,
): Array<{ id: number; revision: number }> {
  const value = inputObject(input);
  if (
    !Array.isArray(value.records) ||
    value.records.length === 0 ||
    value.records.length > MAX_DELETE_RECORDS
  ) {
    throw new AdminApiError(
      400,
      "삭제할 관리권한을 하나 이상 선택해 주세요.",
    );
  }
  const records = value.records.map((item) => {
    const record = inputObject(item);
    const id = Number(record.id);
    const revision = Number(record.revision);
    if (
      !Number.isSafeInteger(id) ||
      id <= 0 ||
      !Number.isSafeInteger(revision) ||
      revision <= 0
    ) {
      throw new AdminApiError(
        400,
        "삭제할 관리권한 정보가 올바르지 않습니다.",
      );
    }
    return { id, revision };
  });
  if (new Set(records.map((record) => record.id)).size !== records.length) {
    throw new AdminApiError(400, "중복된 관리권한이 선택되었습니다.");
  }
  return records;
}

function normalizeAuthFlags(value: string): string {
  return ["r", "w", "d"]
    .filter((flag) => value.includes(flag))
    .join("");
}

function inputObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AdminApiError(400, "요청 내용을 확인해 주세요.");
  }
  return value as Record<string, unknown>;
}

function cleanQuery(value: string | undefined): string {
  return (value ?? "").trim().slice(0, MAX_QUERY_LENGTH);
}

function positiveInteger(
  value: number | undefined,
  fallback: number,
): number {
  return Number.isSafeInteger(value) && (value ?? 0) > 0
    ? Number(value)
    : fallback;
}

function safeRevision(value: number): number {
  return Number.isSafeInteger(value) && value > 0 ? value : 1;
}

function stalePermission(): AdminApiError {
  return new AdminApiError(
    409,
    "관리권한이 다른 화면에서 변경되었습니다. 목록을 새로 불러와 주세요.",
  );
}

async function writeAudit(
  database: D1Database,
  options: PermissionWriteOptions,
  action: string,
  details: Record<string, unknown>,
): Promise<void> {
  await auditStatement(database, options, action, details).run();
}

function auditStatement(
  database: D1Database,
  options: PermissionWriteOptions,
  action: string,
  details: Record<string, unknown>,
): D1PreparedStatement {
  return database
    .prepare(
      `INSERT INTO admin_audit_logs (
         admin_id, action, entity_type, entity_id, details
       ) VALUES (?, ?, 'admin_menu_permission', ?, ?)`,
    )
    .bind(
      options.actorAdminId ?? null,
      action,
      String(details.permissionId ?? "").slice(0, 128),
      JSON.stringify({
        actorUsername: options.actorUsername.slice(0, 128),
        ...details,
      }),
    );
}

export const ADMIN_PERMISSION_MENU_OPTIONS =
  ADMIN_LEGACY_MENU_OPTIONS;
