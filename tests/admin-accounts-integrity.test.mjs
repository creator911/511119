import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  hashAdminPassword,
  verifyPbkdf2Password,
} from "../lib/admin-password.ts";
import {
  hasAdminPermission,
  normalizeAdminPermissions,
  requiredAdminApiPermission,
} from "../lib/admin-permissions.ts";

const source = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("admin password hashes use bounded PBKDF2-SHA-256 records", async () => {
  const password = "correct horse battery staple";
  const encoded = await hashAdminPassword(password);

  assert.match(
    encoded,
    /^pbkdf2-sha256\$100000\$[0-9a-f]{32}\$[0-9a-f]{64}$/u,
  );
  assert.equal(await verifyPbkdf2Password(password, encoded), true);
  assert.equal(await verifyPbkdf2Password(`${password}!`, encoded), false);
  assert.equal(await verifyPbkdf2Password(password, "not-a-hash"), false);
});

test("admin migration preserves rows and revokes sessions on sensitive changes", async () => {
  const migration = await source("drizzle/0006_admin_accounts.sql");
  const database = new DatabaseSync(":memory:");
  database.exec(`
    CREATE TABLE admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      username TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      last_login_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX admins_username_uq ON admins(username);
    INSERT INTO admins (username, password_hash)
    VALUES ('legacy-admin', 'preserved-original-hash');
  `);
  for (const statement of migration.split("--> statement-breakpoint")) {
    if (statement.trim()) database.exec(statement);
  }

  const migrated = database
    .prepare(`SELECT username, password_hash, permissions_json, session_version
              FROM admins WHERE username = ?`)
    .get("legacy-admin");
  assert.deepEqual({ ...migrated }, {
    username: "legacy-admin",
    password_hash: "preserved-original-hash",
    permissions_json: "[]",
    session_version: 1,
  });

  database
    .prepare("UPDATE admins SET password_hash = ? WHERE username = ?")
    .run("new-hash", "legacy-admin");
  assert.equal(
    database
      .prepare("SELECT session_version FROM admins WHERE username = ?")
      .get("legacy-admin").session_version,
    2,
  );
  database
    .prepare("UPDATE admins SET active = 0 WHERE username = ?")
    .run("legacy-admin");
  assert.equal(
    database
      .prepare("SELECT session_version FROM admins WHERE username = ?")
      .get("legacy-admin").session_version,
    3,
  );
  database.close();
});

test("permission scopes are allowlisted and admin APIs default deny", () => {
  assert.deepEqual(
    normalizeAdminPermissions([
      "catalog.manage",
      "catalog.manage",
      "not-a-scope",
      1,
    ]),
    ["catalog.manage"],
  );
  assert.equal(
    hasAdminPermission(["catalog.manage"], "catalog.manage"),
    true,
  );
  assert.equal(
    hasAdminPermission(["catalog.manage"], "orders.manage"),
    false,
  );
  assert.equal(hasAdminPermission(["*"], "orders.manage"), true);
  assert.equal(
    requiredAdminApiPermission("/api/admin/accounts/1"),
    "admins.manage",
  );
  assert.equal(
    requiredAdminApiPermission("/api/admin/products"),
    "catalog.manage",
  );
  assert.equal(
    requiredAdminApiPermission("/api/admin/future-resource"),
    "primary",
  );
});

test("secondary login and sessions are checked against durable account state", async () => {
  const [auth, accounts, sessionRoute, adminApi] = await Promise.all([
    source("lib/auth.ts"),
    source("lib/admin-accounts.ts"),
    source("app/api/admin/session/route.ts"),
    source("lib/admin-api.ts"),
  ]);

  assert.match(auth, /authenticateSecondaryAdmin/);
  assert.match(auth, /getSecondaryAdminSessionIdentity/);
  assert.match(auth, /payload\.version === 1/);
  assert.match(auth, /accountType: "primary"/);
  assert.match(auth, /permissions: \["\*"\]/);
  assert.match(accounts, /WHERE id = \? AND active = 1/);
  assert.match(accounts, /row\.active !== 1/);
  assert.match(accounts, /sessionVersion/);
  assert.match(sessionRoute, /authenticateAdminCredentials/);
  assert.match(sessionRoute, /createAdminSessionCookie\([\s\S]*identity/);
  assert.match(adminApi, /requiredAdminApiPermission/);
  assert.match(
    adminApi,
    /canAccessAdminRequirement\(session, required\)/,
  );
});

test("account CRUD is authenticated, same-origin, bounded, and primary-safe", async () => {
  const [collection, item, password, accounts] = await Promise.all([
    source("app/api/admin/accounts/route.ts"),
    source("app/api/admin/accounts/[id]/route.ts"),
    source("app/api/admin/accounts/[id]/password/route.ts"),
    source("lib/admin-accounts.ts"),
  ]);

  for (const route of [collection, item, password]) {
    assert.match(route, /assertSameOrigin\(request\)/);
    assert.match(route, /requireAdminApiSession\(request\)/);
  }
  assert.match(collection, /readAdminJson\(request, MAX_ACCOUNT_BODY_BYTES\)/);
  assert.match(item, /readAdminJson\(request, MAX_ACCOUNT_BODY_BYTES\)/);
  assert.match(
    password,
    /readAdminJson\(request, MAX_PASSWORD_BODY_BYTES\)/,
  );
  assert.match(accounts, /value === "primary"/);
  assert.match(accounts, /환경 변수에서만 관리되며 변경할 수 없습니다/);
  assert.match(accounts, /MAX_SECONDARY_ADMINS = 100/);
  assert.match(accounts, /MIN_PASSWORD_LENGTH = 12/);
  assert.match(accounts, /permissions_json/);
  assert.doesNotMatch(accounts, /passwordHash:\s*row\./);
  assert.doesNotMatch(
    accounts.slice(
      accounts.indexOf("function toPublicAdminAccount"),
      accounts.indexOf("function auditStatement"),
    ),
    /password|hash/iu,
  );
});

test("permission UI reuses member hashes without collecting administrator passwords", async () => {
  const [page, manager, accounts, permissions] = await Promise.all([
    source("app/adm/(protected)/settings/page.tsx"),
    source("app/adm/(protected)/settings/AdminAccountsManager.tsx"),
    source("lib/admin-accounts.ts"),
    source("lib/admin-menu-permissions.ts"),
  ]);

  assert.match(page, /AdminAccountsManager/);
  assert.match(page, /hasAdminPermission\(session\.permissions/);
  assert.doesNotMatch(manager, /type="password"/);
  assert.match(manager, /비밀번호는 저장 후 다시 표시되지 않습니다/);
  assert.doesNotMatch(manager, /useState\([^)]*password/iu);
  assert.doesNotMatch(manager, /passwordHash|password_hash/);
  assert.match(accounts, /verifyCustomerPassword/);
  assert.match(accounts, /member_user_id/);
  assert.match(permissions, /MEMBER_LINK_PASSWORD_SENTINEL/);
  assert.match(permissions, /admin_permission_challenges/);
  assert.match(manager, /captchaAnswer/);
});
