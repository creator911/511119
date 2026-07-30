import { AdminApiError } from "@/lib/admin-api";
import {
  ensureAdminProductSchema,
  getAdminProductRecords,
  productDatabase,
  validateProductInput,
  type ManagedCatalogProduct,
} from "@/lib/admin-products";
import {
  categoryCatalogGenerationId,
  getCategoryCatalogGeneration,
  getEffectiveCategoryRecords,
} from "@/lib/categories";
import type { CategoryRecord } from "@/lib/category-contract";

const MAX_CSV_BYTES = 550_000;
const MAX_IMPORT_ROWS = 200;
const MAX_REPORTED_ISSUES = 100;

export const PRODUCT_CSV_COLUMNS = [
  "id",
  "categoryId",
  "name",
  "basic",
  "price",
  "originalPrice",
  "stock",
  "maker",
  "origin",
  "brand",
  "model",
  "images",
  "detailHtml",
  "hit",
  "recommend",
  "new",
  "popular",
  "sale",
  "active",
] as const;

type ProductCsvColumn = (typeof PRODUCT_CSV_COLUMNS)[number];

export interface ProductBulkIssue {
  row: number;
  field: string;
  message: string;
}

export interface ProductBulkPreview {
  row: number;
  id: string;
  categoryId: string;
  name: string;
  price: number;
  stock: number;
}

export interface ProductBulkDryRunResult {
  valid: boolean;
  rowCount: number;
  token: string;
  issues: ProductBulkIssue[];
  preview: ProductBulkPreview[];
}

interface ValidatedBulkImport {
  generation: number;
  products: ManagedCatalogProduct[];
  categoryRecords: Map<string, CategoryRecord>;
  token: string;
  issues: ProductBulkIssue[];
}

export async function exportManagedProductsCsv(): Promise<string> {
  const records = await getAdminProductRecords({
    strict: true,
    includeDeleted: false,
  });
  const rows = records
    .map(({ product }) => product)
    .sort((left, right) => left.id.localeCompare(right.id, "ko-KR"))
    .map((product) =>
      PRODUCT_CSV_COLUMNS.map((column) =>
        csvCell(exportColumn(product, column)),
      ).join(","),
    );
  return `\uFEFF${PRODUCT_CSV_COLUMNS.join(",")}\r\n${rows.join("\r\n")}\r\n`;
}

export async function dryRunProductCsvImport(
  csv: string,
  adminUsername: string,
): Promise<ProductBulkDryRunResult> {
  const validation = await validateProductCsvImport(csv, adminUsername);
  return {
    valid: validation.issues.length === 0,
    rowCount: validation.products.length,
    token: validation.token,
    issues: validation.issues,
    preview: validation.products.slice(0, 20).map((product, index) => ({
      row: index + 2,
      id: product.id,
      categoryId: product.categoryId,
      name: product.name,
      price: product.price,
      stock: product.stock,
    })),
  };
}

export async function commitProductCsvImport(
  csv: string,
  token: string,
  adminUsername: string,
): Promise<{ imported: number; ids: string[] }> {
  if (!token || token.length > 128) {
    throw new AdminApiError(400, "dry-run 확인값이 올바르지 않습니다.");
  }
  const validation = await validateProductCsvImport(csv, adminUsername);
  if (validation.issues.length > 0) {
    throw new AdminApiError(
      422,
      "CSV 검증 결과가 변경되었거나 입력값에 오류가 있습니다.",
      issuesToFieldErrors(validation.issues),
    );
  }
  if (!constantTimeEqual(token, validation.token)) {
    throw new AdminApiError(
      409,
      "CSV 또는 상품분류가 dry-run 이후 변경되었습니다. 다시 검증해 주세요.",
    );
  }

  const database = productDatabase();
  await ensureAdminProductSchema(database);
  const statements: D1PreparedStatement[] = [];
  const updatedBy = adminUsername.slice(0, 128);

  for (const product of validation.products) {
    const category = validation.categoryRecords.get(product.categoryId);
    if (!category) {
      throw new AdminApiError(
        409,
        "상품분류가 변경되었습니다. 다시 검증해 주세요.",
      );
    }
    const categoryCondition =
      category.revision === 0
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
      category.revision === 0
        ? [
            categoryCatalogGenerationId,
            validation.generation,
            category.category.id,
          ]
        : [
            categoryCatalogGenerationId,
            validation.generation,
            category.category.id,
            category.revision,
          ];

    statements.push(
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
          product.id,
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
        .bind(product.id, product.stock),
    );
  }

  statements.push(
    database
      .prepare(
        `INSERT INTO admin_audit_logs (
           action, entity_type, entity_id, details
         ) VALUES ('product.bulk_create', 'product_batch', ?, ?)`,
      )
      .bind(
        validation.token.slice(0, 32),
        JSON.stringify({
          count: validation.products.length,
          ids: validation.products.map((product) => product.id),
          adminUsername: updatedBy,
        }),
      ),
  );

  try {
    await database.batch(statements);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/product_changes|product_stock|category_changes|constraint|not null/iu.test(message)) {
      throw new AdminApiError(
        409,
        "상품 또는 상품분류가 dry-run 이후 변경되었습니다. 다시 검증해 주세요.",
      );
    }
    throw error;
  }

  return {
    imported: validation.products.length,
    ids: validation.products.map((product) => product.id),
  };
}

async function validateProductCsvImport(
  csv: string,
  adminUsername: string,
): Promise<ValidatedBulkImport> {
  if (typeof csv !== "string") {
    throw new AdminApiError(400, "CSV 내용을 확인해 주세요.");
  }
  const byteLength = new TextEncoder().encode(csv).byteLength;
  if (byteLength === 0 || byteLength > MAX_CSV_BYTES) {
    throw new AdminApiError(
      byteLength > MAX_CSV_BYTES ? 413 : 400,
      `CSV 파일은 ${MAX_CSV_BYTES.toLocaleString("ko-KR")}바이트 이하여야 합니다.`,
    );
  }

  const database = productDatabase();
  await ensureAdminProductSchema(database);
  const [generation, categoryRecords, existingRecords] = await Promise.all([
    getCategoryCatalogGeneration(database),
    getEffectiveCategoryRecords({ database, strict: true }),
    getAdminProductRecords({
      database,
      strict: true,
      includeDeleted: true,
    }),
  ]);
  const parsed = parseCsv(csv.replace(/^\uFEFF/u, ""));
  if (parsed.length < 2) {
    throw new AdminApiError(400, "헤더와 한 개 이상의 상품 행이 필요합니다.");
  }
  if (parsed.length - 1 > MAX_IMPORT_ROWS) {
    throw new AdminApiError(
      400,
      `한 번에 최대 ${MAX_IMPORT_ROWS.toLocaleString("ko-KR")}개 상품을 등록할 수 있습니다.`,
    );
  }

  const header = parsed[0].map((value) => value.trim());
  const headerIssues = validateHeader(header);
  if (headerIssues.length > 0) {
    return {
      generation,
      products: [],
      categoryRecords: new Map(
        categoryRecords.map((record) => [record.category.id, record]),
      ),
      token: await makeDryRunToken(csv, generation, adminUsername),
      issues: headerIssues,
    };
  }

  const headerIndex = new Map(
    header.map((column, index) => [column as ProductCsvColumn, index]),
  );
  const allowedCategoryIds = new Set(
    categoryRecords.map((record) => record.category.id),
  );
  const categoryById = new Map(
    categoryRecords.map((record) => [record.category.id, record]),
  );
  const existingIds = new Set(
    existingRecords.map((record) => record.product.id),
  );
  const seenIds = new Set<string>();
  const products: ManagedCatalogProduct[] = [];
  const issues: ProductBulkIssue[] = [];

  parsed.slice(1).forEach((cells, index) => {
    const rowNumber = index + 2;
    if (cells.every((cell) => cell.trim() === "")) return;
    if (cells.length > header.length) {
      pushIssue(issues, {
        row: rowNumber,
        field: "row",
        message: "헤더보다 열이 많습니다.",
      });
      return;
    }
    const raw = Object.fromEntries(
      PRODUCT_CSV_COLUMNS.map((column) => [
        column,
        cells[headerIndex.get(column) ?? -1] ?? "",
      ]),
    ) as Record<ProductCsvColumn, string>;
    const id = raw.id.trim();
    if (existingIds.has(id)) {
      pushIssue(issues, {
        row: rowNumber,
        field: "id",
        message: "이미 존재하거나 삭제 이력이 있는 상품코드입니다.",
      });
    }
    if (seenIds.has(id)) {
      pushIssue(issues, {
        row: rowNumber,
        field: "id",
        message: "CSV 안에서 상품코드가 중복되었습니다.",
      });
    }
    seenIds.add(id);

    try {
      const product = validateProductInput(
        csvRowToProductInput(raw),
        undefined,
        undefined,
        allowedCategoryIds,
      );
      products.push(product);
    } catch (error) {
      if (error instanceof AdminApiError) {
        const entries = Object.entries(error.details ?? {});
        if (entries.length === 0) {
          pushIssue(issues, {
            row: rowNumber,
            field: "row",
            message: error.message,
          });
        } else {
          for (const [field, message] of entries) {
            pushIssue(issues, { row: rowNumber, field, message });
          }
        }
      } else {
        throw error;
      }
    }
  });

  if (products.length === 0 && issues.length === 0) {
    pushIssue(issues, {
      row: 2,
      field: "row",
      message: "등록할 상품 행이 없습니다.",
    });
  }

  return {
    generation,
    products,
    categoryRecords: categoryById,
    token: await makeDryRunToken(csv, generation, adminUsername),
    issues,
  };
}

function validateHeader(header: string[]): ProductBulkIssue[] {
  const issues: ProductBulkIssue[] = [];
  const duplicates = header.filter(
    (column, index) => header.indexOf(column) !== index,
  );
  for (const column of [...new Set(duplicates)]) {
    pushIssue(issues, {
      row: 1,
      field: column || "header",
      message: "헤더가 중복되었습니다.",
    });
  }
  const allowed = new Set<string>(PRODUCT_CSV_COLUMNS);
  for (const column of header) {
    if (!allowed.has(column)) {
      pushIssue(issues, {
        row: 1,
        field: column || "header",
        message: "지원하지 않는 헤더입니다.",
      });
    }
  }
  for (const required of ["id", "categoryId", "name", "price", "stock"]) {
    if (!header.includes(required)) {
      pushIssue(issues, {
        row: 1,
        field: required,
        message: "필수 헤더가 없습니다.",
      });
    }
  }
  return issues;
}

function csvRowToProductInput(
  raw: Record<ProductCsvColumn, string>,
): Record<string, unknown> {
  return {
    id: unescapeSpreadsheetValue(raw.id).trim(),
    categoryId: unescapeSpreadsheetValue(raw.categoryId).trim(),
    name: unescapeSpreadsheetValue(raw.name).trim(),
    basic: unescapeSpreadsheetValue(raw.basic),
    price: raw.price.trim(),
    originalPrice: raw.originalPrice.trim() || "0",
    stock: raw.stock.trim(),
    maker: unescapeSpreadsheetValue(raw.maker).trim(),
    origin: unescapeSpreadsheetValue(raw.origin).trim(),
    brand: unescapeSpreadsheetValue(raw.brand).trim(),
    model: unescapeSpreadsheetValue(raw.model).trim(),
    images: raw.images
      .split("|")
      .map((value) => unescapeSpreadsheetValue(value).trim())
      .filter(Boolean),
    detailHtml: unescapeSpreadsheetValue(raw.detailHtml),
    flags: {
      hit: parseCsvBoolean(raw.hit),
      recommend: parseCsvBoolean(raw.recommend),
      new: parseCsvBoolean(raw.new),
      popular: parseCsvBoolean(raw.popular),
      sale: parseCsvBoolean(raw.sale),
    },
    active: parseCsvBoolean(raw.active, true),
  };
}

function parseCsvBoolean(value: string, fallback = false): boolean | string {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return fallback;
  if (["1", "true", "yes", "y", "예", "사용"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "n", "아니오", "미사용"].includes(normalized)) {
    return false;
  }
  return value;
}

function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quoted) {
      if (character === '"') {
        if (input[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += character;
      }
      continue;
    }
    if (character === '"') {
      if (field.length > 0) {
        throw new AdminApiError(400, "CSV 따옴표 위치를 확인해 주세요.");
      }
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/u, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (quoted) {
    throw new AdminApiError(400, "CSV 따옴표가 닫히지 않았습니다.");
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field.replace(/\r$/u, ""));
    rows.push(row);
  }
  while (
    rows.length > 0 &&
    rows[rows.length - 1].every((cell) => cell.trim() === "")
  ) {
    rows.pop();
  }
  return rows;
}

function exportColumn(
  product: ManagedCatalogProduct,
  column: ProductCsvColumn,
): string {
  if (column === "images") return product.images.join("|");
  if (
    column === "hit" ||
    column === "recommend" ||
    column === "new" ||
    column === "popular" ||
    column === "sale"
  ) {
    return product.flags[column] ? "1" : "0";
  }
  const value = product[column];
  if (typeof value === "boolean") return value ? "1" : "0";
  return String(value);
}

function csvCell(value: string): string {
  const protectedValue = escapeSpreadsheetValue(value);
  return `"${protectedValue.replace(/"/gu, '""')}"`;
}

function escapeSpreadsheetValue(value: string): string {
  return /^[=+\-@]/u.test(value) ? `'${value}` : value;
}

function unescapeSpreadsheetValue(value: string): string {
  return /^'[=+\-@]/u.test(value) ? value.slice(1) : value;
}

async function makeDryRunToken(
  csv: string,
  generation: number,
  adminUsername: string,
): Promise<string> {
  const input = new TextEncoder().encode(
    `product-bulk-v1\0${generation}\0${adminUsername.slice(0, 128)}\0${csv}`,
  );
  const digest = await crypto.subtle.digest("SHA-256", input);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return result === 0;
}

function pushIssue(
  issues: ProductBulkIssue[],
  issue: ProductBulkIssue,
): void {
  if (issues.length < MAX_REPORTED_ISSUES) issues.push(issue);
}

function issuesToFieldErrors(
  issues: ProductBulkIssue[],
): Record<string, string> {
  return Object.fromEntries(
    issues.slice(0, 50).map((issue, index) => [
      `row${issue.row}.${issue.field}.${index}`,
      issue.message,
    ]),
  );
}
