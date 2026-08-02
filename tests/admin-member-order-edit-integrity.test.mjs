import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const read = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("member management exposes an authenticated product-change workflow", async () => {
  const [route, service, manager, styles] = await Promise.all([
    read("app/api/admin/users/[id]/orders/route.ts"),
    read("lib/admin-member-orders.ts"),
    read("app/adm/(protected)/users/UsersManager.tsx"),
    read("app/adm/legacy-admin.css"),
  ]);

  assert.match(route, /export async function GET/);
  assert.match(route, /export async function PUT/);
  assert.equal((route.match(/requireAdminApiSession\(request\)/gu) ?? []).length, 2);
  assert.equal((route.match(/assertSameOrigin\(request\)/gu) ?? []).length, 1);
  assert.match(route, /readAdminJson\(request, 12_288\)/);

  assert.match(service, /CREATE TABLE IF NOT EXISTS admin_member_order_write_guards/);
  assert.match(service, /order_guard INTEGER NOT NULL CHECK\(order_guard = 1\)/);
  assert.match(service, /item_guard INTEGER NOT NULL CHECK\(item_guard = 1\)/);
  assert.match(service, /balance_guard INTEGER NOT NULL CHECK\(balance_guard = 1\)/);
  assert.match(service, /stock_guard INTEGER NOT NULL CHECK\(stock_guard = 1\)/);
  assert.match(service, /WHERE id = \? AND user_id = \? AND updated_at = \?/);
  assert.match(service, /SET id = \?, subtotal = \?, discount = \?, total = \?/);
  assert.match(service, /function orderIdForPurchaseDate/);
  assert.match(service, /\^\(\.\*KG\)\\d\{14\}/);
  assert.match(service, /date\.getTime\(\) \+ 9 \* 60 \* 60 \* 1_000/);
  assert.match(service, /UPDATE \$\{table\} SET order_id = \? WHERE order_id = \?/);
  for (const table of [
    "order_items",
    "order_payment_details",
    "order_option_items",
    "order_option_guards",
    "order_catalog_guards",
    "order_inventory_adjustments",
    "order_point_debits",
    "order_point_credits",
    "order_point_reversals",
    "order_requests",
    "coupon_redemptions",
    "personal_payments",
  ]) {
    assert.match(service, new RegExp(`"${table}"`, "u"));
  }
  assert.match(service, /SET product_id = \?, product_name = \?, product_image = \?/);
  assert.match(service, /unit_price = \?, quantity = \?, line_total = \?/);
  assert.match(service, /const quantity = Number\(value\.quantity\)/);
  assert.match(service, /const wasFullyPaidWithPoints =/);
  assert.match(service, /\? maximumPointUse\s*:\s*Math\.min\(currentPointsUsed, maximumPointUse\)/s);
  assert.match(service, /SET stock = stock \+ \?/);
  assert.match(service, /SET stock = stock - \?/);
  assert.match(service, /UPDATE order_option_items\s+SET quantity = \?/s);
  assert.match(service, /order_point_debits/);
  assert.match(service, /order_point_credits/);
  assert.match(service, /member\.order-item\.update/);
  assert.match(service, /getEffectiveProducts\(\{ database, strict: true \}\)/);

  assert.match(manager, />\s*상품변경\s*</u);
  assert.match(manager, /title="상품변경"/);
  assert.match(manager, /상품ID \(it_id\)/u);
  assert.match(manager, /<span>수량<\/span>/u);
  assert.match(manager, /quantity: event\.currentTarget\.value/);
  assert.match(manager, /quantity,/);
  assert.match(manager, /type="datetime-local"/);
  assert.match(manager, /step=\{1\}/);
  assert.match(manager, /단가·주문금액·사용 및 보유 마일리지가 자동 계산/u);
  assert.match(styles, /\.legacy-member-order \{/);
  assert.match(styles, /\.legacy-member-order-editor/);
});

test("product edits atomically update order totals, member points, and stock", () => {
  const database = new DatabaseSync(":memory:");
  database.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE users (id TEXT PRIMARY KEY, points INTEGER NOT NULL);
    CREATE TABLE orders (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      subtotal INTEGER NOT NULL,
      discount INTEGER NOT NULL,
      total INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE order_items (
      id INTEGER PRIMARY KEY,
      order_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      product_name TEXT NOT NULL,
      unit_price INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      line_total INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE product_stock (
      product_id TEXT PRIMARY KEY,
      stock INTEGER NOT NULL CHECK(stock >= 0)
    );
    CREATE TABLE admin_member_order_write_guards (
      operation_id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      order_guard INTEGER NOT NULL CHECK(order_guard = 1),
      item_guard INTEGER NOT NULL CHECK(item_guard = 1),
      balance_guard INTEGER NOT NULL CHECK(balance_guard = 1),
      stock_guard INTEGER NOT NULL CHECK(stock_guard = 1)
    );
    INSERT INTO users VALUES ('member-1', 1000);
    INSERT INTO orders VALUES (
      'order-1', 'member-1', 1000, 200, 800,
      '2026-07-31 10:00:00', 'revision-1'
    );
    INSERT INTO order_items VALUES (
      1, 'order-1', 'old-product', '기존상품', 1000, 1, 1000,
      '2026-07-31 10:00:00'
    );
    INSERT INTO product_stock VALUES ('old-product', 9), ('1762011927', 5);
  `);

  applyProductEdit(database, {
    operationId: "write-1",
    expectedUpdatedAt: "revision-1",
    nextUpdatedAt: "revision-2",
    purchasedAt: "2026-07-01 12:34:56",
    productId: "1762011927",
    productName: "호랑이 골드바",
    unitPrice: 500,
    quantity: 3,
    memberPoints: 950,
  });

  assert.deepEqual(
    { ...database.prepare("SELECT * FROM orders").get() },
    {
      id: "order-1",
      user_id: "member-1",
      subtotal: 1500,
      discount: 200,
      total: 1300,
      created_at: "2026-07-01 12:34:56",
      updated_at: "revision-2",
    },
  );
  assert.deepEqual(
    {
      ...database
        .prepare(
          `SELECT product_id, product_name, unit_price, quantity, line_total, created_at
           FROM order_items WHERE id = 1`,
        )
        .get(),
    },
    {
      product_id: "1762011927",
      product_name: "호랑이 골드바",
      unit_price: 500,
      quantity: 3,
      line_total: 1500,
      created_at: "2026-07-01 12:34:56",
    },
  );
  assert.equal(database.prepare("SELECT points FROM users").get().points, 950);
  assert.equal(
    database
      .prepare("SELECT stock FROM product_stock WHERE product_id = 'old-product'")
      .get().stock,
    10,
  );
  assert.equal(
    database
      .prepare("SELECT stock FROM product_stock WHERE product_id = '1762011927'")
      .get().stock,
    2,
  );

  assert.throws(
    () =>
      applyProductEdit(database, {
        operationId: "stale-write",
        expectedUpdatedAt: "revision-1",
        nextUpdatedAt: "revision-3",
        purchasedAt: "2026-06-01 00:00:00",
        productId: "another-product",
        productName: "충돌상품",
        unitPrice: 100,
        quantity: 2,
        memberPoints: 0,
      }),
    /constraint/iu,
  );
  assert.equal(
    database.prepare("SELECT updated_at FROM orders").get().updated_at,
    "revision-2",
  );
  assert.equal(
    database.prepare("SELECT product_id FROM order_items").get().product_id,
    "1762011927",
  );
  database.close();
});

function applyProductEdit(database, values) {
  database.exec("BEGIN IMMEDIATE");
  try {
    database
      .prepare(
        `UPDATE orders
         SET subtotal = ?, total = ?, created_at = ?, updated_at = ?
         WHERE id = 'order-1' AND user_id = 'member-1' AND updated_at = ?`,
      )
      .run(
        values.unitPrice * values.quantity,
        Math.max(0, values.unitPrice * values.quantity - 200),
        values.purchasedAt,
        values.nextUpdatedAt,
        values.expectedUpdatedAt,
      );
    database
      .prepare(
        `INSERT INTO admin_member_order_write_guards
         VALUES (?, 'order-1', changes(), 1, 1, 1)`,
      )
      .run(values.operationId);
    database
      .prepare(
        `UPDATE order_items
         SET product_id = ?, product_name = ?, unit_price = ?,
             quantity = ?, line_total = ?, created_at = ?
         WHERE id = 1 AND order_id = 'order-1'`,
      )
      .run(
        values.productId,
        values.productName,
        values.unitPrice,
        values.quantity,
        values.unitPrice * values.quantity,
        values.purchasedAt,
      );
    database
      .prepare(
        `UPDATE admin_member_order_write_guards
         SET item_guard = CASE WHEN changes() = 1 THEN 1 ELSE 0 END
         WHERE operation_id = ?`,
      )
      .run(values.operationId);
    database
      .prepare("UPDATE users SET points = ? WHERE id = 'member-1'")
      .run(values.memberPoints);
    database
      .prepare(
        `UPDATE admin_member_order_write_guards
         SET balance_guard = CASE WHEN changes() = 1 THEN 1 ELSE 0 END
         WHERE operation_id = ?`,
      )
      .run(values.operationId);
    database
      .prepare("UPDATE product_stock SET stock = stock + 1 WHERE product_id = 'old-product'")
      .run();
    database
      .prepare(
        "UPDATE product_stock SET stock = stock - ? WHERE product_id = '1762011927' AND stock >= ?",
      )
      .run(values.quantity, values.quantity);
    database
      .prepare(
        `UPDATE admin_member_order_write_guards
         SET stock_guard = CASE WHEN changes() = 1 THEN 1 ELSE 0 END
         WHERE operation_id = ?`,
      )
      .run(values.operationId);
    database
      .prepare("DELETE FROM admin_member_order_write_guards WHERE operation_id = ?")
      .run(values.operationId);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}
