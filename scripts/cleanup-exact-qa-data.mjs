import assert from "node:assert/strict";
import { existsSync, readdirSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const apply = process.argv.includes("--apply");
const databaseDirectory = resolve(
  process.cwd(),
  ".wrangler/state/v3/d1/miniflare-D1DatabaseObject",
);
const databaseFile = readdirSync(databaseDirectory)
  .filter((name) => name.endsWith(".sqlite") && name !== "metadata.sqlite")
  .map((name) => join(databaseDirectory, name))
  .find(Boolean);
assert.ok(databaseFile, "로컬 D1 파일을 찾을 수 없습니다.");
assert.ok(resolve(databaseFile).startsWith(databaseDirectory));

const exactNeedles = [
  "3385402a-974b-42ed-97f7-57a1b0651847",
  "KG202607281320141NEGPR",
  "87fa3dbd2cc84648a9713644a34d766d.png",
  "products/87fa3dbd2cc84648a9713644a34d766d.png",
];
const qaPrefixes = [
  "QAADM_PASS1_08ddc174e3_",
  "QAADM_PASS2B_2732f9a8d2_",
  "QAADM_R1_0b7364c0d1_",
];
const matchPatterns = [
  ...qaPrefixes.map((prefix) => `%${prefix}%`),
  ...exactNeedles.map((value) => `%${value}%`),
];
const database = new DatabaseSync(databaseFile);
const tables = database
  .prepare(
    `SELECT name FROM sqlite_master
     WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
     ORDER BY name`,
  )
  .all()
  .map((row) => row.name);

const before = scan(matchPatterns);
const broadBefore = scan(["%QAADM%"]);
console.log(JSON.stringify({ phase: "before", exact: before, qaadm: broadBefore }));

if (apply) {
  const preferredOrder = [
    "order_point_reversals",
    "order_point_credits",
    "order_point_debits",
    "order_inventory_adjustments",
    "order_requests",
    "order_payment_details",
    "order_catalog_guards",
    "order_items",
    "admin_order_delete_stock_guards",
    "admin_order_delete_guards",
    "wallet_ledger",
    "wallet_processing_guards",
    "wallet_request_rate_limits",
    "charge_requests",
    "withdrawal_requests",
    "product_interaction_rate_limits",
    "product_interactions",
    "questions",
    "reviews",
    "wishlist_items",
    "cart_items",
    "password_reset_tokens",
    "user_sessions",
    "user_session_state",
    "auth_rate_limits",
    "order_rate_limits",
    "orders",
    "product_stock",
    "product_changes",
    "banner_changes",
    "category_changes",
    "media_assets",
    "admin_audit_logs",
    "users",
  ];
  const orderedTables = [
    ...preferredOrder.filter((table) => tables.includes(table)),
    ...tables.filter((table) => !preferredOrder.includes(table)),
  ];

  database.exec("BEGIN IMMEDIATE");
  try {
    for (const table of orderedTables) {
      const columns = textColumns(table);
      if (columns.length === 0) continue;
      const { where, bindings } = buildWhere(columns, matchPatterns);
      database.prepare(`DELETE FROM ${quote(table)} WHERE ${where}`).run(
        ...bindings,
      );
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
  cleanupExactR2Object();
}

const after = scan(matchPatterns);
const broadAfter = scan(["%QAADM%"]);
console.log(JSON.stringify({ phase: "after", exact: after, qaadm: broadAfter }));
database.close();

function scan(patterns) {
  const matches = [];
  for (const table of tables) {
    const columns = textColumns(table);
    if (columns.length === 0) continue;
    const { where, bindings } = buildWhere(columns, patterns);
    const row = database
      .prepare(`SELECT COUNT(*) AS count FROM ${quote(table)} WHERE ${where}`)
      .get(...bindings);
    const count = Number(row?.count ?? 0);
    if (count > 0) matches.push({ table, count });
  }
  return matches;
}

function textColumns(table) {
  return database
    .prepare(`PRAGMA table_info(${quote(table)})`)
    .all()
    .filter((column) => /TEXT|CHAR|CLOB|JSON/iu.test(column.type || ""))
    .map((column) => column.name);
}

function buildWhere(columns, patterns) {
  const clauses = [];
  const bindings = [];
  for (const column of columns) {
    for (const pattern of patterns) {
      clauses.push(`${quote(column)} LIKE ? ESCAPE '\\'`);
      bindings.push(pattern);
    }
  }
  return { where: `(${clauses.join(" OR ")})`, bindings };
}

function quote(identifier) {
  assert.match(identifier, /^[A-Za-z_][A-Za-z0-9_]*$/u);
  return `"${identifier}"`;
}

function cleanupExactR2Object() {
  const objectKey = "products/87fa3dbd2cc84648a9713644a34d766d.png";
  const r2Directory = resolve(
    process.cwd(),
    ".wrangler/state/v3/r2/miniflare-R2BucketObject",
  );
  const r2DatabaseFile = readdirSync(r2Directory)
    .filter((name) => name.endsWith(".sqlite") && name !== "metadata.sqlite")
    .map((name) => join(r2Directory, name))
    .find(Boolean);
  if (!r2DatabaseFile) return;
  const r2 = new DatabaseSync(r2DatabaseFile);
  const object = r2
    .prepare(
      `SELECT key, blob_id, size, custom_metadata
       FROM _mf_objects WHERE key = ?`,
    )
    .get(objectKey);
  if (!object) {
    r2.close();
    return;
  }
  assert.equal(object.key, objectKey);
  assert.equal(Number(object.size), 46_934);
  assert.match(String(object.custom_metadata), /store-logo\.png/u);
  assert.match(String(object.blob_id), /^[a-f0-9]+$/u);
  r2.prepare("DELETE FROM _mf_objects WHERE key = ?").run(objectKey);
  r2.close();

  const blobDirectory = resolve(
    process.cwd(),
    ".wrangler/state/v3/r2/site-creator-r2/blobs",
  );
  const blobPath = resolve(blobDirectory, String(object.blob_id));
  assert.ok(blobPath.startsWith(`${blobDirectory}\\`));
  if (existsSync(blobPath)) unlinkSync(blobPath);
}
