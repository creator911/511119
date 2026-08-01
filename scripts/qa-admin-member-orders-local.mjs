import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const workspace = process.cwd();
const baseUrl =
  process.env.QA_BASE_URL?.replace(/\/+$/u, "") ??
  "http://localhost:4175";
const suffix = crypto.randomUUID().replace(/-/gu, "").slice(0, 12);
const loginId = `qaorder${suffix}`.slice(0, 30);
const email = `${loginId}@qa.invalid`;
const orderId = `QA-ORDER-${suffix}`;
const originalProductId = "1762011941";
const nextProductId = "1762011927";
const nextQuantity = 3;
const startingMemberPoints = 10_000_000;
const catalog = JSON.parse(
  readFileSync(resolve(workspace, "data/catalog.json"), "utf8"),
);
const originalProduct = catalog.products.find(
  (product) => product.id === originalProductId,
);
const nextProduct = catalog.products.find(
  (product) => product.id === nextProductId,
);
assert.ok(originalProduct);
assert.ok(nextProduct);

const adminCookie = await createLocalAdminCookie();
let memberId = "";
let itemId = 0;
let databaseFile = "";
let originalStockRow;
let nextStockRow;

try {
  const createResponse = await adminFetch("/api/admin/users", {
    method: "POST",
    body: JSON.stringify({
      loginId,
      password: `Qa!${suffix}safe`,
      name: "QA 상품변경 회원",
      nickname: "QA상품",
      email,
      phone: "010-1111-2222",
      points: startingMemberPoints,
      level: 2,
      active: true,
    }),
  });
  assert.equal(createResponse.status, 201);
  const created = await createResponse.json();
  memberId = created.member.id;

  const initializeResponse = await adminFetch(
    `/api/admin/users/${encodeURIComponent(memberId)}/orders`,
  );
  assert.equal(initializeResponse.status, 200);
  assert.deepEqual((await initializeResponse.json()).items, []);

  databaseFile = findMemberDatabase(memberId);
  const database = new DatabaseSync(databaseFile);
  database.exec("PRAGMA busy_timeout = 5000");
  try {
    originalStockRow = database
      .prepare("SELECT stock FROM product_stock WHERE product_id = ?")
      .get(originalProductId);
    nextStockRow = database
      .prepare("SELECT stock FROM product_stock WHERE product_id = ?")
      .get(nextProductId);
    database.exec("BEGIN IMMEDIATE");
    try {
      database
        .prepare(
          `INSERT INTO product_stock (product_id, stock)
           VALUES (?, ?)
           ON CONFLICT(product_id) DO NOTHING`,
        )
        .run(originalProductId, originalProduct.stock);
      database
        .prepare(
          `INSERT INTO product_stock (product_id, stock)
           VALUES (?, ?)
           ON CONFLICT(product_id) DO NOTHING`,
        )
        .run(nextProductId, nextProduct.stock);
      database
        .prepare(
          `INSERT INTO orders (
             id, user_id, email, orderer_name, orderer_phone,
             recipient_name, recipient_phone, postcode, address1,
             subtotal, shipping_fee, discount, total, payment_method,
             payment_status, status, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 0, 'points',
                     'paid', 'payment_confirmed', ?, ?)`,
        )
        .run(
          orderId,
          memberId,
          email,
          "QA 상품변경 회원",
          "010-1111-2222",
          "QA 상품변경 회원",
          "010-1111-2222",
          "01234",
          "QA 주소",
          originalProduct.price,
          originalProduct.price,
          "2026-07-31 01:00:00",
          "2026-07-31 01:00:00",
        );
      const inserted = database
        .prepare(
          `INSERT INTO order_items (
             order_id, product_id, product_name, product_image,
             unit_price, quantity, line_total, created_at
           ) VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
        )
        .run(
          orderId,
          originalProduct.id,
          originalProduct.name,
          originalProduct.images[0] ?? "",
          originalProduct.price,
          originalProduct.price,
          "2026-07-31 01:00:00",
        );
      itemId = Number(inserted.lastInsertRowid);
      database
        .prepare(
          `INSERT INTO order_point_debits (
             order_id, user_id, points_used, guard_value, created_at
           ) VALUES (?, ?, ?, 1, ?)`,
        )
        .run(
          orderId,
          memberId,
          originalProduct.price,
          "2026-07-31 01:00:00",
        );
      database
        .prepare(
          `INSERT INTO order_catalog_guards (
             order_id, product_id, catalog_guard
           ) VALUES (?, ?, 1)`,
        )
        .run(orderId, originalProduct.id);
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  } finally {
    database.close();
  }

  const listResponse = await adminFetch(
    `/api/admin/users/${encodeURIComponent(memberId)}/orders`,
  );
  assert.equal(listResponse.status, 200);
  const list = await listResponse.json();
  assert.equal(list.items.length, 1);
  assert.equal(list.items[0].itemId, itemId);
  assert.equal(list.items[0].productId, originalProductId);

  const crossOrigin = await fetch(
    `${baseUrl}/api/admin/users/${encodeURIComponent(memberId)}/orders`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://example.invalid",
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        itemId,
        productId: nextProductId,
        quantity: nextQuantity,
        purchasedAt: "2026-07-01T12:34:56+09:00",
        expectedUpdatedAt: list.items[0].updatedAt,
      }),
    },
  );
  assert.equal(crossOrigin.status, 403);

  const updateResponse = await adminFetch(
    `/api/admin/users/${encodeURIComponent(memberId)}/orders`,
    {
      method: "PUT",
      body: JSON.stringify({
        itemId,
        productId: nextProductId,
        quantity: nextQuantity,
        purchasedAt: "2026-07-01T12:34:56+09:00",
        expectedUpdatedAt: list.items[0].updatedAt,
      }),
    },
  );
  assert.equal(updateResponse.status, 200);
  const updated = await updateResponse.json();
  assert.equal(updated.items.length, 1);
  assert.equal(updated.items[0].productId, nextProductId);
  assert.equal(updated.items[0].productName, nextProduct.name);
  assert.equal(updated.items[0].unitPrice, nextProduct.price);
  assert.equal(updated.items[0].quantity, nextQuantity);
  assert.equal(updated.items[0].lineTotal, nextProduct.price * nextQuantity);
  assert.equal(updated.items[0].subtotal, nextProduct.price * nextQuantity);
  assert.equal(updated.items[0].pointsUsed, nextProduct.price * nextQuantity);
  assert.equal(updated.items[0].total, 0);
  assert.equal(updated.items[0].purchasedAt, "2026-07-01 03:34:56");
  const expectedMemberPoints =
    startingMemberPoints -
    (nextProduct.price * nextQuantity - originalProduct.price);
  assert.equal(updated.member.points, expectedMemberPoints);

  const staleResponse = await adminFetch(
    `/api/admin/users/${encodeURIComponent(memberId)}/orders`,
    {
      method: "PUT",
      body: JSON.stringify({
        itemId,
        productId: originalProductId,
        quantity: 1,
        purchasedAt: "2026-06-01T00:00:00+09:00",
        expectedUpdatedAt: list.items[0].updatedAt,
      }),
    },
  );
  assert.equal(staleResponse.status, 409);

  const verificationDatabase = new DatabaseSync(databaseFile);
  try {
    const stored = verificationDatabase
      .prepare(
        `SELECT o.created_at, o.subtotal, o.total, oi.product_id,
                oi.product_name, oi.unit_price, oi.quantity, oi.line_total,
                opd.points_used, u.points AS member_points
         FROM orders o JOIN order_items oi ON oi.order_id = o.id
         JOIN users u ON u.id = o.user_id
         LEFT JOIN order_point_debits opd ON opd.order_id = o.id
         WHERE o.id = ? AND oi.id = ?`,
      )
      .get(orderId, itemId);
    assert.equal(stored.created_at, "2026-07-01 03:34:56");
    assert.equal(stored.product_id, nextProductId);
    assert.equal(stored.product_name, nextProduct.name);
    assert.equal(stored.unit_price, nextProduct.price);
    assert.equal(stored.quantity, nextQuantity);
    assert.equal(stored.line_total, nextProduct.price * nextQuantity);
    assert.equal(stored.subtotal, nextProduct.price * nextQuantity);
    assert.equal(stored.points_used, nextProduct.price * nextQuantity);
    assert.equal(stored.member_points, expectedMemberPoints);
    assert.equal(stored.total, 0);

    const originalStock = verificationDatabase
      .prepare("SELECT stock FROM product_stock WHERE product_id = ?")
      .get(originalProductId).stock;
    const nextStock = verificationDatabase
      .prepare("SELECT stock FROM product_stock WHERE product_id = ?")
      .get(nextProductId).stock;
    assert.equal(
      originalStock,
      Number(originalStockRow?.stock ?? originalProduct.stock) + 1,
    );
    assert.equal(
      nextStock,
      Number(nextStockRow?.stock ?? nextProduct.stock) - nextQuantity,
    );
  } finally {
    verificationDatabase.close();
  }

  console.log(
    JSON.stringify({
      ok: true,
      loginId,
      memberOrderList: true,
      productIdResolved: true,
      purchaseDateUpdatedToSeconds: true,
      totalsRecalculated: true,
      quantityUpdated: true,
      fullPointBalanceReconciled: true,
      inventoryRebalanced: true,
      staleWriteBlocked: true,
      crossOriginBlocked: true,
    }),
  );
  const visualWaitMs = Number(process.env.QA_VISUAL_WAIT_MS ?? 0);
  if (Number.isSafeInteger(visualWaitMs) && visualWaitMs > 0) {
    await new Promise((resolveWait) =>
      setTimeout(resolveWait, Math.min(visualWaitMs, 180_000)),
    );
  }
} finally {
  cleanupQaRows();
}

function adminFetch(pathname, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  headers.set("Cookie", adminCookie);
  headers.set("Origin", baseUrl);
  if (init.body) headers.set("Content-Type", "application/json");
  return fetch(`${baseUrl}${pathname}`, { ...init, headers });
}

async function createLocalAdminCookie() {
  const environmentFile = resolve(workspace, ".env.local");
  const fileValues = existsSync(environmentFile)
    ? Object.fromEntries(
        readFileSync(environmentFile, "utf8")
          .split(/\r?\n/u)
          .filter((line) => line && !line.trimStart().startsWith("#"))
          .map((line) => {
            const separator = line.indexOf("=");
            return separator < 0
              ? ["", ""]
              : [
                  line.slice(0, separator).trim(),
                  line.slice(separator + 1).trim(),
                ];
          })
          .filter(([key]) => key),
      )
    : {};
  const values = { ...fileValues, ...process.env };
  assert.ok(values.ADMIN_USERNAME);
  assert.ok(values.SESSION_SECRET?.length >= 32);
  const now = Math.floor(Date.now() / 1_000);
  const payload = {
    version: 1,
    subject: values.ADMIN_USERNAME,
    role: "admin",
    issuedAt: now,
    expiresAt: now + 3600,
    nonce: crypto.randomUUID().replace(/-/gu, ""),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(values.SESSION_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(encoded),
  );
  return `admin_session=${encoded}.${Buffer.from(signature).toString("base64url")}`;
}

function findMemberDatabase(id) {
  const databaseDirectory = resolve(
    workspace,
    ".wrangler/state/v3/d1/miniflare-D1DatabaseObject",
  );
  assert.equal(existsSync(databaseDirectory), true);
  for (const name of readdirSync(databaseDirectory)) {
    if (!name.endsWith(".sqlite") || name === "metadata.sqlite") continue;
    const file = join(databaseDirectory, name);
    const database = new DatabaseSync(file);
    try {
      if (!tableExists(database, "users")) continue;
      if (
        database
          .prepare("SELECT id FROM users WHERE id = ? LIMIT 1")
          .get(id)
      ) {
        return file;
      }
    } finally {
      database.close();
    }
  }
  throw new Error("QA 회원이 저장된 로컬 데이터베이스를 찾지 못했습니다.");
}

function cleanupQaRows() {
  if (!databaseFile || !existsSync(databaseFile)) return;
  const database = new DatabaseSync(databaseFile);
  database.exec("PRAGMA busy_timeout = 5000");
  try {
    database.exec("BEGIN IMMEDIATE");
    try {
      if (tableExists(database, "admin_member_order_write_guards")) {
        database
          .prepare("DELETE FROM admin_member_order_write_guards WHERE order_id = ?")
          .run(orderId);
      }
      if (tableExists(database, "admin_audit_logs")) {
        database
          .prepare(
            `DELETE FROM admin_audit_logs
             WHERE entity_id IN (?, ?) OR details LIKE ?`,
          )
          .run(memberId, String(itemId), `%${orderId}%`);
      }
      for (const table of [
        "order_inventory_adjustments",
        "order_catalog_guards",
        "order_option_guards",
        "order_option_items",
        "order_point_reversals",
        "order_point_credits",
        "order_point_debits",
        "coupon_redemptions",
        "order_payment_details",
        "order_requests",
        "order_items",
      ]) {
        if (tableExists(database, table)) {
          database
            .prepare(`DELETE FROM ${table} WHERE order_id = ?`)
            .run(orderId);
        }
      }
      if (tableExists(database, "orders")) {
        database.prepare("DELETE FROM orders WHERE id = ?").run(orderId);
      }
      restoreStock(database, originalProductId, originalStockRow);
      restoreStock(database, nextProductId, nextStockRow);
      if (memberId && tableExists(database, "member_access_groups")) {
        database
          .prepare("DELETE FROM member_access_groups WHERE user_id = ?")
          .run(memberId);
      }
      if (memberId && tableExists(database, "member_access_group_state")) {
        database
          .prepare("DELETE FROM member_access_group_state WHERE user_id = ?")
          .run(memberId);
      }
      if (memberId && tableExists(database, "user_session_state")) {
        database.prepare("DELETE FROM user_session_state WHERE user_id = ?").run(memberId);
      }
      if (memberId && tableExists(database, "users")) {
        database.prepare("DELETE FROM users WHERE id = ?").run(memberId);
      }
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  } finally {
    database.close();
  }
}

function restoreStock(database, productId, previous) {
  if (!tableExists(database, "product_stock")) return;
  if (previous) {
    database
      .prepare("UPDATE product_stock SET stock = ? WHERE product_id = ?")
      .run(previous.stock, productId);
  } else {
    database
      .prepare("DELETE FROM product_stock WHERE product_id = ?")
      .run(productId);
  }
}

function tableExists(database, table) {
  return Boolean(
    database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
      )
      .get(table),
  );
}
