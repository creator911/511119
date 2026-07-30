import { AdminApiError } from "@/lib/admin-api";
import { commerceDb, ensureCommerceSchema } from "@/lib/commerce-db";
import { MAX_POINTS } from "@/lib/commerce-limits";

export interface AdminPointLedgerEntry {
  id: string;
  userId: string;
  loginId: string;
  name: string;
  delta: number;
  balanceBefore: number;
  balanceAfter: number;
  reason: string;
  expiresAt: string | null;
  revision: number;
  createdAt: string;
}

export interface AdminPointDeletionResult {
  deletedIds: string[];
  balances: Array<{
    userId: string;
    loginId: string;
    points: number;
  }>;
}

interface PointEntryRow {
  id: string;
  user_id: string;
  delta: number;
  balance_before: number;
  balance_after: number;
  reason: string;
  expires_at: string | null;
  revision: number;
  deleted_at: string | null;
  created_at: string;
}

interface PointUserRow {
  id: string;
  login_id: string;
  name: string;
  points: number;
}

const MAX_DELETE_ENTRIES = 50;
const pointEntryIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const loginIdPattern = /^[A-Za-z0-9_-]{4,30}$/u;
let schemaInitialization: Promise<void> | null = null;

export async function ensureAdminPointSchema(): Promise<void> {
  await ensureCommerceSchema();
  if (!schemaInitialization) {
    const database = commerceDb();
    schemaInitialization = database
      .batch([
        database.prepare(`CREATE TABLE IF NOT EXISTS admin_point_ledger (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          delta INTEGER NOT NULL CHECK(delta <> 0),
          balance_before INTEGER NOT NULL
            CHECK(balance_before >= 0 AND balance_before <= ${MAX_POINTS}),
          balance_after INTEGER NOT NULL
            CHECK(balance_after >= 0 AND balance_after <= ${MAX_POINTS}),
          reason TEXT NOT NULL,
          expires_at TEXT,
          revision INTEGER NOT NULL DEFAULT 1 CHECK(revision >= 1),
          admin_username TEXT NOT NULL DEFAULT '',
          deleted_at TEXT,
          deleted_by TEXT NOT NULL DEFAULT '',
          delete_reason TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CHECK(balance_after = balance_before + delta)
        )`),
        database.prepare(
          `CREATE INDEX IF NOT EXISTS admin_point_ledger_user_idx
           ON admin_point_ledger(user_id, created_at)`,
        ),
        database.prepare(
          `CREATE INDEX IF NOT EXISTS admin_point_ledger_active_idx
           ON admin_point_ledger(deleted_at, created_at)`,
        ),
        database.prepare(`CREATE TABLE IF NOT EXISTS admin_point_write_guards (
          operation_id TEXT PRIMARY KEY,
          target_id TEXT NOT NULL,
          guard_value INTEGER NOT NULL CHECK(guard_value = 1),
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
      ])
      .then(() => undefined)
      .catch((error) => {
        schemaInitialization = null;
        throw error;
      });
  }
  await schemaInitialization;
}

export async function createAdminPointEntry(
  input: unknown,
  adminUsername: string,
): Promise<AdminPointLedgerEntry> {
  const values = parseCreateInput(input);
  await ensureAdminPointSchema();
  const database = commerceDb();
  const user = await database
    .prepare(
      `SELECT id, login_id, name, points
       FROM users WHERE login_id = ? LIMIT 1`,
    )
    .bind(values.loginId)
    .first<PointUserRow>();
  if (!user) {
    throw new AdminApiError(404, "포인트를 조정할 회원을 찾을 수 없습니다.", {
      loginId: "회원아이디를 확인해 주세요.",
    });
  }

  const balanceBefore = Number(user.points);
  const balanceAfter = balanceBefore + values.delta;
  if (
    !Number.isSafeInteger(balanceAfter) ||
    balanceAfter < 0 ||
    balanceAfter > MAX_POINTS
  ) {
    throw new AdminApiError(
      409,
      values.delta < 0
        ? "회원의 현재 포인트보다 많이 차감할 수 없습니다."
        : "회원 포인트 한도를 초과할 수 없습니다.",
      { points: "현재 포인트 잔액을 확인해 주세요." },
    );
  }

  const id = crypto.randomUUID();
  const guardId = crypto.randomUUID();
  const normalizedAdmin = adminUsername.trim().slice(0, 128);
  const details = JSON.stringify({
    adminUsername: normalizedAdmin,
    loginId: user.login_id,
    delta: values.delta,
    balanceBefore,
    balanceAfter,
    reason: values.reason,
    expiresAt: values.expiresAt,
  });
  try {
    await database.batch([
      database
        .prepare(
          `UPDATE users
           SET points = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND points = ?`,
        )
        .bind(balanceAfter, user.id, balanceBefore),
      pointGuardStatement(database, guardId, user.id),
      database
        .prepare(
          `INSERT INTO admin_point_ledger (
             id, user_id, delta, balance_before, balance_after, reason,
             expires_at, admin_username
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          user.id,
          values.delta,
          balanceBefore,
          balanceAfter,
          values.reason,
          values.expiresAt,
          normalizedAdmin,
        ),
      database
        .prepare(
          `INSERT INTO admin_audit_logs (
             admin_id, action, entity_type, entity_id, details
           ) VALUES (NULL, 'point.create', 'point', ?, ?)`,
        )
        .bind(id, details),
      database
        .prepare(
          "DELETE FROM admin_point_write_guards WHERE operation_id = ?",
        )
        .bind(guardId),
    ]);
  } catch (error) {
    if (isPointWriteConflict(error)) {
      throw new AdminApiError(
        409,
        "회원 포인트가 다른 주문 또는 관리자 작업에서 변경되었습니다. 최신 잔액을 확인한 뒤 다시 처리해 주세요.",
      );
    }
    throw error;
  }

  return {
    id,
    userId: user.id,
    loginId: user.login_id,
    name: user.name,
    delta: values.delta,
    balanceBefore,
    balanceAfter,
    reason: values.reason,
    expiresAt: values.expiresAt,
    revision: 1,
    createdAt: new Date().toISOString(),
  };
}

export async function deleteAdminPointEntries(
  input: unknown,
  adminUsername: string,
): Promise<AdminPointDeletionResult> {
  const values = parseDeleteInput(input);
  await ensureAdminPointSchema();
  const database = commerceDb();
  const placeholders = values.entries.map(() => "?").join(", ");
  const result = await database
    .prepare(
      `SELECT id, user_id, delta, balance_before, balance_after, reason,
              expires_at, revision, deleted_at, created_at
       FROM admin_point_ledger
       WHERE id IN (${placeholders})`,
    )
    .bind(...values.entries.map((entry) => entry.id))
    .all<PointEntryRow>();
  const rowsById = new Map(
    (result.results ?? []).map((row) => [row.id, row]),
  );
  for (const entry of values.entries) {
    const row = rowsById.get(entry.id);
    if (!row || row.deleted_at || Number(row.revision) !== entry.revision) {
      throw new AdminApiError(
        409,
        "선택한 포인트 내역이 이미 변경되었습니다. 목록을 새로고침해 주세요.",
      );
    }
  }

  const rows = values.entries.map((entry) => rowsById.get(entry.id)!);
  const userIds = [...new Set(rows.map((row) => row.user_id))];
  const userPlaceholders = userIds.map(() => "?").join(", ");
  const userResult = await database
    .prepare(
      `SELECT id, login_id, name, points
       FROM users WHERE id IN (${userPlaceholders})`,
    )
    .bind(...userIds)
    .all<PointUserRow>();
  const usersById = new Map(
    (userResult.results ?? []).map((user) => [user.id, user]),
  );
  if (usersById.size !== userIds.length) {
    throw new AdminApiError(
      409,
      "포인트 회원 정보가 변경되었습니다. 목록을 새로고침해 주세요.",
    );
  }

  const deltaByUser = new Map<string, number>();
  for (const row of rows) {
    deltaByUser.set(
      row.user_id,
      (deltaByUser.get(row.user_id) ?? 0) + Number(row.delta),
    );
  }

  const balanceChanges = userIds.map((userId) => {
    const user = usersById.get(userId)!;
    const before = Number(user.points);
    const after = before - (deltaByUser.get(userId) ?? 0);
    if (
      !Number.isSafeInteger(after) ||
      after < 0 ||
      after > MAX_POINTS
    ) {
      throw new AdminApiError(
        409,
        `${user.login_id} 회원의 현재 잔액 때문에 선택 내역을 삭제할 수 없습니다.`,
        {
          entries:
            "선택 내역 이후 사용·적립된 포인트를 확인한 뒤 개별 조정해 주세요.",
        },
      );
    }
    return { user, before, after };
  });

  const operationId = crypto.randomUUID();
  const normalizedAdmin = adminUsername.trim().slice(0, 128);
  const statements: D1PreparedStatement[] = [];
  const guardIds: string[] = [];
  for (const change of balanceChanges) {
    if (change.before === change.after) continue;
    statements.push(
      database
        .prepare(
          `UPDATE users
           SET points = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND points = ?`,
        )
        .bind(change.after, change.user.id, change.before),
    );
    const guardId = `${operationId}:user:${change.user.id}`;
    guardIds.push(guardId);
    statements.push(
      pointGuardStatement(database, guardId, change.user.id),
    );
  }
  for (const entry of values.entries) {
    statements.push(
      database
        .prepare(
          `UPDATE admin_point_ledger
           SET deleted_at = CURRENT_TIMESTAMP,
               deleted_by = ?,
               delete_reason = ?,
               revision = revision + 1
           WHERE id = ? AND revision = ? AND deleted_at IS NULL`,
        )
        .bind(
          normalizedAdmin,
          values.reason,
          entry.id,
          entry.revision,
        ),
    );
    const guardId = `${operationId}:entry:${entry.id}`;
    guardIds.push(guardId);
    statements.push(pointGuardStatement(database, guardId, entry.id));
  }
  statements.push(
    database
      .prepare(
        `INSERT INTO admin_audit_logs (
           admin_id, action, entity_type, entity_id, details
         ) VALUES (NULL, 'point.delete', 'point', ?, ?)`,
      )
      .bind(
        values.entries[0]!.id,
        JSON.stringify({
          adminUsername: normalizedAdmin,
          reason: values.reason,
          entries: rows.map((row) => ({
            id: row.id,
            userId: row.user_id,
            delta: Number(row.delta),
            reason: row.reason,
          })),
          balances: balanceChanges.map((change) => ({
            userId: change.user.id,
            loginId: change.user.login_id,
            before: change.before,
            after: change.after,
          })),
        }).slice(0, 10_000),
      ),
  );
  if (guardIds.length > 0) {
    const cleanupPlaceholders = guardIds.map(() => "?").join(", ");
    statements.push(
      database
        .prepare(
          `DELETE FROM admin_point_write_guards
           WHERE operation_id IN (${cleanupPlaceholders})`,
        )
        .bind(...guardIds),
    );
  }

  try {
    await database.batch(statements);
  } catch (error) {
    if (isPointWriteConflict(error)) {
      throw new AdminApiError(
        409,
        "포인트 잔액 또는 선택 내역이 다른 작업에서 변경되었습니다. 최신 목록을 확인해 주세요.",
      );
    }
    throw error;
  }

  return {
    deletedIds: values.entries.map((entry) => entry.id),
    balances: balanceChanges.map((change) => ({
      userId: change.user.id,
      loginId: change.user.login_id,
      points: change.after,
    })),
  };
}

function parseCreateInput(input: unknown): {
  loginId: string;
  delta: number;
  reason: string;
  expiresAt: string | null;
} {
  const body = objectInput(input);
  const loginId =
    typeof body.loginId === "string" ? body.loginId.trim() : "";
  const reason =
    typeof body.reason === "string" ? body.reason.trim() : "";
  const delta = body.delta;
  const expiresAt =
    typeof body.expiresAt === "string" && body.expiresAt.trim()
      ? body.expiresAt.trim()
      : null;
  const errors: Record<string, string> = {};
  if (!loginIdPattern.test(loginId)) {
    errors.loginId = "회원아이디를 확인해 주세요.";
  }
  if (
    typeof delta !== "number" ||
    !Number.isSafeInteger(delta) ||
    delta === 0 ||
    Math.abs(delta) > MAX_POINTS
  ) {
    errors.points = "0이 아닌 포인트 정수를 입력해 주세요.";
  }
  if (reason.length < 2 || reason.length > 255) {
    errors.reason = "포인트 내용은 2자 이상 255자 이하로 입력해 주세요.";
  }
  if (
    expiresAt &&
    (!/^\d{4}-\d{2}-\d{2}$/u.test(expiresAt) ||
      !Number.isFinite(Date.parse(`${expiresAt}T00:00:00+09:00`)) ||
      expiresAt < koreaToday())
  ) {
    errors.expiresAt = "만료일은 오늘 이후의 날짜로 입력해 주세요.";
  }
  if (Object.keys(errors).length > 0) {
    throw new AdminApiError(400, "포인트 입력 내용을 확인해 주세요.", errors);
  }
  return { loginId, delta: delta as number, reason, expiresAt };
}

function parseDeleteInput(input: unknown): {
  entries: Array<{ id: string; revision: number }>;
  reason: string;
} {
  const body = objectInput(input);
  const entries = body.entries;
  const reason =
    typeof body.reason === "string" ? body.reason.trim() : "";
  if (
    !Array.isArray(entries) ||
    entries.length < 1 ||
    entries.length > MAX_DELETE_ENTRIES
  ) {
    throw new AdminApiError(
      400,
      `한 번에 1개 이상 ${MAX_DELETE_ENTRIES}개 이하의 관리자 포인트 내역을 선택해 주세요.`,
    );
  }
  if (reason.length < 2 || reason.length > 255) {
    throw new AdminApiError(400, "삭제 사유를 2자 이상 입력해 주세요.", {
      reason: "삭제 사유는 2자 이상 255자 이하로 입력해 주세요.",
    });
  }
  const seen = new Set<string>();
  const normalized = entries.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new AdminApiError(
        400,
        `${index + 1}번째 선택 내역을 확인해 주세요.`,
      );
    }
    const value = entry as Record<string, unknown>;
    const id = typeof value.id === "string" ? value.id.trim() : "";
    const revision = value.revision;
    if (!pointEntryIdPattern.test(id) || seen.has(id)) {
      throw new AdminApiError(
        400,
        `${index + 1}번째 포인트 내역 번호를 확인해 주세요.`,
      );
    }
    if (
      typeof revision !== "number" ||
      !Number.isSafeInteger(revision) ||
      revision < 1 ||
      revision > 2_147_483_647
    ) {
      throw new AdminApiError(
        400,
        `${index + 1}번째 포인트 내역 기준값을 확인해 주세요.`,
      );
    }
    seen.add(id);
    return { id, revision };
  });
  return { entries: normalized, reason };
}

function pointGuardStatement(
  database: D1Database,
  operationId: string,
  targetId: string,
): D1PreparedStatement {
  return database
    .prepare(
      `INSERT INTO admin_point_write_guards (
         operation_id, target_id, guard_value
       ) VALUES (
         ?, ?, CASE WHEN changes() = 1 THEN 1 ELSE 0 END
       )`,
    )
    .bind(operationId, targetId);
}

function objectInput(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new AdminApiError(400, "요청 형식을 확인해 주세요.");
  }
  return input as Record<string, unknown>;
}

function isPointWriteConflict(error: unknown): boolean {
  return (
    error instanceof Error &&
    /admin_point_write_guards|guard_value|balance_after|users\.points|check constraint|constraint failed/iu.test(
      error.message,
    )
  );
}

function koreaToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
