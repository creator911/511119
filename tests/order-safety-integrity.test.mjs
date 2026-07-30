import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

test("isolates expired orders and reconciles capped point restores later", () => {
  const database = new DatabaseSync(":memory:");
  const maxPoints = 1_000;
  database.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      points INTEGER NOT NULL
    );
    CREATE TABLE orders (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      payment_status TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE order_items (
      order_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      quantity INTEGER NOT NULL
    );
    CREATE TABLE product_stock (
      product_id TEXT PRIMARY KEY,
      stock INTEGER NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE order_point_debits (
      order_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      points_used INTEGER NOT NULL
    );
    CREATE TABLE order_inventory_adjustments (
      order_id TEXT NOT NULL,
      adjustment_type TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (order_id, adjustment_type)
    );
  `);
  database.exec(`
    INSERT INTO users (id, points) VALUES ('capped', 950), ('regular', 100);
    INSERT INTO orders (id, status, payment_status, created_at)
      VALUES
        ('capped-order', 'ordered', 'pending', '2020-01-01 00:00:00'),
        ('regular-order', 'ordered', 'pending', '2020-01-01 00:00:00');
    INSERT INTO order_items (order_id, product_id, quantity)
      VALUES
        ('capped-order', 'product-a', 2),
        ('regular-order', 'product-b', 3);
    INSERT INTO product_stock (product_id, stock)
      VALUES ('product-a', 5), ('product-b', 7);
    INSERT INTO order_point_debits (order_id, user_id, points_used)
      VALUES
        ('capped-order', 'capped', 100),
        ('regular-order', 'regular', 50);
  `);

  release("capped-order");
  release("regular-order");

  assert.equal(readOrderStatus("capped-order"), "cancelled");
  assert.equal(readOrderStatus("regular-order"), "cancelled");
  assert.equal(readStock("product-a"), 7);
  assert.equal(readStock("product-b"), 10);
  assert.equal(readPoints("capped"), 950);
  assert.equal(readPoints("regular"), 150);
  assert.equal(hasAdjustment("capped-order", "points_restore_pending"), 1);
  assert.equal(hasAdjustment("capped-order", "points_restore"), 0);
  assert.equal(hasAdjustment("regular-order", "points_restore"), 1);

  database
    .prepare("UPDATE users SET points = ? WHERE id = ?")
    .run(800, "capped");
  settlePending("capped-order");
  assert.equal(readPoints("capped"), 900);
  assert.equal(hasAdjustment("capped-order", "points_restore"), 1);
  assert.equal(hasAdjustment("capped-order", "points_restore_pending"), 0);
  database.close();

  function release(orderId) {
    database.exec("BEGIN IMMEDIATE");
    try {
      database
        .prepare(
          `INSERT OR IGNORE INTO order_inventory_adjustments (
             order_id, adjustment_type
           ) SELECT id, 'stock_restore' FROM orders
             WHERE id = ? AND status = 'ordered' AND payment_status = 'pending'`,
        )
        .run(orderId);
      database
        .prepare(
          `INSERT INTO product_stock (product_id, stock)
           SELECT product_id, SUM(quantity)
           FROM order_items WHERE order_id = ? AND changes() = 1
           GROUP BY product_id
           ON CONFLICT(product_id) DO UPDATE
             SET stock = product_stock.stock + excluded.stock`,
        )
        .run(orderId);
      database
        .prepare(
          `INSERT OR IGNORE INTO order_inventory_adjustments (
             order_id, adjustment_type
           )
           SELECT opd.order_id, 'points_restore'
           FROM order_point_debits opd
           JOIN users u ON u.id = opd.user_id
           JOIN orders o ON o.id = opd.order_id
           WHERE opd.order_id = ?
             AND o.status = 'ordered'
             AND o.payment_status = 'pending'
             AND u.points <= ? - opd.points_used`,
        )
        .run(orderId, maxPoints);
      database
        .prepare(
          `UPDATE users
           SET points = points + (
             SELECT points_used FROM order_point_debits WHERE order_id = ?
           )
           WHERE id = (
             SELECT user_id FROM order_point_debits WHERE order_id = ?
           ) AND changes() = 1`,
        )
        .run(orderId, orderId);
      database
        .prepare(
          `INSERT OR IGNORE INTO order_inventory_adjustments (
             order_id, adjustment_type
           )
           SELECT opd.order_id, 'points_restore_pending'
           FROM order_point_debits opd
           WHERE opd.order_id = ?
             AND NOT EXISTS (
               SELECT 1 FROM order_inventory_adjustments completed
               WHERE completed.order_id = opd.order_id
                 AND completed.adjustment_type = 'points_restore'
             )`,
        )
        .run(orderId);
      database
        .prepare(
          `UPDATE orders SET status = 'cancelled', payment_status = 'cancelled'
           WHERE id = ? AND status = 'ordered' AND payment_status = 'pending'`,
        )
        .run(orderId);
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }

  function settlePending(orderId) {
    database.exec("BEGIN IMMEDIATE");
    try {
      database
        .prepare(
          `INSERT OR IGNORE INTO order_inventory_adjustments (
             order_id, adjustment_type
           )
           SELECT pending.order_id, 'points_restore'
           FROM order_inventory_adjustments pending
           JOIN order_point_debits opd ON opd.order_id = pending.order_id
           JOIN users u ON u.id = opd.user_id
           WHERE pending.order_id = ?
             AND pending.adjustment_type = 'points_restore_pending'
             AND u.points <= ? - opd.points_used`,
        )
        .run(orderId, maxPoints);
      database
        .prepare(
          `UPDATE users
           SET points = points + (
             SELECT points_used FROM order_point_debits WHERE order_id = ?
           )
           WHERE id = (
             SELECT user_id FROM order_point_debits WHERE order_id = ?
           ) AND changes() = 1`,
        )
        .run(orderId, orderId);
      database
        .prepare(
          `DELETE FROM order_inventory_adjustments
           WHERE order_id = ? AND adjustment_type = 'points_restore_pending'
             AND EXISTS (
               SELECT 1 FROM order_inventory_adjustments completed
               WHERE completed.order_id = ?
                 AND completed.adjustment_type = 'points_restore'
             )`,
        )
        .run(orderId, orderId);
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }

  function readOrderStatus(orderId) {
    return database
      .prepare("SELECT status FROM orders WHERE id = ?")
      .get(orderId).status;
  }

  function readStock(productId) {
    return database
      .prepare("SELECT stock FROM product_stock WHERE product_id = ?")
      .get(productId).stock;
  }

  function readPoints(userId) {
    return database
      .prepare("SELECT points FROM users WHERE id = ?")
      .get(userId).points;
  }

  function hasAdjustment(orderId, type) {
    return database
      .prepare(
        `SELECT COUNT(*) AS count FROM order_inventory_adjustments
         WHERE order_id = ? AND adjustment_type = ?`,
      )
      .get(orderId, type).count;
  }
});

test("credits and reverses an explicit positive order reward exactly once", () => {
  const database = new DatabaseSync(":memory:");
  const maxPoints = 1_000;
  database.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      points INTEGER NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE orders (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      status TEXT NOT NULL,
      payment_status TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE order_point_credits (
      order_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      points_earned INTEGER NOT NULL CHECK(points_earned > 0)
    );
    CREATE TABLE order_point_reversals (
      order_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      points_reversed INTEGER NOT NULL CHECK(points_reversed > 0)
    );
    CREATE TABLE order_inventory_adjustments (
      order_id TEXT NOT NULL,
      adjustment_type TEXT NOT NULL,
      PRIMARY KEY (order_id, adjustment_type)
    );
    INSERT INTO users (id, points)
      VALUES
        ('rewarded-user', 100),
        ('plain-user', 50),
        ('capped-user', 995),
        ('spent-user', 100);
    INSERT INTO orders (id, user_id, status, payment_status, updated_at)
      VALUES
        ('rewarded-order', 'rewarded-user', 'shipped', 'paid', '2026-01-01 00:00:00'),
        ('plain-order', 'plain-user', 'shipped', 'paid', '2026-01-01 00:00:00'),
        ('capped-order', 'capped-user', 'shipped', 'paid', '2026-01-01 00:00:00'),
        ('spent-order', 'spent-user', 'shipped', 'paid', '2026-01-01 00:00:00');
    INSERT INTO order_point_credits (order_id, user_id, points_earned)
      VALUES
        ('rewarded-order', 'rewarded-user', 25),
        ('capped-order', 'capped-user', 10),
        ('spent-order', 'spent-user', 25);
  `);

  applyCredit("rewarded-order");
  applyCredit("rewarded-order");
  applyCredit("plain-order");
  assert.equal(readPoints("rewarded-user"), 125);
  assert.equal(readPoints("plain-user"), 50);
  assert.equal(hasAdjustment("rewarded-order", "points_credit"), 1);
  assert.equal(hasAdjustment("plain-order", "points_credit"), 0);

  database
    .prepare("UPDATE orders SET status = 'delivered' WHERE id = ?")
    .run("rewarded-order");
  reverseCredit("rewarded-order");
  reverseCredit("rewarded-order");
  assert.equal(readPoints("rewarded-user"), 100);
  assert.equal(hasAdjustment("rewarded-order", "points_reversal"), 1);
  assert.equal(
    database
      .prepare(
        "SELECT COUNT(*) AS count FROM order_point_reversals WHERE order_id = ?",
      )
      .get("rewarded-order").count,
    1,
  );

  assert.throws(() => applyCredit("capped-order"), /not null/iu);
  assert.equal(readPoints("capped-user"), 995);
  assert.equal(hasAdjustment("capped-order", "points_credit"), 0);

  applyCredit("spent-order");
  database
    .prepare("UPDATE orders SET status = 'delivered' WHERE id = ?")
    .run("spent-order");
  database
    .prepare("UPDATE users SET points = 10 WHERE id = ?")
    .run("spent-user");
  assert.throws(() => reverseCredit("spent-order"), /not null/iu);
  assert.equal(readPoints("spent-user"), 10);
  assert.equal(hasAdjustment("spent-order", "points_reversal"), 0);
  assert.equal(
    database
      .prepare(
        "SELECT COUNT(*) AS count FROM order_point_reversals WHERE order_id = ?",
      )
      .get("spent-order").count,
    0,
  );

  database.close();

  function applyCredit(orderId) {
    database.exec("BEGIN IMMEDIATE");
    try {
      database
        .prepare(
          `INSERT OR IGNORE INTO order_inventory_adjustments (
             order_id, adjustment_type
           )
           SELECT opc.order_id, 'points_credit'
           FROM order_point_credits opc
           JOIN orders o ON o.id = opc.order_id
           JOIN users u ON u.id = opc.user_id
           WHERE opc.order_id = ?
             AND opc.points_earned > 0
             AND o.user_id = opc.user_id
             AND o.status = 'shipped'
             AND o.payment_status = 'paid'`,
        )
        .run(orderId);
      database
        .prepare(
          `UPDATE users
           SET points = CASE
                 WHEN points <= ? - (
                   SELECT points_earned
                   FROM order_point_credits
                   WHERE order_id = ?
                 )
                 THEN points + (
                   SELECT points_earned
                   FROM order_point_credits
                   WHERE order_id = ?
                 )
                 ELSE NULL
               END
           WHERE id = (
             SELECT user_id
             FROM order_point_credits
             WHERE order_id = ?
           )
             AND changes() = 1`,
        )
        .run(maxPoints, orderId, orderId, orderId);
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }

  function reverseCredit(orderId) {
    database.exec("BEGIN IMMEDIATE");
    try {
      database
        .prepare(
          `INSERT OR IGNORE INTO order_inventory_adjustments (
             order_id, adjustment_type
           )
           SELECT opc.order_id, 'points_reversal'
           FROM order_point_credits opc
           JOIN orders o ON o.id = opc.order_id
           JOIN users u ON u.id = opc.user_id
           WHERE opc.order_id = ?
             AND o.status = 'delivered'
             AND o.payment_status = 'paid'
             AND EXISTS (
               SELECT 1
               FROM order_inventory_adjustments credit
               WHERE credit.order_id = opc.order_id
                 AND credit.adjustment_type = 'points_credit'
             )`,
        )
        .run(orderId);
      database
        .prepare(
          `INSERT INTO order_point_reversals (
             order_id, user_id, points_reversed
           )
           SELECT order_id, user_id, points_earned
           FROM order_point_credits
           WHERE order_id = ? AND changes() = 1`,
        )
        .run(orderId);
      database
        .prepare(
          `UPDATE users
           SET points = CASE
                 WHEN points >= (
                   SELECT points_reversed
                   FROM order_point_reversals
                   WHERE order_id = ?
                 )
                 THEN points - (
                   SELECT points_reversed
                   FROM order_point_reversals
                   WHERE order_id = ?
                 )
                 ELSE NULL
               END
           WHERE id = (
             SELECT user_id
             FROM order_point_reversals
             WHERE order_id = ?
           )
             AND changes() = 1`,
        )
        .run(orderId, orderId, orderId);
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }

  function readPoints(userId) {
    return database
      .prepare("SELECT points FROM users WHERE id = ?")
      .get(userId).points;
  }

  function hasAdjustment(orderId, adjustmentType) {
    return database
      .prepare(
        `SELECT COUNT(*) AS count
         FROM order_inventory_adjustments
         WHERE order_id = ? AND adjustment_type = ?`,
      )
      .get(orderId, adjustmentType).count;
  }
});

test("source guards cleanup availability and stale tracking updates", async () => {
  const [safety, operations, reports] = await Promise.all([
    readFile(new URL("../lib/order-safety.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/admin-operations.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/admin-reports.ts", import.meta.url), "utf8"),
  ]);

  assert.match(safety, /for \(const orderId of ids\)/);
  assert.match(safety, /expiredOrderReleaseStatements/);
  assert.match(safety, /points_restore_pending/);
  assert.match(safety, /settlePendingPointRestores/);
  assert.doesNotMatch(safety, /ELSE NULL/);
  const clientKey = safety.slice(safety.indexOf("async function hashedClientKey"));
  assert.match(clientKey, /cf-connecting-ip/);
  assert.doesNotMatch(clientKey, /x-forwarded-for|user-agent/);
  assert.match(clientKey, /"anonymous"/);
  assert.match(operations, /AND tracking_number = \?/);
  assert.match(operations, /current\.trackingNumber/);
  assert.match(operations, /current\.earnedPoints > 0/);
  assert.match(operations, /SELECT opc\.order_id, 'points_credit'/);
  assert.match(operations, /credit\.adjustment_type = 'points_credit'/);
  assert.match(operations, /points_restore_pending/);
  assert.match(reports, /restore_pending/);
});
