import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const guardedStockUpsert = `
  INSERT INTO product_stock (product_id, stock)
  VALUES (
    ?,
    CASE
      WHEN COALESCE(
        (SELECT stock FROM product_stock WHERE product_id = ?),
        ?
      ) = ?
      THEN ?
      ELSE NULL
    END
  )
  ON CONFLICT(product_id) DO UPDATE SET
    stock = excluded.stock,
    updated_at = CURRENT_TIMESTAMP
`;

const createOnlyProductUpsert = `
  INSERT INTO product_changes (
    product_id, change_type, payload_json, revision, updated_by
  ) VALUES (?, ?, ?, 1, ?)
  ON CONFLICT(product_id) DO UPDATE SET
    change_type = NULL,
    payload_json = excluded.payload_json,
    revision = product_changes.revision + 1,
    updated_by = excluded.updated_by
`;

test("atomically rejects concurrent creation of the same product code", () => {
  const database = new DatabaseSync(":memory:");
  database.exec(`
    CREATE TABLE product_changes (
      product_id TEXT PRIMARY KEY,
      change_type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 1,
      updated_by TEXT NOT NULL
    );
  `);
  const create = database.prepare(createOnlyProductUpsert);

  create.run("same-sku", "created", '{"name":"first"}', "admin");
  assert.throws(
    () => create.run("same-sku", "created", '{"name":"second"}', "admin"),
    /constraint|not null/iu,
  );
  assert.equal(
    database
      .prepare(
        "SELECT payload_json FROM product_changes WHERE product_id = ?",
      )
      .get("same-sku").payload_json,
    '{"name":"first"}',
  );

  database
    .prepare(
      "UPDATE product_changes SET change_type = 'deleted' WHERE product_id = ?",
    )
    .run("same-sku");
  assert.throws(
    () => create.run("same-sku", "created", '{"name":"restored"}', "admin"),
    /constraint|not null/iu,
  );
  assert.equal(
    database
      .prepare(
        "SELECT change_type FROM product_changes WHERE product_id = ?",
      )
      .get("same-sku").change_type,
    "deleted",
  );
  database.close();
});

test("rejects a stale admin stock overwrite after an order changes inventory", () => {
  const database = new DatabaseSync(":memory:");
  database.exec(`
    CREATE TABLE product_changes (
      product_id TEXT PRIMARY KEY,
      payload_json TEXT NOT NULL
    );
    CREATE TABLE product_stock (
      product_id TEXT PRIMARY KEY,
      stock INTEGER NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO product_stock (product_id, stock) VALUES ('product-1', 10);
  `);

  const managerExpectedStock = 10;
  database
    .prepare(
      "UPDATE product_stock SET stock = stock - 1 WHERE product_id = ? AND stock > 0",
    )
    .run("product-1");

  assert.throws(
    () => saveProduct(managerExpectedStock, 12),
    /constraint|not null/iu,
  );
  assert.equal(readStock(), 9);
  assert.equal(
    database
      .prepare(
        "SELECT COUNT(*) AS count FROM product_changes WHERE product_id = ?",
      )
      .get("product-1").count,
    0,
  );

  saveProduct(9, 12);
  assert.equal(readStock(), 12);
  assert.equal(
    database
      .prepare(
        "SELECT COUNT(*) AS count FROM product_changes WHERE product_id = ?",
      )
      .get("product-1").count,
    1,
  );
  database.close();

  function saveProduct(expectedStock, newStock) {
    database.exec("BEGIN IMMEDIATE");
    try {
      database
        .prepare(
          `INSERT INTO product_changes (product_id, payload_json)
           VALUES (?, ?)
           ON CONFLICT(product_id) DO UPDATE SET
             payload_json = excluded.payload_json`,
        )
        .run("product-1", JSON.stringify({ stock: newStock }));
      database
        .prepare(guardedStockUpsert)
        .run(
          "product-1",
          "product-1",
          expectedStock,
          expectedStock,
          newStock,
        );
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }

  function readStock() {
    return database
      .prepare("SELECT stock FROM product_stock WHERE product_id = ?")
      .get("product-1").stock;
  }
});

test("product editing sends and verifies the stock snapshot", async () => {
  const [service, editor] = await Promise.all([
    readFile(
      new URL("../lib/admin-products.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(
        "../app/adm/(protected)/products/ProductEditor.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);

  assert.match(service, /const expectedStock = body\.expectedStock/);
  assert.match(service, /expectedStock !== current\.stock/);
  assert.match(service, /SELECT stock FROM product_stock WHERE product_id = \?/);
  assert.match(service, /ELSE NULL/);
  assert.match(service, /change_type = NULL/);
  assert.match(service, /createOnly/);
  assert.doesNotMatch(
    service,
    /DELETE FROM product_stock WHERE product_id = \?/,
  );
  assert.match(editor, /setExpectedStock\(payload\.product\.stock\)/);
  assert.match(
    editor,
    /\{\s*\.\.\.product,\s*expectedStock,\s*expectedRevision\s*\}/,
  );
  assert.match(service, /AND revision = \?/);
  assert.match(service, /AND change_type <> 'deleted'/);
});

test("dedicated stock manager preserves the legacy inventory workflow", async () => {
  const [page, manager, service, route, catalog, orderRoute] =
    await Promise.all([
      readFile(
        new URL(
          "../app/adm/(protected)/products/page.tsx",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../app/adm/(protected)/products/ProductStockManager.tsx",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL("../lib/admin-product-stock.ts", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL(
          "../app/api/admin/products/stock/route.ts",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(new URL("../lib/catalog.tsx", import.meta.url), "utf8"),
      readFile(
        new URL("../app/api/orders/route.ts", import.meta.url),
        "utf8",
      ),
    ]);

  assert.match(page, /requestedView === "stock"/);
  assert.match(page, /<ProductStockManager/);
  assert.doesNotMatch(page, /stockMode=\{/);
  for (const label of [
    "상품코드",
    "상품명",
    "창고재고",
    "주문대기",
    "가재고",
    "재고수정",
    "통보수량",
    "판매",
    "품절",
    "재입고 알림",
    "관리",
    "일괄수정",
  ]) {
    assert.match(manager, new RegExp(label));
  }
  assert.match(manager, /<Image/);
  assert.match(service, /product\.stock - pendingStock/);
  assert.match(
    service,
    /o\.status IN \('ordered', 'payment_confirmed', 'preparing'\)/,
  );
  assert.match(service, /expectedControlRevision/);
  assert.match(service, /product_stock_write_guards/);
  assert.match(route, /assertSameOrigin\(request\)/);
  assert.match(route, /requireAdminApiSession\(request\)/);
  assert.match(route, /readAdminJson\(request, 150_000\)/);
  assert.match(catalog, /Boolean\(product\.soldOut\) \|\| product\.stock <= 0/);
  assert.match(orderRoute, /product\.soldOut/);
});

test("legacy stock baseline contains every catalog product exactly once", async () => {
  const [baseline, catalog] = await Promise.all([
    readFile(
      new URL("../data/legacy-stock-baseline.json", import.meta.url),
      "utf8",
    ).then(JSON.parse),
    readFile(new URL("../data/catalog.json", import.meta.url), "utf8").then(
      JSON.parse,
    ),
  ]);
  const baselineIds = baseline.map((row) => String(row.code));
  const catalogIds = catalog.products.map((product) => String(product.id));
  const catalogIdSet = new Set(catalogIds);

  assert.equal(baselineIds.length, 274);
  assert.equal(new Set(baselineIds).size, 274);
  assert.equal(catalogIds.length, 274);
  assert.deepEqual(
    baselineIds.filter((id) => !catalogIdSet.has(id)),
    [],
  );
  assert.notDeepEqual(
    baselineIds,
    catalogIds,
    "the stock service must actively apply the captured source order",
  );
});

test("stock rows honor source order and keep warehouse display read-only", async () => {
  const [baseline, service, manager] = await Promise.all([
    readFile(
      new URL("../data/legacy-stock-baseline.json", import.meta.url),
      "utf8",
    ).then(JSON.parse),
    readFile(
      new URL("../lib/admin-product-stock.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(
        "../app/adm/(protected)/products/ProductStockManager.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);

  assert.ok(
    baseline.some(
      (row) =>
        Number(String(row.warehouseDisplay).replaceAll(",", "")) !==
        Number(row.stockInput),
    ),
    "the fixture must distinguish warehouse display from editable stock",
  );
  assert.match(
    service,
    /legacyStockBaselineSource\.map\(\(row, index\) => \[String\(row\.code\), index\]\)/,
  );
  assert.match(
    service,
    /const leftOrder = legacyStockOrder\.get\(left\.id\);[\s\S]*const rightOrder = legacyStockOrder\.get\(right\.id\);[\s\S]*return leftOrder - rightOrder;/,
  );
  assert.match(
    service,
    /warehouseStock:\s*legacyWarehouseStock\.get\(product\.id\) \?\? product\.stock,/,
  );
  assert.match(service, /stockQuantity:\s*product\.stock,/);
  assert.match(manager, /stock:\s*row\.stockQuantity,/);
  assert.match(manager, /expectedStock:\s*row\.stockQuantity,/);
  assert.match(
    manager,
    /\{row\.warehouseStock\.toLocaleString\("ko-KR"\)\}/,
  );
  assert.match(manager, /value=\{draft\.stock\}/);
  assert.doesNotMatch(manager, /stock:\s*row\.warehouseStock/);
  assert.doesNotMatch(manager, /value=\{row\.warehouseStock\}/);
});

test("product option reads stay below the D1 bind-parameter limit", async () => {
  const source = await readFile(
    new URL("../lib/product-options.ts", import.meta.url),
    "utf8",
  );
  const chunkSizeMatch = source.match(/const bindChunkSize = (\d+);/);
  assert.ok(chunkSizeMatch, "product option reads must declare a chunk size");
  const chunkSize = Number(chunkSizeMatch[1]);
  const d1BindParameterLimit = 100;
  const fixtureIds = Array.from({ length: 274 }, (_, index) => `p-${index}`);
  const chunks = [];
  for (let offset = 0; offset < fixtureIds.length; offset += chunkSize) {
    chunks.push(fixtureIds.slice(offset, offset + chunkSize));
  }

  assert.ok(chunkSize > 0);
  assert.ok(chunkSize < d1BindParameterLimit);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => chunk.length < d1BindParameterLimit));
  assert.deepEqual(chunks.flat(), fixtureIds);
  assert.match(
    source,
    /for \(let offset = 0; offset < uniqueIds\.length; offset \+= bindChunkSize\)/,
  );
  assert.match(
    source,
    /const idChunk = uniqueIds\.slice\(offset, offset \+ bindChunkSize\)/,
  );
  assert.match(source, /const placeholders = idChunk\.map\(\(\) => "\?"\)/);
  assert.match(source, /\.bind\(\.\.\.idChunk\)\s*\.all<StoredOptionRow>\(\)/);
});

test("legacy stock pagination exposes ten pages plus next and end controls", async () => {
  const [baseline, manager] = await Promise.all([
    readFile(
      new URL("../data/legacy-stock-baseline.json", import.meta.url),
      "utf8",
    ).then(JSON.parse),
    readFile(
      new URL(
        "../app/adm/(protected)/products/ProductStockManager.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);
  const pageSizeMatch = manager.match(/const PAGE_SIZE = (\d+);/);
  assert.ok(pageSizeMatch, "stock pagination must declare its row count");
  const pageSize = Number(pageSizeMatch[1]);
  const totalPages = Math.ceil(baseline.length / pageSize);
  const pageWindowStart = 1;
  const pageWindowEnd = Math.min(totalPages, pageWindowStart + 9);
  const pageNumbers = Array.from(
    { length: pageWindowEnd - pageWindowStart + 1 },
    (_, index) => pageWindowStart + index,
  );

  assert.equal(baseline.length, 274);
  assert.equal(pageSize, 15);
  assert.equal(totalPages, 19);
  assert.deepEqual(pageNumbers, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(pageWindowEnd < totalPages, true);
  assert.match(
    manager,
    /const pageWindowStart = Math\.floor\(\(safePage - 1\) \/ 10\) \* 10 \+ 1;/,
  );
  assert.match(
    manager,
    /const pageWindowEnd = Math\.min\(totalPages, pageWindowStart \+ 9\);/,
  );
  assert.match(manager, /\{pageNumbers\.map\(\(pageNumber\) =>/);
  assert.match(
    manager,
    /\{pageWindowEnd < totalPages \? \([\s\S]*className="pg_page pg_next"[\s\S]*setPage\(pageWindowEnd \+ 1\);[\s\S]*className="pg_page pg_end"[\s\S]*setPage\(totalPages\);/,
  );
});

test("stock batch rolls every row back when an order makes one snapshot stale", () => {
  const database = new DatabaseSync(":memory:");
  database.exec(`
    CREATE TABLE product_changes (
      product_id TEXT PRIMARY KEY,
      change_type TEXT NOT NULL
    );
    CREATE TABLE product_stock (
      product_id TEXT PRIMARY KEY,
      stock INTEGER NOT NULL CHECK(stock >= 0),
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE product_stock_controls (
      product_id TEXT PRIMARY KEY,
      notification_qty INTEGER NOT NULL DEFAULT 0,
      sale_enabled INTEGER NOT NULL DEFAULT 1,
      sold_out INTEGER NOT NULL DEFAULT 0,
      restock_notification INTEGER NOT NULL DEFAULT 0,
      revision INTEGER NOT NULL DEFAULT 1,
      updated_by TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE product_stock_write_guards (
      product_id TEXT PRIMARY KEY,
      guard_value INTEGER NOT NULL CHECK(guard_value = 1),
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO product_stock (product_id, stock)
    VALUES ('product-1', 10), ('product-2', 20);
    INSERT INTO product_stock_controls (product_id, revision)
    VALUES ('product-1', 1), ('product-2', 1);
  `);

  database
    .prepare(
      "UPDATE product_stock SET stock = stock - 1 WHERE product_id = 'product-2'",
    )
    .run();

  assert.throws(() => {
    database.exec("BEGIN IMMEDIATE");
    try {
      writeStockRow(database, {
        id: "product-1",
        expectedStock: 10,
        stock: 12,
        expectedControlRevision: 1,
        notificationQuantity: 3,
      });
      writeStockRow(database, {
        id: "product-2",
        expectedStock: 20,
        stock: 22,
        expectedControlRevision: 1,
        notificationQuantity: 4,
      });
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }, /constraint|not null/iu);

  assert.deepEqual(readStockState(database, "product-1"), {
    stock: 10,
    notification_qty: 0,
    revision: 1,
  });
  assert.deepEqual(readStockState(database, "product-2"), {
    stock: 19,
    notification_qty: 0,
    revision: 1,
  });

  database.exec("BEGIN IMMEDIATE");
  writeStockRow(database, {
    id: "product-1",
    expectedStock: 10,
    stock: 12,
    expectedControlRevision: 1,
    notificationQuantity: 3,
  });
  writeStockRow(database, {
    id: "product-2",
    expectedStock: 19,
    stock: 22,
    expectedControlRevision: 1,
    notificationQuantity: 4,
  });
  database.exec("COMMIT");
  assert.deepEqual(readStockState(database, "product-1"), {
    stock: 12,
    notification_qty: 3,
    revision: 2,
  });
  assert.deepEqual(readStockState(database, "product-2"), {
    stock: 22,
    notification_qty: 4,
    revision: 2,
  });
  database.close();
});

test("keeps order lookup credentials out of browser and network URLs", async () => {
  const [client, lookupRoute, inquiryPage, ordersRoute] = await Promise.all([
    readFile(
      new URL("../app/components/CommerceClients.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/api/orders/lookup/route.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/shop/orderinquiry.php/page.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/api/orders/route.ts", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(client, /#token=\$\{encodeURIComponent\(result\.lookupToken\)\}/);
  assert.match(client, /fetch\("\/api\/orders\/lookup"/);
  assert.match(client, /method:\s*"POST"/);
  assert.match(client, /window\.history\.replaceState/);
  assert.doesNotMatch(client, /fetch\(`\/api\/orders\?\$\{/);
  assert.doesNotMatch(inquiryPage, /params\.token/);
  assert.match(lookupRoute, /MAX_LOOKUP_BODY_BYTES/);
  assert.match(lookupRoute, /readBoundedJson/);
  assert.match(lookupRoute, /isSameOrigin\(request\)/);
  assert.doesNotMatch(lookupRoute, /request\.text\(\)/);
  assert.match(lookupRoute, /lookupOrder/);
  assert.doesNotMatch(ordersRoute, /export async function GET/);
  assert.doesNotMatch(ordersRoute, /searchParams\.get\("token"\)/);
});

function writeStockRow(
  database,
  {
    id,
    expectedStock,
    stock,
    expectedControlRevision,
    notificationQuantity,
  },
) {
  database
    .prepare(
      `INSERT INTO product_stock (product_id, stock, updated_at)
       SELECT ?, ?, CURRENT_TIMESTAMP
       WHERE COALESCE(
               (SELECT stock FROM product_stock WHERE product_id = ?),
               ?
             ) = ?
         AND NOT EXISTS (
           SELECT 1 FROM product_changes
           WHERE product_id = ? AND change_type = 'deleted'
         )
       ON CONFLICT(product_id) DO UPDATE SET
         stock = excluded.stock,
         updated_at = CURRENT_TIMESTAMP`,
    )
    .run(id, stock, id, expectedStock, expectedStock, id);
  database
    .prepare(
      `UPDATE product_stock_controls
       SET notification_qty = ?,
           sale_enabled = 1,
           sold_out = 0,
           restock_notification = 1,
           revision = revision + 1,
           updated_by = 'admin',
           updated_at = CURRENT_TIMESTAMP
       WHERE product_id = ?
         AND revision = ?
         AND changes() = 1`,
    )
    .run(notificationQuantity, id, expectedControlRevision);
  database
    .prepare(
      `INSERT INTO product_stock_write_guards (
         product_id, guard_value, updated_at
       ) VALUES (
         ?,
         CASE WHEN changes() = 1 THEN 1 ELSE NULL END,
         CURRENT_TIMESTAMP
       )
       ON CONFLICT(product_id) DO UPDATE SET
         guard_value = excluded.guard_value,
         updated_at = CURRENT_TIMESTAMP`,
    )
    .run(id);
}

function readStockState(database, id) {
  const row = database
    .prepare(
      `SELECT stock, notification_qty, revision
       FROM product_stock
       INNER JOIN product_stock_controls USING (product_id)
       WHERE product_id = ?`,
    )
    .get(id);
  return row ? { ...row } : undefined;
}
