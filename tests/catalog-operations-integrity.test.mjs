import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const root = new URL("../", import.meta.url);
const source = async (path) =>
  readFile(new URL(path, root), "utf8");

test("product types, option stock, and restock SMS use dedicated operating surfaces", async () => {
  const [
    toolPage,
    managers,
    typeRoute,
    optionRoute,
    restockAdminRoute,
    restockPublicRoute,
    optionService,
    restockService,
  ] = await Promise.all([
    source("app/adm/(protected)/tools/[tool]/page.tsx"),
    source(
      "app/adm/(protected)/tools/[tool]/CatalogOperationManagers.tsx",
    ),
    source("app/api/admin/products/types/route.ts"),
    source("app/api/admin/products/options/route.ts"),
    source("app/api/admin/products/restock/route.ts"),
    source("app/api/products/[id]/restock/route.ts"),
    source("lib/product-options.ts"),
    source("lib/restock-notifications.ts"),
  ]);

  assert.match(toolPage, /tool === "product-types"/);
  assert.match(toolPage, /tool === "product-option-stock"/);
  assert.match(toolPage, /tool === "restock-sms"/);
  assert.match(managers, /ProductTypeManager/);
  assert.match(managers, /ProductOptionStockManager/);
  assert.match(managers, /RestockSmsManager/);
  for (const route of [typeRoute, optionRoute, restockAdminRoute]) {
    assert.match(route, /requireAdminApiSession\(request\)/);
    assert.match(route, /assertSameOrigin\(request\)/);
    assert.match(route, /readAdminJson\(request,/);
  }
  assert.match(restockPublicRoute, /readBoundedJson<unknown>/);
  assert.match(restockPublicRoute, /isSameOrigin\(request\)/);
  assert.match(optionService, /product_option_write_guards/);
  assert.match(optionService, /expectedSetRevision/);
  assert.match(restockService, /restock_request_rate_limits/);
  assert.match(restockService, /waiting_provider/);
  assert.match(restockService, /restock_sms_queue/);
});

test("storefront option selection reaches server-authoritative order pricing and inventory", async () => {
  const [detail, commerce, orderRoute, safety, operations, schema] =
    await Promise.all([
      source("app/components/storefront/ProductDetail.tsx"),
      source("app/components/CommerceClients.tsx"),
      source("app/api/orders/route.ts"),
      source("lib/order-safety.ts"),
      source("lib/admin-operations.ts"),
      source("db/schema.ts"),
    ]);

  assert.match(detail, /optionsComplete/);
  assert.match(detail, /selectedOptions/);
  assert.match(commerce, /optionIds/);
  assert.match(commerce, /lineKey/);
  assert.match(orderRoute, /product\.price\s*\+\s*validOptions\.reduce/);
  assert.match(orderRoute, /UPDATE product_options/);
  assert.match(orderRoute, /order_option_guards/);
  assert.match(orderRoute, /INSERT INTO order_option_items/);
  assert.match(safety, /option_stock_restore/);
  assert.match(operations, /option_stock_restore/);
  assert.match(schema, /export const productOptions/);
  assert.match(schema, /export const orderOptionItems/);
});

test("stale option inventory rolls an entire multi-option order reservation back", () => {
  const database = new DatabaseSync(":memory:");
  database.exec(`
    CREATE TABLE product_options (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      stock INTEGER NOT NULL CHECK(stock >= 0),
      revision INTEGER NOT NULL,
      sale_enabled INTEGER NOT NULL,
      sold_out INTEGER NOT NULL,
      deleted INTEGER NOT NULL
    );
    CREATE TABLE order_option_guards (
      order_id TEXT NOT NULL,
      option_id TEXT NOT NULL,
      guard_value INTEGER NOT NULL CHECK(guard_value = 1),
      PRIMARY KEY(order_id, option_id)
    );
    INSERT INTO product_options
      (id, product_id, stock, revision, sale_enabled, sold_out, deleted)
    VALUES
      ('size-large', 'P1', 4, 1, 1, 0, 0),
      ('color-gold', 'P1', 1, 2, 1, 0, 0);
  `);

  assert.throws(() => {
    database.exec("BEGIN");
    try {
      const reserve = (id, expectedRevision, expectedStock, quantity) => {
        database
          .prepare(
            `UPDATE product_options
             SET stock = stock - ?, revision = revision + 1
             WHERE id = ?
               AND revision = ?
               AND stock = ?
               AND stock >= ?
               AND sale_enabled = 1
               AND sold_out = 0
               AND deleted = 0`,
          )
          .run(
            quantity,
            id,
            expectedRevision,
            expectedStock,
            quantity,
          );
        database
          .prepare(
            `INSERT INTO order_option_guards
               (order_id, option_id, guard_value)
             VALUES (
               'ORDER-1', ?,
               CASE WHEN changes() = 1 THEN 1 ELSE 0 END
             )`,
          )
          .run(id);
      };
      reserve("size-large", 1, 4, 1);
      reserve("color-gold", 1, 2, 1);
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }, /constraint/i);

  assert.deepEqual(
    database
      .prepare(
        "SELECT id, stock, revision FROM product_options ORDER BY id",
      )
      .all()
      .map((row) => ({ ...row })),
    [
      { id: "color-gold", stock: 1, revision: 2 },
      { id: "size-large", stock: 4, revision: 1 },
    ],
  );
});

test("stale product type bulk writes roll every product back", () => {
  const database = new DatabaseSync(":memory:");
  database.exec(`
    CREATE TABLE product_changes (
      product_id TEXT PRIMARY KEY,
      change_type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      revision INTEGER NOT NULL
    );
    CREATE TABLE product_type_write_guards (
      operation_id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      guard_value INTEGER NOT NULL CHECK(guard_value = 1)
    );
    INSERT INTO product_changes
      (product_id, change_type, payload_json, revision)
    VALUES ('P2', 'override', '{}', 2);
  `);

  assert.throws(() => {
    database.exec("BEGIN");
    try {
      database
        .prepare(
          `INSERT INTO product_changes
             (product_id, change_type, payload_json, revision)
           SELECT 'P1', 'override', '{"hit":true}', 1
           WHERE NOT EXISTS (
             SELECT 1 FROM product_changes WHERE product_id = 'P1'
           )`,
        )
        .run();
      database
        .prepare(
          `INSERT INTO product_type_write_guards
             (operation_id, product_id, guard_value)
           VALUES ('one', 'P1', CASE WHEN changes() = 1 THEN 1 ELSE 0 END)`,
        )
        .run();
      database
        .prepare(
          `UPDATE product_changes
           SET payload_json = '{"sale":true}', revision = revision + 1
           WHERE product_id = 'P2' AND revision = 1`,
        )
        .run();
      database
        .prepare(
          `INSERT INTO product_type_write_guards
             (operation_id, product_id, guard_value)
           VALUES ('two', 'P2', CASE WHEN changes() = 1 THEN 1 ELSE 0 END)`,
        )
        .run();
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }, /constraint/i);

  assert.equal(
    database
      .prepare("SELECT COUNT(*) AS count FROM product_changes WHERE product_id = 'P1'")
      .get().count,
    0,
  );
  assert.deepEqual(
    {
      ...database
      .prepare(
        "SELECT payload_json, revision FROM product_changes WHERE product_id = 'P2'",
      )
      .get(),
    },
    { payload_json: "{}", revision: 2 },
  );
});

test("restock requests persist a real waiting queue and deduplicate active subscriptions", () => {
  const database = new DatabaseSync(":memory:");
  database.exec(`
    CREATE TABLE restock_requests (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      phone_hash TEXT NOT NULL,
      status TEXT NOT NULL
    );
    CREATE UNIQUE INDEX restock_requests_active_uq
      ON restock_requests(product_id, phone_hash)
      WHERE status IN ('waiting_provider', 'queued');
    CREATE TABLE restock_sms_queue (
      id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL
    );
  `);
  const insertRequest = database.prepare(
    `INSERT INTO restock_requests
       (id, product_id, phone_hash, status)
     VALUES (?, 'P1', 'PHONE-HASH', 'waiting_provider')`,
  );
  database.exec("BEGIN");
  insertRequest.run("R1");
  database
    .prepare(
      `INSERT INTO restock_sms_queue
         (id, request_id, status)
       VALUES ('Q1', 'R1', 'waiting_provider')`,
    )
    .run();
  database.exec("COMMIT");
  assert.throws(() => insertRequest.run("R2"), /unique/i);

  database
    .prepare("UPDATE restock_requests SET status = 'sent' WHERE id = 'R1'")
    .run();
  insertRequest.run("R2");
  assert.deepEqual(
    database
      .prepare(
        "SELECT id, status FROM restock_requests ORDER BY id",
      )
      .all()
      .map((row) => ({ ...row })),
    [
      { id: "R1", status: "sent" },
      { id: "R2", status: "waiting_provider" },
    ],
  );
});
