import { AdminApiError } from "@/lib/admin-api";
import { ensureAdminCommunitySchema } from "@/lib/admin-community";
import { commerceDb } from "@/lib/commerce-db";
import { ensureAdminOperationsSchema } from "@/lib/admin-operations";

export interface AdminMemberAccessGroup {
  id: string;
  name: string;
  active: boolean;
  selected: boolean;
}

export interface AdminMemberAccessGroups {
  memberId: string;
  loginId: string;
  revision: number;
  groups: AdminMemberAccessGroup[];
}

interface GroupRow {
  id: string;
  name: string;
  active: number;
  selected: number;
}

const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const MAX_ACCESS_GROUPS = 100;
let accessGroupSchemaInitialization: Promise<void> | null = null;

export async function ensureAdminMemberAccessGroupSchema(): Promise<void> {
  await ensureAdminOperationsSchema();
  await ensureAdminCommunitySchema();
  if (!accessGroupSchemaInitialization) {
    const database = commerceDb();
    accessGroupSchemaInitialization = database
      .batch([
        database.prepare(`CREATE TABLE IF NOT EXISTS member_access_groups (
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          group_id TEXT NOT NULL REFERENCES community_groups(id) ON DELETE CASCADE,
          created_by TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (user_id, group_id)
        )`),
        database.prepare(
          `CREATE INDEX IF NOT EXISTS member_access_groups_group_idx
           ON member_access_groups(group_id, user_id)`,
        ),
        database.prepare(`CREATE TABLE IF NOT EXISTS member_access_group_state (
          user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          revision INTEGER NOT NULL DEFAULT 1 CHECK(revision >= 1),
          updated_by TEXT NOT NULL DEFAULT '',
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        database.prepare(`CREATE TABLE IF NOT EXISTS member_access_group_write_guards (
          operation_id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          guard_value INTEGER NOT NULL CHECK(guard_value = 1),
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
      ])
      .then(() => undefined)
      .catch((error) => {
        accessGroupSchemaInitialization = null;
        throw error;
      });
  }
  await accessGroupSchemaInitialization;
}

export async function getAdminMemberAccessGroups(
  memberId: string,
): Promise<AdminMemberAccessGroups> {
  assertIdentifier(memberId, "회원번호");
  await ensureAdminMemberAccessGroupSchema();
  const database = commerceDb();
  const member = await database
    .prepare("SELECT id, login_id FROM users WHERE id = ? LIMIT 1")
    .bind(memberId)
    .first<{ id: string; login_id: string }>();
  if (!member) {
    throw new AdminApiError(404, "회원을 찾을 수 없습니다.");
  }
  const [state, groupResult] = await Promise.all([
    database
      .prepare(
        `SELECT revision
         FROM member_access_group_state
         WHERE user_id = ?
         LIMIT 1`,
      )
      .bind(memberId)
      .first<{ revision: number }>(),
    database
      .prepare(
        `SELECT g.id, g.name, g.active,
                CASE WHEN membership.user_id IS NULL THEN 0 ELSE 1 END AS selected
         FROM community_groups g
         LEFT JOIN member_access_groups membership
           ON membership.group_id = g.id AND membership.user_id = ?
         WHERE g.active = 1 OR membership.user_id IS NOT NULL
         ORDER BY g.sort_order ASC, g.name ASC, g.id ASC`,
      )
      .bind(memberId)
      .all<GroupRow>(),
  ]);
  return {
    memberId: member.id,
    loginId: member.login_id,
    revision: Number(state?.revision ?? 0),
    groups: (groupResult.results ?? []).map((group) => ({
      id: group.id,
      name: group.name,
      active: Boolean(group.active),
      selected: Boolean(group.selected),
    })),
  };
}

export async function updateAdminMemberAccessGroups(
  memberId: string,
  input: unknown,
  adminUsername: string,
): Promise<AdminMemberAccessGroups> {
  assertIdentifier(memberId, "회원번호");
  const values = parseUpdateInput(input);
  await ensureAdminMemberAccessGroupSchema();
  const database = commerceDb();
  const member = await database
    .prepare("SELECT id, login_id FROM users WHERE id = ? LIMIT 1")
    .bind(memberId)
    .first<{ id: string; login_id: string }>();
  if (!member) {
    throw new AdminApiError(404, "회원을 찾을 수 없습니다.");
  }

  const [state, currentResult, requestedGroupResult] = await Promise.all([
    database
      .prepare(
        `SELECT revision
         FROM member_access_group_state
         WHERE user_id = ?
         LIMIT 1`,
      )
      .bind(memberId)
      .first<{ revision: number }>(),
    database
      .prepare(
        `SELECT group_id
         FROM member_access_groups
         WHERE user_id = ?
         ORDER BY group_id ASC`,
      )
      .bind(memberId)
      .all<{ group_id: string }>(),
    values.groupIds.length > 0
      ? database
          .prepare(
            `SELECT id, active
             FROM community_groups
             WHERE id IN (${values.groupIds.map(() => "?").join(", ")})`,
          )
          .bind(...values.groupIds)
          .all<{ id: string; active: number }>()
      : Promise.resolve({ results: [] as Array<{ id: string; active: number }> }),
  ]);
  const currentRevision = Number(state?.revision ?? 0);
  if (currentRevision !== values.expectedRevision) {
    throw new AdminApiError(
      409,
      "회원 접근그룹이 다른 관리자 작업에서 변경되었습니다. 목록을 다시 불러와 주세요.",
    );
  }

  const currentGroupIds = (currentResult.results ?? []).map(
    (row) => row.group_id,
  );
  const currentGroupSet = new Set(currentGroupIds);
  const requestedGroups = new Map(
    (requestedGroupResult.results ?? []).map((group) => [group.id, group]),
  );
  for (const groupId of values.groupIds) {
    const group = requestedGroups.get(groupId);
    if (!group) {
      throw new AdminApiError(400, "존재하지 않는 접근그룹이 포함되어 있습니다.");
    }
    if (!group.active && !currentGroupSet.has(groupId)) {
      throw new AdminApiError(
        409,
        "사용 중지된 접근그룹을 새로 배정할 수 없습니다.",
      );
    }
  }

  const operationId = crypto.randomUUID();
  const normalizedAdmin = adminUsername.trim().slice(0, 128);
  const nextRevision = currentRevision + 1;
  const statements: D1PreparedStatement[] = [];
  if (currentRevision === 0) {
    statements.push(
      database
        .prepare(
          `INSERT INTO member_access_group_state (
             user_id, revision, updated_by, updated_at
           ) VALUES (?, 1, ?, CURRENT_TIMESTAMP)`,
        )
        .bind(memberId, normalizedAdmin),
    );
  } else {
    statements.push(
      database
        .prepare(
          `UPDATE member_access_group_state
           SET revision = revision + 1,
               updated_by = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE user_id = ? AND revision = ?`,
        )
        .bind(normalizedAdmin, memberId, currentRevision),
    );
  }
  statements.push(
    database
      .prepare(
        `INSERT INTO member_access_group_write_guards (
           operation_id, user_id, guard_value
         ) VALUES (
           ?, ?, CASE WHEN changes() = 1 THEN 1 ELSE 0 END
         )`,
      )
      .bind(operationId, memberId),
    database
      .prepare("DELETE FROM member_access_groups WHERE user_id = ?")
      .bind(memberId),
  );
  for (const groupId of values.groupIds) {
    statements.push(
      database
        .prepare(
          `INSERT INTO member_access_groups (
             user_id, group_id, created_by
           ) VALUES (?, ?, ?)`,
        )
        .bind(memberId, groupId, normalizedAdmin),
    );
  }
  statements.push(
    database
      .prepare(
        `INSERT INTO admin_audit_logs (
           admin_id, action, entity_type, entity_id, details
         ) VALUES (NULL, 'member.groups.update', 'member', ?, ?)`,
      )
      .bind(
        memberId,
        JSON.stringify({
          adminUsername: normalizedAdmin,
          loginId: member.login_id,
          revisionBefore: currentRevision,
          revisionAfter: nextRevision,
          before: currentGroupIds,
          after: values.groupIds,
        }),
      ),
    database
      .prepare(
        `DELETE FROM member_access_group_write_guards
         WHERE operation_id = ?`,
      )
      .bind(operationId),
  );

  try {
    await database.batch(statements);
  } catch (error) {
    if (isAccessGroupConflict(error)) {
      throw new AdminApiError(
        409,
        "회원 접근그룹이 다른 관리자 작업에서 변경되었습니다. 목록을 다시 불러와 주세요.",
      );
    }
    throw error;
  }
  return getAdminMemberAccessGroups(memberId);
}

function parseUpdateInput(input: unknown): {
  groupIds: string[];
  expectedRevision: number;
} {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new AdminApiError(400, "접근그룹 요청 형식을 확인해 주세요.");
  }
  const body = input as Record<string, unknown>;
  if (
    !Array.isArray(body.groupIds) ||
    body.groupIds.length > MAX_ACCESS_GROUPS
  ) {
    throw new AdminApiError(
      400,
      `접근그룹은 한 번에 ${MAX_ACCESS_GROUPS}개까지 선택할 수 있습니다.`,
    );
  }
  const seen = new Set<string>();
  const groupIds = body.groupIds.map((value, index) => {
    const id = typeof value === "string" ? value.trim() : "";
    if (!identifierPattern.test(id) || seen.has(id)) {
      throw new AdminApiError(
        400,
        `${index + 1}번째 접근그룹을 확인해 주세요.`,
      );
    }
    seen.add(id);
    return id;
  });
  if (
    typeof body.expectedRevision !== "number" ||
    !Number.isSafeInteger(body.expectedRevision) ||
    body.expectedRevision < 0 ||
    body.expectedRevision > 2_147_483_647
  ) {
    throw new AdminApiError(
      400,
      "최신 접근그룹 목록을 다시 불러온 뒤 저장해 주세요.",
    );
  }
  return {
    groupIds: groupIds.sort((left, right) => left.localeCompare(right)),
    expectedRevision: body.expectedRevision,
  };
}

function assertIdentifier(value: string, label: string): void {
  if (!identifierPattern.test(value)) {
    throw new AdminApiError(400, `${label} 형식이 올바르지 않습니다.`);
  }
}

function isAccessGroupConflict(error: unknown): boolean {
  return (
    error instanceof Error &&
    /member_access_group_(?:state|write_guards)|guard_value|UNIQUE constraint|FOREIGN KEY constraint|constraint failed/iu.test(
      error.message,
    )
  );
}
