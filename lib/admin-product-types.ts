import { AdminApiError } from "@/lib/admin-api";
import {
  ensureAdminProductSchema,
  getAdminProductRecords,
  productDatabase,
  type ManagedProductFlags,
  type ProductChangeType,
} from "@/lib/admin-products";

export interface AdminProductTypeRow {
  id: string;
  categoryId: string;
  name: string;
  image: string;
  flags: ManagedProductFlags;
  revision: number;
}

interface ProductTypeOptions {
  database?: D1Database;
}

interface ProductTypeWrite {
  id: string;
  expectedRevision: number;
  flags: ManagedProductFlags;
}

const MAX_ROWS_PER_WRITE = 100;
const productIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u;

export async function getAdminProductTypeRows(
  options: ProductTypeOptions = {},
): Promise<AdminProductTypeRow[]> {
  const database = options.database ?? productDatabase();
  await ensureAdminProductSchema(database);
  const records = await getAdminProductRecords({
    database,
    strict: true,
  });
  return records
    .map(({ product, revision }) => ({
      id: product.id,
      categoryId: product.categoryId,
      name: product.name,
      image: product.images[0] || "/legacy/logo.png",
      flags: { ...product.flags },
      revision,
    }))
    .sort((left, right) =>
      right.id.localeCompare(left.id, "ko-KR", {
        numeric: true,
        sensitivity: "base",
      }),
    );
}

export async function updateAdminProductTypes(
  input: unknown,
  adminUsername: string,
  options: ProductTypeOptions = {},
): Promise<AdminProductTypeRow[]> {
  const writes = validateProductTypeWrites(input);
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
      throw new AdminApiError(404, `${write.id} 상품을 찾을 수 없습니다.`);
    }
    if (current.revision !== write.expectedRevision) {
      throw new AdminApiError(
        409,
        `${write.id} 상품 정보가 다른 작업에서 변경되었습니다. 새로고침 후 다시 저장해 주세요.`,
      );
    }
  }

  const updatedBy = adminUsername.trim().slice(0, 128);
  const statements: D1PreparedStatement[] = [];
  for (const write of writes) {
    const current = recordsById.get(write.id)!;
    const payload = JSON.stringify({
      ...current.product,
      flags: { ...write.flags },
    });
    const changeType: ProductChangeType =
      current.source === "created" ? "created" : "override";
    const operationId = crypto.randomUUID();

    if (write.expectedRevision === 0) {
      statements.push(
        database
          .prepare(
            `INSERT INTO product_changes (
               product_id, change_type, payload_json, revision, updated_by
             )
             SELECT ?, ?, ?, 1, ?
             WHERE NOT EXISTS (
               SELECT 1 FROM product_changes WHERE product_id = ?
             )`,
          )
          .bind(write.id, changeType, payload, updatedBy, write.id),
      );
    } else {
      statements.push(
        database
          .prepare(
            `UPDATE product_changes
             SET change_type = ?,
                 payload_json = ?,
                 revision = revision + 1,
                 updated_by = ?,
                 updated_at = CURRENT_TIMESTAMP
             WHERE product_id = ?
               AND revision = ?
               AND change_type <> 'deleted'`,
          )
          .bind(
            changeType,
            payload,
            updatedBy,
            write.id,
            write.expectedRevision,
          ),
      );
    }
    statements.push(
      database
        .prepare(
          `INSERT INTO product_type_write_guards (
             operation_id, product_id, guard_value
           ) VALUES (
             ?, ?,
             CASE WHEN changes() = 1 THEN 1 ELSE 0 END
           )`,
        )
        .bind(operationId, write.id),
    );
  }
  statements.push(
    database
      .prepare(
        `INSERT INTO admin_audit_logs (
           action, entity_type, entity_id, details
         ) VALUES ('product.types.bulk_update', 'product', '', ?)`,
      )
      .bind(
        JSON.stringify({
          count: writes.length,
          adminUsername: updatedBy,
          productIds: writes.map((write) => write.id),
        }),
      ),
  );

  try {
    await database.batch(statements);
  } catch (error) {
    if (
      error instanceof Error &&
      /product_changes|product_type_write_guards|guard_value|constraint|not null/iu.test(
        error.message,
      )
    ) {
      throw new AdminApiError(
        409,
        "저장 중 상품 정보가 변경되었습니다. 최신 목록을 불러온 뒤 다시 저장해 주세요.",
      );
    }
    throw error;
  }

  const updatedIds = new Set(writes.map((write) => write.id));
  return (await getAdminProductTypeRows({ database })).filter((row) =>
    updatedIds.has(row.id),
  );
}

export function validateProductTypeWrites(
  input: unknown,
): ProductTypeWrite[] {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new AdminApiError(400, "상품유형 저장 형식을 확인해 주세요.");
  }
  const rows = (input as { rows?: unknown }).rows;
  if (
    !Array.isArray(rows) ||
    rows.length < 1 ||
    rows.length > MAX_ROWS_PER_WRITE
  ) {
    throw new AdminApiError(
      400,
      `한 번에 1개 이상 ${MAX_ROWS_PER_WRITE}개 이하의 상품을 저장해 주세요.`,
    );
  }
  const seen = new Set<string>();
  return rows.map((row, index) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw new AdminApiError(
        400,
        `${index + 1}번째 상품 형식을 확인해 주세요.`,
      );
    }
    const value = row as Record<string, unknown>;
    const id = typeof value.id === "string" ? value.id.trim() : "";
    if (!productIdPattern.test(id) || seen.has(id)) {
      throw new AdminApiError(
        400,
        `${index + 1}번째 상품코드를 확인해 주세요.`,
      );
    }
    seen.add(id);
    const expectedRevision = value.expectedRevision;
    if (
      typeof expectedRevision !== "number" ||
      !Number.isSafeInteger(expectedRevision) ||
      expectedRevision < 0 ||
      expectedRevision > 2_147_483_647
    ) {
      throw new AdminApiError(400, `${id} 상품의 변경 기준값을 확인해 주세요.`);
    }
    const flagsValue = value.flags;
    if (
      !flagsValue ||
      typeof flagsValue !== "object" ||
      Array.isArray(flagsValue)
    ) {
      throw new AdminApiError(400, `${id} 상품유형을 확인해 주세요.`);
    }
    const flags = flagsValue as Record<string, unknown>;
    for (const key of ["hit", "recommend", "new", "popular", "sale"]) {
      if (typeof flags[key] !== "boolean") {
        throw new AdminApiError(400, `${id} 상품유형을 확인해 주세요.`);
      }
    }
    return {
      id,
      expectedRevision,
      flags: {
        hit: flags.hit as boolean,
        recommend: flags.recommend as boolean,
        new: flags.new as boolean,
        popular: flags.popular as boolean,
        sale: flags.sale as boolean,
      },
    };
  });
}
