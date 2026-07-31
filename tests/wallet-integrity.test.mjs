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
  assert.match(adminRoute, /export async function PUT/);
  assert.match(adminRoute, /editAdminWalletRequest/);
  assert.match(adminRoute, /export async function DELETE/);
  assert.match(adminRoute, /processDecision\(request, context, "approve"\)/);
  assert.match(adminRoute, /processDecision\(request, context, "reject"\)/);
  assert.match(service, /wallet_processing_guards/);
  assert.match(service, /wallet_ledger/);
  assert.match(service, /balanceAdjustment/);
  assert.match(service, /expectedUpdatedAt/);
  assert.match(service, /wallet\.request\.edit/);
  assert.match(service, /admin_username, created_at/);
  assert.match(service, /edit\.createdAt/);
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

test("member management exposes editable wallet history down to seconds", async () => {
  const [manager, css] = await Promise.all([
    readFile(
      new URL(
        "../app/adm/(protected)/users/UsersManager.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(new URL("../app/adm/legacy-admin.css", import.meta.url), "utf8"),
  ]);

  assert.match(manager, /충환변경/);
  assert.match(manager, /type="datetime-local"/);
  assert.match(manager, /step=\{1\}/);
  assert.match(manager, /method: "PUT"/);
  assert.match(manager, /expectedUpdatedAt: request\.updatedAt/);
  assert.match(manager, /입금자명/);
  assert.match(manager, /계좌번호/);
  assert.match(css, /\.legacy-member-wallet-card/);
  assert.match(css, /\.legacy-member-wallet-status-approved/);
  assert.match(
    css,
    /div\[role="presentation"\]:has\(\.legacy-member-wallet-editor\) \{[\s\S]*?z-index: 1100/,
  );
  assert.match(
    css,
    /section\[role="dialog"\]:has\(\.legacy-member-wallet-editor\) > header \{[\s\S]*?display: flex !important/,
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

test("approved wallet corrections atomically reconcile points and ledger", () => {
  const database = new DatabaseSync(":memory:");
  database.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      points INTEGER NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE charge_requests (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      amount INTEGER NOT NULL,
      depositor_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'requested',
      admin_memo TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
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
      delta INTEGER NOT NULL CHECK(delta <> 0),
      balance_after INTEGER NOT NULL CHECK(balance_after >= 0),
      admin_username TEXT NOT NULL DEFAULT '',
      UNIQUE(request_type, request_id)
    );
  `);
  database
    .prepare("INSERT INTO users (id, points) VALUES (?, ?)")
    .run("member-1", 10_000_000);
  database
    .prepare(
      `INSERT INTO charge_requests (
         id, user_id, amount, depositor_name, status, created_at, updated_at
       ) VALUES (?, ?, ?, ?, 'approved', ?, ?)`,
    )
    .run(
      "CHG-original",
      "member-1",
      10_000_000,
      "rksk",
      "2026-07-30 12:36:18",
      "revision-1",
    );
  database
    .prepare(
      `INSERT INTO wallet_ledger (
         id, request_type, request_id, user_id, delta, balance_after
       ) VALUES (?, 'charge', ?, ?, ?, ?)`,
    )
    .run(
      "ledger-original",
      "CHG-original",
      "member-1",
      10_000_000,
      10_000_000,
    );

  editCharge({
    currentId: "CHG-original",
    nextId: "CHG-corrected",
    currentAmount: 10_000_000,
    nextAmount: 9_000_000,
    currentStatus: "approved",
    nextStatus: "approved",
    expectedUpdatedAt: "revision-1",
    nextUpdatedAt: "revision-2",
  });
  assert.equal(readPoints(), 9_000_000);
  assert.equal(readLedger("CHG-corrected")?.delta, 9_000_000);
  assert.equal(readLedger("CHG-corrected")?.balance_after, 9_000_000);
  assert.equal(readLedger("CHG-original"), undefined);

  editCharge({
    currentId: "CHG-corrected",
    nextId: "CHG-corrected",
    currentAmount: 9_000_000,
    nextAmount: 9_000_000,
    currentStatus: "approved",
    nextStatus: "rejected",
    expectedUpdatedAt: "revision-2",
    nextUpdatedAt: "revision-3",
  });
  assert.equal(readPoints(), 0);
  assert.equal(readLedger("CHG-corrected"), undefined);

  assert.throws(
    () =>
      editCharge({
        currentId: "CHG-corrected",
        nextId: "CHG-corrected",
        currentAmount: 9_000_000,
        nextAmount: 8_000_000,
        currentStatus: "rejected",
        nextStatus: "approved",
        expectedUpdatedAt: "stale-revision",
        nextUpdatedAt: "revision-4",
      }),
    /constraint/iu,
  );
  assert.equal(readPoints(), 0);
  assert.equal(
    database
      .prepare(
        "SELECT amount FROM charge_requests WHERE id = 'CHG-corrected'",
      )
      .get().amount,
    9_000_000,
  );
  database.close();

  function editCharge({
    currentId,
    nextId,
    currentAmount,
    nextAmount,
    currentStatus,
    nextStatus,
    expectedUpdatedAt,
    nextUpdatedAt,
  }) {
    const currentPoints = readPoints();
    const previousEffect =
      currentStatus === "approved" ? currentAmount : 0;
    const nextEffect = nextStatus === "approved" ? nextAmount : 0;
    const balanceAdjustment = nextEffect - previousEffect;
    const nextPoints = currentPoints + balanceAdjustment;
    const guardId = `edit-${nextUpdatedAt}`;

    database.exec("BEGIN IMMEDIATE");
    try {
      database
        .prepare(
          `UPDATE charge_requests
           SET id = ?, amount = ?, status = ?, updated_at = ?
           WHERE id = ? AND updated_at = ? AND amount = ? AND status = ?`,
        )
        .run(
          nextId,
          nextAmount,
          nextStatus,
          nextUpdatedAt,
          currentId,
          expectedUpdatedAt,
          currentAmount,
          currentStatus,
        );
      database
        .prepare(
          `INSERT INTO wallet_processing_guards (
             request_type, request_id, transition_guard, balance_guard
           ) VALUES ('charge', ?, changes(), 1)`,
        )
        .run(guardId);
      database
        .prepare(
          `DELETE FROM wallet_ledger
           WHERE request_type = 'charge' AND request_id = ?`,
        )
        .run(currentId);
      if (balanceAdjustment !== 0) {
        database
          .prepare(
            `UPDATE users SET points = ?
             WHERE id = 'member-1' AND points = ?`,
          )
          .run(nextPoints, currentPoints);
        database
          .prepare(
            `UPDATE wallet_processing_guards
             SET balance_guard = CASE WHEN changes() = 1 THEN 1 ELSE 0 END
             WHERE request_type = 'charge' AND request_id = ?`,
          )
          .run(guardId);
      }
      if (nextStatus === "approved") {
        database
          .prepare(
            `INSERT INTO wallet_ledger (
               id, request_type, request_id, user_id, delta, balance_after
             ) VALUES (?, 'charge', ?, 'member-1', ?, ?)`,
          )
          .run(`ledger-${nextUpdatedAt}`, nextId, nextEffect, nextPoints);
      }
      database
        .prepare(
          `DELETE FROM wallet_processing_guards
           WHERE request_type = 'charge' AND request_id = ?`,
        )
        .run(guardId);
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }

  function readPoints() {
    return database
      .prepare("SELECT points FROM users WHERE id = 'member-1'")
      .get().points;
  }

  function readLedger(requestId) {
    return database
      .prepare(
        `SELECT delta, balance_after FROM wallet_ledger
         WHERE request_type = 'charge' AND request_id = ?`,
      )
      .get(requestId);
  }
});
