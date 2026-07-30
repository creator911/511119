import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const source = async (path) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

const catalog = JSON.parse(
  await source("data/catalog.json"),
);

test("keeps the 31-category baseline internally linked and two levels deep", () => {
  assert.equal(catalog.categories.length, 31);
  const categoryById = new Map(
    catalog.categories.map((category) => [category.id, category]),
  );
  assert.equal(categoryById.size, catalog.categories.length);

  for (const category of catalog.categories) {
    assert.match(category.id, /^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/u);
    assert.ok(category.name.trim());
    assert.doesNotMatch(category.name, /https?:\/\/|www\./iu);
    if (category.parentId) {
      const parent = categoryById.get(category.parentId);
      assert.ok(parent, `missing parent for category ${category.id}`);
      assert.equal(
        parent.parentId,
        null,
        `category ${category.id} exceeds the two-level storefront tree`,
      );
    }
  }

  const product = catalog.products.find(
    (entry) => entry.categoryId === "2030",
  );
  assert.ok(product);
  const leaf = categoryById.get(product.categoryId);
  const root = categoryById.get(leaf.parentId);
  assert.equal(root.id, "20");
  assert.equal(root.name, "골드바");
});

test("includes authenticated category management and public integration surfaces", async () => {
  const files = [
    "app/adm/(protected)/categories/page.tsx",
    "app/adm/(protected)/categories/CategoriesManager.tsx",
    "app/adm/(protected)/categories/categories-manager.module.css",
    "app/api/admin/categories/route.ts",
    "app/api/admin/categories/[id]/route.ts",
    "app/components/SiteFrame.tsx",
    "app/shop/list.php/page.tsx",
    "app/shop/item.php/page.tsx",
    "app/shop/search.php/page.tsx",
    "lib/category-contract.ts",
    "lib/categories.ts",
    "lib/admin-categories.ts",
  ];
  await Promise.all(
    files.map((file) => access(new URL(`../${file}`, import.meta.url))),
  );

  const sources = await Promise.all(files.map(source));
  for (const contents of sources) {
    assert.doesNotMatch(contents, /kiel-gold\.com/iu);
    assert.doesNotMatch(contents, /(?:https?:)?\/\/(?:www\.)?kiel-/iu);
  }
});

test("protects category writes and enforces validation, graph, and delete guards", async () => {
  const [collectionRoute, itemRoute, service, categories] = await Promise.all([
    source("app/api/admin/categories/route.ts"),
    source("app/api/admin/categories/[id]/route.ts"),
    source("lib/admin-categories.ts"),
    source("lib/categories.ts"),
  ]);

  assert.match(collectionRoute, /requireAdminApiSession\(request\)/);
  assert.match(collectionRoute, /assertSameOrigin\(request\)/);
  assert.match(collectionRoute, /readAdminJson\(request,\s*32_768\)/);
  assert.match(itemRoute, /requireAdminApiSession\(request\)/);
  assert.match(itemRoute, /assertSameOrigin\(request\)/);
  assert.match(itemRoute, /readAdminJson\(request,\s*32_768\)/);
  assert.match(itemRoute, /export const PUT = PATCH/);

  assert.match(service, /getEffectiveProducts/);
  assert.match(service, /productCount > 0/);
  assert.match(service, /category\.parentId === id/);
  assert.match(service, /validateCategoryGraph/);
  assert.match(service, /visited\.has\(parentId\)/);
  assert.match(service, /depth > 4/);
  assert.match(service, /categoryTextContainsExternalUrl/);
  assert.match(service, /database\.batch/);
  assert.match(service, /admin_audit_logs/);
  assert.match(categories, /strict/);
  assert.match(categories, /mergeCategoryChanges/);
  assert.match(categories, /getPublicCategorySnapshot/);
  assert.match(categories, /buildStorefrontCategoryNavigation/);
});

test("uses effective categories for storefront navigation, listing, search, detail, and product editing", async () => {
  const [
    frame,
    listPage,
    searchPage,
    itemPage,
    catalogSource,
    productService,
    productList,
    productNew,
    productEdit,
  ] = await Promise.all([
    source("app/components/SiteFrame.tsx"),
    source("app/shop/list.php/page.tsx"),
    source("app/shop/search.php/page.tsx"),
    source("app/shop/item.php/page.tsx"),
    source("lib/catalog.tsx"),
    source("lib/admin-products.ts"),
    source("app/adm/(protected)/products/page.tsx"),
    source("app/adm/(protected)/products/new/page.tsx"),
    source("app/adm/(protected)/products/[id]/page.tsx"),
  ]);

  assert.match(frame, /buildStorefrontCategoryNavigation\(publicCategories\)/);
  assert.match(frame, /getPublicCategories\(\)/);
  assert.match(listPage, /getPublicCategories\(\)/);
  assert.match(listPage, /findCategory\(categorySnapshot,\s*categoryId\)/);
  assert.match(listPage, /getSubcategoriesFromSnapshot/);
  assert.match(searchPage, /summarizeCategories\(baseMatches,\s*categorySnapshot\)/);
  assert.match(searchPage, /categories=\{categorySnapshot\}/);
  assert.match(itemPage, /getEffectiveCategories\(\)/);
  assert.match(
    itemPage,
    /toProductDetail\(product,\s*categorySnapshot(?:,\s*productOptions)?\)/,
  );
  assert.match(
    catalogSource,
    /categoryPath\[categoryPath\.length - 1\]\s*\?\?\s*findCategory/,
  );
  assert.match(catalogSource, /encodeURIComponent\(category\.id\)/);
  assert.match(productService, /getEffectiveCategoryRecords/);
  assert.match(productService, /getCategoryCatalogGeneration/);
  assert.match(productService, /categoryCatalogGenerationId/);
  assert.match(productService, /allowedCategoryIds/);
  assert.match(productList, /getEffectiveCategories/);
  assert.match(productNew, /getEffectiveCategories/);
  assert.match(productEdit, /getEffectiveCategories/);
});

test("migration stores category overrides, revisions, and delete tombstones", async () => {
  const [schema, migration] = await Promise.all([
    source("db/schema.ts"),
    source("drizzle/0004_wealthy_wonder_man.sql"),
  ]);
  assert.match(schema, /export const categoryChanges = sqliteTable/);
  assert.match(migration, /CREATE TABLE `category_changes`/);
  assert.match(migration, /CREATE INDEX `category_changes_type_idx`/);
  assert.match(migration, /CREATE INDEX `category_changes_updated_idx`/);

  const database = new DatabaseSync(":memory:");
  for (const statement of migration.split("--> statement-breakpoint")) {
    if (statement.trim()) database.exec(statement);
  }
  const category = {
    id: "NEW_01",
    name: "새 분류",
    parentId: null,
    sortOrder: 100,
    active: true,
  };
  const upsert = database.prepare(`
    INSERT INTO category_changes (
      category_id, change_type, payload_json, revision, updated_by
    ) VALUES (?, ?, ?, 1, ?)
    ON CONFLICT(category_id) DO UPDATE SET
      change_type = excluded.change_type,
      payload_json = excluded.payload_json,
      revision = category_changes.revision + 1,
      updated_by = excluded.updated_by,
      updated_at = CURRENT_TIMESTAMP
  `);
  upsert.run(category.id, "created", JSON.stringify(category), "admin");
  upsert.run(category.id, "deleted", JSON.stringify(category), "admin");
  const stored = database
    .prepare(
      "SELECT change_type, revision, payload_json FROM category_changes WHERE category_id = ?",
    )
    .get(category.id);
  assert.equal(stored.change_type, "deleted");
  assert.equal(stored.revision, 2);
  assert.deepEqual(JSON.parse(stored.payload_json), category);
  database.close();
});
