import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const read = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("admin point mutations are authenticated, same-origin, guarded, and auditable", async () => {
  const [route, service, report, page, actions, manager, permissions] =
    await Promise.all([
      read("app/api/admin/points/route.ts"),
      read("lib/admin-points.ts"),
      read("lib/admin-reports.ts"),
      read("app/adm/(protected)/reports/page.tsx"),
      read("app/adm/(protected)/reports/PointLedgerActions.tsx"),
      read("app/adm/(protected)/reports/PointLedgerManager.tsx"),
      read("lib/admin-permissions.ts"),
    ]);

  for (const verb of ["POST", "PATCH", "DELETE"]) {
    assert.match(route, new RegExp(`export async function ${verb}`));
  }
  assert.equal((route.match(/assertSameOrigin\(request\)/gu) ?? []).length, 3);
  assert.equal(
    (route.match(/requireAdminApiSession\(request\)/gu) ?? []).length,
    3,
  );
  assert.match(permissions, /case "points":\s+return "members\.manage"/s);
  assert.match(service, /CREATE TABLE IF NOT EXISTS admin_point_ledger/);
  assert.match(service, /CREATE TABLE IF NOT EXISTS admin_point_write_guards/);
  assert.match(service, /CASE WHEN changes\(\) = 1 THEN 1 ELSE 0 END/);
  assert.match(service, /'point\.create'/);
  assert.match(service, /'point\.update'/);
  assert.match(service, /'point\.delete'/);
  assert.match(service, /deleted_at IS NULL/);
  assert.match(service, /balanceAfter = balanceBefore \+ values\.delta/);
  assert.match(service, /after = before - \(deltaByUser\.get\(userId\)/);
  assert.match(report, /FROM admin_point_ledger entry/);
  assert.match(report, /entry\.deleted_at IS NULL/);
  assert.match(report, /deletable: Boolean\(row\.deletable\)/);
  assert.match(page, /editable: row\.deletable/);
  assert.match(manager, /method: "PATCH"/);
  assert.match(manager, /"수정"/);
  assert.match(manager, /저장 중/);
  assert.match(manager, /type="datetime-local"/);
  assert.match(manager, /step=\{1\}/);
  for (const field of ["mb_id", "po_content", "po_point"]) {
    assert.match(actions, new RegExp(`name="${field}"`));
  }
  assert.doesNotMatch(actions, /po_expire_date|만료일/u);
  assert.doesNotMatch(page, /만료일/u);
  assert.doesNotMatch(manager, /만료일/u);
});

test("admin point guard transactions keep ledger and balance consistent", () => {
  const database = createPointDatabase();
  database
    .prepare(
      "INSERT INTO users (id, login_id, points) VALUES ('u1', 'member1', 100)",
    )
    .run();

  addPoint(database, {
    id: "p1",
    userId: "u1",
    delta: 50,
    expectedPoints: 100,
  });
  assert.equal(readPoints(database, "u1"), 150);
  assert.equal(activePointCount(database), 1);

  assert.throws(
    () =>
      addPoint(database, {
        id: "stale",
        userId: "u1",
        delta: 10,
        expectedPoints: 100,
      }),
    /constraint/iu,
  );
  assert.equal(readPoints(database, "u1"), 150);
  assert.equal(activePointCount(database), 1);

  database.prepare("UPDATE users SET points = 120 WHERE id = 'u1'").run();
  deletePoint(database, {
    id: "p1",
    revision: 1,
    expectedPoints: 120,
    afterPoints: 70,
  });
  assert.equal(readPoints(database, "u1"), 70);
  assert.equal(activePointCount(database), 0);
  assert.throws(
    () =>
      deletePoint(database, {
        id: "p1",
        revision: 1,
        expectedPoints: 70,
        afterPoints: 20,
      }),
    /constraint/iu,
  );
  assert.equal(readPoints(database, "u1"), 70);

  addPoint(database, {
    id: "p2",
    userId: "u1",
    delta: -20,
    expectedPoints: 70,
  });
  assert.equal(readPoints(database, "u1"), 50);
  deletePoint(database, {
    id: "p2",
    revision: 1,
    expectedPoints: 50,
    afterPoints: 70,
  });
  assert.equal(readPoints(database, "u1"), 70);
  database.close();
});

test("editing an issued point entry updates history, later balances, and allows a negative member balance", () => {
  const database = createPointDatabase();
  database
    .prepare(
      "INSERT INTO users (id, login_id, points) VALUES ('u1', 'member1', 200)",
    )
    .run();
  database
    .prepare(
      `INSERT INTO admin_point_ledger (
         id, user_id, delta, balance_before, balance_after, reason, created_at
       ) VALUES
         ('p1', 'u1', 1000000, 0, 1000000, '기존 지급', '2026-07-30 12:00:00'),
         ('p2', 'u1', 500000, 1000000, 1500000, '후속 지급', '2026-07-30 13:00:00')`,
    )
    .run();

  updatePoint(database, {
    id: "p1",
    revision: 1,
    expectedPoints: 200,
    oldDelta: 1000000,
    newDelta: 500000,
    reason: "수정 지급",
    occurredAt: "2026-07-30 12:34:56",
  });

  assert.equal(readPoints(database, "u1"), -499800);
  assert.deepEqual(
    {
      ...database
      .prepare(
        `SELECT delta, balance_before, balance_after, reason, revision,
                created_at
         FROM admin_point_ledger WHERE id = 'p1'`,
      )
      .get(),
    },
    {
      delta: 500000,
      balance_before: 0,
      balance_after: 500000,
      reason: "수정 지급",
      revision: 2,
      created_at: "2026-07-30 12:34:56",
    },
  );
  assert.deepEqual(
    {
      ...database
      .prepare(
        `SELECT balance_before, balance_after, revision
         FROM admin_point_ledger WHERE id = 'p2'`,
      )
      .get(),
    },
    {
      balance_before: 500000,
      balance_after: 1000000,
      revision: 2,
    },
  );
  database.close();
});

test("admin member creation and edits cover core identity fields without leaking passwords", async () => {
  const [
    route,
    detailRoute,
    operations,
    manager,
    mediaRoute,
    mediaService,
    migration,
    adminData,
    groupRoute,
    groupService,
  ] = await Promise.all([
    read("app/api/admin/users/route.ts"),
    read("app/api/admin/users/[id]/route.ts"),
    read("lib/admin-operations.ts"),
    read("app/adm/(protected)/users/UsersManager.tsx"),
    read("app/api/admin/users/media/route.ts"),
    read("lib/admin-media.ts"),
    read("drizzle/0011_member_point_parity.sql"),
    read("lib/admin-data.ts"),
    read("app/api/admin/users/[id]/groups/route.ts"),
    read("lib/admin-member-groups.ts"),
  ]);

  assert.match(route, /export async function POST/);
  assert.match(route, /assertSameOrigin\(request\)/);
  assert.match(route, /requireAdminApiSession\(request\)/);
  assert.match(route, /createAdminMember\(input, session\.username\)/);
  assert.match(detailRoute, /assertSameOrigin\(request\)/);
  assert.match(operations, /await hashCustomerPassword\(values\.password\)/);
  assert.match(operations, /action: "member\.create"/);
  assert.match(operations, /expectedUpdatedAt !== current\.updatedAt/);
  assert.match(operations, /WHERE id = \? AND updated_at = \?/);
  assert.match(operations, /UNIQUE constraint failed:\\s\*users/);
  for (const field of [
    "nickname",
    "telephone",
    "homepage",
    "address3",
    "adminMemo",
    "emailOptIn",
    "smsOptIn",
  ]) {
    assert.match(operations, new RegExp(field));
    assert.match(manager, new RegExp(field));
  }
  for (const field of [
    "identityMethod",
    "identityVerified",
    "emailVerified",
    "adultVerified",
    "publicProfile",
    "signature",
    "profile",
    "verificationHistory",
    "withdrawnAt",
    "blockedAt",
    "memberIcon",
    "memberImage",
    "extra1",
    "extra10",
  ]) {
    assert.match(operations, new RegExp(field));
  }
  assert.match(manager, /id="admin-member-create-form"/);
  assert.match(manager, /name="password"/);
  assert.match(adminData, /await ensureAdminOperationsSchema\(\)/u);
  assert.match(
    adminData,
    /telephone, email_opt_in, sms_opt_in, email_verified,[\s\S]*identity_method/u,
  );
  assert.match(manager, /telephone: member\.telephone/u);
  assert.match(manager, /emailVerified: member\.emailVerified/u);
  assert.match(mediaRoute, /export async function POST/);
  assert.match(mediaRoute, /export async function DELETE/);
  assert.equal(
    (mediaRoute.match(/assertSameOrigin\(request\)/gu) ?? []).length,
    2,
  );
  assert.equal(
    (mediaRoute.match(/requireAdminApiSession\(request\)/gu) ?? []).length,
    2,
  );
  assert.match(mediaRoute, /storeProductImage\(file, \{ purpose: "member" \}\)/);
  assert.match(mediaRoute, /deleteMemberImage\(url\)/);
  assert.match(mediaService, /customMetadata:[\s\S]*purpose/u);
  assert.match(mediaService, /object\.customMetadata\?\.purpose !== "member"/u);
  assert.match(mediaService, /WHERE member_icon = \? OR member_image = \?/u);
  assert.match(groupRoute, /export async function GET/u);
  assert.match(groupRoute, /export async function PUT/u);
  assert.match(groupRoute, /assertSameOrigin\(request\)/u);
  assert.equal(
    (groupRoute.match(/requireAdminApiSession\(request\)/gu) ?? []).length,
    2,
  );
  assert.match(groupService, /CREATE TABLE IF NOT EXISTS member_access_groups/u);
  assert.match(groupService, /member_access_group_state/u);
  assert.match(
    groupService,
    /CASE WHEN changes\(\) = 1 THEN 1 ELSE 0 END/u,
  );
  assert.match(groupService, /'member\.groups\.update'/u);
  assert.match(groupService, /expectedRevision/u);
  for (const column of [
    "telephone",
    "homepage",
    "address3",
    "identity_method",
    "email_verified",
    "member_image",
    "extra10",
  ]) {
    assert.match(migration, new RegExp(`ADD COLUMN \\\`${column}\\\``));
  }
  assert.match(migration, /CREATE TABLE `admin_point_ledger`/u);
  assert.match(migration, /CREATE TABLE `admin_point_write_guards`/u);
  assert.match(migration, /CREATE TABLE `member_access_groups`/u);
  assert.match(migration, /CREATE TABLE `member_access_group_state`/u);
  assert.doesNotMatch(
    operations.slice(
      operations.indexOf("const auditDetails = JSON.stringify", operations.indexOf("createAdminMember")),
      operations.indexOf(
        "const memberInsertColumns",
        operations.indexOf("createAdminMember"),
      ),
    ),
    /passwordHash|values\.password/,
  );
});

test("member and point migration preserves existing users after 0010", async () => {
  const migrations = await Promise.all(
    Array.from({ length: 12 }, (_, index) => {
      const prefix = String(index).padStart(4, "0");
      return readMigration(prefix);
    }),
  );
  const database = new DatabaseSync(":memory:");
  for (const migration of migrations.slice(0, 11)) {
    applyMigration(database, migration);
  }
  database
    .prepare(
      `INSERT INTO users (
         id, login_id, email, password_hash, name, points
       ) VALUES ('legacy-user', 'legacy1', 'legacy@example.invalid',
                 'legacy-hash', '기존 회원', 321)`,
    )
    .run();

  applyMigration(database, migrations[11]);
  const member = database
    .prepare(
      `SELECT name, points, telephone, identity_method, identity_verified,
              email_verified, member_image, extra10
       FROM users WHERE id = 'legacy-user'`,
    )
    .get();
  assert.deepEqual({ ...member }, {
    name: "기존 회원",
    points: 321,
    telephone: "",
    identity_method: "none",
    identity_verified: 0,
    email_verified: 0,
    member_image: "",
    extra10: "",
  });
  assert.ok(
    database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'admin_point_ledger'",
      )
      .get(),
  );
  assert.ok(
    database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'member_access_groups'",
      )
      .get(),
  );
  database.close();
});

test("editable point migration preserves rows and permits signed balances", async () => {
  const database = new DatabaseSync(":memory:");
  database.exec(`
    CREATE TABLE admin_point_ledger (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      delta INTEGER NOT NULL CHECK(delta <> 0),
      balance_before INTEGER NOT NULL CHECK(balance_before >= 0),
      balance_after INTEGER NOT NULL CHECK(balance_after >= 0),
      reason TEXT NOT NULL,
      expires_at TEXT,
      revision INTEGER DEFAULT 1 NOT NULL CHECK(revision >= 1),
      admin_username TEXT DEFAULT '' NOT NULL,
      deleted_at TEXT,
      deleted_by TEXT DEFAULT '' NOT NULL,
      delete_reason TEXT DEFAULT '' NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
      CHECK(balance_after = balance_before + delta)
    );
    CREATE INDEX admin_point_ledger_user_idx
      ON admin_point_ledger(user_id, created_at);
    CREATE INDEX admin_point_ledger_active_idx
      ON admin_point_ledger(deleted_at, created_at);
    INSERT INTO admin_point_ledger (
      id, user_id, delta, balance_before, balance_after, reason, expires_at
    ) VALUES ('legacy-point', 'u1', 100, 0, 100, '기존 지급', '2027-01-01');
  `);
  applyMigration(
    database,
    await read("drizzle/0014_editable_point_ledger.sql"),
  );

  const preserved = database
    .prepare(
      `SELECT delta, balance_before, balance_after, reason, expires_at
       FROM admin_point_ledger WHERE id = 'legacy-point'`,
    )
    .get();
  assert.deepEqual(
    { ...preserved },
    {
      delta: 100,
      balance_before: 0,
      balance_after: 100,
      reason: "기존 지급",
      expires_at: null,
    },
  );
  database
    .prepare(
      `UPDATE admin_point_ledger
       SET delta = -100, balance_before = 0, balance_after = -100
       WHERE id = 'legacy-point'`,
    )
    .run();
  assert.equal(
    database
      .prepare(
        "SELECT balance_after FROM admin_point_ledger WHERE id = 'legacy-point'",
      )
      .get().balance_after,
    -100,
  );
  database.close();
});

function createPointDatabase() {
  const database = new DatabaseSync(":memory:");
  database.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      login_id TEXT NOT NULL UNIQUE,
      points INTEGER NOT NULL
    );
    CREATE TABLE admin_point_ledger (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      delta INTEGER NOT NULL CHECK(delta <> 0),
      balance_before INTEGER NOT NULL,
      balance_after INTEGER NOT NULL,
      reason TEXT NOT NULL,
      expires_at TEXT,
      revision INTEGER NOT NULL DEFAULT 1,
      deleted_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CHECK(balance_after = balance_before + delta)
    );
    CREATE TABLE admin_point_write_guards (
      operation_id TEXT PRIMARY KEY,
      target_id TEXT NOT NULL,
      guard_value INTEGER NOT NULL CHECK(guard_value = 1)
    );
  `);
  return database;
}

async function readMigration(prefix) {
  const candidates = [
    "0000_lame_makkari",
    "0001_sticky_nuke",
    "0002_dapper_doctor_octopus",
    "0003_left_earthquake",
    "0004_wealthy_wonder_man",
    "0005_shop_operation_defaults",
    "0006_admin_accounts",
    "0007_product_stock_controls",
    "0008_coupon_shipping_operations",
    "0009_product_options_restock",
    "0010_clubs_mail_feed",
    "0011_member_point_parity",
  ];
  const tag = candidates.find((candidate) => candidate.startsWith(prefix));
  assert.ok(tag, `migration ${prefix} must exist`);
  return read(`drizzle/${tag}.sql`);
}

function applyMigration(database, migration) {
  for (const statement of migration
    .split(/--> statement-breakpoint\s*/u)
    .map((value) => value.trim())
    .filter(Boolean)) {
    database.exec(statement);
  }
}

function addPoint(database, { id, userId, delta, expectedPoints }) {
  const after = expectedPoints + delta;
  database.exec("BEGIN IMMEDIATE");
  try {
    database
      .prepare(
        "UPDATE users SET points = ? WHERE id = ? AND points = ?",
      )
      .run(after, userId, expectedPoints);
    database
      .prepare(
        `INSERT INTO admin_point_write_guards
         VALUES (?, ?, CASE WHEN changes() = 1 THEN 1 ELSE 0 END)`,
      )
      .run(`add:${id}`, userId);
    database
      .prepare(
        `INSERT INTO admin_point_ledger (
           id, user_id, delta, balance_before, balance_after, reason
         ) VALUES (?, ?, ?, ?, ?, 'QA')`,
      )
      .run(id, userId, delta, expectedPoints, after);
    database
      .prepare(
        "DELETE FROM admin_point_write_guards WHERE operation_id = ?",
      )
      .run(`add:${id}`);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function deletePoint(
  database,
  { id, revision, expectedPoints, afterPoints },
) {
  database.exec("BEGIN IMMEDIATE");
  try {
    database
      .prepare(
        "UPDATE users SET points = ? WHERE id = 'u1' AND points = ?",
      )
      .run(afterPoints, expectedPoints);
    database
      .prepare(
        `INSERT INTO admin_point_write_guards
         VALUES (?, 'u1', CASE WHEN changes() = 1 THEN 1 ELSE 0 END)`,
      )
      .run(`delete-user:${id}`);
    database
      .prepare(
        `UPDATE admin_point_ledger
         SET deleted_at = CURRENT_TIMESTAMP, revision = revision + 1
         WHERE id = ? AND revision = ? AND deleted_at IS NULL`,
      )
      .run(id, revision);
    database
      .prepare(
        `INSERT INTO admin_point_write_guards
         VALUES (?, ?, CASE WHEN changes() = 1 THEN 1 ELSE 0 END)`,
      )
      .run(`delete-entry:${id}`, id);
    database
      .prepare(
        "DELETE FROM admin_point_write_guards WHERE operation_id IN (?, ?)",
      )
      .run(`delete-user:${id}`, `delete-entry:${id}`);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function updatePoint(
  database,
  {
    id,
    revision,
    expectedPoints,
    oldDelta,
    newDelta,
    reason,
    occurredAt,
  },
) {
  const difference = newDelta - oldDelta;
  database.exec("BEGIN IMMEDIATE");
  try {
    database
      .prepare(
        "UPDATE users SET points = ? WHERE id = 'u1' AND points = ?",
      )
      .run(expectedPoints + difference, expectedPoints);
    database
      .prepare(
        `INSERT INTO admin_point_write_guards
         VALUES (?, 'u1', CASE WHEN changes() = 1 THEN 1 ELSE 0 END)`,
      )
      .run(`update-user:${id}`);
    const current = database
      .prepare(
        `SELECT balance_before, created_at
         FROM admin_point_ledger WHERE id = ?`,
      )
      .get(id);
    database
      .prepare(
        `UPDATE admin_point_ledger
         SET balance_before = balance_before + ?,
             balance_after = balance_after + ?,
             revision = revision + 1
         WHERE user_id = 'u1'
           AND id <> ?
           AND deleted_at IS NULL
           AND (
             created_at > ?
             OR (created_at = ? AND id > ?)
           )`,
      )
      .run(
        difference,
        difference,
        id,
        current.created_at,
        current.created_at,
        id,
      );
    database
      .prepare(
        `UPDATE admin_point_ledger
         SET delta = ?, balance_after = ?, reason = ?, expires_at = NULL,
             created_at = ?, revision = revision + 1
         WHERE id = ? AND revision = ? AND deleted_at IS NULL`,
      )
      .run(
        newDelta,
        current.balance_before + newDelta,
        reason,
        occurredAt,
        id,
        revision,
      );
    database
      .prepare(
        `INSERT INTO admin_point_write_guards
         VALUES (?, ?, CASE WHEN changes() = 1 THEN 1 ELSE 0 END)`,
      )
      .run(`update-entry:${id}`, id);
    database
      .prepare(
        "DELETE FROM admin_point_write_guards WHERE operation_id IN (?, ?)",
      )
      .run(`update-user:${id}`, `update-entry:${id}`);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function readPoints(database, userId) {
  return database
    .prepare("SELECT points FROM users WHERE id = ?")
    .get(userId).points;
}

function activePointCount(database) {
  return database
    .prepare(
      "SELECT COUNT(*) AS count FROM admin_point_ledger WHERE deleted_at IS NULL",
    )
    .get().count;
}
