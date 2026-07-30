import { AdminApiError } from "@/lib/admin-api";
import { commerceDb, ensureCommerceSchema } from "@/lib/commerce-db";

export type ProductInteractionKind = "review" | "question";

export interface AdminProductInteraction {
  id: string;
  productId: string;
  userId: string;
  kind: ProductInteractionKind;
  authorName: string;
  title: string;
  body: string;
  rating: number;
  answer: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AdminInteractionPage {
  items: AdminProductInteraction[];
  page: number;
  pageSize: number;
  pageCount: number;
  total: number;
}

interface ProductInteractionRow {
  id: string;
  product_id: string;
  user_id: string;
  kind: string;
  author_name: string;
  title: string;
  body: string;
  rating: number;
  answer: string;
  active: number;
  created_at: string;
  updated_at: string;
}

export async function listAdminProductInteractions(
  kind: ProductInteractionKind,
  options: { page?: number; pageSize?: number; query?: string } = {},
): Promise<AdminInteractionPage> {
  await ensureCommerceSchema();
  const database = commerceDb();
  const pageSize = boundedInteger(options.pageSize, 30, 1, 100);
  const requestedPage = boundedInteger(options.page, 1, 1, 100_000);
  const query =
    typeof options.query === "string"
      ? options.query.replace(/\0/gu, "").trim().slice(0, 80)
      : "";
  const pattern = `%${query.replace(/[\\%_]/gu, (value) => `\\${value}`)}%`;
  const searchClause = query
    ? " AND (title LIKE ? ESCAPE '\\' OR body LIKE ? ESCAPE '\\' OR author_name LIKE ? ESCAPE '\\' OR product_id LIKE ? ESCAPE '\\')"
    : "";
  const searchBindings = query
    ? [pattern, pattern, pattern, pattern]
    : [];
  const count = await database
    .prepare(
      `SELECT COUNT(*) AS count
       FROM product_interactions
       WHERE kind = ?${searchClause}`,
    )
    .bind(kind, ...searchBindings)
    .first<{ count: number }>();
  const total = Number(count?.count ?? 0);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, pageCount);
  const result = await database
    .prepare(
      `SELECT id, product_id, user_id, kind, author_name, title, body,
              rating, answer, active, created_at, updated_at
       FROM product_interactions
       WHERE kind = ?${searchClause}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
    )
    .bind(kind, ...searchBindings, pageSize, (page - 1) * pageSize)
    .all<ProductInteractionRow>();
  return {
    items: (result.results ?? []).flatMap((row) => {
      const parsed = parseInteraction(row);
      return parsed ? [parsed] : [];
    }),
    page,
    pageSize,
    pageCount,
    total,
  };
}

export async function updateAdminProductInteraction(
  id: string,
  input: unknown,
  adminUsername: string,
): Promise<AdminProductInteraction> {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/u.test(id)) {
    throw new AdminApiError(400, "문의 식별값이 올바르지 않습니다.");
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new AdminApiError(400, "요청 형식이 올바르지 않습니다.");
  }
  const value = input as Record<string, unknown>;
  if (typeof value.answer !== "string") {
    throw new AdminApiError(400, "답변 내용을 확인해 주세요.", {
      answer: "답변은 문자열로 입력해 주세요.",
    });
  }
  const answer = value.answer.replace(/\0/gu, "").trim();
  if (answer.length > 5_000) {
    throw new AdminApiError(400, "답변 내용을 확인해 주세요.", {
      answer: "답변은 5000자 이하로 입력해 주세요.",
    });
  }
  if (typeof value.active !== "boolean") {
    throw new AdminApiError(400, "공개 상태를 확인해 주세요.");
  }

  await ensureCommerceSchema();
  const database = commerceDb();
  const results = await database.batch([
    database
      .prepare(
        `UPDATE product_interactions
         SET answer = ?, active = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      )
      .bind(answer, value.active ? 1 : 0, id),
    database
      .prepare(
        `INSERT INTO admin_audit_logs (
           admin_id, action, entity_type, entity_id, details
         )
         SELECT NULL, 'interaction.update', 'product_interaction', ?, ?
         WHERE EXISTS (
           SELECT 1 FROM product_interactions WHERE id = ?
         )`,
      )
      .bind(
        id,
        JSON.stringify({
          adminUsername: adminUsername.slice(0, 128),
          active: value.active,
          answerLength: answer.length,
        }),
        id,
      ),
  ]);
  if (!results[0]?.meta.changes) {
    throw new AdminApiError(404, "후기·문의를 찾을 수 없습니다.");
  }
  const row = await database
    .prepare(
      `SELECT id, product_id, user_id, kind, author_name, title, body,
              rating, answer, active, created_at, updated_at
       FROM product_interactions WHERE id = ? LIMIT 1`,
    )
    .bind(id)
    .first<ProductInteractionRow>();
  const interaction = row ? parseInteraction(row) : null;
  if (!interaction) {
    throw new AdminApiError(500, "수정된 후기·문의를 찾지 못했습니다.");
  }
  return interaction;
}

export async function deleteAdminProductInteraction(
  id: string,
  adminUsername: string,
): Promise<void> {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/u.test(id)) {
    throw new AdminApiError(400, "후기·문의 식별값이 올바르지 않습니다.");
  }
  await ensureCommerceSchema();
  const database = commerceDb();
  const results = await database.batch([
    database
      .prepare(
        `INSERT INTO admin_audit_logs (
           admin_id, action, entity_type, entity_id, details
         )
         SELECT NULL, 'interaction.delete', 'product_interaction', ?, ?
         WHERE EXISTS (
           SELECT 1 FROM product_interactions WHERE id = ?
         )`,
      )
      .bind(
        id,
        JSON.stringify({ adminUsername: adminUsername.slice(0, 128) }),
        id,
      ),
    database
      .prepare("DELETE FROM product_interactions WHERE id = ?")
      .bind(id),
  ]);
  if (!results[1]?.meta.changes) {
    throw new AdminApiError(404, "후기·문의를 찾을 수 없습니다.");
  }
}

function parseInteraction(
  row: ProductInteractionRow,
): AdminProductInteraction | null {
  if (row.kind !== "review" && row.kind !== "question") return null;
  return {
    id: row.id,
    productId: row.product_id,
    userId: row.user_id,
    kind: row.kind,
    authorName: row.author_name,
    title: row.title,
    body: row.body,
    rating: Number(row.rating),
    answer: row.answer,
    active: Boolean(row.active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function boundedInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  return Number.isFinite(value)
    ? Math.min(maximum, Math.max(minimum, Math.trunc(Number(value))))
    : fallback;
}
