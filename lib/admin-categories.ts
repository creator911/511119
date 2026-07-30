import { AdminApiError } from "@/lib/admin-api";
import {
  baselineCategoryIds,
  categoryCatalogGenerationId,
  categoryDatabase,
  categoryTextContainsExternalUrl,
  ensureCategorySchema,
  getCategoryCatalogGeneration,
  getEffectiveCategoryRecords,
  validCategoryId,
} from "@/lib/categories";
import type {
  AdminCategoryRecord,
  CategoryChangeType,
  ManagedCategory,
} from "@/lib/category-contract";
import { getEffectiveProducts } from "@/lib/admin-products";

interface CategoryWriteOptions {
  database?: D1Database;
  adminUsername: string;
  expectedRevision?: number;
}

interface CategoryListOptions {
  database?: D1Database;
  strict?: boolean;
}

interface CategoryWriteGuards {
  createOnly?: boolean;
  expectedRevision: number;
  expectedGeneration: number;
  parent?: {
    id: string;
    revision: number;
  };
  requireUnreferenced?: boolean;
}

export async function getAdminCategoryRecords(
  options: CategoryListOptions = {},
): Promise<AdminCategoryRecord[]> {
  const [records, products] = await Promise.all([
    getEffectiveCategoryRecords({
      database: options.database,
      strict: options.strict,
    }),
    getEffectiveProducts({
      database: options.database,
      strict: options.strict,
    }),
  ]);
  const productCounts = new Map<string, number>();
  const childCounts = new Map<string, number>();
  for (const product of products) {
    productCounts.set(
      product.categoryId,
      (productCounts.get(product.categoryId) ?? 0) + 1,
    );
  }
  for (const record of records) {
    const parentId = record.category.parentId;
    if (parentId) {
      childCounts.set(parentId, (childCounts.get(parentId) ?? 0) + 1);
    }
  }
  return records.map((record) => ({
    ...record,
    category: { ...record.category },
    productCount: productCounts.get(record.category.id) ?? 0,
    childCount: childCounts.get(record.category.id) ?? 0,
  }));
}

export async function createManagedCategory(
  input: unknown,
  options: CategoryWriteOptions,
): Promise<AdminCategoryRecord> {
  const database = options.database ?? categoryDatabase();
  await ensureCategorySchema(database);
  const { records: existingRecords, generation } =
    await readStableCategoryRecords(database, true);
  const existingIds = new Set(
    existingRecords.map((record) => record.category.id),
  );
  const categories = existingRecords
    .filter((record) => !record.deleted)
    .map((record) => record.category);
  const category = validateCategoryInput(input, undefined, undefined, categories);
  if (baselineCategoryIds.has(category.id) || existingIds.has(category.id)) {
    throw new AdminApiError(409, "이미 사용 중인 분류코드입니다.", {
      id: "다른 분류코드를 입력해 주세요.",
    });
  }
  validateCategoryGraph([...categories, category], category);
  const parentRecord = category.parentId
    ? existingRecords.find(
        (record) =>
          !record.deleted && record.category.id === category.parentId,
      )
    : undefined;
  await writeCategoryChange(
    category,
    "created",
    options.adminUsername,
    database,
    {
      createOnly: true,
      expectedRevision: 0,
      expectedGeneration: generation,
      parent: parentRecord
        ? { id: parentRecord.category.id, revision: parentRecord.revision }
        : undefined,
    },
  );
  return readAdminCategory(category.id, database);
}

export async function updateManagedCategory(
  id: string,
  input: unknown,
  options: CategoryWriteOptions,
): Promise<AdminCategoryRecord> {
  assertCategoryId(id);
  const database = options.database ?? categoryDatabase();
  await ensureCategorySchema(database);
  const { records, generation } =
    await readStableCategoryRecords(database);
  const categories = records.map((record) => record.category);
  const currentRecord = records.find((record) => record.category.id === id);
  if (!currentRecord) {
    throw new AdminApiError(404, "상품분류를 찾을 수 없습니다.");
  }
  const current = currentRecord.category;
  const expectedRevision = readExpectedRevision(input);
  if (expectedRevision !== currentRecord.revision) {
    throw new AdminApiError(
      409,
      "다른 작업에서 상품분류가 변경되었습니다. 최신 정보를 다시 불러와 주세요.",
    );
  }
  const category = validateCategoryInput(input, current, id, categories);
  const nextCategories = categories.map((entry) =>
    entry.id === id ? category : entry,
  );
  validateCategoryGraph(nextCategories, category);
  const parentRecord = category.parentId
    ? records.find((record) => record.category.id === category.parentId)
    : undefined;
  await writeCategoryChange(
    category,
    baselineCategoryIds.has(id) ? "override" : "created",
    options.adminUsername,
    database,
    {
      expectedRevision,
      expectedGeneration: generation,
      parent: parentRecord
        ? { id: parentRecord.category.id, revision: parentRecord.revision }
        : undefined,
    },
  );
  return readAdminCategory(id, database);
}

export async function deleteManagedCategory(
  id: string,
  options: CategoryWriteOptions,
): Promise<void> {
  assertCategoryId(id);
  const database = options.database ?? categoryDatabase();
  await ensureCategorySchema(database);
  const { records, generation } =
    await readStableCategoryRecords(database);
  const categories = records.map((record) => record.category);
  const currentRecord = records.find((record) => record.category.id === id);
  if (!currentRecord) {
    throw new AdminApiError(404, "상품분류를 찾을 수 없습니다.");
  }
  const current = currentRecord.category;
  if (
    options.expectedRevision !== undefined &&
    options.expectedRevision !== currentRecord.revision
  ) {
    throw new AdminApiError(
      409,
      "다른 작업에서 상품분류가 변경되었습니다. 최신 정보를 다시 불러와 주세요.",
    );
  }
  if (categories.some((category) => category.parentId === id)) {
    throw new AdminApiError(
      409,
      "하위 분류가 연결되어 있어 삭제할 수 없습니다. 하위 분류를 먼저 이동하거나 삭제해 주세요.",
    );
  }
  const products = await getEffectiveProducts({
    database,
    strict: true,
  });
  const productCount = products.filter(
    (product) => product.categoryId === id,
  ).length;
  if (productCount > 0) {
    throw new AdminApiError(
      409,
      `상품 ${productCount.toLocaleString("ko-KR")}개가 연결되어 있어 삭제할 수 없습니다. 비활성으로 전환할 수 있습니다.`,
    );
  }
  await writeCategoryChange(
    current,
    "deleted",
    options.adminUsername,
    database,
    {
      expectedRevision: currentRecord.revision,
      expectedGeneration: generation,
      requireUnreferenced: true,
    },
  );
}

export function validateCategoryInput(
  input: unknown,
  base: ManagedCategory | undefined,
  fixedId: string | undefined,
  categories: readonly ManagedCategory[],
): ManagedCategory {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new AdminApiError(400, "상품분류 정보 형식이 올바르지 않습니다.");
  }
  const body = input as Record<string, unknown>;
  const errors: Record<string, string> = {};
  for (const [field, value] of Object.entries(body)) {
    // Legacy skin names intentionally contain several dots (for example
    // `list.10.skin.php`). They are validated against a strict filename-only
    // allowlist below, so do not run them through the general URL detector.
    if (field === "skin" || field === "mobileSkin") continue;
    if (typeof value === "string" && categoryTextContainsExternalUrl(value)) {
      throw new AdminApiError(
        400,
        "외부 또는 기존 도메인 주소는 상품분류 정보에 사용할 수 없습니다.",
      );
    }
  }

  const suppliedId = readString(body.id, base?.id ?? "", 40, "id", errors);
  const id = fixedId ?? suppliedId;
  if (!id || !validCategoryId(id)) {
    errors.id =
      "분류코드는 영문 또는 숫자로 시작하고 영문·숫자·밑줄·하이픈만 사용해 40자 이하로 입력해 주세요.";
  }
  if (fixedId && suppliedId && suppliedId !== fixedId) {
    errors.id = "분류코드는 수정할 수 없습니다.";
  }

  const name = readString(body.name, base?.name ?? "", 80, "name", errors);
  if (!name) {
    errors.name = "분류명을 입력해 주세요.";
  } else if (
    /[<>\u0000-\u001f\u007f]/u.test(name) ||
    categoryTextContainsExternalUrl(name)
  ) {
    errors.name = "분류명에 태그, 제어문자 또는 외부 주소를 사용할 수 없습니다.";
  }

  const parentId = readParentId(body, base?.parentId ?? null, errors);
  const sortOrder = readInteger(
    body.sortOrder,
    base?.sortOrder ?? 0,
    0,
    1_000_000,
    "sortOrder",
    errors,
  );
  const active = readBoolean(
    body.active,
    base?.active ?? true,
    "active",
    errors,
  );
  const manager = readString(
    body.manager,
    base?.manager ?? "",
    80,
    "manager",
    errors,
  );
  const identityRequired = readBoolean(
    body.identityRequired,
    base?.identityRequired ?? false,
    "identityRequired",
    errors,
  );
  const adultOnly = readBoolean(
    body.adultOnly,
    base?.adultOnly ?? false,
    "adultOnly",
    errors,
  );
  const imageWidth = readInteger(
    body.imageWidth,
    base?.imageWidth ?? 600,
    0,
    10_000,
    "imageWidth",
    errors,
  );
  const imageHeight = readInteger(
    body.imageHeight,
    base?.imageHeight ?? 0,
    0,
    10_000,
    "imageHeight",
    errors,
  );
  const desktopColumns = readInteger(
    body.desktopColumns,
    base?.desktopColumns ?? 3,
    1,
    20,
    "desktopColumns",
    errors,
  );
  const desktopRows = readInteger(
    body.desktopRows,
    base?.desktopRows ?? 5,
    1,
    100,
    "desktopRows",
    errors,
  );
  const mobileColumns = readInteger(
    body.mobileColumns,
    base?.mobileColumns ?? 3,
    1,
    10,
    "mobileColumns",
    errors,
  );
  const mobileRows = readInteger(
    body.mobileRows,
    base?.mobileRows ?? 5,
    1,
    100,
    "mobileRows",
    errors,
  );
  const skinDirectory = readCategorySkinDirectory(
    body.skinDirectory,
    base?.skinDirectory ?? "basic",
    "skinDirectory",
    errors,
  );
  const skin = readCategorySkin(
    body.skin,
    base?.skin ?? "list.10.skin.php",
    "skin",
    errors,
  );
  const mobileSkinDirectory = readCategorySkinDirectory(
    body.mobileSkinDirectory,
    base?.mobileSkinDirectory ?? "basic",
    "mobileSkinDirectory",
    errors,
  );
  const mobileSkin = readCategorySkin(
    body.mobileSkin,
    base?.mobileSkin ?? "list.10.skin.php",
    "mobileSkin",
    errors,
  );

  if (parentId && !categories.some((category) => category.id === parentId)) {
    errors.parentId = "존재하는 상위 분류를 선택해 주세요.";
  }
  if (parentId === id) {
    errors.parentId = "자기 자신을 상위 분류로 지정할 수 없습니다.";
  }

  if (Object.keys(errors).length > 0) {
    throw new AdminApiError(400, "상품분류 정보를 확인해 주세요.", errors);
  }
  return {
    id,
    name,
    parentId,
    sortOrder,
    active,
    manager,
    identityRequired,
    adultOnly,
    imageWidth,
    imageHeight,
    desktopColumns,
    desktopRows,
    mobileColumns,
    mobileRows,
    skinDirectory,
    skin,
    mobileSkinDirectory,
    mobileSkin,
  };
}

export function validateCategoryGraph(
  categories: readonly ManagedCategory[],
  candidate: ManagedCategory,
): void {
  const byId = new Map(categories.map((category) => [category.id, category]));
  for (const category of categories) {
    const visited = new Set<string>([category.id]);
    let parentId: string | null = category.parentId;
    let depth = 0;
    while (parentId) {
      if (visited.has(parentId)) {
        throw new AdminApiError(
          400,
          "순환되는 상위 분류를 지정할 수 없습니다.",
          { parentId: "다른 상위 분류를 선택해 주세요." },
        );
      }
      const parent = byId.get(parentId);
      if (!parent) {
        throw new AdminApiError(400, "존재하는 상위 분류를 선택해 주세요.", {
          parentId: "상위 분류를 다시 선택해 주세요.",
        });
      }
      visited.add(parentId);
      depth += 1;
      if (depth > 4) {
        throw new AdminApiError(
          400,
          "상품분류는 5단계까지만 구성할 수 있습니다.",
          {
            parentId:
              category.id === candidate.id
                ? "4단계 이하의 상위 분류를 선택해 주세요."
                : "연결된 하위 분류를 먼저 이동해 주세요.",
          },
        );
      }
      parentId = parent.parentId;
    }
  }
}

async function writeCategoryChange(
  category: ManagedCategory,
  changeType: CategoryChangeType,
  adminUsername: string,
  database: D1Database,
  guards: CategoryWriteGuards,
): Promise<void> {
  const updatedBy = adminUsername.slice(0, 128);
  const details = JSON.stringify({
    changeType,
    parentId: category.parentId,
    sortOrder: category.sortOrder,
    active: category.active,
    adminUsername: updatedBy,
  });
  const conditions: string[] = [];
  const conditionBindings: Array<string | number> = [];
  if (guards.parent) {
    if (guards.parent.revision === 0) {
      conditions.push(
        `NOT EXISTS (
           SELECT 1 FROM category_changes parent
           WHERE parent.category_id = ?
         )`,
      );
      conditionBindings.push(guards.parent.id);
    } else {
      conditions.push(
        `EXISTS (
           SELECT 1 FROM category_changes parent
           WHERE parent.category_id = ?
             AND parent.revision = ?
             AND parent.change_type <> 'deleted'
         )`,
      );
      conditionBindings.push(guards.parent.id, guards.parent.revision);
    }
  }
  if (guards.requireUnreferenced) {
    conditions.push(
      `NOT EXISTS (
         SELECT 1 FROM category_changes child
         WHERE child.change_type <> 'deleted'
           AND json_extract(child.payload_json, '$.parentId') = ?
       )`,
      `NOT EXISTS (
         SELECT 1 FROM product_changes product
         WHERE product.change_type <> 'deleted'
           AND json_extract(product.payload_json, '$.categoryId') = ?
       )`,
    );
    conditionBindings.push(category.id, category.id);
  }
  const conditionSql = conditions.length ? conditions.join(" AND ") : "1 = 1";
  const payload = JSON.stringify(category);
  const changeStatement =
    guards.createOnly || guards.expectedRevision === 0
      ? database
          .prepare(
            `INSERT INTO category_changes (
               category_id, change_type, payload_json, revision, updated_by
             )
             SELECT ?, ?, ?, 1, ?
             WHERE ${conditionSql}
             ON CONFLICT(category_id) DO UPDATE SET
               change_type = NULL,
               payload_json = excluded.payload_json,
               revision = category_changes.revision + 1,
               updated_by = excluded.updated_by,
               updated_at = CURRENT_TIMESTAMP`,
          )
          .bind(
            category.id,
            changeType,
            payload,
            updatedBy,
            ...conditionBindings,
          )
      : database
          .prepare(
            `UPDATE category_changes
             SET change_type = ?,
                 payload_json = ?,
                 revision = revision + 1,
                 updated_by = ?,
                 updated_at = CURRENT_TIMESTAMP
             WHERE category_id = ?
               AND revision = ?
               AND change_type <> 'deleted'
               AND ${conditionSql}`,
          )
          .bind(
            changeType,
            payload,
            updatedBy,
            category.id,
            guards.expectedRevision,
            ...conditionBindings,
          );
  try {
    await database.batch([
      changeStatement,
      database
        .prepare(
          `UPDATE category_changes
           SET revision = revision + 1,
               updated_at = CURRENT_TIMESTAMP
           WHERE category_id = ?
             AND revision = ?
             AND changes() = 1`,
        )
        .bind(
          categoryCatalogGenerationId,
          guards.expectedGeneration,
        ),
      database
        .prepare(
          `INSERT INTO admin_audit_logs (
             admin_id, action, entity_type, entity_id, details
           ) VALUES (
             NULL,
             ?,
             'category',
             ?,
             CASE WHEN changes() = 1 THEN ? ELSE NULL END
           )`,
        )
        .bind(`category.${changeType}`, category.id, details),
    ]);
  } catch (error) {
    if (
      error instanceof Error &&
      /category_changes|admin_audit_logs|not null|constraint/iu.test(
        error.message,
      )
    ) {
      throw new AdminApiError(
        409,
        guards.requireUnreferenced
          ? "하위 분류 또는 연결 상품이 추가되어 삭제할 수 없습니다. 최신 정보를 다시 불러와 주세요."
          : "다른 작업에서 상품분류가 변경되었습니다. 최신 정보를 다시 불러와 주세요.",
      );
    }
    throw error;
  }
}

async function readStableCategoryRecords(
  database: D1Database,
  includeDeleted = false,
): Promise<{
  records: Awaited<ReturnType<typeof getEffectiveCategoryRecords>>;
  generation: number;
}> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const before = await getCategoryCatalogGeneration(database);
    const records = await getEffectiveCategoryRecords({
      database,
      strict: true,
      includeDeleted,
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

function readExpectedRevision(input: unknown): number {
  const value =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>).expectedRevision
      : undefined;
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > 2_147_483_647
  ) {
    throw new AdminApiError(400, "상품분류 변경 기준값을 확인해 주세요.");
  }
  return value;
}

async function readAdminCategory(
  id: string,
  database: D1Database,
): Promise<AdminCategoryRecord> {
  const record = (await getAdminCategoryRecords({
    database,
    strict: true,
  })).find((entry) => entry.category.id === id);
  if (!record) {
    throw new AdminApiError(500, "저장한 상품분류를 불러오지 못했습니다.");
  }
  return record;
}

function readString(
  value: unknown,
  fallback: string,
  maximumLength: number,
  field: string,
  errors: Record<string, string>,
): string {
  if (value === undefined) return fallback;
  if (typeof value !== "string") {
    errors[field] = "문자열로 입력해 주세요.";
    return fallback;
  }
  const normalized = value.replace(/\0/gu, "").trim();
  if (normalized.length > maximumLength) {
    errors[field] = `${maximumLength.toLocaleString("ko-KR")}자 이하로 입력해 주세요.`;
  }
  return normalized;
}

function readParentId(
  body: Record<string, unknown>,
  fallback: string | null,
  errors: Record<string, string>,
): string | null {
  if (!Object.prototype.hasOwnProperty.call(body, "parentId")) return fallback;
  const value = body.parentId;
  if (value === null || value === "") return null;
  if (typeof value !== "string") {
    errors.parentId = "상위 분류를 다시 선택해 주세요.";
    return fallback;
  }
  const normalized = value.trim();
  if (!validCategoryId(normalized)) {
    errors.parentId = "상위 분류코드 형식이 올바르지 않습니다.";
  }
  return normalized;
}

function readInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
  field: string,
  errors: Record<string, string>,
): number {
  if (value === undefined) return fallback;
  const parsed =
    typeof value === "string" && /^\d+$/u.test(value)
      ? Number(value)
      : value;
  if (
    typeof parsed !== "number" ||
    !Number.isSafeInteger(parsed) ||
    parsed < minimum ||
    parsed > maximum
  ) {
    errors[field] =
      `${minimum.toLocaleString("ko-KR")} 이상 ${maximum.toLocaleString("ko-KR")} 이하의 정수를 입력해 주세요.`;
    return fallback;
  }
  return parsed;
}

function readBoolean(
  value: unknown,
  fallback: boolean,
  field: string,
  errors: Record<string, string>,
): boolean {
  if (value === undefined) return fallback;
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1" || value === "true") return true;
  if (value === 0 || value === "0" || value === "false") return false;
  errors[field] = "사용 여부 값을 확인해 주세요.";
  return fallback;
}

function readCategorySkin(
  value: unknown,
  fallback: string,
  field: string,
  errors: Record<string, string>,
): string {
  const skin = readString(value, fallback, 100, field, errors);
  if (
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/u.test(skin) ||
    !skin.endsWith(".php")
  ) {
    errors[field] = "스킨 파일명을 확인해 주세요.";
    return fallback;
  }
  return skin;
}

function readCategorySkinDirectory(
  value: unknown,
  fallback: string,
  field: string,
  errors: Record<string, string>,
): string {
  const directory = readString(value, fallback, 80, field, errors);
  if (!/^(?:[A-Za-z0-9][A-Za-z0-9_-]{0,79}|theme\/[A-Za-z0-9][A-Za-z0-9_-]{0,73})$/u.test(directory)) {
    errors[field] = "스킨 폴더명을 확인해 주세요.";
    return fallback;
  }
  return directory;
}

function assertCategoryId(id: string): void {
  if (!validCategoryId(id)) {
    throw new AdminApiError(400, "분류코드 형식이 올바르지 않습니다.");
  }
}
