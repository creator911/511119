import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const workspace = process.cwd();
const databaseDirectory = resolve(
  workspace,
  ".wrangler/state/v3/d1/miniflare-D1DatabaseObject",
);
const databaseFile = readdirSync(databaseDirectory)
  .filter((name) => name.endsWith(".sqlite") && name !== "metadata.sqlite")
  .map((name) => join(databaseDirectory, name))
  .find(Boolean);
assert.ok(databaseFile, "로컬 D1 파일을 찾을 수 없습니다.");
assert.ok(
  resolve(databaseFile).startsWith(databaseDirectory),
  "로컬 D1 경로가 작업공간을 벗어났습니다.",
);

const publicBase = "http://localhost:4173";
const authenticatedBase = publicBase;
const adminCookie = await createLocalAdminCookie();
const runId = `QAADM-${Date.now().toString(36).toUpperCase()}`;
const productIds = [`${runId}-P1`, `${runId}-P2`];
const safeOrderId = `${runId}-ORDER-SAFE`;
const staleOrderId = `${runId}-ORDER-STALE`;
const paidOrderId = `${runId}-ORDER-PAID`;
const orderProductId = `${runId}-STOCK`;
const updatedAt = "2026-07-29 00:00:00";
const database = new DatabaseSync(databaseFile);

try {
  const unauthorizedExport = await fetch(
    `${publicBase}/api/admin/products/bulk`,
  );
  assert.equal(unauthorizedExport.status, 401);

  const exportResponse = await authFetch(
    `${authenticatedBase}/api/admin/products/bulk`,
    { headers: { Accept: "text/csv" } },
  );
  assert.equal(exportResponse.status, 200);
  assert.match(
    exportResponse.headers.get("content-type") ?? "",
    /^text\/csv/iu,
  );
  const exported = await exportResponse.text();
  assert.match(exported, /^\uFEFF?id,categoryId,name,basic,/u);

  const productsResponse = await authFetch(
    `${authenticatedBase}/api/admin/products`,
    { headers: { Accept: "application/json" } },
  );
  assert.equal(productsResponse.status, 200);
  const productsPayload = await productsResponse.json();
  const categoryId = productsPayload.products?.find(
    (product) => typeof product.categoryId === "string",
  )?.categoryId;
  assert.ok(categoryId, "검증에 사용할 상품분류가 없습니다.");

  const invalidDryRun = await adminPost("/api/admin/products/bulk", {
    mode: "dry-run",
    csv: "id,name,price,stock\r\nBAD,필수분류없음,1000,1\r\n",
  });
  assert.equal(invalidDryRun.response.status, 200);
  assert.equal(invalidDryRun.payload.valid, false);
  assert.ok(invalidDryRun.payload.issues.length > 0);

  const csv = makeProductCsv([
    {
      id: productIds[0],
      categoryId,
      name: "QA 일괄등록 상품 1",
      price: 1000,
      stock: 3,
    },
    {
      id: productIds[1],
      categoryId,
      name: "QA 일괄등록 상품 2",
      price: 2000,
      stock: 4,
    },
  ]);
  const dryRun = await adminPost("/api/admin/products/bulk", {
    mode: "dry-run",
    csv,
  });
  assert.equal(dryRun.response.status, 200);
  assert.equal(dryRun.payload.valid, true);
  assert.equal(dryRun.payload.rowCount, 2);
  assert.match(dryRun.payload.token, /^[a-f0-9]{64}$/u);

  const tampered = await adminPost("/api/admin/products/bulk", {
    mode: "commit",
    csv,
    token: `${dryRun.payload.token.slice(0, -1)}${
      dryRun.payload.token.endsWith("0") ? "1" : "0"
    }`,
  });
  assert.equal(tampered.response.status, 409);
  assert.equal(countRows("product_changes", "product_id", productIds), 0);

  const committed = await adminPost("/api/admin/products/bulk", {
    mode: "commit",
    csv,
    token: dryRun.payload.token,
  });
  assert.equal(committed.response.status, 201);
  assert.equal(committed.payload.imported, 2);
  assert.equal(countRows("product_changes", "product_id", productIds), 2);
  assert.equal(countRows("product_stock", "product_id", productIds), 2);

  const replay = await adminPost("/api/admin/products/bulk", {
    mode: "commit",
    csv,
    token: dryRun.payload.token,
  });
  assert.ok([409, 422].includes(replay.response.status));
  assert.equal(countRows("product_changes", "product_id", productIds), 2);

  seedOrder(safeOrderId, "pending", "ordered", 2);
  const safeDelete = await adminDeleteOrder(safeOrderId, updatedAt);
  assert.equal(
    safeDelete.response.status,
    200,
    JSON.stringify(safeDelete.payload),
  );
  assert.equal(safeDelete.payload.restoredUnits, 2);
  assert.equal(orderExists(safeOrderId), false);
  assert.equal(readStock(), 12);

  database
    .prepare(
      "UPDATE product_stock SET stock = 10 WHERE product_id = ?",
    )
    .run(orderProductId);
  seedOrder(staleOrderId, "pending", "ordered", 1);
  const staleDelete = await adminDeleteOrder(
    staleOrderId,
    "2026-07-28 00:00:00",
  );
  assert.equal(staleDelete.response.status, 409);
  assert.equal(orderExists(staleOrderId), true);
  assert.equal(readStock(), 10);

  seedOrder(paidOrderId, "paid", "payment_confirmed", 1);
  const paidDelete = await adminDeleteOrder(paidOrderId, updatedAt);
  assert.equal(paidDelete.response.status, 409);
  assert.equal(orderExists(paidOrderId), true);
  assert.equal(readStock(), 10);

  const dashboard = await authFetch(`${authenticatedBase}/adm`, {
    headers: { Accept: "text/html" },
  });
  assert.equal(dashboard.status, 200);
  const dashboardHtml = await dashboard.text();
  for (const label of [
    "신규가입회원 5건 목록",
    "최근게시물",
    "최근 포인트 발생내역",
    "회원 전체보기",
    "포인트내역 전체보기",
  ]) {
    assert.match(dashboardHtml, new RegExp(label));
  }

  const report = await authFetch(
    `${authenticatedBase}/adm/reports?view=incomplete&mode=all`,
    { headers: { Accept: "text/html" } },
  );
  assert.equal(report.status, 200);
  const reportHtml = await report.text();
  assert.match(reportHtml, /미입금·미완료 주문/u);
  assert.match(reportHtml, /안전 삭제/u);

  const visitInvalid = await fetch(`${publicBase}/api/visits`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: publicBase,
    },
    body: JSON.stringify({ visitorId: "short", pathname: "/" }),
  });
  assert.equal(visitInvalid.status, 204);
  const visitorId = `${runId.replace(/-/gu, "")}VISITOR`;
  const visit = await fetch(`${publicBase}/api/visits`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: publicBase,
    },
    body: JSON.stringify({ visitorId, pathname: "/qa-dashboard-check" }),
  });
  assert.equal(visit.status, 204);
  const duplicateVisit = await fetch(`${publicBase}/api/visits`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: publicBase,
    },
    body: JSON.stringify({ visitorId, pathname: "/qa-dashboard-check" }),
  });
  assert.equal(duplicateVisit.status, 204);

  console.log(
    JSON.stringify({
      ok: true,
      checks: {
        unauthorized: true,
        csvExport: true,
        invalidDryRun: true,
        tamperedTokenRejected: true,
        atomicBulkCommit: true,
        duplicateCommitRejected: true,
        safeOrderDeletedAndStockRestored: true,
        staleOrderRejected: true,
        paidOrderRejected: true,
        dashboardWidgets: true,
        incompleteOrderUi: true,
        visitorDedupe: true,
      },
    }),
  );
} finally {
  cleanup();
  database.close();
}

async function adminPost(pathname, body) {
  const response = await authFetch(`${authenticatedBase}${pathname}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Origin: authenticatedBase,
    },
    body: JSON.stringify(body),
  });
  return {
    response,
    payload: await response.json().catch(() => ({})),
  };
}

async function adminDeleteOrder(id, expectedUpdatedAt) {
  const response = await authFetch(
    `${authenticatedBase}/api/admin/orders/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Origin: authenticatedBase,
      },
      body: JSON.stringify({
        confirmation: id,
        expectedUpdatedAt,
      }),
    },
  );
  const responseText = await response.text();
  let payload = {};
  try {
    payload = JSON.parse(responseText);
  } catch {
    payload = { responseText };
  }
  return { response, payload };
}

function makeProductCsv(products) {
  const rows = [
    ["id", "categoryId", "name", "price", "stock"],
    ...products.map((product) => [
      product.id,
      product.categoryId,
      product.name,
      String(product.price),
      String(product.stock),
    ]),
  ];
  return `${rows
    .map((row) =>
      row
        .map((value) => `"${String(value).replaceAll('"', '""')}"`)
        .join(","),
    )
    .join("\r\n")}\r\n`;
}

function seedOrder(id, paymentStatus, status, quantity) {
  database.exec("BEGIN IMMEDIATE");
  try {
    database
      .prepare(
        `INSERT INTO product_stock (product_id, stock)
         VALUES (?, 10)
         ON CONFLICT(product_id) DO UPDATE SET stock = 10`,
      )
      .run(orderProductId);
    database
      .prepare(
        `INSERT INTO orders (
           id, email, orderer_name, orderer_phone,
           recipient_name, recipient_phone, address1,
           subtotal, total, payment_method, payment_status, status,
           updated_at
         ) VALUES (?, 'qa@example.invalid', 'QA', '01000000000',
           'QA', '01000000000', 'QA address',
           1000, 1000, 'bank', ?, ?, ?)`,
      )
      .run(id, paymentStatus, status, updatedAt);
    database
      .prepare(
        `INSERT INTO order_items (
           order_id, product_id, product_name, unit_price, quantity, line_total
         ) VALUES (?, ?, 'QA item', 1000, ?, ?)`,
      )
      .run(id, orderProductId, quantity, quantity * 1000);
    database
      .prepare(
        `INSERT INTO order_payment_details (
           order_id, bank_code, depositor
         ) VALUES (?, 'manual', 'QA')`,
      )
      .run(id);
    database
      .prepare(
        `INSERT INTO order_requests (request_key, order_id, email)
         VALUES (?, ?, 'qa@example.invalid')`,
      )
      .run(`${id}-REQUEST`, id);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function orderExists(id) {
  return (
    database
      .prepare("SELECT COUNT(*) AS count FROM orders WHERE id = ?")
      .get(id).count === 1
  );
}

function readStock() {
  return database
    .prepare("SELECT stock FROM product_stock WHERE product_id = ?")
    .get(orderProductId).stock;
}

function countRows(table, column, values) {
  const placeholders = values.map(() => "?").join(",");
  return database
    .prepare(
      `SELECT COUNT(*) AS count FROM ${table} WHERE ${column} IN (${placeholders})`,
    )
    .get(...values).count;
}

function cleanup() {
  database.exec("BEGIN IMMEDIATE");
  try {
    for (const table of [
      "order_point_reversals",
      "order_point_credits",
      "order_point_debits",
      "order_inventory_adjustments",
      "order_requests",
      "order_payment_details",
      "order_catalog_guards",
      "order_items",
    ]) {
      if (tableExists(table)) {
        database
          .prepare(`DELETE FROM ${table} WHERE order_id LIKE ?`)
          .run(`${runId}%`);
      }
    }
    if (tableExists("orders")) {
      database
        .prepare("DELETE FROM orders WHERE id LIKE ?")
        .run(`${runId}%`);
    }
    if (tableExists("admin_order_delete_stock_guards")) {
      database
        .prepare(
          "DELETE FROM admin_order_delete_stock_guards WHERE order_id LIKE ?",
        )
        .run(`${runId}%`);
    }
    if (tableExists("admin_order_delete_guards")) {
      database
        .prepare(
          "DELETE FROM admin_order_delete_guards WHERE order_id LIKE ?",
        )
        .run(`${runId}%`);
    }
    if (tableExists("product_stock")) {
      database
        .prepare(
          "DELETE FROM product_stock WHERE product_id LIKE ?",
        )
        .run(`${runId}%`);
    }
    if (tableExists("product_changes")) {
      database
        .prepare(
          "DELETE FROM product_changes WHERE product_id LIKE ?",
        )
        .run(`${runId}%`);
    }
    if (tableExists("admin_audit_logs")) {
      database
        .prepare(
          `DELETE FROM admin_audit_logs
           WHERE entity_id LIKE ? OR details LIKE ?`,
        )
        .run(`${runId}%`, `%${runId}%`);
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function tableExists(table) {
  return Boolean(
    database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
      )
      .get(table),
  );
}

function authFetch(url, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cookie", adminCookie);
  return fetch(url, { ...init, headers });
}

async function createLocalAdminCookie() {
  const values = Object.fromEntries(
    readFileSync(resolve(workspace, ".env.local"), "utf8")
      .split(/\r?\n/u)
      .filter((line) => line && !line.trimStart().startsWith("#"))
      .map((line) => {
        const separator = line.indexOf("=");
        return separator < 0
          ? ["", ""]
          : [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
      })
      .filter(([key]) => key),
  );
  assert.ok(values.ADMIN_USERNAME);
  assert.ok(values.SESSION_SECRET?.length >= 32);
  const now = Math.floor(Date.now() / 1_000);
  const payload = {
    version: 1,
    subject: values.ADMIN_USERNAME,
    role: "admin",
    issuedAt: now,
    expiresAt: now + 60 * 60,
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
