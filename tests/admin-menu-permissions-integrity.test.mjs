import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { ADMIN_LEGACY_MENU_OPTIONS } from "../lib/admin-menu-catalog.ts";
import {
  hasAdminPermission,
  hasAdminPermissionMode,
} from "../lib/admin-permissions.ts";

const source = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("the legacy permission menu keeps all 66 original code and label pairs", () => {
  assert.equal(ADMIN_LEGACY_MENU_OPTIONS.length, 66);
  assert.equal(
    new Set(ADMIN_LEGACY_MENU_OPTIONS.map(({ code }) => code)).size,
    66,
  );
  assert.deepEqual(ADMIN_LEGACY_MENU_OPTIONS[0], {
    code: "100100",
    label: "기본환경설정",
    scope: "settings.manage",
  });
  assert.deepEqual(ADMIN_LEGACY_MENU_OPTIONS.at(-1), {
    code: "999100",
    label: "이윰관리자 바로가기",
    scope: "settings.manage",
  });
  assert.ok(
    ADMIN_LEGACY_MENU_OPTIONS.some(
      ({ code, label }) => code === "400400" && label === "주문내역",
    ),
  );
});

test("granular r/w/d tokens allow only their matching HTTP operation", () => {
  const permissions = ["scope:catalog.manage:r"];

  assert.equal(hasAdminPermission(permissions, "catalog.manage"), true);
  assert.equal(
    hasAdminPermissionMode(permissions, "catalog.manage", "r"),
    true,
  );
  assert.equal(
    hasAdminPermissionMode(permissions, "catalog.manage", "w"),
    false,
  );
  assert.equal(
    hasAdminPermissionMode(permissions, "catalog.manage", "d"),
    false,
  );
  assert.equal(
    hasAdminPermissionMode(["catalog.manage"], "catalog.manage", "d"),
    true,
  );
});

test("the durable migration preserves linked-member sessions and invalidates them", async () => {
  const migration = await source("drizzle/0012_admin_menu_permissions.sql");
  const database = new DatabaseSync(":memory:");
  database.exec(`
    CREATE TABLE admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      username TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      permissions_json TEXT NOT NULL DEFAULT '[]',
      session_version INTEGER NOT NULL DEFAULT 1,
      last_login_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX admins_username_uq ON admins(username);
    CREATE TABLE users (
      id TEXT PRIMARY KEY NOT NULL,
      login_id TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1
    );
    INSERT INTO users (id, login_id, password_hash)
    VALUES ('member-1', 'manager-one', 'member-hash');
    INSERT INTO admins (username, password_hash)
    VALUES ('manager-one', '!member-password-hash-not-copied!');
  `);
  for (const statement of migration.split("--> statement-breakpoint")) {
    if (statement.trim()) database.exec(statement);
  }
  database
    .prepare("UPDATE admins SET member_user_id = ? WHERE username = ?")
    .run("member-1", "manager-one");
  const adminId = database
    .prepare("SELECT id FROM admins WHERE username = ?")
    .get("manager-one").id;

  database
    .prepare(
      `INSERT INTO admin_menu_permissions
       (admin_id, menu_code, auth_flags) VALUES (?, '400300', 'r')`,
    )
    .run(adminId);
  assert.equal(
    database
      .prepare("SELECT session_version FROM admins WHERE id = ?")
      .get(adminId).session_version,
    2,
  );
  database
    .prepare(
      "UPDATE admin_menu_permissions SET auth_flags = 'rwd' WHERE admin_id = ?",
    )
    .run(adminId);
  assert.equal(
    database
      .prepare("SELECT session_version FROM admins WHERE id = ?")
      .get(adminId).session_version,
    3,
  );
  database
    .prepare("UPDATE users SET password_hash = ? WHERE id = ?")
    .run("changed-member-hash", "member-1");
  assert.equal(
    database
      .prepare("SELECT session_version FROM admins WHERE id = ?")
      .get(adminId).session_version,
    4,
  );
  database
    .prepare("DELETE FROM admin_menu_permissions WHERE admin_id = ?")
    .run(adminId);
  assert.equal(
    database
      .prepare("SELECT session_version FROM admins WHERE id = ?")
      .get(adminId).session_version,
    5,
  );
  database.close();
});

test("permission writes are same-origin, bounded, revision-safe, and CAPTCHA-backed", async () => {
  const [route, service, accounts, manager, css] = await Promise.all([
    source("app/api/admin/accounts/menu-permissions/route.ts"),
    source("lib/admin-menu-permissions.ts"),
    source("lib/admin-accounts.ts"),
    source("app/adm/(protected)/settings/AdminAccountsManager.tsx"),
    source("app/adm/legacy-admin.css"),
  ]);

  assert.match(route, /assertSameOrigin\(request\)/);
  assert.match(
    route,
    /readAdminJson\(\s*request,\s*MAX_PERMISSION_BODY_BYTES,\s*\)/,
  );
  assert.match(service, /DELETE FROM admin_permission_challenges[\s\S]*RETURNING id, answer_hash, expires_at/);
  assert.match(service, /timingSafeHexEqual/);
  assert.match(service, /HMAC/);
  assert.match(service, /expectedRevision/);
  assert.match(service, /member_user_id/);
  assert.match(accounts, /verifyCustomerPassword/);
  assert.doesNotMatch(manager, /type="password"/);
  assert.match(manager, /r \(읽기\)/);
  assert.match(manager, /w \(쓰기\)/);
  assert.match(manager, /d \(삭제\)/);
  assert.match(css, /width:\s*1005px/);
  assert.match(css, /height:\s*256px/);
  assert.match(css, /height:\s*231\.84375px/);
});
