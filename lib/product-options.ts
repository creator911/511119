import type { ProductOption } from "@/app/components/storefront/types";
import { AdminApiError } from "@/lib/admin-api";
import {
  ensureAdminProductSchema,
  getAdminProductRecords,
  productDatabase,
} from "@/lib/admin-products";
import { commerceDb, ensureCommerceSchema } from "@/lib/commerce-db";

export interface ProductOptionRow {
  id: string;
  productId: string;
  optionName: string;
  optionValue: string;
  priceDelta: number;
  stock: number;
  saleEnabled: boolean;
  soldOut: boolean;
  sortOrder: number;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminProductOptionProduct {
  id: string;
  name: string;
  image: string;
  basePrice: number;
  setRevision: number;
  options: ProductOptionRow[];
}

interface ProductOptionReadOptions {
  database?: D1Database;
  includeDeleted?: boolean;
}

interface ProductOptionInputRow {
  id: string | null;
  expectedRevision: number;
  expectedStock: number;
  optionName: string;
  optionValue: string;
  priceDelta: number;
  stock: number;
  saleEnabled: boolean;
  soldOut: boolean;
  sortOrder: number;
}

interface ProductOptionWriteInput {
  productId: string;
  expectedSetRevision: number;
  rows: ProductOptionInputRow[];
}

interface StoredOptionRow {
  id: string;
  product_id: string;
  option_name: string;
  option_value: string;
  price_delta: number;
  stock: number;
  sale_enabled: number;
  sold_out: number;
  sort_order: number;
  revision: number;
  created_at: string;
  updated_at: string;
}

const optionSchemaInitializations = new WeakMap<object, Promise<void>>();
const productIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u;
const optionIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u;
const MAX_OPTIONS_PER_PRODUCT = 100;
const MAX_OPTION_GROUPS = 12;
const MAX_STOCK = 10_000_000;
const MAX_PRICE_DELTA = 10_000_000;

export async function ensureProductOptionSchema(
  database = commerceDb(),
): Promise<void> {
  const cacheKey = database as unknown as object;
  let initialization = optionSchemaInitializations.get(cacheKey);
  if (!initialization) {
    initialization = database
      .batch([
        database.prepare(`CREATE TABLE IF NOT EXISTS product_options (
          id TEXT PRIMARY KEY,
          product_id TEXT NOT NULL,
          option_name TEXT NOT NULL,
          option_value TEXT NOT NULL,
          price_delta INTEGER NOT NULL DEFAULT 0,
          stock INTEGER NOT NULL DEFAULT 0 CHECK(stock >= 0),
          sale_enabled INTEGER NOT NULL DEFAULT 1
            CHECK(sale_enabled IN (0, 1)),
          sold_out INTEGER NOT NULL DEFAULT 0
            CHECK(sold_out IN (0, 1)),
          sort_order INTEGER NOT NULL DEFAULT 0,
          deleted INTEGER NOT NULL DEFAULT 0 CHECK(deleted IN (0, 1)),
          revision INTEGER NOT NULL DEFAULT 1 CHECK(revision >= 1),
          updated_by TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        database.prepare(
          "CREATE INDEX IF NOT EXISTS product_options_product_idx ON product_options(product_id, deleted, sort_order)",
        ),
        database.prepare(
          `CREATE UNIQUE INDEX IF NOT EXISTS product_options_active_value_uq
           ON product_options(product_id, option_name, option_value)
           WHERE deleted = 0`,
        ),
        database.prepare(`CREATE TABLE IF NOT EXISTS product_option_sets (
          product_id TEXT PRIMARY KEY,
          revision INTEGER NOT NULL DEFAULT 1 CHECK(revision >= 1),
          updated_by TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        database.prepare(`CREATE TABLE IF NOT EXISTS product_option_write_guards (
          operation_id TEXT PRIMARY KEY,
          option_id TEXT NOT NULL,
          guard_value INTEGER NOT NULL CHECK(guard_value = 1),
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        database.prepare(
          "CREATE INDEX IF NOT EXISTS product_option_write_guards_option_idx ON product_option_write_guards(option_id)",
        ),
        database.prepare(`CREATE TABLE IF NOT EXISTS order_option_items (
          order_id TEXT NOT NULL,
          option_id TEXT NOT NULL,
          product_id TEXT NOT NULL,
          quantity INTEGER NOT NULL CHECK(quantity > 0),
          option_name TEXT NOT NULL,
          option_value TEXT NOT NULL,
          price_delta INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (order_id, option_id)
        )`),
        database.prepare(
          "CREATE INDEX IF NOT EXISTS order_option_items_product_idx ON order_option_items(product_id)",
        ),
        database.prepare(`CREATE TABLE IF NOT EXISTS order_option_guards (
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
        optionSchemaInitializations.delete(cacheKey);
        throw error;
      });
    optionSchemaInitializations.set(cacheKey, initialization);
  }
  await initialization;
}

export async function getProductOptionRows(
  productIds: readonly string[],
  options: ProductOptionReadOptions = {},
): Promise<ProductOptionRow[]> {
  const uniqueIds = [
    ...new Set(productIds.filter((id) => productIdPattern.test(id))),
  ];
  if (!uniqueIds.length) return [];
  if (!options.database) await ensureCommerceSchema();
  const database = options.database ?? commerceDb();
  await ensureProductOptionSchema(database);
  const storedRows: StoredOptionRow[] = [];
  const bindChunkSize = 80;
  for (let offset = 0; offset < uniqueIds.length; offset += bindChunkSize) {
    const idChunk = uniqueIds.slice(offset, offset + bindChunkSize);
    const placeholders = idChunk.map(() => "?").join(", ");
    const result = await database
      .prepare(
        `SELECT id, product_id, option_name, option_value, price_delta, stock,
                sale_enabled, sold_out, sort_order, revision, created_at,
                updated_at
         FROM product_options
         WHERE product_id IN (${placeholders})
           ${options.includeDeleted ? "" : "AND deleted = 0"}
         ORDER BY product_id, option_name, sort_order, option_value, id`,
      )
      .bind(...idChunk)
      .all<StoredOptionRow>();
    storedRows.push(...(result.results ?? []));
  }
  storedRows.sort(
    (left, right) =>
      left.product_id.localeCompare(right.product_id) ||
      left.option_name.localeCompare(right.option_name) ||
      left.sort_order - right.sort_order ||
      left.option_value.localeCompare(right.option_value) ||
      left.id.localeCompare(right.id),
  );
  return storedRows.flatMap(parseStoredOptionRow);
}

export async function getStorefrontProductOptions(
  productId: string,
  options: ProductOptionReadOptions = {},
): Promise<ProductOption[]> {
  const rows = await getProductOptionRows([productId], options);
  const groups = new Map<string, ProductOption>();
  for (const row of rows) {
    let group = groups.get(row.optionName);
    if (!group) {
      group = {
        id: row.optionName,
        label: row.optionName,
        required: true,
        values: [],
      };
      groups.set(row.optionName, group);
    }
    group.values.push({
      id: row.id,
      value: row.id,
      label: row.optionValue,
      priceDelta: row.priceDelta,
      stock: row.stock,
      disabled: !row.saleEnabled || row.soldOut || row.stock <= 0,
    });
  }
  return [...groups.values()];
}

export async function getAdminProductOptionProducts(
  options: ProductOptionReadOptions = {},
): Promise<AdminProductOptionProduct[]> {
  const database = options.database ?? productDatabase();
  await Promise.all([
    ensureAdminProductSchema(database),
    ensureProductOptionSchema(database),
  ]);
  const records = await getAdminProductRecords({
    database,
    strict: true,
  });
  const ids = records.map((record) => record.product.id);
  const [optionRows, setResult] = await Promise.all([
    getProductOptionRows(ids, { database }),
    database
      .prepare(
        `SELECT product_id, revision
         FROM product_option_sets
         ORDER BY product_id`,
      )
      .all<{ product_id: string; revision: number }>(),
  ]);
  const optionsByProduct = new Map<string, ProductOptionRow[]>();
  for (const row of optionRows) {
    const current = optionsByProduct.get(row.productId) ?? [];
    current.push(row);
    optionsByProduct.set(row.productId, current);
  }
  const revisionByProduct = new Map(
    (setResult.results ?? []).map((row) => [
      row.product_id,
      Number(row.revision) || 0,
    ]),
  );
  return records
    .map(({ product }) => ({
      id: product.id,
      name: product.name,
      image: product.images[0] || "/legacy/logo.png",
      basePrice: product.price,
      setRevision: revisionByProduct.get(product.id) ?? 0,
      options: optionsByProduct.get(product.id) ?? [],
    }))
    .sort((left, right) =>
      right.id.localeCompare(left.id, "ko-KR", {
        numeric: true,
        sensitivity: "base",
      }),
    );
}

export async function saveAdminProductOptions(
  input: unknown,
  adminUsername: string,
  options: ProductOptionReadOptions = {},
): Promise<AdminProductOptionProduct> {
  const write = validateProductOptionWrite(input);
  const database = options.database ?? productDatabase();
  await Promise.all([
    ensureAdminProductSchema(database),
    ensureProductOptionSchema(database),
  ]);
  const productRecords = await getAdminProductRecords({
    database,
    strict: true,
  });
  const productRecord = productRecords.find(
    (record) => record.product.id === write.productId,
  );
  if (!productRecord) {
    throw new AdminApiError(404, "상품을 찾을 수 없습니다.");
  }
  if (
    write.rows.some(
      (row) => productRecord.product.price + row.priceDelta < 0,
    )
  ) {
    throw new AdminApiError(
      400,
      "옵션 추가금 적용 후 판매가격은 0원 이상이어야 합니다.",
    );
  }

  const [currentRows, setRow] = await Promise.all([
    getProductOptionRows([write.productId], { database }),
    database
      .prepare(
        `SELECT revision
         FROM product_option_sets
         WHERE product_id = ?
         LIMIT 1`,
      )
      .bind(write.productId)
      .first<{ revision: number }>(),
  ]);
  const currentSetRevision = Number(setRow?.revision) || 0;
  if (currentSetRevision !== write.expectedSetRevision) {
    throw new AdminApiError(
      409,
      "옵션 목록이 다른 작업에서 변경되었습니다. 새로고침 후 다시 저장해 주세요.",
    );
  }
  const currentById = new Map(currentRows.map((row) => [row.id, row]));
  const submittedIds = new Set<string>();
  for (const row of write.rows) {
    if (!row.id) continue;
    const current = currentById.get(row.id);
    if (
      !current ||
      submittedIds.has(row.id) ||
      current.revision !== row.expectedRevision ||
      current.stock !== row.expectedStock
    ) {
      throw new AdminApiError(
        409,
        "옵션 정보 또는 재고가 변경되었습니다. 최신 목록을 불러와 다시 저장해 주세요.",
      );
    }
    submittedIds.add(row.id);
  }

  const updatedBy = adminUsername.trim().slice(0, 128);
  const statements: D1PreparedStatement[] = [];
  const setOperationId = crypto.randomUUID();
  if (write.expectedSetRevision === 0) {
    statements.push(
      database
        .prepare(
          `INSERT INTO product_option_sets (
             product_id, revision, updated_by
           )
           SELECT ?, 1, ?
           WHERE NOT EXISTS (
             SELECT 1 FROM product_option_sets WHERE product_id = ?
           )
             AND NOT EXISTS (
               SELECT 1 FROM product_changes
               WHERE product_id = ? AND change_type = 'deleted'
             )`,
        )
        .bind(write.productId, updatedBy, write.productId, write.productId),
    );
  } else {
    statements.push(
      database
        .prepare(
          `UPDATE product_option_sets
           SET revision = revision + 1,
               updated_by = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE product_id = ?
             AND revision = ?
             AND NOT EXISTS (
               SELECT 1 FROM product_changes
               WHERE product_id = ? AND change_type = 'deleted'
             )`,
        )
        .bind(
          updatedBy,
          write.productId,
          write.expectedSetRevision,
          write.productId,
        ),
    );
  }
  statements.push(optionWriteGuard(database, setOperationId, write.productId));

  for (const row of write.rows) {
    const optionId = row.id ?? crypto.randomUUID();
    if (row.id) {
      statements.push(
        database
          .prepare(
            `UPDATE product_options
             SET option_name = ?,
                 option_value = ?,
                 price_delta = ?,
                 stock = ?,
                 sale_enabled = ?,
                 sold_out = ?,
                 sort_order = ?,
                 revision = revision + 1,
                 updated_by = ?,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?
               AND product_id = ?
               AND revision = ?
               AND stock = ?
               AND deleted = 0`,
          )
          .bind(
            row.optionName,
            row.optionValue,
            row.priceDelta,
            row.stock,
            row.saleEnabled ? 1 : 0,
            row.soldOut ? 1 : 0,
            row.sortOrder,
            updatedBy,
            row.id,
            write.productId,
            row.expectedRevision,
            row.expectedStock,
          ),
      );
    } else {
      statements.push(
        database
          .prepare(
            `INSERT INTO product_options (
               id, product_id, option_name, option_value, price_delta, stock,
               sale_enabled, sold_out, sort_order, deleted, revision,
               updated_by
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?)`,
          )
          .bind(
            optionId,
            write.productId,
            row.optionName,
            row.optionValue,
            row.priceDelta,
            row.stock,
            row.saleEnabled ? 1 : 0,
            row.soldOut ? 1 : 0,
            row.sortOrder,
            updatedBy,
          ),
      );
    }
    statements.push(
      optionWriteGuard(database, crypto.randomUUID(), optionId),
    );
  }

  for (const current of currentRows) {
    if (submittedIds.has(current.id)) continue;
    statements.push(
      database
        .prepare(
          `UPDATE product_options
           SET deleted = 1,
               sale_enabled = 0,
               revision = revision + 1,
               updated_by = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?
             AND product_id = ?
             AND revision = ?
             AND stock = ?
             AND deleted = 0`,
        )
        .bind(
          updatedBy,
          current.id,
          write.productId,
          current.revision,
          current.stock,
        ),
    );
    statements.push(
      optionWriteGuard(database, crypto.randomUUID(), current.id),
    );
  }

  statements.push(
    database
      .prepare(
        `INSERT INTO admin_audit_logs (
           action, entity_type, entity_id, details
         ) VALUES ('product.options.save', 'product', ?, ?)`,
      )
      .bind(
        write.productId,
        JSON.stringify({
          optionCount: write.rows.length,
          removedCount: currentRows.length - submittedIds.size,
          adminUsername: updatedBy,
        }),
      ),
  );

  try {
    await database.batch(statements);
  } catch (error) {
    if (
      error instanceof Error &&
      /product_options|product_option_sets|product_option_write_guards|guard_value|unique|constraint|not null/iu.test(
        error.message,
      )
    ) {
      throw new AdminApiError(
        409,
        "옵션 정보 또는 재고가 변경되었거나 같은 옵션이 중복되었습니다. 최신 목록을 불러와 다시 저장해 주세요.",
      );
    }
    throw error;
  }

  const products = await getAdminProductOptionProducts({ database });
  const saved = products.find((product) => product.id === write.productId);
  if (!saved) throw new AdminApiError(404, "상품을 찾을 수 없습니다.");
  return saved;
}

function optionWriteGuard(
  database: D1Database,
  operationId: string,
  optionId: string,
): D1PreparedStatement {
  return database
    .prepare(
      `INSERT INTO product_option_write_guards (
         operation_id, option_id, guard_value
       ) VALUES (
         ?, ?,
         CASE WHEN changes() = 1 THEN 1 ELSE 0 END
       )`,
    )
    .bind(operationId, optionId);
}

function validateProductOptionWrite(input: unknown): ProductOptionWriteInput {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new AdminApiError(400, "옵션 저장 형식을 확인해 주세요.");
  }
  const value = input as Record<string, unknown>;
  const productId =
    typeof value.productId === "string" ? value.productId.trim() : "";
  if (!productIdPattern.test(productId)) {
    throw new AdminApiError(400, "상품코드를 확인해 주세요.");
  }
  const expectedSetRevision = boundedInteger(
    value.expectedSetRevision,
    "옵션 목록 변경 기준값",
    2_147_483_647,
  );
  if (
    !Array.isArray(value.rows) ||
    value.rows.length > MAX_OPTIONS_PER_PRODUCT
  ) {
    throw new AdminApiError(
      400,
      `옵션은 상품별 ${MAX_OPTIONS_PER_PRODUCT}개까지 저장할 수 있습니다.`,
    );
  }
  const pairKeys = new Set<string>();
  const ids = new Set<string>();
  const groupNames = new Set<string>();
  const rows = value.rows.map((row, index) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw new AdminApiError(400, `${index + 1}번째 옵션을 확인해 주세요.`);
    }
    const item = row as Record<string, unknown>;
    const id =
      typeof item.id === "string" && item.id.trim()
        ? item.id.trim()
        : null;
    if (id && (!optionIdPattern.test(id) || ids.has(id))) {
      throw new AdminApiError(400, `${index + 1}번째 옵션번호를 확인해 주세요.`);
    }
    if (id) ids.add(id);
    const optionName = normalizedText(
      item.optionName,
      "옵션명",
      80,
      index,
    );
    const optionValue = normalizedText(
      item.optionValue,
      "옵션값",
      120,
      index,
    );
    const pairKey = `${optionName}\u0000${optionValue}`;
    if (pairKeys.has(pairKey)) {
      throw new AdminApiError(
        400,
        `${optionName} / ${optionValue} 옵션이 중복되었습니다.`,
      );
    }
    pairKeys.add(pairKey);
    groupNames.add(optionName);
    return {
      id,
      expectedRevision: id
        ? boundedInteger(
            item.expectedRevision,
            "옵션 변경 기준값",
            2_147_483_647,
          )
        : 0,
      expectedStock: id
        ? boundedInteger(item.expectedStock, "기존 옵션재고", MAX_STOCK)
        : 0,
      optionName,
      optionValue,
      priceDelta: signedInteger(
        item.priceDelta,
        "추가금",
        MAX_PRICE_DELTA,
      ),
      stock: boundedInteger(item.stock, "옵션재고", MAX_STOCK),
      saleEnabled: requiredBoolean(item.saleEnabled, "판매"),
      soldOut: requiredBoolean(item.soldOut, "품절"),
      sortOrder: boundedInteger(item.sortOrder, "정렬순서", 1_000_000),
    };
  });
  if (groupNames.size > MAX_OPTION_GROUPS) {
    throw new AdminApiError(
      400,
      `옵션명은 상품별 ${MAX_OPTION_GROUPS}개까지 사용할 수 있습니다.`,
    );
  }
  return { productId, expectedSetRevision, rows };
}

function parseStoredOptionRow(row: StoredOptionRow): ProductOptionRow[] {
  const stock = Number(row.stock);
  const revision = Number(row.revision);
  const priceDelta = Number(row.price_delta);
  const sortOrder = Number(row.sort_order);
  if (
    !optionIdPattern.test(row.id) ||
    !productIdPattern.test(row.product_id) ||
    !row.option_name ||
    !row.option_value ||
    !Number.isSafeInteger(stock) ||
    stock < 0 ||
    !Number.isSafeInteger(revision) ||
    revision < 1 ||
    !Number.isSafeInteger(priceDelta) ||
    !Number.isSafeInteger(sortOrder)
  ) {
    return [];
  }
  return [
    {
      id: row.id,
      productId: row.product_id,
      optionName: row.option_name,
      optionValue: row.option_value,
      priceDelta,
      stock,
      saleEnabled: Boolean(row.sale_enabled),
      soldOut: Boolean(row.sold_out),
      sortOrder,
      revision,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
  ];
}

function normalizedText(
  value: unknown,
  label: string,
  maximum: number,
  index: number,
): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (
    !normalized ||
    normalized.length > maximum ||
    /[\u0000-\u001f\u007f]/u.test(normalized)
  ) {
    throw new AdminApiError(
      400,
      `${index + 1}번째 ${label}을(를) ${maximum}자 이하로 입력해 주세요.`,
    );
  }
  return normalized;
}

function boundedInteger(
  value: unknown,
  label: string,
  maximum: number,
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > maximum
  ) {
    throw new AdminApiError(
      400,
      `${label}은(는) 0 이상 ${maximum.toLocaleString("ko-KR")} 이하의 정수여야 합니다.`,
    );
  }
  return value;
}

function signedInteger(
  value: unknown,
  label: string,
  maximumAbsolute: number,
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    Math.abs(value) > maximumAbsolute
  ) {
    throw new AdminApiError(
      400,
      `${label}은(는) ${maximumAbsolute.toLocaleString("ko-KR")}원 범위의 정수여야 합니다.`,
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
