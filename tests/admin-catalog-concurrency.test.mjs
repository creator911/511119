import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

test("category generation CAS serializes graph edits and reference deletes", () => {
  const database = createCatalogDatabase();

  writeCategory({
    id: "A",
    changeType: "override",
    payload: { id: "A", parentId: "B" },
    expectedRevision: 0,
    expectedGeneration: 1,
  });
  assert.equal(readGeneration(), 2);
  assert.throws(
    () =>
      writeCategory({
        id: "B",
        changeType: "override",
        payload: { id: "B", parentId: "C" },
        expectedRevision: 0,
        expectedGeneration: 1,
      }),
    /constraint|not null/iu,
  );
  assert.equal(readGeneration(), 2);
  assert.equal(readCategory("B"), undefined);

  database
    .prepare(
      `INSERT INTO product_changes (
         product_id, change_type, payload_json, revision
       ) VALUES (?, 'created', ?, 1)`,
    )
    .run("product-1", JSON.stringify({ categoryId: "ROOT" }));
  assert.throws(
    () =>
      writeCategory({
        id: "ROOT",
        changeType: "deleted",
        payload: { id: "ROOT", parentId: null },
        expectedRevision: 0,
        expectedGeneration: 2,
        requireUnreferenced: true,
      }),
    /constraint|not null/iu,
  );
  assert.equal(readCategory("ROOT"), undefined);
  assert.equal(readGeneration(), 2);
  database.close();

  function writeCategory({
    id,
    changeType,
    payload,
    expectedRevision,
    expectedGeneration,
    requireUnreferenced = false,
  }) {
    const referenceGuard = requireUnreferenced
      ? `AND NOT EXISTS (
           SELECT 1 FROM category_changes child
           WHERE child.change_type <> 'deleted'
             AND json_extract(child.payload_json, '$.parentId') = ?
         )
         AND NOT EXISTS (
           SELECT 1 FROM product_changes product
           WHERE product.change_type <> 'deleted'
             AND json_extract(product.payload_json, '$.categoryId') = ?
         )`
      : "";
    database.exec("BEGIN IMMEDIATE");
    try {
      if (expectedRevision === 0) {
        database
          .prepare(
            `INSERT INTO category_changes (
               category_id, change_type, payload_json, revision
             )
             SELECT ?, ?, ?, 1
             WHERE 1 = 1 ${referenceGuard}
             ON CONFLICT(category_id) DO UPDATE SET
               change_type = NULL`,
          )
          .run(
            id,
            changeType,
            JSON.stringify(payload),
            ...(requireUnreferenced ? [id, id] : []),
          );
      } else {
        database
          .prepare(
            `UPDATE category_changes
             SET change_type = ?, payload_json = ?, revision = revision + 1
             WHERE category_id = ? AND revision = ?
               AND change_type <> 'deleted' ${referenceGuard}`,
          )
          .run(
            changeType,
            JSON.stringify(payload),
            id,
            expectedRevision,
            ...(requireUnreferenced ? [id, id] : []),
          );
      }
      database
        .prepare(
          `UPDATE category_changes
           SET revision = revision + 1
           WHERE category_id = '__catalog_generation__'
             AND revision = ? AND changes() = 1`,
        )
        .run(expectedGeneration);
      database
        .prepare(
          `INSERT INTO admin_audit_logs (details)
           VALUES (CASE WHEN changes() = 1 THEN 'ok' ELSE NULL END)`,
        )
        .run();
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }

  function readGeneration() {
    return database
      .prepare(
        `SELECT revision FROM category_changes
         WHERE category_id = '__catalog_generation__'`,
      )
      .get().revision;
  }

  function readCategory(id) {
    return database
      .prepare(
        "SELECT change_type, payload_json, revision FROM category_changes WHERE category_id = ?",
      )
      .get(id);
  }
});

test("product and category guards reject both delete-create race orderings", () => {
  const deleteFirst = createCatalogDatabase();
  seedManagedCategory(deleteFirst);
  deleteFirst.exec(`
    UPDATE category_changes
    SET change_type = 'deleted', revision = 2
    WHERE category_id = 'managed';
    UPDATE category_changes
    SET revision = 2
    WHERE category_id = '__catalog_generation__';
  `);
  assert.throws(
    () => guardedProductCreate(deleteFirst, 1, 1),
    /constraint|not null/iu,
  );
  assert.equal(
    deleteFirst
      .prepare(
        "SELECT COUNT(*) AS count FROM product_changes WHERE product_id = 'new-product'",
      )
      .get().count,
    0,
  );
  deleteFirst.close();

  const productFirst = createCatalogDatabase();
  seedManagedCategory(productFirst);
  guardedProductCreate(productFirst, 1, 1);
  productFirst.exec("BEGIN IMMEDIATE");
  assert.throws(() => {
    try {
      productFirst
        .prepare(
          `UPDATE category_changes
           SET change_type = 'deleted', revision = revision + 1
           WHERE category_id = 'managed'
             AND NOT EXISTS (
               SELECT 1 FROM product_changes product
               WHERE product.change_type <> 'deleted'
                 AND json_extract(product.payload_json, '$.categoryId') = 'managed'
             )`,
        )
        .run();
      productFirst
        .prepare(
          `UPDATE category_changes
           SET revision = revision + 1
           WHERE category_id = '__catalog_generation__'
             AND revision = 1 AND changes() = 1`,
        )
        .run();
      productFirst
        .prepare(
          `INSERT INTO admin_audit_logs (details)
           VALUES (CASE WHEN changes() = 1 THEN 'ok' ELSE NULL END)`,
        )
        .run();
      productFirst.exec("COMMIT");
    } catch (error) {
      productFirst.exec("ROLLBACK");
      throw error;
    }
  }, /constraint|not null/iu);
  assert.equal(
    productFirst
      .prepare(
        "SELECT change_type FROM category_changes WHERE category_id = 'managed'",
      )
      .get().change_type,
    "created",
  );
  productFirst.close();
});

test("banner create and revision CAS prevent duplicate and stale resurrection", () => {
  const database = new DatabaseSync(":memory:");
  database.exec(`
    CREATE TABLE banner_changes (
      banner_id TEXT PRIMARY KEY,
      change_type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 1
    );
  `);
  const create = database.prepare(`
    INSERT INTO banner_changes (
      banner_id, change_type, payload_json, revision
    ) VALUES (?, 'created', ?, 1)
    ON CONFLICT(banner_id) DO UPDATE SET change_type = NULL
  `);
  create.run("banner-1", '{"image":"first"}');
  assert.throws(
    () => create.run("banner-1", '{"image":"second"}'),
    /constraint|not null/iu,
  );
  assert.equal(
    database
      .prepare(
        "SELECT payload_json FROM banner_changes WHERE banner_id = 'banner-1'",
      )
      .get().payload_json,
    '{"image":"first"}',
  );

  const cas = database.prepare(`
    UPDATE banner_changes
    SET change_type = ?, payload_json = ?, revision = revision + 1
    WHERE banner_id = ? AND revision = ? AND change_type <> 'deleted'
  `);
  assert.equal(
    cas.run("deleted", '{"image":"first"}', "banner-1", 1).changes,
    1,
  );
  assert.equal(
    cas.run("created", '{"image":"stale"}', "banner-1", 1).changes,
    0,
  );
  const row = database
    .prepare(
      "SELECT change_type, payload_json, revision FROM banner_changes WHERE banner_id = 'banner-1'",
    )
    .get();
  assert.equal(row.change_type, "deleted");
  assert.equal(row.payload_json, '{"image":"first"}');
  assert.equal(row.revision, 2);
  database.close();
});

test("source wires category generation, product guards, and banner revisions", async () => {
  const [categories, products, banners, categoryManager, bannerManager] =
    await Promise.all([
      source("lib/admin-categories.ts"),
      source("lib/admin-products.ts"),
      source("lib/admin-banners.ts"),
      source("app/adm/(protected)/categories/CategoriesManager.tsx"),
      source("app/adm/(protected)/banners/BannerManager.tsx"),
    ]);
  assert.match(categories, /expectedGeneration/);
  assert.match(categories, /categoryCatalogGenerationId/);
  assert.match(categories, /AND changes\(\) = 1/);
  assert.match(products, /categoryCondition/);
  assert.match(products, /categoryCatalogGenerationId/);
  assert.match(products, /RETURNING product_id/);
  assert.match(banners, /expectedRevision/);
  assert.match(banners, /RETURNING banner_id/);
  assert.match(categoryManager, /expectedRevision/);
  assert.match(bannerManager, /expectedRevision/);
});

function createCatalogDatabase() {
  const database = new DatabaseSync(":memory:");
  database.exec(`
    CREATE TABLE category_changes (
      category_id TEXT PRIMARY KEY,
      change_type TEXT NOT NULL,
      payload_json TEXT NOT NULL DEFAULT '{}',
      revision INTEGER NOT NULL DEFAULT 1,
      updated_by TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE product_changes (
      product_id TEXT PRIMARY KEY,
      change_type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE product_stock (
      product_id TEXT PRIMARY KEY,
      stock INTEGER NOT NULL
    );
    CREATE TABLE admin_audit_logs (
      id INTEGER PRIMARY KEY,
      details TEXT NOT NULL
    );
    INSERT INTO category_changes (
      category_id, change_type, payload_json, revision
    ) VALUES ('__catalog_generation__', 'override', '{}', 1);
  `);
  return database;
}

function seedManagedCategory(database) {
  database
    .prepare(
      `INSERT INTO category_changes (
         category_id, change_type, payload_json, revision
       ) VALUES ('managed', 'created', ?, 1)`,
    )
    .run(JSON.stringify({ id: "managed", parentId: null }));
}

function guardedProductCreate(database, categoryRevision, generation) {
  database.exec("BEGIN IMMEDIATE");
  try {
    database
      .prepare(
        `INSERT INTO product_changes (
           product_id, change_type, payload_json, revision
         )
         SELECT 'new-product', 'created', ?, 1
         WHERE EXISTS (
           SELECT 1 FROM category_changes generation
           WHERE generation.category_id = '__catalog_generation__'
             AND generation.revision = ?
         )
           AND EXISTS (
             SELECT 1 FROM category_changes category
             WHERE category.category_id = 'managed'
               AND category.revision = ?
               AND category.change_type <> 'deleted'
           )`,
      )
      .run(JSON.stringify({ categoryId: "managed" }), generation, categoryRevision);
    database
      .prepare(
        `INSERT INTO product_stock (product_id, stock)
         VALUES (
           'new-product',
           CASE WHEN changes() = 1 THEN 10 ELSE NULL END
         )`,
      )
      .run();
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

const source = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");
