import { AdminApiError } from "@/lib/admin-api";
import {
  commerceDb,
  ensureCommerceSchema,
} from "@/lib/commerce-db";

const orderIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;

interface DeleteOrderInput {
  confirmation?: unknown;
  expectedUpdatedAt?: unknown;
}

interface DeleteCandidateRow {
  id: string;
  status: string;
  payment_status: string;
  payment_method: string;
  discount: number;
  refund_amount: number;
  updated_at: string;
  history_count: number;
}

interface OrderItemStockRow {
  product_id: string;
  quantity: number;
}

interface OrderOptionStockRow {
  option_id: string;
  quantity: number;
}

let deleteSchemaInitialization: Promise<void> | null = null;

export async function deleteSafeIncompleteOrder(
  id: string,
  input: unknown,
  adminUsername: string,
): Promise<{
  deletedId: string;
  restoredProducts: number;
  restoredUnits: number;
}> {
  if (!orderIdPattern.test(id)) {
    throw new AdminApiError(400, "주문번호 형식이 올바르지 않습니다.");
  }
  const body = asDeleteInput(input);
  if (body.confirmation !== id) {
    throw new AdminApiError(400, "삭제할 주문번호 확인값이 일치하지 않습니다.");
  }
  if (
    typeof body.expectedUpdatedAt !== "string" ||
    body.expectedUpdatedAt.length < 10 ||
    body.expectedUpdatedAt.length > 40
  ) {
    throw new AdminApiError(
      400,
      "주문 변경 기준값이 없습니다. 목록을 새로 불러와 주세요.",
    );
  }

  await ensureDeleteSchema();
  const database = commerceDb();
  const candidate = await database
    .prepare(
      `SELECT
         o.id, o.status, o.payment_status, o.payment_method, o.discount,
         o.refund_amount, o.updated_at,
         (
           EXISTS (
             SELECT 1 FROM order_point_debits debit
             WHERE debit.order_id = o.id
           )
           + EXISTS (
             SELECT 1 FROM order_point_credits credit
             WHERE credit.order_id = o.id
           )
           + EXISTS (
             SELECT 1 FROM order_point_reversals reversal
             WHERE reversal.order_id = o.id
           )
           + EXISTS (
             SELECT 1 FROM order_inventory_adjustments adjustment
             WHERE adjustment.order_id = o.id
           )
         ) AS history_count
       FROM orders o
       WHERE o.id = ?
       LIMIT 1`,
    )
    .bind(id)
    .first<DeleteCandidateRow>();
  if (!candidate) {
    throw new AdminApiError(404, "주문을 찾을 수 없습니다.");
  }
  assertSafeCandidate(candidate, body.expectedUpdatedAt);

  const itemResult = await database
    .prepare(
      `SELECT product_id, SUM(quantity) AS quantity
       FROM order_items
       WHERE order_id = ?
       GROUP BY product_id
       ORDER BY product_id`,
    )
    .bind(id)
    .all<OrderItemStockRow>();
  const items = (itemResult.results ?? []).map((row) => ({
    product_id: row.product_id,
    quantity: Number(row.quantity),
  }));
  if (
    items.length === 0 ||
    items.some(
      (item) =>
        !item.product_id ||
        !Number.isSafeInteger(item.quantity) ||
        item.quantity <= 0,
    )
  ) {
    throw new AdminApiError(
      409,
      "주문 상품 또는 재고 복원 정보를 확인할 수 없어 삭제하지 않았습니다.",
    );
  }
  const optionResult = await database
    .prepare(
      `SELECT option_id, quantity
       FROM order_option_items
       WHERE order_id = ?
       ORDER BY option_id`,
    )
    .bind(id)
    .all<OrderOptionStockRow>();
  const optionItems = (optionResult.results ?? []).map((row) => ({
    option_id: row.option_id,
    quantity: Number(row.quantity),
  }));
  if (
    optionItems.some(
      (item) =>
        !item.option_id ||
        !Number.isSafeInteger(item.quantity) ||
        item.quantity <= 0,
    )
  ) {
    throw new AdminApiError(
      409,
      "주문 옵션 재고 복원 정보를 확인할 수 없어 삭제하지 않았습니다.",
    );
  }

  const safeCondition = `EXISTS (
    SELECT 1
    FROM orders guarded_order
    WHERE guarded_order.id = ?
      AND guarded_order.updated_at = ?
      AND guarded_order.status = 'ordered'
      AND guarded_order.payment_status = 'pending'
      AND guarded_order.payment_method = 'bank'
      AND guarded_order.discount = 0
      AND guarded_order.refund_amount = 0
      AND NOT EXISTS (
        SELECT 1 FROM order_point_debits debit
        WHERE debit.order_id = guarded_order.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM order_point_credits credit
        WHERE credit.order_id = guarded_order.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM order_point_reversals reversal
        WHERE reversal.order_id = guarded_order.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM order_inventory_adjustments adjustment
        WHERE adjustment.order_id = guarded_order.id
      )
  )`;
  const statements: D1PreparedStatement[] = [
    database
      .prepare(
        `INSERT INTO admin_order_delete_guards (
           order_id, guard_value
         ) VALUES (?, CASE WHEN ${safeCondition} THEN 1 ELSE 0 END)
         ON CONFLICT(order_id) DO UPDATE SET
           guard_value = excluded.guard_value`,
      )
      .bind(id, id, body.expectedUpdatedAt),
  ];

  for (const item of items) {
    statements.push(
      database
        .prepare(
          `INSERT INTO admin_order_delete_stock_guards (
             order_id, product_id, guard_value
           ) VALUES (
             ?, ?,
             CASE
               WHEN ${safeCondition}
                 AND EXISTS (
                   SELECT 1 FROM product_stock WHERE product_id = ?
                 )
               THEN 1 ELSE 0
             END
           )
           ON CONFLICT(order_id, product_id) DO UPDATE SET
             guard_value = excluded.guard_value`,
        )
        .bind(
          id,
          item.product_id,
          id,
          body.expectedUpdatedAt,
          item.product_id,
        ),
      database
        .prepare(
          `UPDATE product_stock
           SET stock = stock + ?, updated_at = CURRENT_TIMESTAMP
           WHERE product_id = ?`,
        )
        .bind(item.quantity, item.product_id),
    );
  }
  for (const item of optionItems) {
    statements.push(
      database
        .prepare(
          `INSERT INTO admin_order_delete_option_guards (
             order_id, option_id, guard_value
           ) VALUES (
             ?, ?,
             CASE
               WHEN ${safeCondition}
                 AND EXISTS (
                   SELECT 1 FROM product_options WHERE id = ?
                 )
               THEN 1 ELSE 0
             END
           )
           ON CONFLICT(order_id, option_id) DO UPDATE SET
             guard_value = excluded.guard_value`,
        )
        .bind(
          id,
          item.option_id,
          id,
          body.expectedUpdatedAt,
          item.option_id,
        ),
      database
        .prepare(
          `UPDATE product_options
           SET stock = stock + ?,
               revision = revision + 1,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
        )
        .bind(item.quantity, item.option_id),
    );
  }

  statements.push(
    database
      .prepare("DELETE FROM order_requests WHERE order_id = ?")
      .bind(id),
    database
      .prepare("DELETE FROM order_payment_details WHERE order_id = ?")
      .bind(id),
    database
      .prepare("DELETE FROM order_catalog_guards WHERE order_id = ?")
      .bind(id),
    database
      .prepare("DELETE FROM order_option_guards WHERE order_id = ?")
      .bind(id),
    database
      .prepare("DELETE FROM order_option_items WHERE order_id = ?")
      .bind(id),
    database.prepare("DELETE FROM order_items WHERE order_id = ?").bind(id),
    database
      .prepare(
        `DELETE FROM orders
         WHERE id = ?
           AND updated_at = ?
           AND status = 'ordered'
           AND payment_status = 'pending'
         RETURNING id`,
      )
      .bind(id, body.expectedUpdatedAt),
    database
      .prepare(
        `INSERT INTO admin_audit_logs (
           action, entity_type, entity_id, details
         ) VALUES ('order.delete_incomplete', 'order', ?, ?)`,
      )
      .bind(
        id,
        JSON.stringify({
          restoredProducts: items.length,
          restoredUnits: items.reduce(
            (sum, item) => sum + item.quantity,
            0,
          ),
          adminUsername: adminUsername.slice(0, 128),
        }),
      ),
  );

  let results: D1Result<unknown>[];
  try {
    results = await database.batch(statements);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/admin_order_delete|guard_value|constraint|not null/iu.test(message)) {
      throw new AdminApiError(
        409,
        "주문이 변경되었거나 안전 삭제 조건을 충족하지 않아 삭제하지 않았습니다.",
      );
    }
    throw error;
  }

  const deleteResult = results[results.length - 2];
  const deleted = deleteResult?.results?.[0] as { id?: unknown } | undefined;
  if (deleted?.id !== id) {
    throw new AdminApiError(
      409,
      "주문이 변경되어 삭제하지 않았습니다. 목록을 새로 불러와 주세요.",
    );
  }

  return {
    deletedId: id,
    restoredProducts: items.length,
    restoredUnits: items.reduce((sum, item) => sum + item.quantity, 0),
  };
}

async function ensureDeleteSchema(): Promise<void> {
  await ensureCommerceSchema();
  if (!deleteSchemaInitialization) {
    const database = commerceDb();
    deleteSchemaInitialization = database
      .batch([
        database.prepare(`CREATE TABLE IF NOT EXISTS admin_order_delete_guards (
          order_id TEXT PRIMARY KEY,
          guard_value INTEGER NOT NULL CHECK(guard_value = 1),
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        database.prepare(`CREATE TABLE IF NOT EXISTS admin_order_delete_stock_guards (
          order_id TEXT NOT NULL,
          product_id TEXT NOT NULL,
          guard_value INTEGER NOT NULL CHECK(guard_value = 1),
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (order_id, product_id)
        )`),
        database.prepare(`CREATE TABLE IF NOT EXISTS admin_order_delete_option_guards (
          order_id TEXT NOT NULL,
          option_id TEXT NOT NULL,
          guard_value INTEGER NOT NULL CHECK(guard_value = 1),
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (order_id, option_id)
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
      ])
      .then(() => undefined)
      .catch((error) => {
        deleteSchemaInitialization = null;
        throw error;
      });
  }
  await deleteSchemaInitialization;
}

function assertSafeCandidate(
  candidate: DeleteCandidateRow,
  expectedUpdatedAt: string,
): void {
  if (candidate.updated_at !== expectedUpdatedAt) {
    throw new AdminApiError(
      409,
      "주문이 목록 조회 이후 변경되었습니다. 목록을 새로 불러와 주세요.",
    );
  }
  if (
    candidate.status !== "ordered" ||
    candidate.payment_status !== "pending" ||
    candidate.payment_method !== "bank" ||
    Number(candidate.discount) !== 0 ||
    Number(candidate.refund_amount) !== 0 ||
    Number(candidate.history_count) !== 0
  ) {
    throw new AdminApiError(
      409,
      "미입금 주문접수 상태이며 포인트·배송·취소 처리 이력이 없는 주문만 삭제할 수 있습니다.",
    );
  }
}

function asDeleteInput(value: unknown): DeleteOrderInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AdminApiError(400, "삭제 확인 정보를 입력해 주세요.");
  }
  return value as DeleteOrderInput;
}
