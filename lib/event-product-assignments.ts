import { AdminApiError } from "@/lib/admin-api";
import {
  getEffectiveProducts,
  type ManagedCatalogProduct,
} from "@/lib/admin-products";
import { getEffectiveCategories } from "@/lib/categories";
import type { ManagedCategory } from "@/lib/category-contract";
import { commerceDb } from "@/lib/commerce-db";
import { isJsonObject } from "@/lib/http-boundary";
import {
  listAdminStoreEvents,
  updateStoreEvent,
  type StoreEvent,
} from "@/lib/store-events";

const PAGE_SIZE = 15;
const productIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u;
const schemaInitializations = new WeakMap<object, Promise<void>>();

export type EventProductSearchField = "name" | "id";
export type EventProductSort = "id" | "name";
export type EventProductSortDirection = "asc" | "desc";

export interface EventProductListFilters {
  eventId: string;
  categoryId: string;
  searchField: EventProductSearchField;
  query: string;
  sortBy: EventProductSort;
  sortDirection: EventProductSortDirection;
}

export interface EventProductListRow {
  id: string;
  categoryId: string;
  name: string;
  image: string;
  assigned: boolean;
}

export interface EventProductCategory {
  id: string;
  label: string;
}

export interface EventProductListResult {
  products: EventProductListRow[];
  categories: EventProductCategory[];
  filters: EventProductListFilters;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface EventProductListInput {
  eventId?: string;
  categoryId?: string;
  searchField?: string;
  query?: string;
  sortBy?: string;
  sortDirection?: string;
  page?: number;
}

interface AssignmentRow {
  product_id: string;
}

interface EventProductAssignmentInput {
  eventId: string;
  visibleProductIds: string[];
  selectedProductIds: string[];
}

export async function getAdminEventProductList(
  input: EventProductListInput = {},
): Promise<EventProductListResult> {
  const database = commerceDb();
  await ensureEventProductSchema(database);
  const [products, categories, events] = await Promise.all([
    getEffectiveProducts({ database, strict: true }),
    getEffectiveCategories({ database, strict: true }),
    listAdminStoreEvents(),
  ]);
  const eventId = normalizeEventId(input.eventId, events);
  const filters: EventProductListFilters = {
    eventId,
    categoryId: normalizedCategoryId(input.categoryId),
    searchField: input.searchField === "id" ? "id" : "name",
    query: normalizedQuery(input.query),
    sortBy: input.sortBy === "name" ? "name" : "id",
    sortDirection: input.sortDirection === "asc" ? "asc" : "desc",
  };
  const publicProducts = products.filter((product) => product.active);
  const filtered = publicProducts
    .filter((product) => matchesFilters(product, filters))
    .sort((left, right) => compareProducts(left, right, filters));
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const requestedPage =
    Number.isSafeInteger(input.page) && Number(input.page) > 0
      ? Number(input.page)
      : 1;
  const page = Math.min(requestedPage, totalPages);
  const pageProducts = filtered.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE,
  );
  const assignedIds = await readAssignedProductIds(database, eventId);
  return {
    products: pageProducts.map((product) => ({
      id: product.id,
      categoryId: product.categoryId,
      name: product.name,
      image: product.images[0] ?? "",
      assigned: assignedIds.has(product.id),
    })),
    categories: categoryOptions(categories),
    filters,
    page,
    pageSize: PAGE_SIZE,
    total,
    totalPages,
  };
}

export async function saveAdminEventProductAssignments(
  input: unknown,
  adminUsername: string,
): Promise<{ eventId: string; assignedCount: number }> {
  const parsed = parseAssignmentInput(input);
  const database = commerceDb();
  await ensureEventProductSchema(database);
  const [events, products] = await Promise.all([
    listAdminStoreEvents(),
    getEffectiveProducts({ database, strict: true }),
  ]);
  const event = events.find((candidate) => candidate.id === parsed.eventId);
  if (!event) {
    throw new AdminApiError(404, "선택한 이벤트를 찾을 수 없습니다.");
  }
  const publicProductIds = new Set(
    products.filter((product) => product.active).map((product) => product.id),
  );
  if (
    parsed.visibleProductIds.some((productId) => !publicProductIds.has(productId))
  ) {
    throw new AdminApiError(
      409,
      "현재 공개 상품 목록이 변경되었습니다. 목록을 새로 불러와 주세요.",
    );
  }
  const visible = new Set(parsed.visibleProductIds);
  if (parsed.selectedProductIds.some((productId) => !visible.has(productId))) {
    throw new AdminApiError(
      400,
      "현재 페이지에 없는 상품은 이벤트 선택값으로 저장할 수 없습니다.",
    );
  }

  const statements: D1PreparedStatement[] = [];
  for (const productId of parsed.visibleProductIds) {
    statements.push(
      database
        .prepare(
          "DELETE FROM store_event_products WHERE event_id = ? AND product_id = ?",
        )
        .bind(parsed.eventId, productId),
    );
  }
  for (const productId of parsed.selectedProductIds) {
    statements.push(
      database
        .prepare(
          `INSERT INTO store_event_products (
             event_id, product_id, updated_by, created_at, updated_at
           ) VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
           ON CONFLICT(event_id, product_id) DO UPDATE SET
             updated_by = excluded.updated_by,
             updated_at = CURRENT_TIMESTAMP`,
        )
        .bind(parsed.eventId, productId, adminUsername),
    );
  }
  statements.push(
    database
      .prepare(
        `INSERT INTO admin_audit_logs (
           action, entity_type, entity_id, details
         ) VALUES ('event.products.update', 'store_event', ?, ?)`,
      )
      .bind(
        parsed.eventId,
        JSON.stringify({
          visibleProductIds: parsed.visibleProductIds,
          selectedProductIds: parsed.selectedProductIds,
        }),
      ),
  );
  await database.batch(statements);
  const countRow = await database
    .prepare(
      "SELECT COUNT(*) AS count FROM store_event_products WHERE event_id = ?",
    )
    .bind(parsed.eventId)
    .first<{ count: number }>();
  const assignedCount = Math.max(0, Number(countRow?.count) || 0);
  await updateStoreEvent(
    event.id,
    {
      title: event.title,
      content: event.content,
      href: event.href,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      active: event.active,
      linkedProductCount: assignedCount,
    },
    adminUsername,
  );
  return { eventId: event.id, assignedCount };
}

function parseAssignmentInput(input: unknown): EventProductAssignmentInput {
  if (!isJsonObject(input)) {
    throw new AdminApiError(400, "이벤트 상품 입력 형식을 확인해 주세요.");
  }
  const eventId = normalizedIdentifier(input.eventId, 128);
  const visibleProductIds = normalizedProductIds(input.visibleProductIds);
  const selectedProductIds = normalizedProductIds(input.selectedProductIds);
  if (!eventId) {
    throw new AdminApiError(400, "이벤트를 선택하세요.");
  }
  if (visibleProductIds.length > PAGE_SIZE) {
    throw new AdminApiError(
      400,
      `한 번에 ${PAGE_SIZE.toLocaleString("ko-KR")}개 상품까지 저장할 수 있습니다.`,
    );
  }
  return { eventId, visibleProductIds, selectedProductIds };
}

function normalizedProductIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new AdminApiError(400, "상품 선택값을 확인해 주세요.");
  }
  const ids = value.map((candidate) =>
    typeof candidate === "string" ? candidate.trim() : "",
  );
  if (ids.some((id) => !productIdPattern.test(id))) {
    throw new AdminApiError(400, "상품코드 형식을 확인해 주세요.");
  }
  return [...new Set(ids)];
}

function matchesFilters(
  product: ManagedCatalogProduct,
  filters: EventProductListFilters,
): boolean {
  if (
    filters.categoryId &&
    !product.categoryId.startsWith(filters.categoryId)
  ) {
    return false;
  }
  if (!filters.query) return true;
  const haystack =
    filters.searchField === "id" ? product.id : product.name;
  return haystack.toLocaleLowerCase("ko-KR").includes(
    filters.query.toLocaleLowerCase("ko-KR"),
  );
}

function compareProducts(
  left: ManagedCatalogProduct,
  right: ManagedCatalogProduct,
  filters: EventProductListFilters,
): number {
  const leftValue = filters.sortBy === "name" ? left.name : left.id;
  const rightValue = filters.sortBy === "name" ? right.name : right.id;
  const compared = leftValue.localeCompare(rightValue, "ko-KR", {
    numeric: true,
    sensitivity: "base",
  });
  return filters.sortDirection === "asc" ? compared : -compared;
}

function categoryOptions(
  categories: readonly ManagedCategory[],
): EventProductCategory[] {
  const active = categories.filter((category) => category.active);
  const byId = new Map(active.map((category) => [category.id, category]));
  return active.map((category) => ({
    id: category.id,
    label: categoryPath(category, byId),
  }));
}

function categoryPath(
  category: ManagedCategory,
  byId: ReadonlyMap<string, ManagedCategory>,
): string {
  const labels = [category.name];
  const visited = new Set([category.id]);
  let parentId = category.parentId;
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId);
    const parent = byId.get(parentId);
    if (!parent) break;
    labels.unshift(parent.name);
    parentId = parent.parentId;
  }
  return labels.join(" > ");
}

async function readAssignedProductIds(
  database: D1Database,
  eventId: string,
): Promise<Set<string>> {
  if (!eventId) return new Set();
  const result = await database
    .prepare(
      "SELECT product_id FROM store_event_products WHERE event_id = ? ORDER BY product_id",
    )
    .bind(eventId)
    .all<AssignmentRow>();
  return new Set((result.results ?? []).map((row) => row.product_id));
}

async function ensureEventProductSchema(database: D1Database): Promise<void> {
  const cacheKey = database as unknown as object;
  let initialization = schemaInitializations.get(cacheKey);
  if (!initialization) {
    initialization = database
      .batch([
        database.prepare(`CREATE TABLE IF NOT EXISTS store_event_products (
          event_id TEXT NOT NULL,
          product_id TEXT NOT NULL,
          updated_by TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY(event_id, product_id)
        )`),
        database.prepare(
          "CREATE INDEX IF NOT EXISTS store_event_products_product_idx ON store_event_products(product_id)",
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

function normalizeEventId(
  value: string | undefined,
  events: readonly StoreEvent[],
): string {
  const requested = normalizedIdentifier(value, 128);
  return events.some((event) => event.id === requested) ? requested : "";
}

function normalizedIdentifier(value: unknown, maximumLength: number): string {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  return normalized.length <= maximumLength &&
    /^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(normalized)
    ? normalized
    : "";
}

function normalizedCategoryId(value: string | undefined): string {
  const normalized = normalizedIdentifier(value, 40);
  return normalized;
}

function normalizedQuery(value: string | undefined): string {
  return typeof value === "string"
    ? value
        .replace(
          /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu,
          "",
        )
        .trim()
        .slice(0, 200)
    : "";
}
