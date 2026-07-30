import { env } from "cloudflare:workers";
import catalogSource from "@/data/catalog.json";
import productAdminBaselineSource from "@/data/legacy-product-admin-baseline.json";
import { AdminApiError } from "@/lib/admin-api";
import {
  categoryCatalogGenerationId,
  getCategoryCatalogGeneration,
  getEffectiveCategoryRecords,
} from "@/lib/categories";

export interface ManagedProductFlags {
  hit: boolean;
  recommend: boolean;
  new: boolean;
  popular: boolean;
  sale: boolean;
}

export interface ManagedCatalogProduct {
  id: string;
  categoryId: string;
  primaryCategoryId: string;
  secondaryCategoryId: string;
  tertiaryCategoryId: string;
  name: string;
  basic: string;
  price: number;
  originalPrice: number;
  stock: number;
  maker: string;
  origin: string;
  brand: string;
  model: string;
  flags: ManagedProductFlags;
  images: string[];
  detailHtml: string;
  active: boolean;
  sortOrder: number;
  viewCount: number;
  rewardPoints: number;
  desktopSkin: string;
  mobileSkin: string;
  stockNotificationQuantity: number;
  soldOut: boolean;
  restockNotification: boolean;
}

export type ProductChangeType = "override" | "created" | "deleted";
export type ProductRecordSource = "static" | ProductChangeType;

export interface ProductChangeRow {
  product_id: string;
  change_type: string;
  payload_json: string;
  revision: number;
  updated_by: string;
  created_at: string;
  updated_at: string;
}

export interface ProductStockRow {
  product_id: string;
  stock: number;
  updated_at: string;
}

export interface ProductStockControlRow {
  product_id: string;
  notification_qty: number;
  sale_enabled: number;
  sold_out: number;
  restock_notification: number;
  revision: number;
  updated_by: string;
  updated_at: string;
}

export interface AdminProductRecord {
  product: ManagedCatalogProduct;
  source: ProductRecordSource;
  deleted: boolean;
  revision: number;
  stockControlRevision: number;
  updatedBy: string;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface ProductReadOptions {
  database?: D1Database;
  strict?: boolean;
  includeDeleted?: boolean;
}

export interface ProductWriteOptions {
  database?: D1Database;
  adminUsername: string;
}

interface CatalogFile {
  categories: Array<{ id: string; active: boolean }>;
  products: ManagedCatalogProduct[];
}

interface ProductWriteGuards {
  category?: {
    generation: number;
    id: string;
    revision: number;
  };
  createOnly?: boolean;
  expectedRevision?: number;
  expectedStock?: number;
  expectedStockControlRevision?: number;
}

interface LegacyProductAdminBaseline {
  id: string;
  primaryCategoryId: string;
  secondaryCategoryId: string;
  tertiaryCategoryId: string;
  sortOrder: number;
  saleEnabled: boolean;
  soldOut: boolean;
  viewCount: number;
  rewardPoints: number;
  desktopSkin: string;
  mobileSkin: string;
}

const catalog = catalogSource as unknown as CatalogFile;
const productAdminBaseline =
  productAdminBaselineSource as LegacyProductAdminBaseline[];
const productAdminBaselineById = new Map(
  productAdminBaseline.map((product) => [product.id, product]),
);
const staticProducts = catalog.products.map(cloneProduct);
const staticProductById = new Map(
  staticProducts.map((product) => [product.id, product]),
);
const knownCategoryIds = new Set(
  catalog.categories
    .filter((category) => category.active)
    .map((category) => category.id),
);
const schemaInitializations = new WeakMap<object, Promise<void>>();
const validProductId = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u;
const localLegacyAsset = /^\/legacy\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]+$/u;
const uploadedAsset = /^\/api\/media\/[a-f0-9]{32}\.(?:jpg|png|webp|gif)$/u;

export function productDatabase(): D1Database {
  const database = (env as unknown as { DB?: D1Database }).DB;
  if (!database) {
    throw new AdminApiError(503, "상품 데이터베이스가 준비되지 않았습니다.");
  }
  return database;
}

export async function ensureAdminProductSchema(
  database = productDatabase(),
): Promise<void> {
  const cacheKey = database as unknown as object;
  let initialization = schemaInitializations.get(cacheKey);
  if (!initialization) {
    initialization = database
      .batch([
        database.prepare(`CREATE TABLE IF NOT EXISTS product_changes (
          product_id TEXT PRIMARY KEY,
          change_type TEXT NOT NULL,
          payload_json TEXT NOT NULL DEFAULT '{}',
          revision INTEGER NOT NULL DEFAULT 1,
          updated_by TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        database.prepare(
          "CREATE INDEX IF NOT EXISTS product_changes_type_idx ON product_changes(change_type)",
        ),
        database.prepare(
          "CREATE INDEX IF NOT EXISTS product_changes_updated_idx ON product_changes(updated_at)",
        ),
        database.prepare(`CREATE TABLE IF NOT EXISTS media_assets (
          id TEXT PRIMARY KEY,
          object_key TEXT NOT NULL UNIQUE,
          file_name TEXT NOT NULL,
          content_type TEXT NOT NULL,
          size INTEGER NOT NULL DEFAULT 0,
          alt TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        database.prepare(`CREATE TABLE IF NOT EXISTS product_stock (
          product_id TEXT PRIMARY KEY,
          stock INTEGER NOT NULL DEFAULT 0 CHECK(stock >= 0),
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        database.prepare(`CREATE TABLE IF NOT EXISTS product_stock_controls (
          product_id TEXT PRIMARY KEY,
          notification_qty INTEGER NOT NULL DEFAULT 0
            CHECK(notification_qty >= 0),
          sale_enabled INTEGER NOT NULL DEFAULT 1
            CHECK(sale_enabled IN (0, 1)),
          sold_out INTEGER NOT NULL DEFAULT 0
            CHECK(sold_out IN (0, 1)),
          restock_notification INTEGER NOT NULL DEFAULT 0
            CHECK(restock_notification IN (0, 1)),
          revision INTEGER NOT NULL DEFAULT 1,
          updated_by TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        database.prepare(`CREATE TABLE IF NOT EXISTS product_stock_write_guards (
          product_id TEXT PRIMARY KEY,
          guard_value INTEGER NOT NULL CHECK(guard_value = 1),
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        database.prepare(`CREATE TABLE IF NOT EXISTS product_type_write_guards (
          operation_id TEXT PRIMARY KEY,
          product_id TEXT NOT NULL,
          guard_value INTEGER NOT NULL CHECK(guard_value = 1),
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        database.prepare(
          "CREATE INDEX IF NOT EXISTS product_type_write_guards_product_idx ON product_type_write_guards(product_id)",
        ),
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
        schemaInitializations.delete(cacheKey);
        throw error;
      });
    schemaInitializations.set(cacheKey, initialization);
  }
  await initialization;
}

export async function getEffectiveProducts(
  options: ProductReadOptions = {},
): Promise<ManagedCatalogProduct[]> {
  const records = await getAdminProductRecords({
    ...options,
    includeDeleted: false,
  });
  return records.map((record) => cloneProduct(record.product));
}

export async function getEffectiveProduct(
  id: string | null | undefined,
  options: ProductReadOptions = {},
): Promise<ManagedCatalogProduct | undefined> {
  if (!id) return undefined;
  const products = await getEffectiveProducts(options);
  return products.find((product) => product.id === id);
}

export async function getAdminProductRecords(
  options: ProductReadOptions = {},
): Promise<AdminProductRecord[]> {
  let changes: ProductChangeRow[];
  let stockRows: ProductStockRow[];
  let stockControlRows: ProductStockControlRow[];
  try {
    const database = options.database ?? productDatabase();
    await ensureAdminProductSchema(database);
    const result = await database
      .prepare(
        `SELECT product_id, change_type, payload_json, revision, updated_by,
                created_at, updated_at
         FROM product_changes
         ORDER BY created_at ASC, product_id ASC`,
      )
      .all<ProductChangeRow>();
    changes = result.results ?? [];
    const stockResult = await database
      .prepare(
        "SELECT product_id, stock, updated_at FROM product_stock ORDER BY product_id ASC",
      )
      .all<ProductStockRow>();
    stockRows = stockResult.results ?? [];
    const stockControlResult = await database
      .prepare(
        `SELECT product_id, notification_qty, sale_enabled, sold_out,
                restock_notification, revision, updated_by, updated_at
         FROM product_stock_controls
         ORDER BY product_id ASC`,
      )
      .all<ProductStockControlRow>();
    stockControlRows = stockControlResult.results ?? [];
  } catch (error) {
    if (options.strict) throw error;
    changes = [];
    stockRows = [];
    stockControlRows = [];
  }

  return mergeProductChanges(
    staticProducts,
    changes,
    options.includeDeleted ?? false,
    stockRows,
    stockControlRows,
  );
}

export function mergeProductChanges(
  baseline: readonly ManagedCatalogProduct[],
  changes: readonly ProductChangeRow[],
  includeDeleted = false,
  stockRows: readonly ProductStockRow[] = [],
  stockControlRows: readonly ProductStockControlRow[] = [],
): AdminProductRecord[] {
  const records = new Map<string, AdminProductRecord>();
  const deletedRecords: AdminProductRecord[] = [];

  for (const product of baseline) {
    records.set(product.id, {
      product: cloneProduct(product),
      source: "static",
      deleted: false,
      revision: 0,
      stockControlRevision: 0,
      updatedBy: "",
      createdAt: null,
      updatedAt: null,
    });
  }

  for (const change of changes) {
    if (!isProductChangeType(change.change_type)) continue;
    const storedProduct = parseStoredProduct(change.payload_json);

    if (change.change_type === "deleted") {
      const previous = records.get(change.product_id);
      records.delete(change.product_id);
      if (includeDeleted) {
        const product = storedProduct ?? previous?.product;
        if (product) {
          deletedRecords.push({
            product: cloneProduct(product),
            source: "deleted",
            deleted: true,
            revision: Number(change.revision),
            stockControlRevision: 0,
            updatedBy: change.updated_by,
            createdAt: change.created_at,
            updatedAt: change.updated_at,
          });
        }
      }
      continue;
    }

    if (!storedProduct || storedProduct.id !== change.product_id) continue;
    records.set(change.product_id, {
      product: cloneProduct(storedProduct),
      source: change.change_type,
      deleted: false,
      revision: Number(change.revision),
      stockControlRevision: 0,
      updatedBy: change.updated_by,
      createdAt: change.created_at,
      updatedAt: change.updated_at,
    });
  }

  for (const stockRow of stockRows) {
    const record = records.get(stockRow.product_id);
    if (
      record &&
      Number.isSafeInteger(stockRow.stock) &&
      stockRow.stock >= 0
    ) {
      record.product = {
        ...record.product,
        stock: Number(stockRow.stock),
      };
      records.set(stockRow.product_id, record);
    }
  }

  for (const controlRow of stockControlRows) {
    const record = records.get(controlRow.product_id);
    if (
      !record ||
      !Number.isSafeInteger(controlRow.notification_qty) ||
      controlRow.notification_qty < 0 ||
      !Number.isSafeInteger(controlRow.revision) ||
      controlRow.revision < 1
    ) {
      continue;
    }
    record.product = {
      ...record.product,
      active: Boolean(controlRow.sale_enabled),
      stockNotificationQuantity: Number(controlRow.notification_qty),
      soldOut: Boolean(controlRow.sold_out),
      restockNotification: Boolean(controlRow.restock_notification),
    };
    record.stockControlRevision = Number(controlRow.revision);
    records.set(controlRow.product_id, record);
  }

  return [...records.values(), ...deletedRecords];
}

async function readStableProductCategoryRecords(
  database: D1Database,
): Promise<{
  records: Awaited<ReturnType<typeof getEffectiveCategoryRecords>>;
  generation: number;
}> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const before = await getCategoryCatalogGeneration(database);
    const records = await getEffectiveCategoryRecords({
      database,
      strict: true,
    });
    const after = await getCategoryCatalogGeneration(database);
    if (before === after) {
      return { records, generation: after };
    }
  }
  throw new AdminApiError(
    409,
    "상품분류가 다른 작업에서 변경되었습니다. 최신 정보를 다시 불러와 주세요.",
  );
}

export async function createManagedProduct(
  input: unknown,
  options: ProductWriteOptions,
): Promise<AdminProductRecord> {
  const database = options.database ?? productDatabase();
  await ensureAdminProductSchema(database);
  const categorySnapshot =
    await readStableProductCategoryRecords(database);
  const allowedCategoryIds = new Set(
    categorySnapshot.records.map((record) => record.category.id),
  );
  const product = validateProductInput(
    input,
    undefined,
    undefined,
    allowedCategoryIds,
  );
  const categoryRecord = categorySnapshot.records.find(
    (record) => record.category.id === product.categoryId,
  );
  if (!categoryRecord) {
    throw new AdminApiError(409, "상품분류가 변경되었습니다.");
  }

  if (staticProductById.has(product.id)) {
    throw new AdminApiError(409, "이미 사용 중인 상품코드입니다.", {
      sku: "다른 상품코드를 입력해 주세요.",
    });
  }

  const existingChange = await readProductChange(product.id, database);
  if (existingChange) {
    throw new AdminApiError(409, "이미 사용 중인 상품코드입니다.", {
      sku: "다른 상품코드를 입력해 주세요.",
    });
  }

  return writeProductChange(
    product,
    "created",
    options.adminUsername,
    database,
    {
      createOnly: true,
      category: {
        generation: categorySnapshot.generation,
        id: categoryRecord.category.id,
        revision: categoryRecord.revision,
      },
    },
  );
}

export async function updateManagedProduct(
  id: string,
  input: unknown,
  options: ProductWriteOptions,
): Promise<AdminProductRecord> {
  assertProductId(id);
  const database = options.database ?? productDatabase();
  const body = asObject(input);
  const [records, categorySnapshot] = await Promise.all([
    getAdminProductRecords({
      database,
      strict: true,
    }),
    readStableProductCategoryRecords(database),
  ]);
  const currentRecord = records.find((record) => record.product.id === id);
  if (!currentRecord) {
    throw new AdminApiError(404, "상품을 찾을 수 없습니다.");
  }
  const current = currentRecord.product;
  const expectedRevision = body.expectedRevision;
  if (
    typeof expectedRevision !== "number" ||
    !Number.isSafeInteger(expectedRevision) ||
    expectedRevision < 0 ||
    expectedRevision > 2_147_483_647
  ) {
    throw new AdminApiError(400, "상품 변경 기준값을 확인해 주세요.");
  }
  if (expectedRevision !== currentRecord.revision) {
    throw new AdminApiError(
      409,
      "다른 작업에서 상품 정보가 변경되었습니다. 최신 정보를 다시 불러와 주세요.",
    );
  }
  const expectedStock = body.expectedStock;
  if (
    typeof expectedStock !== "number" ||
    !Number.isSafeInteger(expectedStock) ||
    expectedStock < 0 ||
    expectedStock > 10_000_000
  ) {
    throw new AdminApiError(400, "상품 재고 기준값을 확인해 주세요.", {
      stock: "상품 정보를 새로 불러온 뒤 다시 저장해 주세요.",
    });
  }
  if (expectedStock !== current.stock) {
    throw new AdminApiError(409, "주문 처리 중 상품 재고가 변경되었습니다.", {
      stock: `현재 재고는 ${current.stock.toLocaleString("ko-KR")}개입니다. 상품 정보를 새로 불러온 뒤 다시 저장해 주세요.`,
    });
  }
  const suppliedStockControlRevision = body.expectedStockControlRevision;
  let expectedStockControlRevision: number | undefined;
  if (suppliedStockControlRevision !== undefined) {
    if (
      typeof suppliedStockControlRevision !== "number" ||
      !Number.isSafeInteger(suppliedStockControlRevision) ||
      suppliedStockControlRevision < 0 ||
      suppliedStockControlRevision > 2_147_483_647
    ) {
      throw new AdminApiError(
        400,
        "상품 판매·품절 설정 기준값을 확인해 주세요.",
      );
    }
    expectedStockControlRevision = suppliedStockControlRevision;
    if (expectedStockControlRevision !== currentRecord.stockControlRevision) {
      throw new AdminApiError(
        409,
        "다른 관리자 작업에서 상품 판매·품절 설정이 변경되었습니다. 최신 정보를 다시 불러와 주세요.",
      );
    }
  }

  const product = validateProductInput(
    input,
    current,
    id,
    new Set(
      categorySnapshot.records.map((record) => record.category.id),
    ),
  );
  const categoryRecord = categorySnapshot.records.find(
    (record) => record.category.id === product.categoryId,
  );
  if (!categoryRecord) {
    throw new AdminApiError(409, "상품분류가 변경되었습니다.");
  }
  const changeType: ProductChangeType = staticProductById.has(id)
    ? "override"
    : "created";
  return writeProductChange(
    product,
    changeType,
    options.adminUsername,
    database,
    {
      expectedRevision,
      expectedStock,
      expectedStockControlRevision,
      category: {
        generation: categorySnapshot.generation,
        id: categoryRecord.category.id,
        revision: categoryRecord.revision,
      },
    },
  );
}

export interface AdminProductListWrite {
  id: string;
  expectedRevision: number;
  expectedStock: number;
  expectedStockControlRevision: number;
  product: ManagedCatalogProduct;
}

export async function updateManagedProductList(
  input: unknown,
  options: ProductWriteOptions,
): Promise<AdminProductRecord[]> {
  const body = asObject(input);
  if (!Array.isArray(body.rows) || body.rows.length === 0) {
    throw new AdminApiError(400, "수정할 상품을 선택해 주세요.");
  }
  if (body.rows.length > 15) {
    throw new AdminApiError(
      400,
      "상품목록은 현재 페이지의 상품 15개까지 한 번에 수정할 수 있습니다.",
    );
  }

  const database = options.database ?? productDatabase();
  await ensureAdminProductSchema(database);
  const [records, categorySnapshot] = await Promise.all([
    getAdminProductRecords({ database, strict: true }),
    readStableProductCategoryRecords(database),
  ]);
  const recordById = new Map(
    records.map((record) => [record.product.id, record]),
  );
  const allowedCategoryIds = new Set(
    categorySnapshot.records.map((record) => record.category.id),
  );
  const seen = new Set<string>();
  const writes: AdminProductListWrite[] = [];

  for (let index = 0; index < body.rows.length; index += 1) {
    const row = asObject(body.rows[index]);
    const id = typeof row.id === "string" ? row.id.trim() : "";
    assertProductId(id);
    if (seen.has(id)) {
      throw new AdminApiError(
        400,
        `${index + 1}번째 상품이 중복 선택되었습니다.`,
      );
    }
    seen.add(id);
    const record = recordById.get(id);
    if (!record) {
      throw new AdminApiError(404, `${id} 상품을 찾을 수 없습니다.`);
    }
    const expectedRevision = listWriteInteger(
      row.expectedRevision,
      "상품 변경 기준값",
      0,
      2_147_483_647,
    );
    const expectedStock = listWriteInteger(
      row.expectedStock,
      "기존 재고",
      0,
      10_000_000,
    );
    const expectedStockControlRevision = listWriteInteger(
      row.expectedStockControlRevision,
      "판매·품절 변경 기준값",
      0,
      2_147_483_647,
    );
    if (
      expectedRevision !== record.revision ||
      expectedStock !== record.product.stock ||
      expectedStockControlRevision !== record.stockControlRevision
    ) {
      throw new AdminApiError(
        409,
        `${id} 상품 정보 또는 재고가 다른 작업에서 변경되었습니다. 최신 목록을 다시 불러와 주세요.`,
      );
    }
    const primaryCategoryId =
      typeof row.primaryCategoryId === "string"
        ? row.primaryCategoryId.trim()
        : record.product.primaryCategoryId;
    const secondaryCategoryId =
      typeof row.secondaryCategoryId === "string"
        ? row.secondaryCategoryId.trim()
        : record.product.secondaryCategoryId;
    const tertiaryCategoryId =
      typeof row.tertiaryCategoryId === "string"
        ? row.tertiaryCategoryId.trim()
        : record.product.tertiaryCategoryId;
    const product = validateProductInput(
      {
        ...row,
        categoryId:
          tertiaryCategoryId ||
          secondaryCategoryId ||
          primaryCategoryId ||
          record.product.categoryId,
        primaryCategoryId,
        secondaryCategoryId,
        tertiaryCategoryId,
      },
      record.product,
      id,
      allowedCategoryIds,
    );
    writes.push({
      id,
      expectedRevision,
      expectedStock,
      expectedStockControlRevision,
      product,
    });
  }

  const updatedBy = options.adminUsername.slice(0, 128);
  const statements: D1PreparedStatement[] = [];
  for (const write of writes) {
    const categoryRecord = categorySnapshot.records.find(
      (record) => record.category.id === write.product.categoryId,
    );
    if (!categoryRecord) {
      throw new AdminApiError(409, "상품분류가 변경되었습니다.");
    }
    const categoryGuard = {
      generation: categorySnapshot.generation,
      id: categoryRecord.category.id,
      revision: categoryRecord.revision,
    };
    const categoryCondition =
      categoryGuard.revision === 0
        ? `EXISTS (
             SELECT 1 FROM category_changes generation
             WHERE generation.category_id = ?
               AND generation.revision = ?
           )
           AND NOT EXISTS (
             SELECT 1 FROM category_changes category
             WHERE category.category_id = ?
           )`
        : `EXISTS (
             SELECT 1 FROM category_changes generation
             WHERE generation.category_id = ?
               AND generation.revision = ?
           )
           AND EXISTS (
             SELECT 1 FROM category_changes category
             WHERE category.category_id = ?
               AND category.revision = ?
               AND category.change_type <> 'deleted'
           )`;
    const categoryBindings: Array<string | number> =
      categoryGuard.revision === 0
        ? [
            categoryCatalogGenerationId,
            categoryGuard.generation,
            categoryGuard.id,
          ]
        : [
            categoryCatalogGenerationId,
            categoryGuard.generation,
            categoryGuard.id,
            categoryGuard.revision,
          ];
    const changeType: ProductChangeType = staticProductById.has(write.id)
      ? "override"
      : "created";
    const changeStatement =
      write.expectedRevision === 0
        ? database
            .prepare(
              `INSERT INTO product_changes (
                 product_id, change_type, payload_json, revision, updated_by
               )
               SELECT ?, ?, ?, 1, ?
               WHERE ${categoryCondition}
               ON CONFLICT(product_id) DO UPDATE SET
                 change_type = NULL,
                 payload_json = excluded.payload_json,
                 revision = product_changes.revision + 1,
                 updated_by = excluded.updated_by,
                 updated_at = CURRENT_TIMESTAMP`,
            )
            .bind(
              write.id,
              changeType,
              JSON.stringify(write.product),
              updatedBy,
              ...categoryBindings,
            )
        : database
            .prepare(
              `UPDATE product_changes
               SET change_type = ?,
                   payload_json = ?,
                   revision = revision + 1,
                   updated_by = ?,
                   updated_at = CURRENT_TIMESTAMP
               WHERE product_id = ?
                 AND revision = ?
                 AND change_type <> 'deleted'
                 AND ${categoryCondition}`,
            )
            .bind(
              changeType,
              JSON.stringify(write.product),
              updatedBy,
              write.id,
              write.expectedRevision,
              ...categoryBindings,
            );
    const stockStatement = database
      .prepare(
        `INSERT INTO product_stock (product_id, stock)
         VALUES (
           ?,
           CASE
             WHEN changes() = 1
               AND COALESCE(
                 (SELECT stock FROM product_stock WHERE product_id = ?),
                 ?
               ) = ?
             THEN ?
             ELSE NULL
           END
         )
         ON CONFLICT(product_id) DO UPDATE SET
           stock = excluded.stock,
           updated_at = CURRENT_TIMESTAMP`,
      )
      .bind(
        write.id,
        write.id,
        write.expectedStock,
        write.expectedStock,
        write.product.stock,
      );
    const stockControlStatement = database
      .prepare(
        `INSERT INTO product_stock_controls (
           product_id, notification_qty, sale_enabled, sold_out,
           restock_notification, revision, updated_by
         ) VALUES (
           ?,
           CASE
             WHEN changes() = 1
               AND (
                 (? = 0 AND NOT EXISTS (
                   SELECT 1 FROM product_stock_controls WHERE product_id = ?
                 ))
                 OR EXISTS (
                   SELECT 1 FROM product_stock_controls
                   WHERE product_id = ? AND revision = ?
                 )
               )
             THEN ?
             ELSE NULL
           END,
           ?, ?, ?, 1, ?
         )
         ON CONFLICT(product_id) DO UPDATE SET
           notification_qty = excluded.notification_qty,
           sale_enabled = excluded.sale_enabled,
           sold_out = excluded.sold_out,
           restock_notification = excluded.restock_notification,
           revision = product_stock_controls.revision + 1,
           updated_by = excluded.updated_by,
           updated_at = CURRENT_TIMESTAMP`,
      )
      .bind(
        write.id,
        write.expectedStockControlRevision,
        write.id,
        write.id,
        write.expectedStockControlRevision,
        write.product.stockNotificationQuantity,
        write.product.active ? 1 : 0,
        write.product.soldOut ? 1 : 0,
        write.product.restockNotification ? 1 : 0,
        updatedBy,
      );
    statements.push(
      changeStatement,
      stockStatement,
      stockControlStatement,
    );
  }
  statements.push(
    database
      .prepare(
        `INSERT INTO admin_audit_logs (
           action, entity_type, entity_id, details
         ) VALUES (?, 'product', ?, ?)`,
      )
      .bind(
        "product.list.update",
        writes.map((write) => write.id).join(","),
        JSON.stringify({
          count: writes.length,
          fields: [
            "categoryId",
            "primaryCategoryId",
            "secondaryCategoryId",
            "tertiaryCategoryId",
            "sortOrder",
            "active",
            "soldOut",
            "name",
            "price",
            "originalPrice",
            "stock",
            "desktopSkin",
            "mobileSkin",
          ],
          updatedBy,
        }),
      ),
  );

  try {
    await database.batch(statements);
  } catch (error) {
    if (
      error instanceof Error &&
      /product_changes|product_stock|product_stock_controls|category_changes|not null|constraint/iu.test(
        error.message,
      )
    ) {
      throw new AdminApiError(
        409,
        "상품 정보, 재고 또는 분류가 다른 작업에서 변경되었습니다. 최신 목록을 다시 불러와 주세요.",
      );
    }
    throw error;
  }

  const updated = await getAdminProductRecords({
    database,
    strict: true,
  });
  const updatedById = new Map(
    updated.map((record) => [record.product.id, record]),
  );
  return writes.map((write) => {
    const record = updatedById.get(write.id);
    if (!record) {
      throw new AdminApiError(500, `${write.id} 상품 저장 결과를 찾을 수 없습니다.`);
    }
    return record;
  });
}

export async function cloneManagedProduct(
  input: unknown,
  options: ProductWriteOptions,
): Promise<AdminProductRecord> {
  const body = asObject(input);
  const sourceId =
    typeof body.sourceId === "string" ? body.sourceId.trim() : "";
  const newId = typeof body.newId === "string" ? body.newId.trim() : "";
  assertProductId(sourceId);
  assertProductId(newId);
  if (sourceId === newId) {
    throw new AdminApiError(400, "원본과 다른 새 상품코드를 입력해 주세요.");
  }
  const expectedRevision = listWriteInteger(
    body.expectedRevision,
    "상품 변경 기준값",
    0,
    2_147_483_647,
  );
  const expectedStock = listWriteInteger(
    body.expectedStock,
    "기존 재고",
    0,
    10_000_000,
  );
  const expectedStockControlRevision = listWriteInteger(
    body.expectedStockControlRevision,
    "판매·품절 변경 기준값",
    0,
    2_147_483_647,
  );

  const database = options.database ?? productDatabase();
  const { ensureProductOptionSchema, getProductOptionRows } =
    await import("@/lib/product-options");
  await Promise.all([
    ensureAdminProductSchema(database),
    ensureProductOptionSchema(database),
  ]);
  const [records, categorySnapshot, optionRows] = await Promise.all([
    getAdminProductRecords({ database, strict: true }),
    readStableProductCategoryRecords(database),
    getProductOptionRows([sourceId], { database }),
  ]);
  const source = records.find((record) => record.product.id === sourceId);
  if (!source) {
    throw new AdminApiError(404, "복사할 상품을 찾을 수 없습니다.");
  }
  if (
    source.revision !== expectedRevision ||
    source.product.stock !== expectedStock ||
    source.stockControlRevision !== expectedStockControlRevision
  ) {
    throw new AdminApiError(
      409,
      "복사할 상품 정보 또는 재고가 변경되었습니다. 최신 목록을 다시 불러와 주세요.",
    );
  }
  if (
    staticProductById.has(newId) ||
    records.some((record) => record.product.id === newId) ||
    (await readProductChange(newId, database))
  ) {
    throw new AdminApiError(409, "이미 사용 중인 상품코드입니다.", {
      newId: "다른 상품코드를 입력해 주세요.",
    });
  }

  const allowedCategoryIds = new Set(
    categorySnapshot.records.map((record) => record.category.id),
  );
  const product = validateProductInput(
    {
      ...source.product,
      id: newId,
      viewCount: 0,
    },
    undefined,
    newId,
    allowedCategoryIds,
  );
  const categoryRecord = categorySnapshot.records.find(
    (record) => record.category.id === product.categoryId,
  );
  if (!categoryRecord) {
    throw new AdminApiError(409, "상품분류가 변경되었습니다.");
  }
  const categoryCondition =
    categoryRecord.revision === 0
      ? `EXISTS (
           SELECT 1 FROM category_changes generation
           WHERE generation.category_id = ?
             AND generation.revision = ?
         )
         AND NOT EXISTS (
           SELECT 1 FROM category_changes category
           WHERE category.category_id = ?
         )`
      : `EXISTS (
           SELECT 1 FROM category_changes generation
           WHERE generation.category_id = ?
             AND generation.revision = ?
         )
         AND EXISTS (
           SELECT 1 FROM category_changes category
           WHERE category.category_id = ?
             AND category.revision = ?
             AND category.change_type <> 'deleted'
         )`;
  const categoryBindings: Array<string | number> =
    categoryRecord.revision === 0
      ? [
          categoryCatalogGenerationId,
          categorySnapshot.generation,
          categoryRecord.category.id,
        ]
      : [
          categoryCatalogGenerationId,
          categorySnapshot.generation,
          categoryRecord.category.id,
          categoryRecord.revision,
        ];
  const updatedBy = options.adminUsername.slice(0, 128);
  const statements: D1PreparedStatement[] = [
    database
      .prepare(
        `INSERT INTO product_changes (
           product_id, change_type, payload_json, revision, updated_by
         )
         SELECT ?, 'created', ?, 1, ?
         WHERE ${categoryCondition}
         ON CONFLICT(product_id) DO UPDATE SET
           change_type = NULL,
           payload_json = excluded.payload_json,
           revision = product_changes.revision + 1,
           updated_by = excluded.updated_by,
           updated_at = CURRENT_TIMESTAMP`,
      )
      .bind(
        newId,
        JSON.stringify(product),
        updatedBy,
        ...categoryBindings,
      ),
    database
      .prepare(
        `INSERT INTO product_stock (product_id, stock)
         VALUES (?, CASE WHEN changes() = 1 THEN ? ELSE NULL END)
         ON CONFLICT(product_id) DO UPDATE SET
           stock = excluded.stock,
           updated_at = CURRENT_TIMESTAMP`,
      )
      .bind(newId, product.stock),
    database
      .prepare(
        `INSERT INTO product_stock_controls (
           product_id, notification_qty, sale_enabled, sold_out,
           restock_notification, revision, updated_by
         ) VALUES (
           ?,
           CASE WHEN changes() = 1 THEN ? ELSE NULL END,
           ?, ?, ?, 1, ?
         )
         ON CONFLICT(product_id) DO UPDATE SET
           notification_qty = NULL,
           revision = product_stock_controls.revision + 1,
           updated_by = excluded.updated_by,
           updated_at = CURRENT_TIMESTAMP`,
      )
      .bind(
        newId,
        product.stockNotificationQuantity,
        product.active ? 1 : 0,
        product.soldOut ? 1 : 0,
        product.restockNotification ? 1 : 0,
        updatedBy,
      ),
  ];

  for (let offset = 0; offset < optionRows.length; offset += 8) {
    const chunk = optionRows.slice(offset, offset + 8);
    const values = chunk.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?)").join(", ");
    const bindings: Array<string | number> = [];
    for (let index = 0; index < chunk.length; index += 1) {
      const option = chunk[index];
      bindings.push(
        `OPT-${crypto.randomUUID().replaceAll("-", "").slice(0, 24)}`,
        newId,
        option.optionName,
        option.optionValue,
        option.priceDelta,
        option.stock,
        option.saleEnabled ? 1 : 0,
        option.soldOut ? 1 : 0,
        option.sortOrder,
        updatedBy,
      );
    }
    statements.push(
      database
        .prepare(
          `INSERT INTO product_options (
             id, product_id, option_name, option_value, price_delta, stock,
             sale_enabled, sold_out, sort_order, deleted, revision, updated_by
           ) VALUES ${values}`,
        )
        .bind(...bindings),
    );
  }
  if (optionRows.length > 0) {
    statements.push(
      database
        .prepare(
          `INSERT INTO product_option_sets (
             product_id, revision, updated_by
           ) VALUES (?, 1, ?)`,
        )
        .bind(newId, updatedBy),
    );
  }
  statements.push(
    database
      .prepare(
        `INSERT INTO admin_audit_logs (
           action, entity_type, entity_id, details
         ) VALUES ('product.clone', 'product', ?, ?)`,
      )
      .bind(
        newId,
        JSON.stringify({
          sourceId,
          optionCount: optionRows.length,
          updatedBy,
        }),
      ),
  );

  try {
    await database.batch(statements);
  } catch (error) {
    if (
      error instanceof Error &&
      /product_changes|product_stock|product_stock_controls|product_options|category_changes|not null|constraint|unique/iu.test(
        error.message,
      )
    ) {
      throw new AdminApiError(
        409,
        "상품코드가 이미 사용 중이거나 복사할 상품 정보가 변경되었습니다. 최신 목록을 다시 불러와 주세요.",
      );
    }
    throw error;
  }

  const record = (
    await getAdminProductRecords({ database, strict: true })
  ).find((entry) => entry.product.id === newId);
  if (!record) {
    throw new AdminApiError(500, "복사된 상품을 확인할 수 없습니다.");
  }
  return record;
}

export async function deleteManagedProduct(
  id: string,
  options: ProductWriteOptions,
): Promise<AdminProductRecord> {
  assertProductId(id);
  const database = options.database ?? productDatabase();
  const records = await getAdminProductRecords({
    database,
    strict: true,
  });
  const currentRecord = records.find((record) => record.product.id === id);
  if (!currentRecord) {
    throw new AdminApiError(404, "상품을 찾을 수 없습니다.");
  }

  return writeProductChange(
    currentRecord.product,
    "deleted",
    options.adminUsername,
    database,
    {
      expectedRevision: currentRecord.revision,
      expectedStock: currentRecord.product.stock,
    },
  );
}

export function validateProductInput(
  input: unknown,
  base?: ManagedCatalogProduct,
  fixedId?: string,
  allowedCategoryIds: ReadonlySet<string> = knownCategoryIds,
): ManagedCatalogProduct {
  const body = asObject(input);
  const errors: Record<string, string> = {};

  const suppliedId = stringField(body, ["id", "sku"], base?.id ?? "", {
    field: "sku",
    maximumLength: 80,
    errors,
  });
  const id = (fixedId ?? suppliedId) || generateProductId();
  if (!validProductId.test(id)) {
    errors.sku =
      "상품코드는 영문, 숫자로 시작하고 영문·숫자·점·밑줄·하이픈만 사용할 수 있습니다.";
  }
  if (fixedId && suppliedId && suppliedId !== fixedId) {
    errors.sku = "상품코드는 수정할 수 없습니다.";
  }

  const name = stringField(body, ["name"], base?.name ?? "", {
    field: "name",
    maximumLength: 200,
    required: true,
    errors,
  });
  const categoryId = stringField(
    body,
    ["categoryId"],
    base?.categoryId ?? "",
    {
      field: "categoryId",
      maximumLength: 80,
      required: true,
      errors,
    },
  );
  if (categoryId && !allowedCategoryIds.has(categoryId)) {
    errors.categoryId = "존재하는 상품분류를 선택해 주세요.";
  }
  const suppliedPrimaryCategoryId = stringField(
    body,
    ["primaryCategoryId"],
    base?.primaryCategoryId ?? categoryId,
    {
      field: "primaryCategoryId",
      maximumLength: 80,
      errors,
    },
  );
  const primaryCategoryId = suppliedPrimaryCategoryId || categoryId;
  if (
    primaryCategoryId &&
    !allowedCategoryIds.has(primaryCategoryId)
  ) {
    errors.primaryCategoryId = "존재하는 기본 상품분류를 선택해 주세요.";
  }
  const secondaryCategoryId = stringField(
    body,
    ["secondaryCategoryId"],
    base?.secondaryCategoryId ?? "",
    {
      field: "secondaryCategoryId",
      maximumLength: 80,
      errors,
    },
  );
  if (
    secondaryCategoryId &&
    !allowedCategoryIds.has(secondaryCategoryId)
  ) {
    errors.secondaryCategoryId = "존재하는 2차 상품분류를 선택해 주세요.";
  }
  const tertiaryCategoryId = stringField(
    body,
    ["tertiaryCategoryId"],
    base?.tertiaryCategoryId ?? "",
    {
      field: "tertiaryCategoryId",
      maximumLength: 80,
      errors,
    },
  );
  if (tertiaryCategoryId && !allowedCategoryIds.has(tertiaryCategoryId)) {
    errors.tertiaryCategoryId = "존재하는 3차 상품분류를 선택해 주세요.";
  }

  const price = integerField(body, ["price"], base?.price ?? 0, {
    field: "price",
    minimum: 0,
    maximum: 2_147_483_647,
    errors,
  });
  const originalPrice = integerField(
    body,
    ["originalPrice", "marketPrice"],
    base?.originalPrice ?? 0,
    {
      field: "marketPrice",
      minimum: 0,
      maximum: 2_147_483_647,
      errors,
    },
  );
  if (originalPrice !== 0 && originalPrice < price) {
    errors.marketPrice = "시중가격은 판매가격보다 작을 수 없습니다.";
  }

  let stock = integerField(body, ["stock"], base?.stock ?? 0, {
    field: "stock",
    minimum: 0,
    maximum: 10_000_000,
    errors,
  });
  const status = optionalString(body, "status", errors, 20);
  if (
    status !== undefined &&
    !["selling", "paused", "soldout", "hidden"].includes(status)
  ) {
    errors.status = "판매상태 값이 올바르지 않습니다.";
  }
  if (status === "soldout" && !hasAny(body, ["stock"])) stock = 0;

  const basic = stringField(
    body,
    ["basic", "shortDescription"],
    base?.basic ?? "",
    { field: "shortDescription", maximumLength: 2_000, errors },
  );
  const maker = stringField(body, ["maker"], base?.maker ?? "", {
    field: "maker",
    maximumLength: 200,
    errors,
  });
  const origin = stringField(body, ["origin"], base?.origin ?? "", {
    field: "origin",
    maximumLength: 200,
    errors,
  });
  const brand = stringField(body, ["brand"], base?.brand ?? "", {
    field: "brand",
    maximumLength: 200,
    errors,
  });
  const model = stringField(body, ["model"], base?.model ?? "", {
    field: "model",
    maximumLength: 200,
    errors,
  });
  const sortOrder = integerField(body, ["sortOrder"], base?.sortOrder ?? 0, {
    field: "sortOrder",
    minimum: -2_147_483_648,
    maximum: 2_147_483_647,
    errors,
  });
  const viewCount = integerField(
    body,
    ["viewCount"],
    base?.viewCount ?? 0,
    {
      field: "viewCount",
      minimum: 0,
      maximum: 2_147_483_647,
      errors,
    },
  );
  const rewardPoints = integerField(
    body,
    ["rewardPoints"],
    base?.rewardPoints ?? 0,
    {
      field: "rewardPoints",
      minimum: 0,
      maximum: 2_147_483_647,
      errors,
    },
  );
  const desktopSkin = stringField(
    body,
    ["desktopSkin"],
    base?.desktopSkin ?? "basic",
    {
      field: "desktopSkin",
      maximumLength: 80,
      errors,
    },
  );
  const mobileSkin = stringField(
    body,
    ["mobileSkin"],
    base?.mobileSkin ?? "basic",
    {
      field: "mobileSkin",
      maximumLength: 80,
      errors,
    },
  );
  if (!/^[A-Za-z0-9._-]{0,80}$/u.test(desktopSkin)) {
    errors.desktopSkin = "PC 스킨 값이 올바르지 않습니다.";
  }
  if (!/^[A-Za-z0-9._-]{0,80}$/u.test(mobileSkin)) {
    errors.mobileSkin = "모바일 스킨 값이 올바르지 않습니다.";
  }

  const detailInput = stringField(
    body,
    ["detailHtml", "description"],
    base?.detailHtml ?? "",
    {
      field: "description",
      maximumLength: 500_000,
      trim: false,
      errors,
    },
  );
  if (new TextEncoder().encode(detailInput).byteLength > 500_000) {
    errors.description = "상세설명은 500KB 이하로 입력해 주세요.";
  }
  const detailHtml = sanitizeProductDetailHtml(detailInput);
  const images = imageFields(body, base?.images ?? [], errors);
  const flags = flagFields(body, base?.flags, errors);

  let active = booleanField(
    body,
    ["active", "visible"],
    base?.active ?? false,
    "visible",
    errors,
  );
  if (status !== undefined) {
    active = status === "selling" || status === "soldout";
  }
  let soldOut = booleanField(
    body,
    ["soldOut"],
    base?.soldOut ?? false,
    "soldOut",
    errors,
  );
  if (status === "soldout") soldOut = true;
  if (status === "selling") soldOut = false;

  if (Object.keys(errors).length > 0) {
    throw new AdminApiError(400, "상품 정보를 확인해 주세요.", errors);
  }

  return {
    id,
    categoryId,
    primaryCategoryId,
    secondaryCategoryId,
    tertiaryCategoryId,
    name,
    basic,
    price,
    originalPrice,
    stock,
    maker,
    origin,
    brand,
    model,
    flags,
    images,
    detailHtml,
    active,
    sortOrder,
    viewCount,
    rewardPoints,
    desktopSkin,
    mobileSkin,
    stockNotificationQuantity:
      base?.stockNotificationQuantity ?? 0,
    soldOut,
    restockNotification: base?.restockNotification ?? false,
  };
}

export function sanitizeProductDetailHtml(input: string): string {
  const html = input.replace(/\0/gu, "");
  const tokenPattern = /<!--[\s\S]*?-->|<[^>]*>/gu;
  const blockedStack: string[] = [];
  let output = "";
  let cursor = 0;

  for (const match of html.matchAll(tokenPattern)) {
    const tokenIndex = match.index ?? cursor;
    if (blockedStack.length === 0) {
      output += escapeDetailText(html.slice(cursor, tokenIndex));
    }
    cursor = tokenIndex + match[0].length;

    if (match[0].startsWith("<!--")) continue;
    const parsed = parseDetailTag(match[0]);
    if (!parsed) continue;

    if (blockedStack.length > 0) {
      const current = blockedStack[blockedStack.length - 1];
      if (parsed.closing && parsed.name === current) {
        blockedStack.pop();
      } else if (
        !parsed.closing &&
        !parsed.selfClosing &&
        blockedDetailTags.has(parsed.name)
      ) {
        blockedStack.push(parsed.name);
      }
      continue;
    }

    if (blockedDetailTags.has(parsed.name)) {
      if (!parsed.closing && !parsed.selfClosing) {
        blockedStack.push(parsed.name);
      }
      continue;
    }
    if (!allowedDetailTags.has(parsed.name)) continue;
    if (parsed.closing) {
      if (!voidDetailTags.has(parsed.name)) output += `</${parsed.name}>`;
      continue;
    }

    const attributes = sanitizeDetailAttributes(
      parsed.name,
      parsed.attributeText,
    );
    output += `<${parsed.name}${attributes}${
      voidDetailTags.has(parsed.name) ? " /" : ""
    }>`;
  }

  if (blockedStack.length === 0) {
    output += escapeDetailText(html.slice(cursor));
  }
  return output;
}

const allowedDetailTags = new Set([
  "a",
  "b",
  "blockquote",
  "br",
  "div",
  "em",
  "h2",
  "h3",
  "h4",
  "hr",
  "i",
  "img",
  "li",
  "ol",
  "p",
  "span",
  "strong",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "u",
  "ul",
]);
const voidDetailTags = new Set(["br", "hr", "img"]);
const blockedDetailTags = new Set([
  "base",
  "embed",
  "foreignobject",
  "form",
  "iframe",
  "link",
  "math",
  "meta",
  "object",
  "script",
  "style",
  "svg",
  "template",
]);

function parseDetailTag(raw: string): {
  name: string;
  closing: boolean;
  selfClosing: boolean;
  attributeText: string;
} | null {
  const match = /^<\s*(\/?)\s*([A-Za-z][A-Za-z0-9]*)([\s\S]*?)>$/u.exec(
    raw,
  );
  if (!match) return null;
  const closing = Boolean(match[1]);
  const name = match[2].toLowerCase();
  let attributeText = match[3];
  const selfClosing = /\/\s*$/u.test(attributeText);
  if (selfClosing) attributeText = attributeText.replace(/\/\s*$/u, "");
  if (closing && attributeText.trim()) return null;
  return { name, closing, selfClosing, attributeText };
}

function sanitizeDetailAttributes(
  tagName: string,
  attributeText: string,
): string {
  const attributes: string[] = [];
  let cursor = 0;
  while (cursor < attributeText.length) {
    const whitespace = /^\s+/u.exec(attributeText.slice(cursor));
    if (!whitespace) break;
    cursor += whitespace[0].length;
    if (cursor >= attributeText.length) break;

    const nameMatch = /^([A-Za-z][A-Za-z0-9:._-]*)/u.exec(
      attributeText.slice(cursor),
    );
    if (!nameMatch) break;
    const name = nameMatch[1].toLowerCase();
    cursor += nameMatch[0].length;
    const spacing = /^\s*/u.exec(attributeText.slice(cursor))?.[0] ?? "";
    cursor += spacing.length;
    if (attributeText[cursor] !== "=") continue;
    cursor += 1;
    const valueSpacing =
      /^\s*/u.exec(attributeText.slice(cursor))?.[0] ?? "";
    cursor += valueSpacing.length;

    let value = "";
    const quote = attributeText[cursor];
    if (quote === '"' || quote === "'") {
      const end = attributeText.indexOf(quote, cursor + 1);
      if (end < 0) break;
      value = attributeText.slice(cursor + 1, end);
      cursor = end + 1;
    } else {
      const valueMatch = /^[^\s"'=<>`]+/u.exec(
        attributeText.slice(cursor),
      );
      if (!valueMatch) break;
      value = valueMatch[0];
      cursor += valueMatch[0].length;
    }

    const safeValue =
      name === "style" ? sanitizeDetailInlineStyle(value) : value;
    if (
      safeValue === null ||
      !allowedDetailAttribute(tagName, name, safeValue)
    ) {
      continue;
    }
    attributes.push(` ${name}="${escapeDetailAttribute(safeValue)}"`);
  }
  return attributes.join("");
}

function allowedDetailAttribute(
  tagName: string,
  name: string,
  value: string,
): boolean {
  if (value.length > 1_000 || /[\u0000-\u001f\u007f]/u.test(value)) {
    return false;
  }
  if (name === "class") return /^[A-Za-z0-9 _:-]{0,200}$/u.test(value);
  if (name === "id") return /^[A-Za-z][A-Za-z0-9_:.-]{0,80}$/u.test(value);
  if (name === "style") return value.length <= 500;
  if (name === "title" || (tagName === "img" && name === "alt")) return true;
  if (
    ["width", "height", "colspan", "rowspan"].includes(name)
  ) {
    return /^[1-9][0-9]{0,3}$/u.test(value);
  }
  if (name === "align") return /^(?:left|center|right)$/u.test(value);
  if (tagName === "a" && name === "href") return safeHtmlUrl(name, value);
  if (tagName === "img" && name === "src") return safeHtmlUrl(name, value);
  if (tagName === "img" && name === "loading") {
    return value === "lazy" || value === "eager";
  }
  return false;
}

const allowedInlineStyleProperties = new Set([
  "background-color",
  "clear",
  "color",
  "font-family",
  "font-size",
  "font-weight",
  "height",
  "line-height",
  "margin",
  "margin-bottom",
  "margin-left",
  "margin-right",
  "margin-top",
  "max-width",
  "padding",
  "padding-bottom",
  "padding-left",
  "padding-right",
  "padding-top",
  "text-align",
  "width",
]);

function sanitizeDetailInlineStyle(value: string): string | null {
  if (
    value.length > 500 ||
    /[\\@{}<>]/u.test(value) ||
    unsafeInlineStyle(value)
  ) {
    return null;
  }
  const declarations: string[] = [];
  for (const rawDeclaration of value.split(";")) {
    const declaration = rawDeclaration.trim();
    if (!declaration) continue;
    const separator = declaration.indexOf(":");
    if (separator < 1) return null;
    const property = declaration.slice(0, separator).trim().toLowerCase();
    const propertyValue = declaration.slice(separator + 1).trim();
    if (
      !allowedInlineStyleProperties.has(property) ||
      !propertyValue ||
      propertyValue.length > 200 ||
      !/^[A-Za-z0-9#(),.%'"\s-]+$/u.test(propertyValue)
    ) {
      return null;
    }
    declarations.push(`${property}:${propertyValue}`);
  }
  return declarations.length ? `${declarations.join(";")};` : null;
}

function escapeDetailText(value: string): string {
  return value.replace(/</gu, "&lt;").replace(/>/gu, "&gt;");
}

function escapeDetailAttribute(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/"/gu, "&quot;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;");
}

async function readProductChange(
  id: string,
  database: D1Database,
): Promise<ProductChangeRow | null> {
  return database
    .prepare(
      `SELECT product_id, change_type, payload_json, revision, updated_by,
              created_at, updated_at
       FROM product_changes WHERE product_id = ?`,
    )
    .bind(id)
    .first<ProductChangeRow>();
}

async function writeProductChange(
  product: ManagedCatalogProduct,
  changeType: ProductChangeType,
  adminUsername: string,
  database: D1Database,
  guards: ProductWriteGuards = {},
): Promise<AdminProductRecord> {
  const {
    createOnly = false,
    expectedRevision,
    expectedStock,
    expectedStockControlRevision,
  } = guards;
  const updatedBy = adminUsername.slice(0, 128);
  const categoryCondition = guards.category
    ? guards.category.revision === 0
      ? `EXISTS (
           SELECT 1 FROM category_changes generation
           WHERE generation.category_id = ?
             AND generation.revision = ?
         )
         AND NOT EXISTS (
           SELECT 1 FROM category_changes category
           WHERE category.category_id = ?
         )`
      : `EXISTS (
           SELECT 1 FROM category_changes generation
           WHERE generation.category_id = ?
             AND generation.revision = ?
         )
         AND EXISTS (
           SELECT 1 FROM category_changes category
           WHERE category.category_id = ?
             AND category.revision = ?
             AND category.change_type <> 'deleted'
         )`
    : "1 = 1";
  const categoryBindings: Array<string | number> = guards.category
    ? guards.category.revision === 0
      ? [
          categoryCatalogGenerationId,
          guards.category.generation,
          guards.category.id,
        ]
      : [
          categoryCatalogGenerationId,
          guards.category.generation,
          guards.category.id,
          guards.category.revision,
        ]
    : [];
  const changeStatement = createOnly
    ? database
        .prepare(
          `INSERT INTO product_changes (
             product_id, change_type, payload_json, revision, updated_by
           )
           SELECT ?, ?, ?, 1, ?
           WHERE ${categoryCondition}
           ON CONFLICT(product_id) DO UPDATE SET
             change_type = NULL,
             payload_json = excluded.payload_json,
             revision = product_changes.revision + 1,
             updated_by = excluded.updated_by,
             updated_at = CURRENT_TIMESTAMP
           RETURNING product_id, change_type, payload_json, revision,
                     updated_by, created_at, updated_at`,
        )
        .bind(
          product.id,
          changeType,
          JSON.stringify(product),
          updatedBy,
          ...categoryBindings,
        )
    : expectedRevision === 0
      ? database
          .prepare(
            `INSERT INTO product_changes (
               product_id, change_type, payload_json, revision, updated_by
             )
             SELECT ?, ?, ?, 1, ?
             WHERE ${categoryCondition}
             ON CONFLICT(product_id) DO UPDATE SET
               change_type = NULL,
               payload_json = excluded.payload_json,
               revision = product_changes.revision + 1,
               updated_by = excluded.updated_by,
               updated_at = CURRENT_TIMESTAMP
             RETURNING product_id, change_type, payload_json, revision,
                       updated_by, created_at, updated_at`,
          )
          .bind(
            product.id,
            changeType,
            JSON.stringify(product),
            updatedBy,
            ...categoryBindings,
          )
      : expectedRevision !== undefined
        ? database
            .prepare(
              `UPDATE product_changes
               SET change_type = ?,
                   payload_json = ?,
                   revision = revision + 1,
                   updated_by = ?,
                   updated_at = CURRENT_TIMESTAMP
               WHERE product_id = ?
                 AND revision = ?
                 AND change_type <> 'deleted'
                 AND ${categoryCondition}
               RETURNING product_id, change_type, payload_json, revision,
                         updated_by, created_at, updated_at`,
            )
            .bind(
              changeType,
              JSON.stringify(product),
              updatedBy,
              product.id,
              expectedRevision,
              ...categoryBindings,
            )
        : database
        .prepare(
          `INSERT INTO product_changes (
             product_id, change_type, payload_json, revision, updated_by
           ) VALUES (?, ?, ?, 1, ?)
           ON CONFLICT(product_id) DO UPDATE SET
             change_type = excluded.change_type,
             payload_json = excluded.payload_json,
             revision = product_changes.revision + 1,
             updated_by = excluded.updated_by,
             updated_at = CURRENT_TIMESTAMP
           RETURNING product_id, change_type, payload_json, revision,
                     updated_by, created_at, updated_at`,
        )
        .bind(product.id, changeType, JSON.stringify(product), updatedBy);
  const stockStatement =
    changeType === "deleted"
      ? database
          .prepare(
            `INSERT INTO product_stock (product_id, stock)
             VALUES (
               ?,
               CASE
                 WHEN changes() = 1
                 THEN COALESCE(
                   (SELECT stock FROM product_stock WHERE product_id = ?),
                   ?
                 )
                 ELSE NULL
               END
             )
             ON CONFLICT(product_id) DO UPDATE SET
               stock = excluded.stock,
               updated_at = CURRENT_TIMESTAMP`,
          )
          .bind(product.id, product.id, product.stock)
      : expectedStock !== undefined
        ? database
            .prepare(
              `INSERT INTO product_stock (product_id, stock)
               VALUES (
                 ?,
                 CASE
                   WHEN changes() = 1
                     AND COALESCE(
                       (SELECT stock FROM product_stock WHERE product_id = ?),
                       ?
                     ) = ?
                   THEN ?
                   ELSE NULL
                 END
               )
               ON CONFLICT(product_id) DO UPDATE SET
                 stock = excluded.stock,
                 updated_at = CURRENT_TIMESTAMP`,
            )
            .bind(
              product.id,
              product.id,
              expectedStock,
              expectedStock,
              product.stock,
            )
      : createOnly || guards.category
        ? database
            .prepare(
              `INSERT INTO product_stock (product_id, stock)
               VALUES (
                 ?,
                 CASE WHEN changes() = 1 THEN ? ELSE NULL END
               )
               ON CONFLICT(product_id) DO UPDATE SET
                 stock = excluded.stock,
                 updated_at = CURRENT_TIMESTAMP`,
            )
            .bind(product.id, product.stock)
        : database
          .prepare(
            `INSERT INTO product_stock (product_id, stock)
             VALUES (?, ?)
             ON CONFLICT(product_id) DO UPDATE SET
               stock = excluded.stock,
               updated_at = CURRENT_TIMESTAMP`,
          )
          .bind(product.id, product.stock);
  const stockControlStatement =
    changeType === "deleted"
      ? database
          .prepare(
            "DELETE FROM product_stock_controls WHERE product_id = ?",
          )
          .bind(product.id)
      : expectedStockControlRevision === 0
        ? database
            .prepare(
              `INSERT INTO product_stock_controls (
                 product_id, notification_qty, sale_enabled, sold_out,
                 restock_notification, revision, updated_by
               ) VALUES (?, ?, ?, ?, ?, 1, ?)
               ON CONFLICT(product_id) DO UPDATE SET
                 notification_qty = NULL,
                 revision = product_stock_controls.revision + 1,
                 updated_by = excluded.updated_by,
                 updated_at = CURRENT_TIMESTAMP
               RETURNING revision`,
            )
            .bind(
              product.id,
              product.stockNotificationQuantity,
              product.active ? 1 : 0,
              product.soldOut ? 1 : 0,
              product.restockNotification ? 1 : 0,
              updatedBy,
            )
        : expectedStockControlRevision !== undefined
          ? database
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
                 RETURNING revision`,
              )
              .bind(
                product.stockNotificationQuantity,
                product.active ? 1 : 0,
                product.soldOut ? 1 : 0,
                product.restockNotification ? 1 : 0,
                updatedBy,
                product.id,
                expectedStockControlRevision,
              )
          : database
          .prepare(
            `INSERT INTO product_stock_controls (
               product_id, notification_qty, sale_enabled, sold_out,
               restock_notification, revision, updated_by
             ) VALUES (?, ?, ?, ?, ?, 1, ?)
             ON CONFLICT(product_id) DO UPDATE SET
               notification_qty = excluded.notification_qty,
               sale_enabled = excluded.sale_enabled,
               sold_out = excluded.sold_out,
               restock_notification = excluded.restock_notification,
               revision = product_stock_controls.revision + 1,
               updated_by = excluded.updated_by,
               updated_at = CURRENT_TIMESTAMP
             RETURNING revision`,
          )
          .bind(
            product.id,
            product.stockNotificationQuantity,
            product.active ? 1 : 0,
            product.soldOut ? 1 : 0,
            product.restockNotification ? 1 : 0,
            updatedBy,
          );
  let batchResults: D1Result<unknown>[];
  try {
    batchResults = await database.batch([
      changeStatement,
      stockStatement,
      stockControlStatement,
    ]);
  } catch (error) {
    if (
      guards.category &&
      error instanceof Error &&
      /category_changes|product_stock|not null|constraint/iu.test(
        error.message,
      )
    ) {
      throw new AdminApiError(
        409,
        "상품분류가 다른 작업에서 변경 또는 삭제되었습니다. 최신 정보를 다시 불러와 주세요.",
      );
    }
    if (
      createOnly &&
      error instanceof Error &&
      /product_changes|not null|constraint/iu.test(error.message)
    ) {
      throw new AdminApiError(409, "이미 사용 중인 상품코드입니다.", {
        sku: "다른 상품코드를 입력해 주세요.",
      });
    }
    if (
      expectedRevision !== undefined &&
      error instanceof Error &&
      /product_changes|product_stock|not null|constraint/iu.test(error.message)
    ) {
      throw new AdminApiError(
        409,
        "다른 작업에서 상품 정보 또는 재고가 변경되었습니다. 최신 정보를 다시 불러와 주세요.",
      );
    }
    if (
      expectedStock !== undefined &&
      error instanceof Error &&
      /product_stock|not null/iu.test(error.message)
    ) {
      throw new AdminApiError(
        409,
        "주문 처리 중 상품 재고가 변경되었습니다.",
        {
          stock: "상품 정보를 새로 불러온 뒤 다시 저장해 주세요.",
        },
      );
    }
    throw error;
  }

  const row = batchResults[0]?.results?.[0] as
    | ProductChangeRow
    | undefined;
  if (!row || row.product_id !== product.id) {
    throw new AdminApiError(500, "상품 변경사항을 저장하지 못했습니다.");
  }
  const storedProduct = parseStoredProduct(row.payload_json);
  if (!storedProduct || storedProduct.id !== product.id) {
    throw new AdminApiError(500, "저장된 상품 변경사항을 확인하지 못했습니다.");
  }

  return {
    product: cloneProduct(storedProduct),
    source: isProductChangeType(row.change_type)
      ? row.change_type
      : changeType,
    deleted: row.change_type === "deleted",
    revision: Number(row.revision),
    stockControlRevision:
      changeType === "deleted"
        ? 0
        : Number(
            (
              batchResults[2]?.results?.[0] as
                | { revision?: number }
                | undefined
            )?.revision ?? 0,
          ),
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseStoredProduct(payload: string): ManagedCatalogProduct | null {
  try {
    const value = JSON.parse(payload) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const product = value as Partial<ManagedCatalogProduct>;
    if (
      typeof product.id !== "string" ||
      typeof product.categoryId !== "string" ||
      typeof product.name !== "string" ||
      typeof product.basic !== "string" ||
      !validStoredInteger(product.price) ||
      !validStoredInteger(product.originalPrice) ||
      !validStoredInteger(product.stock) ||
      typeof product.maker !== "string" ||
      typeof product.origin !== "string" ||
      typeof product.brand !== "string" ||
      typeof product.model !== "string" ||
      typeof product.detailHtml !== "string" ||
      typeof product.active !== "boolean" ||
      !Array.isArray(product.images) ||
      !product.images.every((image) => typeof image === "string") ||
      !product.flags ||
      typeof product.flags.hit !== "boolean" ||
      typeof product.flags.recommend !== "boolean" ||
      typeof product.flags.new !== "boolean" ||
      typeof product.flags.popular !== "boolean" ||
      typeof product.flags.sale !== "boolean"
    ) {
      return null;
    }
    return cloneProduct(product as ManagedCatalogProduct);
  } catch {
    return null;
  }
}

function cloneProduct(product: ManagedCatalogProduct): ManagedCatalogProduct {
  const legacy = productAdminBaselineById.get(product.id);
  return {
    ...product,
    primaryCategoryId:
      product.primaryCategoryId ??
      legacy?.primaryCategoryId ??
      product.categoryId,
    secondaryCategoryId:
      product.secondaryCategoryId ?? legacy?.secondaryCategoryId ?? "",
    tertiaryCategoryId:
      product.tertiaryCategoryId ?? legacy?.tertiaryCategoryId ?? "",
    flags: { ...product.flags },
    images: [...product.images],
    sortOrder: product.sortOrder ?? legacy?.sortOrder ?? 0,
    viewCount: product.viewCount ?? legacy?.viewCount ?? 0,
    rewardPoints: product.rewardPoints ?? legacy?.rewardPoints ?? 0,
    desktopSkin: product.desktopSkin ?? legacy?.desktopSkin ?? "basic",
    mobileSkin: product.mobileSkin ?? legacy?.mobileSkin ?? "basic",
    stockNotificationQuantity:
      product.stockNotificationQuantity ?? 0,
    soldOut: product.soldOut ?? legacy?.soldOut ?? false,
    restockNotification: product.restockNotification ?? false,
  };
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AdminApiError(400, "상품 정보 형식이 올바르지 않습니다.");
  }
  return value as Record<string, unknown>;
}

function listWriteInteger(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new AdminApiError(400, `${label} 형식이 올바르지 않습니다.`);
  }
  return value;
}

function stringField(
  body: Record<string, unknown>,
  keys: string[],
  fallback: string,
  options: {
    field: string;
    maximumLength: number;
    errors: Record<string, string>;
    required?: boolean;
    trim?: boolean;
  },
): string {
  const found = firstValue(body, keys);
  if (!found.present) {
    if (options.required && fallback.trim().length === 0) {
      options.errors[options.field] = "필수 입력 항목입니다.";
    }
    return fallback;
  }
  if (typeof found.value !== "string") {
    options.errors[options.field] = "문자열로 입력해 주세요.";
    return fallback;
  }

  const value = options.trim === false ? found.value : found.value.trim();
  if (options.required && value.length === 0) {
    options.errors[options.field] = "필수 입력 항목입니다.";
  } else if (value.length > options.maximumLength) {
    options.errors[options.field] =
      `${options.maximumLength.toLocaleString("ko-KR")}자 이하로 입력해 주세요.`;
  }
  return value;
}

function optionalString(
  body: Record<string, unknown>,
  key: string,
  errors: Record<string, string>,
  maximumLength: number,
): string | undefined {
  if (!Object.prototype.hasOwnProperty.call(body, key)) return undefined;
  const value = body[key];
  if (typeof value !== "string" || value.length > maximumLength) {
    errors[key] = "값을 확인해 주세요.";
    return undefined;
  }
  return value;
}

function integerField(
  body: Record<string, unknown>,
  keys: string[],
  fallback: number,
  options: {
    field: string;
    minimum: number;
    maximum: number;
    errors: Record<string, string>;
  },
): number {
  const found = firstValue(body, keys);
  if (!found.present) return fallback;
  const value =
    typeof found.value === "string" && /^\d+$/u.test(found.value)
      ? Number(found.value)
      : found.value;
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < options.minimum ||
    value > options.maximum
  ) {
    options.errors[options.field] =
      `${options.minimum.toLocaleString("ko-KR")} 이상 ${options.maximum.toLocaleString("ko-KR")} 이하의 정수를 입력해 주세요.`;
    return fallback;
  }
  return value;
}

function booleanField(
  body: Record<string, unknown>,
  keys: string[],
  fallback: boolean,
  field: string,
  errors: Record<string, string>,
): boolean {
  const found = firstValue(body, keys);
  if (!found.present) return fallback;
  if (typeof found.value === "boolean") return found.value;
  if (found.value === 1 || found.value === "1" || found.value === "true") {
    return true;
  }
  if (found.value === 0 || found.value === "0" || found.value === "false") {
    return false;
  }
  errors[field] = "사용 여부 값을 확인해 주세요.";
  return fallback;
}

function imageFields(
  body: Record<string, unknown>,
  fallback: string[],
  errors: Record<string, string>,
): string[] {
  let images = [...fallback];
  if (Object.prototype.hasOwnProperty.call(body, "images")) {
    const supplied = body.images;
    if (
      !Array.isArray(supplied) ||
      !supplied.every((image) => typeof image === "string")
    ) {
      errors.thumbnailUrl = "이미지 주소 목록을 확인해 주세요.";
      return images;
    }
    images = supplied.map((image) => image.trim()).filter(Boolean);
  } else if (Object.prototype.hasOwnProperty.call(body, "thumbnailUrl")) {
    if (typeof body.thumbnailUrl !== "string") {
      errors.thumbnailUrl = "이미지 주소를 확인해 주세요.";
      return images;
    }
    const thumbnail = body.thumbnailUrl.trim();
    images = thumbnail
      ? [thumbnail, ...fallback.slice(1)]
      : fallback.slice(1);
  }

  if (
    images.length > 20 ||
    images.some((image) => image.length > 500 || !isAllowedProductImage(image))
  ) {
    errors.thumbnailUrl =
      "이미지는 로컬 보관 이미지 주소만 최대 20개까지 사용할 수 있습니다.";
  }
  return [...new Set(images)];
}

function flagFields(
  body: Record<string, unknown>,
  fallback: ManagedProductFlags = {
    hit: false,
    recommend: false,
    new: false,
    popular: false,
    sale: false,
  },
  errors: Record<string, string>,
): ManagedProductFlags {
  const suppliedFlags =
    body.flags && typeof body.flags === "object" && !Array.isArray(body.flags)
      ? (body.flags as Record<string, unknown>)
      : {};
  if (
    Object.prototype.hasOwnProperty.call(body, "flags") &&
    suppliedFlags === body.flags
  ) {
    // The equality branch is intentionally empty; it only narrows the value.
  } else if (Object.prototype.hasOwnProperty.call(body, "flags")) {
    errors.flags = "상품 표시 설정을 확인해 주세요.";
  }

  const combined: Record<string, unknown> = { ...suppliedFlags };
  for (const name of ["hit", "recommend", "new", "popular", "sale"]) {
    if (Object.prototype.hasOwnProperty.call(body, name)) {
      combined[name] = body[name];
    }
  }
  if (
    Object.prototype.hasOwnProperty.call(body, "featured") &&
    !Object.prototype.hasOwnProperty.call(combined, "recommend")
  ) {
    combined.recommend = body.featured;
  }

  return {
    hit: booleanField(combined, ["hit"], fallback.hit, "flags", errors),
    recommend: booleanField(
      combined,
      ["recommend"],
      fallback.recommend,
      "flags",
      errors,
    ),
    new: booleanField(combined, ["new"], fallback.new, "flags", errors),
    popular: booleanField(
      combined,
      ["popular"],
      fallback.popular,
      "flags",
      errors,
    ),
    sale: booleanField(combined, ["sale"], fallback.sale, "flags", errors),
  };
}

function firstValue(
  body: Record<string, unknown>,
  keys: string[],
): { present: boolean; value?: unknown } {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      return { present: true, value: body[key] };
    }
  }
  return { present: false };
}

function hasAny(body: Record<string, unknown>, keys: string[]): boolean {
  return keys.some((key) => Object.prototype.hasOwnProperty.call(body, key));
}

function isAllowedProductImage(value: string): boolean {
  return (
    !value.includes("..") &&
    !value.includes("\\") &&
    !value.includes("//") &&
    (localLegacyAsset.test(value) || uploadedAsset.test(value))
  );
}

function safeHtmlUrl(attributeName: string, rawValue: string): boolean {
  const value = rawValue.trim();
  if (
    !value ||
    value.includes("\\") ||
    /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    return false;
  }
  const name = attributeName.toLowerCase();
  if (name === "src" || name === "poster") {
    return isAllowedProductImage(value);
  }
  return (
    (value.startsWith("/") && !value.startsWith("//") && !value.includes("..")) ||
    value.startsWith("#") ||
    /^mailto:[^@\s]+@[^@\s]+$/iu.test(value) ||
    /^tel:[+0-9(). -]+$/u.test(value)
  );
}

function unsafeInlineStyle(value: string): boolean {
  const normalized = value.replace(/\s+/gu, "").toLowerCase();
  return (
    normalized.includes("url(") ||
    normalized.includes("expression(") ||
    normalized.includes("@import") ||
    normalized.includes("javascript:") ||
    normalized.includes("data:") ||
    normalized.includes("behavior:") ||
    normalized.includes("-moz-binding")
  );
}

function isProductChangeType(value: string): value is ProductChangeType {
  return value === "override" || value === "created" || value === "deleted";
}

function validStoredInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function assertProductId(id: string): void {
  if (!validProductId.test(id)) {
    throw new AdminApiError(400, "상품코드 형식이 올바르지 않습니다.");
  }
}

function generateProductId(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = crypto.randomUUID().replace(/-/gu, "").slice(0, 10).toUpperCase();
  return `P${timestamp}${random}`;
}
