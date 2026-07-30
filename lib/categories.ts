import { env } from "cloudflare:workers";
import legacyCategoryAdminBaseline from "@/data/legacy-category-admin-baseline.json";
import { AdminApiError } from "@/lib/admin-api";
import type {
  CategoryChangeType,
  CategoryNavigationItem,
  CategoryRecord,
  ManagedCategory,
} from "@/lib/category-contract";

interface LegacyAdminCategoryBaseline {
  id: string;
  name: string;
  active: boolean;
  imageWidth: number;
  imageHeight: number;
  desktopColumns: number;
  desktopRows: number;
  mobileColumns: number;
  mobileRows: number;
}

export interface CategoryChangeRow {
  category_id: string;
  change_type: string;
  payload_json: string;
  revision: number;
  updated_by: string;
  created_at: string;
  updated_at: string;
}

export interface CategoryReadOptions {
  database?: D1Database;
  strict?: boolean;
  includeDeleted?: boolean;
}

export const baselineCategories: readonly ManagedCategory[] =
  (legacyCategoryAdminBaseline as LegacyAdminCategoryBaseline[]).map(
    (category, index) => ({
      id: category.id,
      name: category.name,
      parentId: category.id.length === 4 ? category.id.slice(0, 2) : null,
      sortOrder: index + 1,
      active: category.active,
      manager: "",
      identityRequired: false,
      adultOnly: false,
      imageWidth: category.imageWidth,
      imageHeight: category.imageHeight,
      desktopColumns: category.desktopColumns,
      desktopRows: category.desktopRows,
      mobileColumns: category.mobileColumns,
      mobileRows: category.mobileRows,
      skinDirectory: "basic",
      skin: "list.10.skin.php",
      mobileSkinDirectory: "basic",
      mobileSkin: "list.10.skin.php",
    }),
  );
export const baselineCategoryIds = new Set(
  baselineCategories.map((category) => category.id),
);

const schemaInitializations = new WeakMap<object, Promise<void>>();
const CATEGORY_CATALOG_GENERATION_ID = "__catalog_generation__";
const categoryIdPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/u;
const externalUrlPattern =
  /(?:https?:\/\/|(?:^|[\s(])\/\/|www\.|\b[a-z0-9-]+(?:\.[a-z0-9-]+)+(?::\d+)?(?:\/|\b))/iu;

export function categoryDatabase(): D1Database {
  const database = (env as unknown as { DB?: D1Database }).DB;
  if (!database) {
    throw new AdminApiError(503, "상품분류 데이터베이스가 준비되지 않았습니다.");
  }
  return database;
}

export async function ensureCategorySchema(
  database = categoryDatabase(),
): Promise<void> {
  const cacheKey = database as unknown as object;
  let initialization = schemaInitializations.get(cacheKey);
  if (!initialization) {
    initialization = database
      .batch([
        database.prepare(`CREATE TABLE IF NOT EXISTS category_changes (
          category_id TEXT PRIMARY KEY,
          change_type TEXT NOT NULL,
          payload_json TEXT NOT NULL DEFAULT '{}',
          revision INTEGER NOT NULL DEFAULT 1,
          updated_by TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        database.prepare(
          "CREATE INDEX IF NOT EXISTS category_changes_type_idx ON category_changes(change_type)",
        ),
        database.prepare(
          "CREATE INDEX IF NOT EXISTS category_changes_updated_idx ON category_changes(updated_at)",
        ),
        database.prepare(
          `INSERT OR IGNORE INTO category_changes (
             category_id, change_type, payload_json, revision, updated_by
           ) VALUES (?, 'override', '{}', 1, 'system')`,
        ).bind(CATEGORY_CATALOG_GENERATION_ID),
        database.prepare(`CREATE TABLE IF NOT EXISTS admin_audit_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          admin_id INTEGER,
          action TEXT NOT NULL,
          entity_type TEXT NOT NULL,
          entity_id TEXT NOT NULL DEFAULT '',
          details TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        database.prepare(
          "CREATE INDEX IF NOT EXISTS admin_audit_created_idx ON admin_audit_logs(created_at)",
        ),
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

export async function getCategoryCatalogGeneration(
  database = categoryDatabase(),
): Promise<number> {
  await ensureCategorySchema(database);
  const row = await database
    .prepare(
      `SELECT revision
       FROM category_changes
       WHERE category_id = ?
       LIMIT 1`,
    )
    .bind(CATEGORY_CATALOG_GENERATION_ID)
    .first<{ revision: number }>();
  const generation = Number(row?.revision);
  if (!Number.isSafeInteger(generation) || generation < 1) {
    throw new AdminApiError(503, "상품분류 변경 기준값을 확인할 수 없습니다.");
  }
  return generation;
}

export const categoryCatalogGenerationId =
  CATEGORY_CATALOG_GENERATION_ID;

export async function getEffectiveCategoryRecords(
  options: CategoryReadOptions = {},
): Promise<CategoryRecord[]> {
  let changes: CategoryChangeRow[] = [];
  try {
    const database = options.database ?? categoryDatabase();
    await ensureCategorySchema(database);
    const result = await database
      .prepare(
        `SELECT category_id, change_type, payload_json, revision, updated_by,
                created_at, updated_at
         FROM category_changes
         ORDER BY created_at ASC, category_id ASC`,
      )
      .all<CategoryChangeRow>();
    changes = result.results ?? [];
  } catch (error) {
    if (options.strict) throw error;
  }
  return mergeCategoryChanges(
    baselineCategories,
    changes,
    options.includeDeleted ?? false,
  );
}

export async function getEffectiveCategories(
  options: CategoryReadOptions = {},
): Promise<ManagedCategory[]> {
  const records = await getEffectiveCategoryRecords({
    ...options,
    includeDeleted: false,
  });
  return records.map((record) => cloneCategory(record.category));
}

export async function getPublicCategories(
  options: CategoryReadOptions = {},
): Promise<ManagedCategory[]> {
  return getPublicCategorySnapshot(await getEffectiveCategories(options));
}

export function mergeCategoryChanges(
  baseline: readonly ManagedCategory[],
  changes: readonly CategoryChangeRow[],
  includeDeleted = false,
): CategoryRecord[] {
  const records = new Map<string, CategoryRecord>();
  const deletedRecords: CategoryRecord[] = [];

  for (const category of baseline) {
    records.set(category.id, {
      category: cloneCategory(category),
      source: "static",
      deleted: false,
      revision: 0,
      updatedBy: "",
      createdAt: null,
      updatedAt: null,
    });
  }

  for (const change of changes) {
    if (!isCategoryChangeType(change.change_type)) continue;
    const storedCategory = parseStoredCategory(change.payload_json);
    if (change.change_type === "deleted") {
      const previous = records.get(change.category_id);
      records.delete(change.category_id);
      if (includeDeleted) {
        const category = storedCategory ?? previous?.category;
        if (category) {
          deletedRecords.push({
            category: cloneCategory(category),
            source: "deleted",
            deleted: true,
            revision: Number(change.revision),
            updatedBy: change.updated_by,
            createdAt: change.created_at,
            updatedAt: change.updated_at,
          });
        }
      }
      continue;
    }
    if (!storedCategory || storedCategory.id !== change.category_id) continue;
    records.set(change.category_id, {
      category: cloneCategory(storedCategory),
      source: change.change_type,
      deleted: false,
      revision: Number(change.revision),
      updatedBy: change.updated_by,
      createdAt: change.created_at,
      updatedAt: change.updated_at,
    });
  }

  return [...records.values(), ...deletedRecords].sort((left, right) =>
    compareCategories(left.category, right.category),
  );
}

export function getPublicCategorySnapshot(
  categories: readonly ManagedCategory[],
): ManagedCategory[] {
  const categoryById = new Map(
    categories.map((category) => [category.id, category]),
  );
  return categories
    .filter((category) => {
      if (!category.active) return false;
      const visited = new Set<string>([category.id]);
      let parentId = category.parentId;
      while (parentId) {
        if (visited.has(parentId)) return false;
        visited.add(parentId);
        const parent = categoryById.get(parentId);
        if (!parent?.active) return false;
        parentId = parent.parentId;
      }
      return true;
    })
    .map(cloneCategory)
    .sort(compareCategories);
}

export function findCategory(
  categories: readonly ManagedCategory[],
  id: string | null | undefined,
): ManagedCategory | undefined {
  return id ? categories.find((category) => category.id === id) : undefined;
}

export function getCategoryTreeIdsFromSnapshot(
  categories: readonly ManagedCategory[],
  id: string,
): string[] {
  const found = new Set<string>([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const category of categories) {
      if (
        category.parentId &&
        found.has(category.parentId) &&
        !found.has(category.id)
      ) {
        found.add(category.id);
        changed = true;
      }
    }
  }
  return [...found];
}

export function getSubcategoriesFromSnapshot(
  categories: readonly ManagedCategory[],
  id: string,
): ManagedCategory[] {
  return categories
    .filter((category) => category.parentId === id)
    .map(cloneCategory)
    .sort(compareCategories);
}

export function getCategoryPathFromSnapshot(
  categories: readonly ManagedCategory[],
  id: string,
): ManagedCategory[] {
  const categoryById = new Map(
    categories.map((category) => [category.id, category]),
  );
  const path: ManagedCategory[] = [];
  const visited = new Set<string>();
  let current = categoryById.get(id);
  while (current) {
    if (visited.has(current.id)) return [];
    visited.add(current.id);
    path.unshift(cloneCategory(current));
    current = current.parentId
      ? categoryById.get(current.parentId)
      : undefined;
  }
  return path;
}

export function buildStorefrontCategoryNavigation(
  categories: readonly ManagedCategory[],
): CategoryNavigationItem[] {
  const publicCategories = getPublicCategorySnapshot(categories);
  const roots = publicCategories
    .filter((category) => !category.parentId)
    .sort(compareCategories);
  return [
    { id: "home", label: "HOME", href: "/shop" },
    ...roots.map((category) =>
      toNavigationBranch(category, publicCategories, new Set<string>()),
    ),
  ];
}

export function compareCategories(
  left: ManagedCategory,
  right: ManagedCategory,
): number {
  return (
    left.sortOrder - right.sortOrder ||
    left.name.localeCompare(right.name, "ko-KR") ||
    left.id.localeCompare(right.id, "en")
  );
}

export function validCategoryId(value: string): boolean {
  return categoryIdPattern.test(value);
}

export function categoryTextContainsExternalUrl(value: string): boolean {
  return externalUrlPattern.test(value);
}

function toNavigationItem(
  category: ManagedCategory,
): CategoryNavigationItem {
  return {
    id: `category-${category.id}`,
    label: category.name,
    href: `/shop/list.php?ca_id=${encodeURIComponent(category.id)}`,
  };
}

function toNavigationBranch(
  category: ManagedCategory,
  categories: readonly ManagedCategory[],
  ancestors: ReadonlySet<string>,
): CategoryNavigationItem {
  if (ancestors.has(category.id)) return toNavigationItem(category);
  const nextAncestors = new Set(ancestors);
  nextAncestors.add(category.id);
  const children = getSubcategoriesFromSnapshot(categories, category.id).map(
    (child) => toNavigationBranch(child, categories, nextAncestors),
  );
  return {
    ...toNavigationItem(category),
    ...(children.length ? { children } : {}),
  };
}

function parseStoredCategory(payload: string): ManagedCategory | null {
  try {
    const value = JSON.parse(payload) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const category = value as Partial<ManagedCategory>;
    if (
      typeof category.id !== "string" ||
      !validCategoryId(category.id) ||
      typeof category.name !== "string" ||
      !category.name.trim() ||
      category.name.length > 80 ||
      categoryTextContainsExternalUrl(category.name) ||
      (category.parentId !== null &&
        (typeof category.parentId !== "string" ||
          !validCategoryId(category.parentId))) ||
      !Number.isSafeInteger(category.sortOrder) ||
      Number(category.sortOrder) < 0 ||
      Number(category.sortOrder) > 1_000_000 ||
      typeof category.active !== "boolean"
    ) {
      return null;
    }
    return cloneCategory(category as ManagedCategory);
  } catch {
    return null;
  }
}

function cloneCategory(category: ManagedCategory): ManagedCategory {
  const baseline = baselineCategories.find((entry) => entry.id === category.id);
  return {
    id: category.id,
    name: category.name,
    parentId: category.parentId,
    sortOrder: category.sortOrder,
    active: category.active,
    manager: category.manager ?? baseline?.manager ?? "",
    identityRequired:
      category.identityRequired ?? baseline?.identityRequired ?? false,
    adultOnly: category.adultOnly ?? baseline?.adultOnly ?? false,
    imageWidth: category.imageWidth ?? baseline?.imageWidth ?? 600,
    imageHeight: category.imageHeight ?? baseline?.imageHeight ?? 0,
    desktopColumns:
      category.desktopColumns ?? baseline?.desktopColumns ?? 3,
    desktopRows: category.desktopRows ?? baseline?.desktopRows ?? 5,
    mobileColumns:
      category.mobileColumns ?? baseline?.mobileColumns ?? 3,
    mobileRows: category.mobileRows ?? baseline?.mobileRows ?? 5,
    skinDirectory:
      category.skinDirectory ?? baseline?.skinDirectory ?? "basic",
    skin: category.skin ?? baseline?.skin ?? "list.10.skin.php",
    mobileSkinDirectory:
      category.mobileSkinDirectory ??
      baseline?.mobileSkinDirectory ??
      "basic",
    mobileSkin:
      category.mobileSkin ?? baseline?.mobileSkin ?? "list.10.skin.php",
  };
}

function isCategoryChangeType(value: string): value is CategoryChangeType {
  return value === "override" || value === "created" || value === "deleted";
}
