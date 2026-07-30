import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const source = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("CSV bulk registration is admin-only, two-step, bounded, and atomic", async () => {
  const [library, route, manager] = await Promise.all([
    source("lib/admin-product-bulk.ts"),
    source("app/api/admin/products/bulk/route.ts"),
    source("app/adm/(protected)/products/ProductBulkManager.tsx"),
  ]);

  assert.match(route, /requireAdminApiSession\(request\)/);
  assert.match(route, /assertSameOrigin\(request\)/);
  assert.match(route, /body\.mode === "dry-run"/);
  assert.match(route, /body\.mode === "commit"/);
  assert.match(library, /MAX_CSV_BYTES/);
  assert.match(library, /MAX_IMPORT_ROWS/);
  assert.match(library, /validateProductInput/);
  assert.match(library, /CSV 안에서 상품코드가 중복/);
  assert.match(library, /categoryCatalogGenerationId/);
  assert.match(library, /database\.batch\(statements\)/);
  assert.match(library, /constantTimeEqual/);
  assert.match(library, /escapeSpreadsheetValue/);
  assert.match(manager, /dry-run 검증/);
  assert.match(manager, /검증된 상품 등록/);

  const database = new DatabaseSync(":memory:");
  database.exec(`
    CREATE TABLE product_changes (
      product_id TEXT PRIMARY KEY,
      change_type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      revision INTEGER NOT NULL
    );
    CREATE TABLE product_stock (
      product_id TEXT PRIMARY KEY,
      stock INTEGER NOT NULL
    );
    INSERT INTO product_changes
      (product_id, change_type, payload_json, revision)
    VALUES ('duplicate', 'created', '{}', 1);
  `);
  database.exec("BEGIN IMMEDIATE");
  assert.throws(() => {
    try {
      bulkInsert(database, "first", 5);
      bulkInsert(database, "duplicate", 7);
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }, /constraint|not null/iu);
  assert.equal(
    database
      .prepare(
        "SELECT COUNT(*) AS count FROM product_changes WHERE product_id = 'first'",
      )
      .get().count,
    0,
  );
  assert.equal(
    database
      .prepare(
        "SELECT COUNT(*) AS count FROM product_stock WHERE product_id = 'first'",
      )
      .get().count,
    0,
  );
  database.close();
});

test("safe incomplete-order deletion restores stock atomically and rejects paid orders", async () => {
  const [library, route, manager] = await Promise.all([
    source("lib/admin-order-delete.ts"),
    source("app/api/admin/orders/[id]/route.ts"),
    source("app/adm/(protected)/reports/IncompleteOrdersManager.tsx"),
  ]);

  assert.match(route, /export async function DELETE/);
  assert.match(route, /assertSameOrigin\(request\)/);
  assert.match(route, /requireAdminApiSession\(request\)/);
  assert.match(library, /expectedUpdatedAt/);
  assert.match(library, /payment_status = 'pending'/);
  assert.match(library, /status = 'ordered'/);
  assert.match(library, /order_point_debits/);
  assert.match(library, /order_inventory_adjustments/);
  assert.match(library, /SET stock = stock \+ \?/);
  assert.match(library, /database\.batch\(statements\)/);
  assert.match(library, /order\.delete_incomplete/);
  assert.match(manager, /안전 삭제/);
  assert.match(manager, /confirmation: target\.id/);

  const safe = createOrderDatabase("pending", "ordered");
  deleteOrderTransaction(safe, "order-1");
  assert.equal(
    safe.prepare("SELECT stock FROM product_stock WHERE product_id = 'p1'").get()
      .stock,
    12,
  );
  assert.equal(
    safe.prepare("SELECT COUNT(*) AS count FROM orders").get().count,
    0,
  );
  safe.close();

  const paid = createOrderDatabase("paid", "payment_confirmed");
  assert.throws(
    () => deleteOrderTransaction(paid, "order-1"),
    /constraint|check/iu,
  );
  assert.equal(
    paid.prepare("SELECT stock FROM product_stock WHERE product_id = 'p1'").get()
      .stock,
    10,
  );
  assert.equal(
    paid.prepare("SELECT COUNT(*) AS count FROM orders").get().count,
    1,
  );
  paid.close();
});

test("legacy dashboard matches the original member, post, and point summary", async () => {
  const [dashboard, data, visits, tracker, visitRoute] = await Promise.all([
    source("app/adm/(protected)/page.tsx"),
    source("lib/admin-data.ts"),
    source("lib/site-visits.ts"),
    source("app/components/storefront/VisitorTracker.tsx"),
    source("app/api/visits/route.ts"),
  ]);

  for (const title of [
    "신규가입회원 5건 목록",
    "최근게시물",
    "최근 포인트 발생내역",
  ]) {
    assert.match(dashboard, new RegExp(title));
  }
  assert.match(dashboard, /getAdminDashboardData/);
  assert.match(dashboard, /getAdminMembersPage/);
  assert.match(dashboard, /getPointReport/);
  assert.match(dashboard, /listCommunityResource\("posts"/);
  assert.match(dashboard, /local_desc02 local_desc/);
  assert.match(dashboard, /tbl_head01 tbl_wrap/);
  assert.match(dashboard, /btn_list03 btn_list/);
  assert.match(data, /weeklySales/);
  assert.match(data, /paymentMethods/);
  assert.match(data, /recentMembers/);
  assert.match(data, /pendingCharges/);
  assert.match(data, /getSiteVisitWeek/);
  assert.match(visits, /visitor_hash/);
  assert.match(visits, /view_hash/);
  assert.match(visits, /site_visit_rate_limits/);
  assert.match(visits, /MAX_VISITS_PER_CLIENT_DAY/);
  assert.match(visits, /VISIT_RETENTION_DAYS/);
  assert.match(visits, /RETURNING attempts/);
  assert.doesNotMatch(visits, /user_agent|ip_address/iu);
  assert.match(tracker, /sessionStorage/);
  assert.match(visitRoute, /assertSameOrigin\(request\)/);
  assert.match(visitRoute, /cf-connecting-ip/);
  assert.doesNotMatch(visitRoute, /x-forwarded-for|user-agent/);
  assert.match(visitRoute, /"anonymous"/);
});

function bulkInsert(database, id, stock) {
  database
    .prepare(
      `INSERT INTO product_changes (
         product_id, change_type, payload_json, revision
       ) VALUES (?, 'created', '{}', 1)
       ON CONFLICT(product_id) DO UPDATE SET change_type = NULL`,
    )
    .run(id);
  database
    .prepare(
      `INSERT INTO product_stock (product_id, stock)
       VALUES (?, CASE WHEN changes() = 1 THEN ? ELSE NULL END)`,
    )
    .run(id, stock);
}

function createOrderDatabase(paymentStatus, status) {
  const database = new DatabaseSync(":memory:");
  database.exec(`
    CREATE TABLE orders (
      id TEXT PRIMARY KEY,
      payment_status TEXT NOT NULL,
      status TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE order_items (
      order_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      quantity INTEGER NOT NULL
    );
    CREATE TABLE product_stock (
      product_id TEXT PRIMARY KEY,
      stock INTEGER NOT NULL
    );
    CREATE TABLE admin_order_delete_guards (
      order_id TEXT PRIMARY KEY,
      guard_value INTEGER NOT NULL CHECK(guard_value = 1)
    );
    CREATE TABLE admin_audit_logs (
      id INTEGER PRIMARY KEY,
      action TEXT NOT NULL
    );
  `);
  database
    .prepare(
      "INSERT INTO orders (id, payment_status, status, updated_at) VALUES ('order-1', ?, ?, 'v1')",
    )
    .run(paymentStatus, status);
  database.exec(`
    INSERT INTO order_items (order_id, product_id, quantity)
    VALUES ('order-1', 'p1', 2);
    INSERT INTO product_stock (product_id, stock) VALUES ('p1', 10);
  `);
  return database;
}

function deleteOrderTransaction(database, id) {
  database.exec("BEGIN IMMEDIATE");
  try {
    database
      .prepare(
        `INSERT INTO admin_order_delete_guards (order_id, guard_value)
         VALUES (
           ?,
           CASE WHEN EXISTS (
             SELECT 1 FROM orders
             WHERE id = ? AND payment_status = 'pending' AND status = 'ordered'
           ) THEN 1 ELSE 0 END
         )`,
      )
      .run(id, id);
    database
      .prepare(
        `UPDATE product_stock
         SET stock = stock + (
           SELECT SUM(quantity) FROM order_items
           WHERE order_id = ? AND product_id = product_stock.product_id
         )
         WHERE product_id IN (
           SELECT product_id FROM order_items WHERE order_id = ?
         )`,
      )
      .run(id, id);
    database.prepare("DELETE FROM order_items WHERE order_id = ?").run(id);
    database.prepare("DELETE FROM orders WHERE id = ?").run(id);
    database
      .prepare(
        "INSERT INTO admin_audit_logs (action) VALUES ('order.delete_incomplete')",
      )
      .run();
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}
