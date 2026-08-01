import { copyFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const databasePath = process.argv[2] ? resolve(process.argv[2]) : "";
if (!databasePath || !existsSync(databasePath)) {
  throw new Error("Usage: node scripts/migrate-member-clone-email-index.mjs <database.sqlite>");
}

const database = new DatabaseSync(databasePath);
database.exec("PRAGMA busy_timeout = 10000");

try {
  const emailIndexes = database
    .prepare("PRAGMA index_list(users)")
    .all()
    .filter((index) => Number(index.unique) === 1)
    .filter((index) => {
      const columns = database
        .prepare(`PRAGMA index_info("${String(index.name).replaceAll('"', '""')}")`)
        .all()
        .map((column) => String(column.name));
      return columns.length === 1 && columns[0] === "email";
    });

  if (emailIndexes.length === 0) {
    console.log("users.email is already clone-compatible");
    process.exitCode = 0;
  } else if (emailIndexes.every((index) => index.name === "users_email_uq")) {
    database.exec("DROP INDEX IF EXISTS users_email_uq");
    console.log("removed users_email_uq");
  } else {
    rebuildUsersTable(database, databasePath);
    console.log("rebuilt users without an email uniqueness constraint");
  }
} finally {
  database.close();
}

function rebuildUsersTable(database, path) {
  database.exec("PRAGMA wal_checkpoint(FULL)");
  const backupPath = `${path}.pre-member-clone.bak`;
  if (!existsSync(backupPath)) copyFileSync(path, backupPath);
  const beforeCount = Number(
    database.prepare("SELECT COUNT(*) AS count FROM users").get().count,
  );
  const columns = [
    "id", "login_id", "email", "password_hash", "name", "nickname",
    "phone", "postcode", "address1", "address2", "points", "level",
    "email_opt_in", "sms_opt_in", "active", "last_login_at", "created_at",
    "updated_at", "telephone", "homepage", "address3", "admin_memo",
    "identity_method", "identity_verified", "email_verified",
    "adult_verified", "public_profile", "member_signature", "member_profile",
    "verification_history", "withdrawn_at", "blocked_at", "member_icon",
    "member_image", "extra1", "extra2", "extra3", "extra4", "extra5",
    "extra6", "extra7", "extra8", "extra9", "extra10",
  ];

  database.exec("PRAGMA foreign_keys = OFF");
  database.exec("BEGIN IMMEDIATE");
  try {
    database.exec(`
      CREATE TABLE users_member_clone_migration (
        id TEXT PRIMARY KEY,
        login_id TEXT NOT NULL UNIQUE,
        email TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        nickname TEXT NOT NULL DEFAULT '',
        phone TEXT NOT NULL DEFAULT '',
        postcode TEXT NOT NULL DEFAULT '',
        address1 TEXT NOT NULL DEFAULT '',
        address2 TEXT NOT NULL DEFAULT '',
        points INTEGER NOT NULL DEFAULT 0,
        level INTEGER NOT NULL DEFAULT 1,
        email_opt_in INTEGER NOT NULL DEFAULT 0,
        sms_opt_in INTEGER NOT NULL DEFAULT 0,
        active INTEGER NOT NULL DEFAULT 1,
        last_login_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        telephone TEXT NOT NULL DEFAULT '',
        homepage TEXT NOT NULL DEFAULT '',
        address3 TEXT NOT NULL DEFAULT '',
        admin_memo TEXT NOT NULL DEFAULT '',
        identity_method TEXT NOT NULL DEFAULT 'none',
        identity_verified INTEGER NOT NULL DEFAULT 0,
        email_verified INTEGER NOT NULL DEFAULT 0,
        adult_verified INTEGER NOT NULL DEFAULT 0,
        public_profile INTEGER NOT NULL DEFAULT 0,
        member_signature TEXT NOT NULL DEFAULT '',
        member_profile TEXT NOT NULL DEFAULT '',
        verification_history TEXT NOT NULL DEFAULT '',
        withdrawn_at TEXT NOT NULL DEFAULT '',
        blocked_at TEXT NOT NULL DEFAULT '',
        member_icon TEXT NOT NULL DEFAULT '',
        member_image TEXT NOT NULL DEFAULT '',
        extra1 TEXT NOT NULL DEFAULT '',
        extra2 TEXT NOT NULL DEFAULT '',
        extra3 TEXT NOT NULL DEFAULT '',
        extra4 TEXT NOT NULL DEFAULT '',
        extra5 TEXT NOT NULL DEFAULT '',
        extra6 TEXT NOT NULL DEFAULT '',
        extra7 TEXT NOT NULL DEFAULT '',
        extra8 TEXT NOT NULL DEFAULT '',
        extra9 TEXT NOT NULL DEFAULT '',
        extra10 TEXT NOT NULL DEFAULT ''
      );
      INSERT INTO users_member_clone_migration (${columns.join(", ")})
      SELECT ${columns.join(", ")} FROM users;
      DROP TABLE users;
      ALTER TABLE users_member_clone_migration RENAME TO users;
      CREATE INDEX users_created_idx ON users(created_at);
    `);
    const afterCount = Number(
      database.prepare("SELECT COUNT(*) AS count FROM users").get().count,
    );
    if (afterCount !== beforeCount) {
      throw new Error(`users row count changed (${beforeCount} -> ${afterCount})`);
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  } finally {
    database.exec("PRAGMA foreign_keys = ON");
  }

  const foreignKeyProblems = database.prepare("PRAGMA foreign_key_check").all();
  if (foreignKeyProblems.length > 0) {
    throw new Error(`foreign key check failed: ${foreignKeyProblems.length}`);
  }
}
