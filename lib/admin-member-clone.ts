import { AdminApiError } from "@/lib/admin-api";
import { commerceDb } from "@/lib/commerce-db";
import {
  ensureAdminOperationsSchema,
  getAdminMemberDetail,
  type AdminMemberDetail,
} from "@/lib/admin-operations";

type SqlValue = string | number | null;

interface TableColumn {
  name: string;
  pk: number;
}

interface ColumnOverride {
  sql: string;
  values?: SqlValue[];
}

interface CloneTableSpec {
  table: string;
  whereSql: string;
  whereValues: SqlValue[];
  omit?: string[];
  overrides?: Record<string, ColumnOverride>;
}

interface CloneSchemaTable {
  name: string;
  columns: TableColumn[];
}

export interface AdminMemberCloneResult {
  sourceMemberId: string;
  loginId: string;
  member: AdminMemberDetail;
  copiedTables: string[];
}

const memberIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const numberedLoginPattern = /^(.*?)(\d+)$/u;
const cloneTableNames = [
  "users",
  "user_session_state",
  "orders",
  "order_items",
  "order_payment_details",
  "order_option_items",
  "order_point_debits",
  "order_point_credits",
  "order_point_reversals",
  "order_requests",
  "charge_requests",
  "withdrawal_requests",
  "wallet_ledger",
  "admin_point_ledger",
  "member_access_groups",
  "member_access_group_state",
  "product_interactions",
  "wishlist_items",
  "cart_items",
  "questions",
  "reviews",
  "coupon_claims",
  "coupon_redemptions",
  "clubs",
  "community_posts",
  "community_comments",
  "one_to_one_inquiries",
  "member_memos",
  "personal_payments",
  "personal_payment_notices",
  "admin_audit_logs",
] as const;

/**
 * Copies a member and every account-owned record while deliberately starting a
 * fresh login session and never inheriting an administrator account binding.
 */
export async function cloneAdminMember(
  sourceMemberId: string,
  adminUsername: string,
): Promise<AdminMemberCloneResult> {
  if (!memberIdPattern.test(sourceMemberId)) {
    throw new AdminApiError(400, "회원번호를 확인해 주세요.");
  }
  await ensureAdminOperationsSchema();
  const database = commerceDb();
  await ensureCloneEmailCompatibility(database);

  const source = await database
    .prepare("SELECT id, login_id FROM users WHERE id = ? LIMIT 1")
    .bind(sourceMemberId)
    .first<{ id: string; login_id: string }>();
  if (!source) {
    throw new AdminApiError(404, "복제할 회원을 찾을 수 없습니다.");
  }

  const loginParts = splitNumberedLoginId(source.login_id);
  const existingLogins = await database
    .prepare("SELECT login_id FROM users WHERE login_id GLOB ?")
    .bind(`${loginParts.prefix}*`)
    .all<{ login_id: string }>();
  const occupied = new Set(
    (existingLogins.results ?? []).map((row) => row.login_id),
  );
  const schema = await readCloneSchema(database);
  let nextNumber = loginParts.number + 1;

  for (let attempt = 0; attempt < 100; attempt += 1, nextNumber += 1) {
    const loginId = formatCloneLoginId(loginParts, nextNumber);
    if (occupied.has(loginId)) continue;

    const newUserId = crypto.randomUUID();
    const rowPrefix = `cl-${newUserId.replace(/-/gu, "").slice(0, 12)}-`;
    const specs = memberCloneSpecs({
      sourceMemberId,
      newUserId,
      loginId,
      rowPrefix,
    });
    const statements = specs.flatMap((spec) => {
      const table = schema.get(spec.table);
      return table ? [cloneStatement(database, table, spec)] : [];
    });

    const sessionTable = schema.get("user_session_state");
    if (sessionTable) {
      statements.push(
        database
          .prepare(
            `INSERT INTO user_session_state
               (user_id, session_version, updated_at)
             VALUES (?, 1, CURRENT_TIMESTAMP)`,
          )
          .bind(newUserId),
      );
    }
    if (schema.has("admin_audit_logs")) {
      statements.push(
        database
          .prepare(
            `INSERT INTO admin_audit_logs
               (action, entity_type, entity_id, details)
             VALUES ('member.clone', 'member', ?, ?)`,
          )
          .bind(
            newUserId,
            JSON.stringify({
              adminUsername: adminUsername.trim().slice(0, 128),
              sourceMemberId,
              sourceLoginId: source.login_id,
              loginId,
            }).slice(0, 10_000),
          ),
      );
    }

    try {
      await database.batch(statements);
    } catch (error) {
      if (isLoginIdConflict(error)) {
        occupied.add(loginId);
        continue;
      }
      throw error;
    }

    const member = await getAdminMemberDetail(newUserId);
    if (!member) {
      throw new AdminApiError(500, "복제한 회원 정보를 불러오지 못했습니다.");
    }
    return {
      sourceMemberId,
      loginId,
      member,
      copiedTables: specs
        .filter((spec) => schema.has(spec.table))
        .map((spec) => spec.table),
    };
  }

  throw new AdminApiError(
    409,
    "사용 가능한 다음 회원 아이디를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.",
  );
}

export function nextNumberedLoginId(
  sourceLoginId: string,
  existingLoginIds: Iterable<string>,
): string {
  const parts = splitNumberedLoginId(sourceLoginId);
  const occupied = new Set(existingLoginIds);
  for (let value = parts.number + 1; value < Number.MAX_SAFE_INTEGER; value += 1) {
    const candidate = formatCloneLoginId(parts, value);
    if (!occupied.has(candidate)) return candidate;
  }
  throw new AdminApiError(409, "사용 가능한 다음 회원 아이디가 없습니다.");
}

function splitNumberedLoginId(loginId: string): {
  prefix: string;
  number: number;
  width: number;
} {
  const match = numberedLoginPattern.exec(loginId);
  if (!match?.[1] || !match[2]) {
    throw new AdminApiError(
      400,
      "아이디 끝이 숫자인 회원만 복제할 수 있습니다.",
    );
  }
  const number = Number(match[2]);
  if (!Number.isSafeInteger(number)) {
    throw new AdminApiError(400, "회원 아이디의 끝 숫자를 확인해 주세요.");
  }
  return { prefix: match[1], number, width: match[2].length };
}

function formatCloneLoginId(
  parts: { prefix: string; width: number },
  number: number,
): string {
  const loginId = `${parts.prefix}${String(number).padStart(parts.width, "0")}`;
  if (loginId.length > 30) {
    throw new AdminApiError(
      409,
      "다음 회원 아이디가 30자를 초과합니다. 원본 아이디를 확인해 주세요.",
    );
  }
  return loginId;
}

async function readCloneSchema(
  database: D1Database,
): Promise<Map<string, CloneSchemaTable>> {
  const tableResult = await database
    .prepare(
      `SELECT name FROM sqlite_schema
       WHERE type = 'table' AND name IN (${cloneTableNames.map(() => "?").join(", ")})`,
    )
    .bind(...cloneTableNames)
    .all<{ name: string }>();
  const tableNames = (tableResult.results ?? []).map((row) => row.name);
  const entries = await Promise.all(
    tableNames.map(async (name) => {
      const result = await database
        .prepare(`PRAGMA table_info(${quoteIdentifier(name)})`)
        .all<TableColumn>();
      return [
        name,
        { name, columns: result.results ?? [] },
      ] as const;
    }),
  );
  return new Map(entries);
}

async function ensureCloneEmailCompatibility(
  database: D1Database,
): Promise<void> {
  const result = await database
    .prepare("PRAGMA index_list(users)")
    .all<{ name: string; unique: number }>();
  for (const index of result.results ?? []) {
    if (!index.unique) continue;
    const columns = await database
      .prepare(`PRAGMA index_info(${quoteIdentifier(index.name)})`)
      .all<{ name: string }>();
    const names = (columns.results ?? []).map((column) => column.name);
    if (names.length !== 1 || names[0] !== "email") continue;
    if (index.name === "users_email_uq") {
      await database.prepare("DROP INDEX IF EXISTS users_email_uq").run();
      continue;
    }
    throw new AdminApiError(
      503,
      "회원 복제용 데이터베이스 전환이 필요합니다. 관리자에게 문의해 주세요.",
    );
  }
}

function cloneStatement(
  database: D1Database,
  table: CloneSchemaTable,
  spec: CloneTableSpec,
): D1PreparedStatement {
  const omitted = new Set(spec.omit ?? []);
  const columns = table.columns.filter((column) => !omitted.has(column.name));
  const values: SqlValue[] = [];
  const selections = columns.map((column) => {
    const replacement = spec.overrides?.[column.name];
    if (!replacement) return `src.${quoteIdentifier(column.name)}`;
    values.push(...(replacement.values ?? []));
    return replacement.sql;
  });
  values.push(...spec.whereValues);
  const statement = database.prepare(
    `INSERT INTO ${quoteIdentifier(table.name)}
       (${columns.map((column) => quoteIdentifier(column.name)).join(", ")})
     SELECT ${selections.join(", ")}
     FROM ${quoteIdentifier(table.name)} AS src
     WHERE ${spec.whereSql}`,
  );
  return values.length > 0 ? statement.bind(...values) : statement;
}

function memberCloneSpecs(input: {
  sourceMemberId: string;
  newUserId: string;
  loginId: string;
  rowPrefix: string;
}): CloneTableSpec[] {
  const { sourceMemberId, newUserId, loginId, rowPrefix } = input;
  const sourceOrders =
    "SELECT id FROM orders WHERE user_id = ?";
  const sourcePayments =
    "SELECT id FROM personal_payments WHERE order_id IN (SELECT id FROM orders WHERE user_id = ?)";
  const prefixedId = (): ColumnOverride => ({
    sql: `? || src.${quoteIdentifier("id")}`,
    values: [rowPrefix],
  });
  const newUser = (): ColumnOverride => ({ sql: "?", values: [newUserId] });
  const prefixedOrder = (): ColumnOverride => ({
    sql: `? || src.${quoteIdentifier("order_id")}`,
    values: [rowPrefix],
  });

  return [
    {
      table: "users",
      whereSql: `src.${quoteIdentifier("id")} = ?`,
      whereValues: [sourceMemberId],
      overrides: {
        id: newUser(),
        login_id: { sql: "?", values: [loginId] },
      },
    },
    {
      table: "orders",
      whereSql: `src.${quoteIdentifier("user_id")} = ?`,
      whereValues: [sourceMemberId],
      overrides: { id: prefixedId(), user_id: newUser() },
    },
    ...[
      "order_items",
      "order_payment_details",
      "order_option_items",
      "order_point_debits",
      "order_point_credits",
      "order_point_reversals",
      "order_requests",
    ].map<CloneTableSpec>((table) => ({
      table,
      whereSql: `src.${quoteIdentifier("order_id")} IN (${sourceOrders})`,
      whereValues: [sourceMemberId],
      ...(table === "order_items" ? { omit: ["id"] } : {}),
      overrides: {
        order_id: prefixedOrder(),
        ...(table.startsWith("order_point_") ? { user_id: newUser() } : {}),
        ...(table === "order_requests"
          ? {
              request_key: {
                sql: `? || src.${quoteIdentifier("request_key")}`,
                values: [rowPrefix],
              },
            }
          : {}),
      },
    })),
    ...["charge_requests", "withdrawal_requests"].map<CloneTableSpec>(
      (table) => ({
        table,
        whereSql: `src.${quoteIdentifier("user_id")} = ?`,
        whereValues: [sourceMemberId],
        overrides: { id: prefixedId(), user_id: newUser() },
      }),
    ),
    {
      table: "wallet_ledger",
      whereSql: `src.${quoteIdentifier("user_id")} = ?`,
      whereValues: [sourceMemberId],
      overrides: {
        id: prefixedId(),
        user_id: newUser(),
        request_id: {
          sql: `? || src.${quoteIdentifier("request_id")}`,
          values: [rowPrefix],
        },
      },
    },
    {
      table: "admin_point_ledger",
      whereSql: `src.${quoteIdentifier("user_id")} = ?`,
      whereValues: [sourceMemberId],
      overrides: { id: prefixedId(), user_id: newUser() },
    },
    ...["member_access_groups", "member_access_group_state"].map<CloneTableSpec>(
      (table) => ({
        table,
        whereSql: `src.${quoteIdentifier("user_id")} = ?`,
        whereValues: [sourceMemberId],
        overrides: { user_id: newUser() },
      }),
    ),
    {
      table: "product_interactions",
      whereSql: `src.${quoteIdentifier("user_id")} = ?`,
      whereValues: [sourceMemberId],
      overrides: { id: prefixedId(), user_id: newUser() },
    },
    ...["wishlist_items", "cart_items"].map<CloneTableSpec>((table) => ({
      table,
      whereSql: `src.${quoteIdentifier("owner_key")} = ?`,
      whereValues: [sourceMemberId],
      omit: ["id"],
      overrides: { owner_key: newUser() },
    })),
    ...["questions", "reviews"].map<CloneTableSpec>((table) => ({
      table,
      whereSql: `src.${quoteIdentifier("user_id")} = ?`,
      whereValues: [sourceMemberId],
      omit: ["id"],
      overrides: { user_id: newUser() },
    })),
    {
      table: "coupon_claims",
      whereSql: `src.${quoteIdentifier("user_id")} = ?`,
      whereValues: [sourceMemberId],
      overrides: { user_id: newUser() },
    },
    {
      table: "coupon_redemptions",
      whereSql: `src.${quoteIdentifier("order_id")} IN (${sourceOrders}) OR src.${quoteIdentifier("claimant_key")} = ?`,
      whereValues: [sourceMemberId, `user:${sourceMemberId}`],
      overrides: {
        order_id: {
          sql: `CASE WHEN src.${quoteIdentifier("order_id")} IN (${sourceOrders}) THEN ? || src.${quoteIdentifier("order_id")} ELSE ? || src.${quoteIdentifier("order_id")} END`,
          values: [sourceMemberId, rowPrefix, rowPrefix],
        },
        claimant_key: {
          sql: `CASE WHEN src.${quoteIdentifier("claimant_key")} = ? THEN ? ELSE src.${quoteIdentifier("claimant_key")} END`,
          values: [`user:${sourceMemberId}`, `user:${newUserId}`],
        },
      },
    },
    {
      table: "clubs",
      whereSql: `src.${quoteIdentifier("owner_user_id")} = ?`,
      whereValues: [sourceMemberId],
      overrides: {
        id: prefixedId(),
        owner_user_id: newUser(),
        slug: {
          sql: `src.${quoteIdentifier("slug")} || '-' || ?`,
          values: [loginId.toLowerCase()],
        },
      },
    },
    {
      table: "community_posts",
      whereSql: `src.${quoteIdentifier("user_id")} = ?`,
      whereValues: [sourceMemberId],
      overrides: { id: prefixedId(), user_id: newUser() },
    },
    {
      table: "community_comments",
      whereSql: `src.${quoteIdentifier("user_id")} = ? OR src.${quoteIdentifier("post_id")} IN (SELECT id FROM community_posts WHERE user_id = ?)`,
      whereValues: [sourceMemberId, sourceMemberId],
      overrides: {
        id: prefixedId(),
        post_id: {
          sql: `CASE WHEN src.${quoteIdentifier("post_id")} IN (SELECT id FROM community_posts WHERE user_id = ?) THEN ? || src.${quoteIdentifier("post_id")} ELSE src.${quoteIdentifier("post_id")} END`,
          values: [sourceMemberId, rowPrefix],
        },
        user_id: {
          sql: `CASE WHEN src.${quoteIdentifier("user_id")} = ? THEN ? ELSE src.${quoteIdentifier("user_id")} END`,
          values: [sourceMemberId, newUserId],
        },
      },
    },
    {
      table: "one_to_one_inquiries",
      whereSql: `src.${quoteIdentifier("user_id")} = ?`,
      whereValues: [sourceMemberId],
      overrides: { id: prefixedId(), user_id: newUser() },
    },
    {
      table: "member_memos",
      whereSql: `src.${quoteIdentifier("sender_user_id")} = ? OR src.${quoteIdentifier("recipient_user_id")} = ?`,
      whereValues: [sourceMemberId, sourceMemberId],
      overrides: {
        id: prefixedId(),
        sender_user_id: {
          sql: `CASE WHEN src.${quoteIdentifier("sender_user_id")} = ? THEN ? ELSE src.${quoteIdentifier("sender_user_id")} END`,
          values: [sourceMemberId, newUserId],
        },
        recipient_user_id: {
          sql: `CASE WHEN src.${quoteIdentifier("recipient_user_id")} = ? THEN ? ELSE src.${quoteIdentifier("recipient_user_id")} END`,
          values: [sourceMemberId, newUserId],
        },
      },
    },
    {
      table: "personal_payments",
      whereSql: `src.${quoteIdentifier("order_id")} IN (${sourceOrders})`,
      whereValues: [sourceMemberId],
      overrides: {
        id: prefixedId(),
        public_token: {
          sql: `? || substr(src.${quoteIdentifier("public_token")}, 1, 70)`,
          values: [rowPrefix.replace(/-/gu, "_")],
        },
        order_id: prefixedOrder(),
      },
    },
    {
      table: "personal_payment_notices",
      whereSql: `src.${quoteIdentifier("payment_id")} IN (${sourcePayments})`,
      whereValues: [sourceMemberId],
      overrides: {
        payment_id: {
          sql: `? || src.${quoteIdentifier("payment_id")}`,
          values: [rowPrefix],
        },
      },
    },
  ];
}

function quoteIdentifier(value: string): string {
  return `"${value.replace(/"/gu, '""')}"`;
}

function isLoginIdConflict(error: unknown): boolean {
  return (
    error instanceof Error &&
    /UNIQUE constraint failed:\s*users\.login_id|users_login_id_uq/iu.test(
      error.message,
    )
  );
}
