import { AdminApiError } from "@/lib/admin-api";
import legacyStockBaselineSource from "@/data/legacy-stock-baseline.json";
import {
  ensureAdminProductSchema,
  getAdminProductRecords,
  productDatabase,
} from "@/lib/admin-products";
import { ensureCommerceSchema } from "@/lib/commerce-db";

export interface AdminProductStockRow {
  id: string;
  categoryId: string;
  name: string;
  image: string;
  warehouseStock: number;
  stockQuantity: number;
  pendingStock: number;
  availableStock: number;
  notificationQuantity: number;
  saleEnabled: boolean;
  soldOut: boolean;
  restockNotification: boolean;
  controlRevision: number;
  lowStock: boolean;
}

export interface AdminProductStockWrite {
  id: string;
  expectedStock: number;
  expectedControlRevision: number;
  stock: number;
  notificationQuantity: number;
  saleEnabled: boolean;
  soldOut: boolean;
  restockNotification: boolean;
}

interface ProductStockOptions {
  database?: D1Database;
}

interface PendingStockRow {
  product_id: string;
  pending_stock: number;
}

const MAX_STOCK_ROWS_PER_WRITE = 50;
const MAX_STOCK_QUANTITY = 10_000_000;
const validProductId = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u;
const legacyStockOrder = new Map(
  legacyStockBaselineSource.map((row, index) => [String(row.code), index]),
);
const legacyWarehouseStock = new Map(
  legacyStockBaselineSource.map((row) => [
    String(row.code),
    Number(String(row.warehouseDisplay).replaceAll(",", "")),
  ]),
);

export async function getAdminProductStockRows(
  options: ProductStockOptions = {},
): Promise<AdminProductStockRow[]> {
  if (!options.database) {
    await ensureCommerceSchema();
  }
  const database = options.database ?? productDatabase();
  await ensureAdminProductSchema(database);
  const [records, pendingResult] = await Promise.all([
    getAdminProductRecords({ database, strict: true }),
    database
      .prepare(
        `SELECT oi.product_id, COALESCE(SUM(oi.quantity), 0) AS pending_stock
         FROM order_items oi
         INNER JOIN orders o ON o.id = oi.order_id
         WHERE o.status IN ('ordered', 'payment_confirmed', 'preparing')
           AND o.payment_status NOT IN ('failed', 'cancelled')
         GROUP BY oi.product_id`,
      )
      .all<PendingStockRow>(),
  ]);
  const pendingByProduct = new Map(
    (pendingResult.results ?? []).map((row) => [
      row.product_id,
      Math.max(0, Number(row.pending_stock) || 0),
    ]),
  );

  return records
    .map(({ product, stockControlRevision }) => {
      const pendingStock = pendingByProduct.get(product.id) ?? 0;
      const notificationQuantity =
        product.stockNotificationQuantity ?? 0;
      return {
        id: product.id,
        categoryId: product.categoryId,
        name: product.name,
        image: product.images[0] || "/legacy/logo.png",
        warehouseStock:
          legacyWarehouseStock.get(product.id) ?? product.stock,
        stockQuantity: product.stock,
        pendingStock,
        availableStock: product.stock - pendingStock,
        notificationQuantity,
        saleEnabled: product.active,
        soldOut: product.soldOut ?? false,
        restockNotification: product.restockNotification ?? false,
        controlRevision: stockControlRevision,
        lowStock: product.stock <= notificationQuantity,
      };
    })
    .sort((left, right) => {
      const leftOrder = legacyStockOrder.get(left.id);
      const rightOrder = legacyStockOrder.get(right.id);
      if (leftOrder !== undefined || rightOrder !== undefined) {
        if (leftOrder === undefined) return 1;
        if (rightOrder === undefined) return -1;
        return leftOrder - rightOrder;
      }
      return right.id.localeCompare(left.id, "ko-KR", {
        numeric: true,
        sensitivity: "base",
      });
    });
}

export async function updateAdminProductStockRows(
  input: unknown,
  adminUsername: string,
  options: ProductStockOptions = {},
): Promise<AdminProductStockRow[]> {
  const writes = validateStockWrites(input);
  if (!options.database) {
    await ensureCommerceSchema();
  }
  const database = options.database ?? productDatabase();
  await ensureAdminProductSchema(database);
  const records = await getAdminProductRecords({
    database,
    strict: true,
  });
  const recordsById = new Map(
    records.map((record) => [record.product.id, record]),
  );

  for (const write of writes) {
    const current = recordsById.get(write.id);
    if (!current) {
      throw new AdminApiError(
        404,
        `${write.id} 상품을 찾을 수 없습니다.`,
      );
    }
    if (
      current.product.stock !== write.expectedStock ||
      current.stockControlRevision !== write.expectedControlRevision
    ) {
      throw new AdminApiError(
        409,
        `${write.id} 상품의 재고 또는 설정이 다른 작업에서 변경되었습니다. 최신 정보를 다시 불러와 주세요.`,
      );
    }
  }

  const updatedBy = adminUsername.slice(0, 128);
  const statements: D1PreparedStatement[] = [];
  for (const write of writes) {
    statements.push(
      database
        .prepare(
          `INSERT INTO product_stock (product_id, stock, updated_at)
           SELECT ?, ?, CURRENT_TIMESTAMP
           WHERE COALESCE(
                   (SELECT stock FROM product_stock WHERE product_id = ?),
                   ?
                 ) = ?
             AND NOT EXISTS (
               SELECT 1 FROM product_changes
               WHERE product_id = ? AND change_type = 'deleted'
             )
           ON CONFLICT(product_id) DO UPDATE SET
             stock = excluded.stock,
             updated_at = CURRENT_TIMESTAMP`,
        )
        .bind(
          write.id,
          write.stock,
          write.id,
          write.expectedStock,
          write.expectedStock,
          write.id,
        ),
    );

    if (write.expectedControlRevision === 0) {
      statements.push(
        database
          .prepare(
            `INSERT INTO product_stock_controls (
               product_id, notification_qty, sale_enabled, sold_out,
               restock_notification, revision, updated_by
             )
             SELECT ?, ?, ?, ?, ?, 1, ?
             WHERE changes() = 1
               AND NOT EXISTS (
                 SELECT 1 FROM product_stock_controls WHERE product_id = ?
               )`,
          )
          .bind(
            write.id,
            write.notificationQuantity,
            write.saleEnabled ? 1 : 0,
            write.soldOut ? 1 : 0,
            write.restockNotification ? 1 : 0,
            updatedBy,
            write.id,
          ),
      );
    } else {
      statements.push(
        database
          .prepare(
            `UPDATE product_stock_controls
             SET notification_qty = ?,
                 sale_enabled = ?,
                 sold_out = ?,
                 restock_notification = ?,
                 revision = revision + 1,
                 updated_by = ?,
                 updated_at = CURRENT_TIMESTAMP
             WHERE product_id = ?
               AND revision = ?
               AND changes() = 1`,
          )
          .bind(
            write.notificationQuantity,
            write.saleEnabled ? 1 : 0,
            write.soldOut ? 1 : 0,
            write.restockNotification ? 1 : 0,
            updatedBy,
            write.id,
            write.expectedControlRevision,
          ),
      );
    }

    statements.push(
      database
        .prepare(
          `INSERT INTO product_stock_write_guards (
             product_id, guard_value, updated_at
           ) VALUES (
             ?,
             CASE WHEN changes() = 1 THEN 1 ELSE NULL END,
             CURRENT_TIMESTAMP
           )
           ON CONFLICT(product_id) DO UPDATE SET
             guard_value = excluded.guard_value,
             updated_at = CURRENT_TIMESTAMP`,
        )
        .bind(write.id),
    );
  }

  try {
    await database.batch(statements);
  } catch (error) {
    if (
      error instanceof Error &&
      /product_stock|product_changes|product_stock_controls|product_stock_write_guards|not null|constraint/iu.test(
        error.message,
      )
    ) {
      throw new AdminApiError(
        409,
        "저장 중 주문 또는 다른 관리자 작업으로 재고가 변경되었습니다. 최신 정보를 다시 불러온 뒤 저장해 주세요.",
      );
    }
    throw error;
  }

  const updatedIds = new Set(writes.map((write) => write.id));
  return (await getAdminProductStockRows({ database })).filter((row) =>
    updatedIds.has(row.id),
  );
}

export function validateStockWrites(
  input: unknown,
): AdminProductStockWrite[] {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new AdminApiError(400, "재고 저장 요청 형식이 올바르지 않습니다.");
  }
  const rows = (input as { rows?: unknown }).rows;
  if (
    !Array.isArray(rows) ||
    rows.length === 0 ||
    rows.length > MAX_STOCK_ROWS_PER_WRITE
  ) {
    throw new AdminApiError(
      400,
      `한 번에 1개 이상 ${MAX_STOCK_ROWS_PER_WRITE}개 이하의 상품을 저장해 주세요.`,
    );
  }

  const seen = new Set<string>();
  return rows.map((row, index) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw new AdminApiError(
        400,
        `${index + 1}번째 상품 재고 형식이 올바르지 않습니다.`,
      );
    }
    const value = row as Record<string, unknown>;
    const id =
      typeof value.id === "string" ? value.id.trim() : "";
    if (!validProductId.test(id) || seen.has(id)) {
      throw new AdminApiError(
        400,
        `${index + 1}번째 상품코드를 확인해 주세요.`,
      );
    }
    seen.add(id);

    return {
      id,
      expectedStock: boundedInteger(
        value.expectedStock,
        "기존 창고재고",
      ),
      expectedControlRevision: boundedInteger(
        value.expectedControlRevision,
        "설정 기준값",
        2_147_483_647,
      ),
      stock: boundedInteger(value.stock, "재고수정"),
      notificationQuantity: boundedInteger(
        value.notificationQuantity,
        "통보수량",
      ),
      saleEnabled: requiredBoolean(value.saleEnabled, "판매"),
      soldOut: requiredBoolean(value.soldOut, "품절"),
      restockNotification: requiredBoolean(
        value.restockNotification,
        "재입고 알림",
      ),
    };
  });
}

function boundedInteger(
  value: unknown,
  label: string,
  maximum = MAX_STOCK_QUANTITY,
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > maximum
  ) {
    throw new AdminApiError(
      400,
      `${label}은(는) 0 이상 ${maximum.toLocaleString("ko-KR")} 이하의 정수로 입력해 주세요.`,
    );
  }
  return value;
}

function requiredBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new AdminApiError(400, `${label} 설정을 확인해 주세요.`);
  }
  return value;
}
