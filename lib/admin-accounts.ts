import { env } from "cloudflare:workers";
import { AdminApiError } from "@/lib/admin-api";
import {
  ADMIN_PERMISSION_OPTIONS,
  normalizeAdminPermissions,
  parseStoredAdminPermissions,
  type AdminGrantedPermission,
  type AdminPermissionScope,
} from "@/lib/admin-permissions";
import { adminMenuPermissionToken } from "@/lib/admin-menu-catalog";
import {
  hashAdminPassword,
  verifyPbkdf2Password,
} from "@/lib/admin-password";
import { verifyCustomerPassword } from "@/lib/customer-auth";

export interface AdminAccount {
  id: string;
  username: string;
  accountType: "primary" | "secondary";
  active: boolean;
  permissions: AdminPermissionScope[];
  lastLoginAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface SecondaryAdminIdentity {
  id: number;
  username: string;
  permissions: AdminGrantedPermission[];
  sessionVersion: number;
}

interface AdminAccountRow {
  id: number;
  username: string;
  password_hash: string;
  member_user_id: string | null;
  active: number;
  permissions_json: string;
  session_version: number;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

interface AdminAccountWriteOptions {
  actorUsername: string;
  actorAdminId?: number | null;
  primaryUsername: string;
  database?: D1Database;
}

interface AdminAccountReadOptions {
  database?: D1Database;
}

const MAX_SECONDARY_ADMINS = 100;
const MAX_MANAGED_USERNAME_LENGTH = 64;
const MAX_LOGIN_USERNAME_LENGTH = 128;
const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 128;
const usernamePattern =
  /^[A-Za-z0-9](?:[A-Za-z0-9._-]{1,62}[A-Za-z0-9])$/u;
const schemaInitializations = new WeakMap<object, Promise<void>>();

export function adminAccountsDatabase(): D1Database {
  const database = (env as unknown as { DB?: D1Database }).DB;
  if (!database) {
    throw new AdminApiError(
      503,
      "관리자 계정 데이터베이스가 준비되지 않았습니다.",
    );
  }
  return database;
}

export async function ensureAdminAccountsSchema(
  database = adminAccountsDatabase(),
): Promise<void> {
  const key = database as unknown as object;
  let initialization = schemaInitializations.get(key);
  if (!initialization) {
    initialization = initializeAdminAccountsSchema(database).catch((error) => {
      schemaInitializations.delete(key);
      throw error;
    });
    schemaInitializations.set(key, initialization);
  }
  await initialization;
}

export async function listAdminAccounts(
  primaryUsername: string,
  options: AdminAccountReadOptions = {},
): Promise<AdminAccount[]> {
  const database = options.database ?? adminAccountsDatabase();
  await ensureAdminAccountsSchema(database);
  const result = await database
    .prepare(`SELECT id, username, password_hash, member_user_id, active, permissions_json,
                     session_version, last_login_at, created_at, updated_at
              FROM admins
              ORDER BY active DESC, username COLLATE NOCASE ASC, id ASC
              LIMIT 200`)
    .all<AdminAccountRow>();

  const accounts: AdminAccount[] = [];
  if (isConfiguredPrimaryUsername(primaryUsername)) {
    accounts.push({
      id: "primary",
      username: primaryUsername,
      accountType: "primary",
      active: true,
      permissions: ADMIN_PERMISSION_OPTIONS.map((option) => option.scope),
      lastLoginAt: null,
      createdAt: null,
      updatedAt: null,
    });
  }
  accounts.push(...(result.results ?? []).map(toPublicAdminAccount));
  return accounts;
}

export async function createSecondaryAdminAccount(
  input: unknown,
  options: AdminAccountWriteOptions,
): Promise<AdminAccount> {
  const value = validateCreateInput(input);
  assertNotPrimaryUsername(value.username, options.primaryUsername);
  const database = options.database ?? adminAccountsDatabase();
  await ensureAdminAccountsSchema(database);
  await assertUsernameAvailable(database, value.username);

  const count = await database
    .prepare("SELECT COUNT(*) AS total FROM admins")
    .first<{ total: number }>();
  if (Number(count?.total ?? 0) >= MAX_SECONDARY_ADMINS) {
    throw new AdminApiError(
      409,
      `보조 관리자는 최대 ${MAX_SECONDARY_ADMINS}명까지 등록할 수 있습니다.`,
    );
  }

  const passwordHash = await hashAdminPassword(value.password);
  try {
    await database.batch([
      database
        .prepare(`INSERT INTO admins (
          username, password_hash, active, permissions_json, session_version,
          updated_at
        ) VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP)`)
        .bind(
          value.username,
          passwordHash,
          value.active ? 1 : 0,
          JSON.stringify(value.permissions),
        ),
      auditStatement(database, options, "admin.account.create", "", {
        targetUsername: value.username,
        active: value.active,
        permissions: value.permissions,
      }),
    ]);
  } catch (error) {
    if (looksLikeUniqueConstraint(error)) {
      throw usernameConflict();
    }
    throw error;
  }

  const created = await findSecondaryAdminByUsername(database, value.username);
  if (!created) {
    throw new AdminApiError(500, "저장된 관리자 계정을 찾지 못했습니다.");
  }
  return toPublicAdminAccount(created);
}

export async function updateSecondaryAdminAccount(
  idValue: string,
  input: unknown,
  options: AdminAccountWriteOptions,
): Promise<AdminAccount> {
  const id = parseSecondaryAdminId(idValue);
  const database = options.database ?? adminAccountsDatabase();
  await ensureAdminAccountsSchema(database);
  const current = await findSecondaryAdminById(database, id);
  if (!current) {
    throw new AdminApiError(404, "관리자 계정을 찾을 수 없습니다.");
  }

  const value = validateUpdateInput(input, current);
  assertNotPrimaryUsername(value.username, options.primaryUsername);
  if (value.username !== current.username) {
    await assertUsernameAvailable(database, value.username, id);
  }

  try {
    const results = await database.batch([
      database
        .prepare(`UPDATE admins
                  SET username = ?, active = ?, permissions_json = ?,
                      updated_at = CURRENT_TIMESTAMP
                  WHERE id = ?`)
        .bind(
          value.username,
          value.active ? 1 : 0,
          JSON.stringify(value.permissions),
          id,
        ),
      auditStatement(
        database,
        options,
        "admin.account.update",
        String(id),
        {
          targetUsername: value.username,
          active: value.active,
          permissions: value.permissions,
        },
      ),
    ]);
    if (!results[0]?.meta.changes) {
      throw new AdminApiError(404, "관리자 계정을 찾을 수 없습니다.");
    }
  } catch (error) {
    if (looksLikeUniqueConstraint(error)) {
      throw usernameConflict();
    }
    throw error;
  }

  const updated = await findSecondaryAdminById(database, id);
  if (!updated) {
    throw new AdminApiError(404, "관리자 계정을 찾을 수 없습니다.");
  }
  return toPublicAdminAccount(updated);
}

export async function resetSecondaryAdminPassword(
  idValue: string,
  input: unknown,
  options: AdminAccountWriteOptions,
): Promise<AdminAccount> {
  const id = parseSecondaryAdminId(idValue);
  const value = validatePasswordResetInput(input);
  const database = options.database ?? adminAccountsDatabase();
  await ensureAdminAccountsSchema(database);
  const current = await findSecondaryAdminById(database, id);
  if (!current) {
    throw new AdminApiError(404, "관리자 계정을 찾을 수 없습니다.");
  }
  if (current.member_user_id) {
    throw new AdminApiError(
      409,
      "회원 연동 관리자의 비밀번호는 회원관리에서 변경해 주세요.",
    );
  }

  const passwordHash = await hashAdminPassword(value.password);
  const results = await database.batch([
    database
      .prepare(`UPDATE admins
                SET password_hash = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?`)
      .bind(passwordHash, id),
    auditStatement(
      database,
      options,
      "admin.account.password-reset",
      String(id),
      {
        targetUsername: current.username,
        passwordReset: true,
      },
    ),
  ]);
  if (!results[0]?.meta.changes) {
    throw new AdminApiError(404, "관리자 계정을 찾을 수 없습니다.");
  }

  const updated = await findSecondaryAdminById(database, id);
  if (!updated) {
    throw new AdminApiError(404, "관리자 계정을 찾을 수 없습니다.");
  }
  return toPublicAdminAccount(updated);
}

export async function deleteSecondaryAdminAccount(
  idValue: string,
  options: AdminAccountWriteOptions,
): Promise<void> {
  const id = parseSecondaryAdminId(idValue);
  const database = options.database ?? adminAccountsDatabase();
  await ensureAdminAccountsSchema(database);
  const current = await findSecondaryAdminById(database, id);
  if (!current) {
    throw new AdminApiError(404, "관리자 계정을 찾을 수 없습니다.");
  }

  const results = await database.batch([
    database
      .prepare("DELETE FROM admin_menu_permissions WHERE admin_id = ?")
      .bind(id),
    database.prepare("DELETE FROM admins WHERE id = ?").bind(id),
    auditStatement(
      database,
      options,
      "admin.account.delete",
      String(id),
      { targetUsername: current.username },
    ),
  ]);
  if (!results[1]?.meta.changes) {
    throw new AdminApiError(404, "관리자 계정을 찾을 수 없습니다.");
  }
}

export async function authenticateSecondaryAdmin(
  username: string,
  password: string,
  databaseOverride?: D1Database,
): Promise<SecondaryAdminIdentity | null> {
  let database: D1Database;
  try {
    database = databaseOverride ?? adminAccountsDatabase();
    await ensureAdminAccountsSchema(database);
  } catch {
    return null;
  }

  const row =
    username.length > 0 && username.length <= MAX_LOGIN_USERNAME_LENGTH
      ? await findSecondaryAdminByUsername(database, username)
      : null;
  const linkedMember = row?.member_user_id
    ? await findLinkedMember(database, row.member_user_id)
    : null;
  const passwordMatches = row?.member_user_id
    ? linkedMember?.active === 1 &&
      (await safelyVerifyCustomerPassword(
        password,
        linkedMember.password_hash,
      ))
    : await verifyPbkdf2Password(password, row?.password_hash);
  if (!row || row.active !== 1 || !passwordMatches) return null;

  const update = await database
    .prepare(
      "UPDATE admins SET last_login_at = CURRENT_TIMESTAMP WHERE id = ? AND active = 1",
    )
    .bind(row.id)
    .run();
  if (!update.meta.changes) return null;

  return {
    id: row.id,
    username: row.username,
    permissions: await grantedPermissionsForAdmin(database, row),
    sessionVersion: safeSessionVersion(row.session_version),
  };
}

export async function getSecondaryAdminSessionIdentity(
  id: number,
  sessionVersion: number,
  databaseOverride?: D1Database,
): Promise<SecondaryAdminIdentity | null> {
  if (
    !Number.isSafeInteger(id) ||
    id <= 0 ||
    !Number.isSafeInteger(sessionVersion) ||
    sessionVersion <= 0
  ) {
    return null;
  }

  let database: D1Database;
  try {
    database = databaseOverride ?? adminAccountsDatabase();
    await ensureAdminAccountsSchema(database);
  } catch {
    return null;
  }
  const row = await findSecondaryAdminById(database, id);
  const linkedMember = row?.member_user_id
    ? await findLinkedMember(database, row.member_user_id)
    : null;
  if (
    !row ||
    row.active !== 1 ||
    (row.member_user_id !== null && linkedMember?.active !== 1) ||
    safeSessionVersion(row.session_version) !== sessionVersion
  ) {
    return null;
  }
  return {
    id: row.id,
    username: row.username,
    permissions: await grantedPermissionsForAdmin(database, row),
    sessionVersion,
  };
}

async function initializeAdminAccountsSchema(
  database: D1Database,
): Promise<void> {
  await database.batch([
    database.prepare(`CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      member_user_id TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      permissions_json TEXT NOT NULL DEFAULT '[]',
      session_version INTEGER NOT NULL DEFAULT 1,
      last_login_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
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
    database.prepare(`CREATE TABLE IF NOT EXISTS admin_menu_permissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_id INTEGER NOT NULL,
      menu_code TEXT NOT NULL,
      auth_flags TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(admin_id, menu_code)
    )`),
    database.prepare(`CREATE TABLE IF NOT EXISTS admin_permission_challenges (
      id TEXT PRIMARY KEY,
      admin_username TEXT NOT NULL,
      answer_hash TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
  ]);

  const columns = await database
    .prepare("PRAGMA table_info(admins)")
    .all<{ name: string }>();
  const existing = new Set(
    (columns.results ?? []).map((column) => column.name),
  );
  const migrations: D1PreparedStatement[] = [];
  if (!existing.has("permissions_json")) {
    migrations.push(
      database.prepare(
        "ALTER TABLE admins ADD COLUMN permissions_json TEXT NOT NULL DEFAULT '[]'",
      ),
    );
  }
  if (!existing.has("member_user_id")) {
    migrations.push(
      database.prepare(
        "ALTER TABLE admins ADD COLUMN member_user_id TEXT",
      ),
    );
  }
  if (!existing.has("session_version")) {
    migrations.push(
      database.prepare(
        "ALTER TABLE admins ADD COLUMN session_version INTEGER NOT NULL DEFAULT 1",
      ),
    );
  }
  if (migrations.length > 0) {
    await database.batch(migrations);
  }

  await database.batch([
    database.prepare(
      "CREATE UNIQUE INDEX IF NOT EXISTS admins_username_uq ON admins(username)",
    ),
    database.prepare(
      "CREATE INDEX IF NOT EXISTS admins_active_idx ON admins(active, username)",
    ),
    database.prepare(
      "CREATE INDEX IF NOT EXISTS admins_member_user_idx ON admins(member_user_id)",
    ),
    database.prepare(
      "CREATE INDEX IF NOT EXISTS admin_menu_permissions_admin_idx ON admin_menu_permissions(admin_id, menu_code)",
    ),
    database.prepare(
      "CREATE INDEX IF NOT EXISTS admin_permission_challenges_expiry_idx ON admin_permission_challenges(expires_at)",
    ),
    database.prepare(
      "CREATE INDEX IF NOT EXISTS admin_audit_created_idx ON admin_audit_logs(created_at)",
    ),
    database.prepare(`CREATE TRIGGER IF NOT EXISTS admins_password_session_invalidate
      AFTER UPDATE OF password_hash ON admins
      WHEN OLD.password_hash <> NEW.password_hash
      BEGIN
        UPDATE admins
        SET session_version = session_version + 1
        WHERE id = NEW.id;
      END`),
    database.prepare(`CREATE TRIGGER IF NOT EXISTS admins_deactivate_session_invalidate
      AFTER UPDATE OF active ON admins
      WHEN OLD.active <> NEW.active AND NEW.active = 0
      BEGIN
        UPDATE admins
        SET session_version = session_version + 1
        WHERE id = NEW.id;
      END`),
    database.prepare(`CREATE TRIGGER IF NOT EXISTS admin_menu_permission_insert_session_invalidate
      AFTER INSERT ON admin_menu_permissions
      BEGIN
        UPDATE admins
        SET session_version = session_version + 1
        WHERE id = NEW.admin_id;
      END`),
    database.prepare(`CREATE TRIGGER IF NOT EXISTS admin_menu_permission_update_session_invalidate
      AFTER UPDATE OF auth_flags ON admin_menu_permissions
      WHEN OLD.auth_flags <> NEW.auth_flags
      BEGIN
        UPDATE admins
        SET session_version = session_version + 1
        WHERE id = NEW.admin_id;
      END`),
    database.prepare(`CREATE TRIGGER IF NOT EXISTS admin_menu_permission_delete_session_invalidate
      AFTER DELETE ON admin_menu_permissions
      BEGIN
        UPDATE admins
        SET session_version = session_version + 1
        WHERE id = OLD.admin_id;
      END`),
  ]);

  const usersTable = await database
    .prepare(
      "SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'users' LIMIT 1",
    )
    .first<{ present: number }>();
  if (usersTable?.present === 1) {
    await database.batch([
      database.prepare(`CREATE TRIGGER IF NOT EXISTS users_admin_password_session_invalidate
        AFTER UPDATE OF password_hash ON users
        WHEN OLD.password_hash <> NEW.password_hash
        BEGIN
          UPDATE admins
          SET session_version = session_version + 1
          WHERE member_user_id = NEW.id;
        END`),
      database.prepare(`CREATE TRIGGER IF NOT EXISTS users_admin_deactivate_session_invalidate
        AFTER UPDATE OF active ON users
        WHEN OLD.active <> NEW.active
        BEGIN
          UPDATE admins
          SET session_version = session_version + 1
          WHERE member_user_id = NEW.id;
        END`),
    ]);
  }
}

function validateCreateInput(input: unknown): {
  username: string;
  password: string;
  active: boolean;
  permissions: AdminPermissionScope[];
} {
  const value = inputObject(input);
  return {
    username: validateUsername(value.username),
    password: validatePassword(value.password),
    active:
      value.active === undefined
        ? true
        : validateBoolean(value.active, "active"),
    permissions: validatePermissions(value.permissions),
  };
}

function validateUpdateInput(
  input: unknown,
  current: AdminAccountRow,
): {
  username: string;
  active: boolean;
  permissions: AdminPermissionScope[];
} {
  const value = inputObject(input);
  const hasUsername = hasOwn(value, "username");
  const hasActive = hasOwn(value, "active");
  const hasPermissions = hasOwn(value, "permissions");
  if (!hasUsername && !hasActive && !hasPermissions) {
    throw new AdminApiError(400, "변경할 관리자 정보를 입력해 주세요.");
  }
  return {
    username: hasUsername
      ? validateUsername(value.username)
      : current.username,
    active: hasActive
      ? validateBoolean(value.active, "active")
      : current.active === 1,
    permissions: hasPermissions
      ? validatePermissions(value.permissions)
      : parseStoredAdminPermissions(current.permissions_json),
  };
}

function validatePasswordResetInput(input: unknown): { password: string } {
  const value = inputObject(input);
  return { password: validatePassword(value.password) };
}

function inputObject(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new AdminApiError(400, "요청 내용을 확인해 주세요.");
  }
  return input as Record<string, unknown>;
}

function validateUsername(value: unknown): string {
  if (typeof value !== "string") {
    throw new AdminApiError(400, "관리자 아이디를 입력해 주세요.", {
      username: "관리자 아이디를 입력해 주세요.",
    });
  }
  const username = value.trim();
  if (
    username.length < 3 ||
    username.length > MAX_MANAGED_USERNAME_LENGTH ||
    !usernamePattern.test(username)
  ) {
    throw new AdminApiError(
      400,
      "관리자 아이디를 확인해 주세요.",
      {
        username:
          "영문, 숫자, 점, 밑줄, 하이픈으로 3~64자를 입력해 주세요.",
      },
    );
  }
  return username;
}

function validatePassword(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length < MIN_PASSWORD_LENGTH ||
    value.length > MAX_PASSWORD_LENGTH ||
    value.trim().length < MIN_PASSWORD_LENGTH ||
    value.includes("\0")
  ) {
    throw new AdminApiError(400, "새 비밀번호를 확인해 주세요.", {
      password: `공백을 제외하고 ${MIN_PASSWORD_LENGTH}~${MAX_PASSWORD_LENGTH}자로 입력해 주세요.`,
    });
  }
  return value;
}

function validatePermissions(value: unknown): AdminPermissionScope[] {
  if (
    !Array.isArray(value) ||
    value.length > ADMIN_PERMISSION_OPTIONS.length ||
    value.some(
      (permission) =>
        typeof permission !== "string" ||
        !ADMIN_PERMISSION_OPTIONS.some(
          (option) => option.scope === permission,
        ),
    )
  ) {
    throw new AdminApiError(400, "관리 권한을 확인해 주세요.", {
      permissions: "제공된 관리 권한만 선택할 수 있습니다.",
    });
  }
  return normalizeAdminPermissions(value);
}

function validateBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new AdminApiError(400, "사용 여부를 확인해 주세요.", {
      [field]: "사용 여부 값이 올바르지 않습니다.",
    });
  }
  return value;
}

function parseSecondaryAdminId(value: string): number {
  if (value === "primary") {
    throw new AdminApiError(
      403,
      "최고관리자 계정은 환경 변수에서만 관리되며 변경할 수 없습니다.",
    );
  }
  if (!/^[1-9]\d{0,9}$/u.test(value)) {
    throw new AdminApiError(400, "관리자 계정 번호를 확인해 주세요.");
  }
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id > 2_147_483_647) {
    throw new AdminApiError(400, "관리자 계정 번호를 확인해 주세요.");
  }
  return id;
}

function assertNotPrimaryUsername(
  username: string,
  primaryUsername: string,
): void {
  if (
    isConfiguredPrimaryUsername(primaryUsername) &&
    username.toLocaleLowerCase("en-US") ===
      primaryUsername.toLocaleLowerCase("en-US")
  ) {
    throw new AdminApiError(
      409,
      "최고관리자 아이디는 보조 관리자에게 사용할 수 없습니다.",
      { username: "다른 관리자 아이디를 입력해 주세요." },
    );
  }
}

async function assertUsernameAvailable(
  database: D1Database,
  username: string,
  excludedId?: number,
): Promise<void> {
  const row = await database
    .prepare(`SELECT id FROM admins
              WHERE lower(username) = lower(?)
                AND (? IS NULL OR id <> ?)
              LIMIT 1`)
    .bind(username, excludedId ?? null, excludedId ?? null)
    .first<{ id: number }>();
  if (row) throw usernameConflict();
}

function usernameConflict(): AdminApiError {
  return new AdminApiError(409, "이미 사용 중인 관리자 아이디입니다.", {
    username: "다른 관리자 아이디를 입력해 주세요.",
  });
}

function isConfiguredPrimaryUsername(value: string): boolean {
  return value.length > 0 && value.length <= 128;
}

function safeSessionVersion(value: number): number {
  return Number.isSafeInteger(value) && value > 0 ? value : 1;
}

interface LinkedMemberRow {
  id: string;
  login_id: string;
  password_hash: string;
  active: number;
}

async function findLinkedMember(
  database: D1Database,
  userId: string,
): Promise<LinkedMemberRow | null> {
  return database
    .prepare(
      `SELECT id, login_id, password_hash, active
       FROM users
       WHERE id = ?
       LIMIT 1`,
    )
    .bind(userId)
    .first<LinkedMemberRow>();
}

async function safelyVerifyCustomerPassword(
  password: string,
  encodedHash: string,
): Promise<boolean> {
  try {
    return await verifyCustomerPassword(password, encodedHash);
  } catch {
    return false;
  }
}

async function grantedPermissionsForAdmin(
  database: D1Database,
  row: AdminAccountRow,
): Promise<AdminGrantedPermission[]> {
  const permissions = new Set<AdminGrantedPermission>(
    parseStoredAdminPermissions(row.permissions_json),
  );
  const result = await database
    .prepare(
      `SELECT menu_code, auth_flags
       FROM admin_menu_permissions
       WHERE admin_id = ?
       ORDER BY menu_code`,
    )
    .bind(row.id)
    .all<{ menu_code: string; auth_flags: string }>();
  for (const grant of result.results ?? []) {
    for (const mode of ["r", "w", "d"] as const) {
      if (grant.auth_flags.includes(mode)) {
        permissions.add(
          adminMenuPermissionToken(grant.menu_code, mode),
        );
      }
    }
  }
  return [...permissions];
}

async function findSecondaryAdminById(
  database: D1Database,
  id: number,
): Promise<AdminAccountRow | null> {
  return database
    .prepare(`SELECT id, username, password_hash, member_user_id, active, permissions_json,
                     session_version, last_login_at, created_at, updated_at
              FROM admins WHERE id = ? LIMIT 1`)
    .bind(id)
    .first<AdminAccountRow>();
}

async function findSecondaryAdminByUsername(
  database: D1Database,
  username: string,
): Promise<AdminAccountRow | null> {
  return database
    .prepare(`SELECT id, username, password_hash, member_user_id, active, permissions_json,
                     session_version, last_login_at, created_at, updated_at
              FROM admins WHERE username = ? LIMIT 1`)
    .bind(username)
    .first<AdminAccountRow>();
}

function toPublicAdminAccount(row: AdminAccountRow): AdminAccount {
  return {
    id: String(row.id),
    username: row.username,
    accountType: "secondary",
    active: row.active === 1,
    permissions: parseStoredAdminPermissions(row.permissions_json),
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function auditStatement(
  database: D1Database,
  options: AdminAccountWriteOptions,
  action: string,
  entityId: string,
  details: Record<string, unknown>,
): D1PreparedStatement {
  return database
    .prepare(`INSERT INTO admin_audit_logs (
      admin_id, action, entity_type, entity_id, details
    ) VALUES (?, ?, 'admin_account', ?, ?)`)
    .bind(
      options.actorAdminId ?? null,
      action,
      entityId.slice(0, 128),
      JSON.stringify({
        actorUsername: options.actorUsername.slice(0, 128),
        ...details,
      }),
    );
}

function looksLikeUniqueConstraint(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /unique|constraint|admins_username_uq/iu.test(message);
}

function hasOwn(
  value: Record<string, unknown>,
  property: string,
): boolean {
  return Object.prototype.hasOwnProperty.call(value, property);
}
