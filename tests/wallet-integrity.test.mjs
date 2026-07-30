import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const walletFiles = [
  "app/bbs/writecz.php/page.tsx",
  "app/bbs/cashtx.php/page.tsx",
  "app/bbs/withdrawal_list.php/page.tsx",
  "app/adm/(protected)/wallet/page.tsx",
  "app/api/customer/wallet/route.ts",
  "app/api/admin/wallet/requests/route.ts",
  "app/api/admin/wallet/requests/[id]/route.ts",
  "app/components/WalletClients.tsx",
  "lib/wallet.ts",
];

test("includes the independent charge and withdrawal surfaces", async () => {
  await Promise.all(
    walletFiles.map((file) => access(new URL(`../${file}`, import.meta.url))),
  );

  const sources = await Promise.all(
    walletFiles.map((file) =>
      readFile(new URL(`../${file}`, import.meta.url), "utf8"),
    ),
  );
  for (const source of sources) {
    assert.doesNotMatch(source, /kiel-gold\.com/iu);
    assert.doesNotMatch(source, /https?:\/\/[^"'\s]+/iu);
  }
});

test("protects wallet mutations and records a single atomic balance change", async () => {
  const [customerRoute, adminRoute, service, schema, migration] =
    await Promise.all([
      readFile(
        new URL("../app/api/customer/wallet/route.ts", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL(
          "../app/api/admin/wallet/requests/[id]/route.ts",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(new URL("../lib/wallet.ts", import.meta.url), "utf8"),
      readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
      readFile(
        new URL("../drizzle/0003_left_earthquake.sql", import.meta.url),
        "utf8",
      ),
    ]);

  assert.match(customerRoute, /getCustomerSession/);
  assert.match(customerRoute, /if \(!session\)/);
  assert.match(customerRoute, /isSameOrigin/);
  assert.match(adminRoute, /requireAdminApiSession/);
  assert.match(adminRoute, /assertSameOrigin/);
  assert.match(adminRoute, /export async function DELETE/);
  assert.match(adminRoute, /processDecision\(request, context, "approve"\)/);
  assert.match(adminRoute, /processDecision\(request, context, "reject"\)/);
  assert.match(service, /wallet_processing_guards/);
  assert.match(service, /wallet_ledger/);
  assert.match(service, /database\.batch/);
  assert.match(schema, /walletRequestRateLimits/);
  assert.match(schema, /walletProcessingGuards/);
  assert.match(schema, /walletLedger/);
  assert.match(migration, /CREATE TABLE `wallet_processing_guards`/);
  assert.match(migration, /CREATE TABLE `wallet_ledger`/);
});

test("administrator wallet lists keep the legacy table, search, and action geometry", async () => {
  const [manager, css, contract] = await Promise.all([
    readFile(
      new URL(
        "../app/adm/(protected)/wallet/WalletRequestsManager.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(new URL("../app/adm/legacy-admin.css", import.meta.url), "utf8"),
    readFile(new URL("../lib/wallet-contract.ts", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(manager, /AdminPanel|AdminInput|AdminSelect/);
  assert.match(manager, /회원ID/);
  assert.match(manager, /포인트합/);
  assert.match(manager, /출금완료/);
  assert.match(manager, /출금취소/);
  assert.match(manager, /method: decision === "approve" \? "PATCH" : "DELETE"/);
  assert.match(manager, /자료가 없습니다\./);
  assert.match(contract, /memberNickname: string/);
  assert.match(contract, /memberPoints: number/);

  assert.match(css, /\.legacy-wallet-manager \{[\s\S]*?width: 1005px/);
  assert.match(css, /\.legacy-wallet-charge \{[\s\S]*?margin-bottom: 20px/);
  assert.match(
    css,
    /\.legacy-wallet-withdrawal \{[\s\S]*?margin-bottom: 10px/,
  );
  assert.match(
    css,
    /\.legacy-wallet-charge \.legacy-wallet-search select \{[\s\S]*?width: 82px/,
  );
  assert.match(
    css,
    /\.legacy-wallet-withdrawal \.legacy-wallet-search select \{[\s\S]*?width: 58px/,
  );
  assert.match(css, /\.legacy-wallet-table thead tr,[\s\S]*?height: 32px/);
  assert.match(css, /\.legacy-wallet-col-member \{[\s\S]*?145\.0625px/);
  assert.match(
    css,
    /\.legacy-wallet-col-withdraw-manage \{[\s\S]*?81\.109375px/,
  );
});

test("SQLite guards roll back duplicate and insufficient balance approvals", () => {
  const database = new DatabaseSync(":memory:");
  database.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      points INTEGER NOT NULL,
      active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE charge_requests (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      amount INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'requested',
      admin_memo TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE withdrawal_requests (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      amount INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'requested',
      admin_memo TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE wallet_processing_guards (
      request_type TEXT NOT NULL,
      request_id TEXT NOT NULL,
      transition_guard INTEGER NOT NULL CHECK(transition_guard = 1),
      balance_guard INTEGER NOT NULL CHECK(balance_guard = 1),
      PRIMARY KEY (request_type, request_id)
    );
    CREATE TABLE wallet_ledger (
      id TEXT PRIMARY KEY,
      request_type TEXT NOT NULL,
      request_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      delta INTEGER NOT NULL,
      balance_after INTEGER NOT NULL CHECK(balance_after >= 0),
      UNIQUE(request_type, request_id)
    );
  `);
  database.prepare("INSERT INTO users (id, points) VALUES (?, ?)").run(
    "member-1",
    2_000,
  );
  database
    .prepare(
      "INSERT INTO charge_requests (id, user_id, amount) VALUES (?, ?, ?)",
    )
    .run("charge-1", "member-1", 3_000);
  database
    .prepare(
      "INSERT INTO withdrawal_requests (id, user_id, amount) VALUES (?, ?, ?)",
    )
    .run("withdrawal-1", "member-1", 8_000);

  approve("charge", "charge-1", "member-1", 3_000);
  assert.equal(readPoints(), 5_000);
  assert.throws(
    () => approve("charge", "charge-1", "member-1", 3_000),
    /constraint|unique/iu,
  );
  assert.equal(readPoints(), 5_000);
  assert.equal(readLedgerCount("charge", "charge-1"), 1);

  assert.throws(
    () => approve("withdrawal", "withdrawal-1", "member-1", 8_000),
    /constraint/iu,
  );
  assert.equal(readPoints(), 5_000);
  assert.equal(
    database
      .prepare("SELECT status FROM withdrawal_requests WHERE id = ?")
      .get("withdrawal-1").status,
    "requested",
  );
  assert.equal(readLedgerCount("withdrawal", "withdrawal-1"), 0);

  database.prepare("UPDATE users SET points = 10_000 WHERE id = ?").run(
    "member-1",
  );
  approve("withdrawal", "withdrawal-1", "member-1", 8_000);
  assert.equal(readPoints(), 2_000);
  assert.equal(readLedgerCount("withdrawal", "withdrawal-1"), 1);
  database.close();

  function approve(kind, requestId, userId, amount) {
    const table =
      kind === "charge" ? "charge_requests" : "withdrawal_requests";
    const delta = kind === "charge" ? amount : -amount;
    database.exec("BEGIN IMMEDIATE");
    try {
      database
        .prepare(
          `UPDATE ${table}
           SET status = 'approved', updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND status = 'requested'`,
        )
        .run(requestId);
      database
        .prepare(
          `INSERT INTO wallet_processing_guards (
             request_type, request_id, transition_guard, balance_guard
           ) VALUES (?, ?, changes(), 1)`,
        )
        .run(kind, requestId);
      if (kind === "charge") {
        database
          .prepare(
            "UPDATE users SET points = points + ? WHERE id = ? AND active = 1",
          )
          .run(amount, userId);
      } else {
        database
          .prepare(
            `UPDATE users SET points = points - ?
             WHERE id = ? AND active = 1 AND points >= ?`,
          )
          .run(amount, userId, amount);
      }
      database
        .prepare(
          `UPDATE wallet_processing_guards
           SET balance_guard = CASE WHEN changes() = 1 THEN 1 ELSE 0 END
           WHERE request_type = ? AND request_id = ?`,
        )
        .run(kind, requestId);
      database
        .prepare(
          `INSERT INTO wallet_ledger (
             id, request_type, request_id, user_id, delta, balance_after
           )
           SELECT ?, ?, ?, id, ?, points FROM users WHERE id = ?`,
        )
        .run(
          `${kind}-${requestId}`,
          kind,
          requestId,
          delta,
          userId,
        );
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }

  function readPoints() {
    return database
      .prepare("SELECT points FROM users WHERE id = ?")
      .get("member-1").points;
  }

  function readLedgerCount(kind, requestId) {
    return database
      .prepare(
        `SELECT COUNT(*) AS total FROM wallet_ledger
         WHERE request_type = ? AND request_id = ?`,
      )
      .get(kind, requestId).total;
  }
});
