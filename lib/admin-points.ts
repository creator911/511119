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
  revision: number;
  createdAt: string;
}

export interface AdminPointUpdateResult {
  entry: AdminPointLedgerEntry;
  memberPoints: number;
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
            CHECK(balance_before >= -${MAX_POINTS} AND balance_before <= ${MAX_POINTS}),
          balance_after INTEGER NOT NULL
            CHECK(balance_after >= -${MAX_POINTS} AND balance_after <= ${MAX_POINTS}),
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
      .then(() => ensureSignedPointBalances(database))
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
    balanceAfter < -MAX_POINTS ||
    balanceAfter > MAX_POINTS
  ) {
    throw new AdminApiError(
      409,
      "회원 포인트 한도를 초과할 수 없습니다.",
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
           ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?)`,
        )
        .bind(
          id,
          user.id,
          values.delta,
          balanceBefore,
          balanceAfter,
          values.reason,
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
    revision: 1,
    createdAt: new Date().toISOString(),
  };
}

export async function updateAdminPointEntry(
  input: unknown,
  adminUsername: string,
): Promise<AdminPointUpdateResult> {
  const values = parseUpdateInput(input);
  await ensureAdminPointSchema();
  const database = commerceDb();
  const row = await database
    .prepare(
      `SELECT id, user_id, delta, balance_before, balance_after, reason,
              expires_at, revision, deleted_at, created_at
       FROM admin_point_ledger
       WHERE id = ? LIMIT 1`,
    )
    .bind(values.id)
    .first<PointEntryRow>();
  if (
    !row ||
    row.deleted_at ||
    Number(row.revision) !== values.revision
  ) {
    throw new AdminApiError(
      409,
      "수정할 포인트 내역이 이미 변경되었습니다. 목록을 새로고침해 주세요.",
    );
  }

  const user = await database
    .prepare(
      `SELECT id, login_id, name, points
       FROM users WHERE id = ? LIMIT 1`,
    )
    .bind(row.user_id)
    .first<PointUserRow>();
  if (!user) {
    throw new AdminApiError(
      409,
      "포인트 내역의 회원 정보를 찾을 수 없습니다.",
    );
  }

  const oldDelta = Number(row.delta);
  const difference = values.delta - oldDelta;
  const memberPointsBefore = Number(user.points);
  const memberPointsAfter = memberPointsBefore + difference;
  if (
    !Number.isSafeInteger(memberPointsAfter) ||
    memberPointsAfter < -MAX_POINTS ||
    memberPointsAfter > MAX_POINTS
  ) {
    throw new AdminApiError(
      409,
      "변경 후 포인트가 허용 범위를 벗어납니다.",
      { points: "포인트 금액을 확인해 주세요." },
    );
  }

  const normalizedAdmin = adminUsername.trim().slice(0, 128);
  const operationId = crypto.randomUUID();
  const guardIds: string[] = [];
  const statements: D1PreparedStatement[] = [];
  if (difference !== 0) {
    statements.push(
      database
        .prepare(
          `UPDATE users
           SET points = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND points = ?`,
        )
        .bind(memberPointsAfter, user.id, memberPointsBefore),
    );
    const userGuardId = `${operationId}:user`;
    guardIds.push(userGuardId);
    statements.push(pointGuardStatement(database, userGuardId, user.id));
  }
  statements.push(
    database
      .prepare(
        `UPDATE admin_point_ledger
         SET delta = ?,
             balance_before = 0,
             balance_after = ?,
             reason = ?,
             expires_at = NULL,
             created_at = ?,
             admin_username = ?
         WHERE id = ? AND revision = ? AND deleted_at IS NULL`,
      )
      .bind(
        values.delta,
        values.delta,
        values.reason,
        values.occurredAt,
        normalizedAdmin,
        row.id,
        values.revision,
      ),
  );
  const entryGuardId = `${operationId}:entry`;
  guardIds.push(entryGuardId);
  statements.push(pointGuardStatement(database, entryGuardId, row.id));
  statements.push(
    recalculateAdminPointBalancesStatement(
      database,
      user.id,
      memberPointsAfter,
    ),
  );
  statements.push(
    database
      .prepare(
        `INSERT INTO admin_audit_logs (
           admin_id, action, entity_type, entity_id, details
         ) VALUES (NULL, 'point.update', 'point', ?, ?)`,
      )
      .bind(
        row.id,
        JSON.stringify({
          adminUsername: normalizedAdmin,
          loginId: user.login_id,
          before: {
            delta: oldDelta,
            reason: row.reason,
            occurredAt: row.created_at,
            memberPoints: memberPointsBefore,
          },
          after: {
            delta: values.delta,
            reason: values.reason,
            occurredAt: values.occurredAt,
            memberPoints: memberPointsAfter,
          },
        }).slice(0, 10_000),
      ),
  );
  statements.push(
    database
      .prepare(
        `DELETE FROM admin_point_write_guards
         WHERE operation_id IN (${guardIds.map(() => "?").join(", ")})`,
      )
      .bind(...guardIds),
  );

  try {
    await database.batch(statements);
  } catch (error) {
    if (isPointWriteConflict(error)) {
      throw new AdminApiError(
        409,
        "회원 잔액 또는 포인트 내역이 다른 작업에서 변경되었습니다. 최신 목록을 확인한 뒤 다시 저장해 주세요.",
      );
    }
    throw error;
  }

  const updatedRow = await database
    .prepare(
      `SELECT balance_before, balance_after, revision, created_at
       FROM admin_point_ledger
       WHERE id = ? AND deleted_at IS NULL
       LIMIT 1`,
    )
    .bind(row.id)
    .first<{
      balance_before: number;
      balance_after: number;
      revision: number;
      created_at: string;
    }>();
  if (!updatedRow) {
    throw new AdminApiError(
      409,
      "수정한 포인트 내역을 다시 확인할 수 없습니다. 목록을 새로고침해 주세요.",
    );
  }

  return {
    entry: {
      id: row.id,
      userId: user.id,
      loginId: user.login_id,
      name: user.name,
      delta: values.delta,
      balanceBefore: Number(updatedRow.balance_before),
      balanceAfter: Number(updatedRow.balance_after),
      reason: values.reason,
      revision: Number(updatedRow.revision),
      createdAt: updatedRow.created_at,
    },
    memberPoints: memberPointsAfter,
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
      after < -MAX_POINTS ||
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
} {
  const body = objectInput(input);
  const loginId =
    typeof body.loginId === "string" ? body.loginId.trim() : "";
  const reason =
    typeof body.reason === "string" ? body.reason.trim() : "";
  const delta = body.delta;
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
  if (Object.keys(errors).length > 0) {
    throw new AdminApiError(400, "포인트 입력 내용을 확인해 주세요.", errors);
  }
  return { loginId, delta: delta as number, reason };
}

function parseUpdateInput(input: unknown): {
  id: string;
  revision: number;
  delta: number;
  reason: string;
  occurredAt: string;
} {
  const body = objectInput(input);
  const id = typeof body.id === "string" ? body.id.trim() : "";
  const revision = body.revision;
  const delta = body.delta;
  const reason =
    typeof body.reason === "string" ? body.reason.trim() : "";
  const occurredAt = normalizeOccurredAt(body.occurredAt);
  const errors: Record<string, string> = {};
  if (!pointEntryIdPattern.test(id)) {
    errors.id = "포인트 내역 번호를 확인해 주세요.";
  }
  if (
    typeof revision !== "number" ||
    !Number.isSafeInteger(revision) ||
    revision < 1 ||
    revision > 2_147_483_647
  ) {
    errors.revision = "포인트 내역 기준값을 확인해 주세요.";
  }
  if (
    typeof delta !== "number" ||
    !Number.isSafeInteger(delta) ||
    delta === 0 ||
    Math.abs(delta) > MAX_POINTS
  ) {
    errors.points = "포인트는 0이 아닌 정수로 입력해 주세요.";
  }
  if (reason.length < 2 || reason.length > 255) {
    errors.reason = "포인트 내용은 2자 이상 255자 이하로 입력해 주세요.";
  }
  if (!occurredAt) {
    errors.occurredAt = "포인트 일시를 확인해 주세요.";
  }
  if (Object.keys(errors).length > 0) {
    throw new AdminApiError(
      400,
      "수정할 포인트 내용을 확인해 주세요.",
      errors,
    );
  }
  return {
    id,
    revision: revision as number,
    delta: delta as number,
    reason,
    occurredAt: occurredAt!,
  };
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

function recalculateAdminPointBalancesStatement(
  database: D1Database,
  userId: string,
  currentPoints: number,
): D1PreparedStatement {
  const timeline = pointBalanceTimelineSql();
  return database
    .prepare(
      `WITH point_timeline AS (${timeline}),
       point_snapshots AS (
         SELECT
           entry.id,
           ? - COALESCE(SUM(event.delta), 0) AS balance_after
         FROM admin_point_ledger entry
         LEFT JOIN point_timeline event
           ON event.user_id = entry.user_id
          AND (
            event.occurred_at > entry.created_at
            OR (
              event.occurred_at = entry.created_at
              AND event.sort_key > '6:admin:' || entry.id
            )
          )
         WHERE entry.user_id = ?
           AND entry.deleted_at IS NULL
         GROUP BY entry.id
       )
       UPDATE admin_point_ledger
       SET balance_after = (
             SELECT snapshot.balance_after
             FROM point_snapshots snapshot
             WHERE snapshot.id = admin_point_ledger.id
           ),
           balance_before = (
             SELECT snapshot.balance_after
             FROM point_snapshots snapshot
             WHERE snapshot.id = admin_point_ledger.id
           ) - delta,
           revision = revision + 1
       WHERE user_id = ?
         AND deleted_at IS NULL`,
    )
    .bind(currentPoints, userId, userId);
}

export function pointBalanceTimelineSql(): string {
  return `
    SELECT sort_key, user_id, delta, occurred_at
    FROM (
      SELECT
        '1:order-debit:' || debit.order_id AS sort_key,
        debit.user_id,
        -debit.points_used AS delta,
        debit.created_at AS occurred_at
      FROM order_point_debits debit
      UNION ALL
      SELECT
        '2:order-restore:' || adjustment.order_id AS sort_key,
        debit.user_id,
        debit.points_used AS delta,
        adjustment.created_at AS occurred_at
      FROM order_inventory_adjustments adjustment
      JOIN order_point_debits debit ON debit.order_id = adjustment.order_id
      WHERE adjustment.adjustment_type = 'points_restore'
      UNION ALL
      SELECT
        '3:order-credit:' || adjustment.order_id AS sort_key,
        credit.user_id,
        credit.points_earned AS delta,
        adjustment.created_at AS occurred_at
      FROM order_inventory_adjustments adjustment
      JOIN order_point_credits credit ON credit.order_id = adjustment.order_id
      WHERE adjustment.adjustment_type = 'points_credit'
      UNION ALL
      SELECT
        '4:order-reversal:' || reversal.order_id AS sort_key,
        reversal.user_id,
        -reversal.points_reversed AS delta,
        reversal.created_at AS occurred_at
      FROM order_point_reversals reversal
    ) order_events
    UNION ALL
    SELECT sort_key, user_id, delta, occurred_at
    FROM (
      SELECT
        '5:wallet:' || wallet.id AS sort_key,
        wallet.user_id,
        wallet.delta,
        COALESCE(
          charge.created_at,
          withdrawal.created_at,
          wallet.created_at
        ) AS occurred_at
      FROM wallet_ledger wallet
      LEFT JOIN charge_requests charge
        ON wallet.request_type = 'charge'
       AND charge.id = wallet.request_id
      LEFT JOIN withdrawal_requests withdrawal
        ON wallet.request_type = 'withdrawal'
       AND withdrawal.id = wallet.request_id
      UNION ALL
      SELECT
        '6:admin:' || entry.id AS sort_key,
        entry.user_id,
        entry.delta,
        entry.created_at AS occurred_at
      FROM admin_point_ledger entry
      WHERE entry.deleted_at IS NULL
      UNION ALL
      SELECT
        '7:member:' || adjustment.id AS sort_key,
        adjustment.user_id,
        adjustment.after_points - adjustment.before_points AS delta,
        adjustment.created_at AS occurred_at
      FROM (
        SELECT
          id,
          entity_id AS user_id,
          created_at,
          CASE
            WHEN json_valid(details) = 1
            THEN CAST(json_extract(details, '$.before.points') AS INTEGER)
            ELSE NULL
          END AS before_points,
          CASE
            WHEN json_valid(details) = 1
            THEN CAST(json_extract(details, '$.after.points') AS INTEGER)
            ELSE NULL
          END AS after_points
        FROM admin_audit_logs
        WHERE action = 'member.update'
          AND entity_type = 'member'
      ) adjustment
      WHERE adjustment.before_points IS NOT NULL
        AND adjustment.after_points IS NOT NULL
        AND adjustment.after_points <> adjustment.before_points
    ) account_events
  `;
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

function normalizeOccurredAt(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  const match =
    /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::(\d{2}))?$/u.exec(
      normalized,
    );
  if (!match) return null;
  const milliseconds = Date.parse(
    `${match[1]}T${match[2]}:${match[3] ?? "00"}+09:00`,
  );
  if (
    !Number.isFinite(milliseconds) ||
    milliseconds < Date.parse("2000-01-01T00:00:00Z") ||
    milliseconds > Date.parse("2100-12-31T23:59:59Z")
  ) {
    return null;
  }
  return new Date(milliseconds)
    .toISOString()
    .replace("T", " ")
    .replace(/\.\d{3}Z$/u, "");
}

async function ensureSignedPointBalances(
  database: D1Database,
): Promise<void> {
  const definition = await database
    .prepare(
      `SELECT sql FROM sqlite_master
       WHERE type = 'table' AND name = 'admin_point_ledger'`,
    )
    .first<{ sql: string }>();
  const sql = definition?.sql ?? "";
  if (
    !sql.includes("balance_before >= 0") &&
    !sql.includes('"balance_before" >= 0')
  ) {
    return;
  }
  await database.batch([
    database.prepare(
      "ALTER TABLE admin_point_ledger RENAME TO admin_point_ledger_unsigned",
    ),
    database.prepare(`CREATE TABLE admin_point_ledger (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      delta INTEGER NOT NULL CHECK(delta <> 0),
      balance_before INTEGER NOT NULL
        CHECK(balance_before >= -${MAX_POINTS} AND balance_before <= ${MAX_POINTS}),
      balance_after INTEGER NOT NULL
        CHECK(balance_after >= -${MAX_POINTS} AND balance_after <= ${MAX_POINTS}),
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
      `INSERT INTO admin_point_ledger (
         id, user_id, delta, balance_before, balance_after, reason,
         expires_at, revision, admin_username, deleted_at, deleted_by,
         delete_reason, created_at
       )
       SELECT id, user_id, delta, balance_before, balance_after, reason,
              NULL, revision, admin_username, deleted_at, deleted_by,
              delete_reason, created_at
       FROM admin_point_ledger_unsigned`,
    ),
    database.prepare("DROP TABLE admin_point_ledger_unsigned"),
    database.prepare(
      `CREATE INDEX admin_point_ledger_user_idx
       ON admin_point_ledger(user_id, created_at)`,
    ),
    database.prepare(
      `CREATE INDEX admin_point_ledger_active_idx
       ON admin_point_ledger(deleted_at, created_at)`,
    ),
  ]);
}
