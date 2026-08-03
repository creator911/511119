import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

test("a stale profile request cannot undo a password reset or adopt its session", () => {
  const database = new DatabaseSync(":memory:");
  database.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE user_session_state (
      user_id TEXT PRIMARY KEY,
      session_version INTEGER NOT NULL DEFAULT 1
    );
    CREATE TRIGGER users_password_session_invalidate
      AFTER UPDATE OF password_hash ON users
      WHEN OLD.password_hash <> NEW.password_hash
      BEGIN
        UPDATE user_session_state
        SET session_version = session_version + 1
        WHERE user_id = NEW.id;
      END;
    INSERT INTO users (id, email, password_hash, name)
      VALUES ('member-1', 'old@example.test', 'old-hash', 'Old Name');
    INSERT INTO user_session_state (user_id, session_version)
      VALUES ('member-1', 1);
  `);

  const ordinaryProfileUpdate = database.prepare(`
    UPDATE users
    SET email = ?, name = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
      AND EXISTS (
        SELECT 1 FROM user_session_state state
        WHERE state.user_id = users.id
          AND state.session_version = ?
      )
  `);
  const passwordProfileUpdate = database.prepare(`
    UPDATE users
    SET email = ?, password_hash = ?, name = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
      AND password_hash = ?
      AND EXISTS (
        SELECT 1 FROM user_session_state state
        WHERE state.user_id = users.id
          AND state.session_version = ?
      )
  `);

  database
    .prepare("UPDATE users SET password_hash = ? WHERE id = ?")
    .run("reset-hash", "member-1");
  assert.equal(readVersion(), 2);

  assert.equal(
    ordinaryProfileUpdate.run(
      "stale@example.test",
      "Stale Name",
      "member-1",
      1,
    ).changes,
    0,
  );
  assert.equal(
    passwordProfileUpdate.run(
      "stale@example.test",
      "attacker-hash",
      "Stale Name",
      "member-1",
      "old-hash",
      1,
    ).changes,
    0,
  );
  const user = database
    .prepare(
      "SELECT email, password_hash, name FROM users WHERE id = ?",
    )
    .get("member-1");
  assert.equal(user.email, "old@example.test");
  assert.equal(user.password_hash, "reset-hash");
  assert.equal(user.name, "Old Name");
  assert.equal(readVersion(), 2);
  database.close();

  function readVersion() {
    return database
      .prepare(
        "SELECT session_version FROM user_session_state WHERE user_id = ?",
      )
      .get("member-1").session_version;
  }
});

test("session cookies sign an explicit guarded version and preserve persistence", async () => {
  const [
    auth,
    profile,
    login,
    register,
    rate,
    loginClient,
    strength,
    authPanels,
    commerceDb,
  ] = await Promise.all([
    readFile(new URL("../lib/customer-auth.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../app/api/customer/profile/route.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/api/customer/session/route.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/api/customer/register/route.ts", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../lib/auth-rate.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../app/components/CommerceClients.tsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../lib/password-strength.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../app/components/storefront/AuthPanels.tsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../lib/commerce-db.ts", import.meta.url), "utf8"),
  ]);
  const cookieFactory = auth.slice(
    auth.indexOf("export async function createCustomerSessionCookie"),
    auth.indexOf("export function clearCustomerSessionCookie"),
  );

  assert.match(cookieFactory, /session: Omit<CustomerSession, "expiresAt">/);
  assert.match(cookieFactory, /session\.sessionVersion/);
  assert.match(cookieFactory, /session\.remember/);
  assert.doesNotMatch(cookieFactory, /SELECT session_version/);
  assert.doesNotMatch(cookieFactory, /commerceDb\(\)/);

  assert.doesNotMatch(profile, /let passwordHash = profile\.password_hash/);
  assert.match(profile, /newPasswordHash/);
  assert.match(profile, /AND password_hash = \?/);
  assert.match(profile, /state\.session_version = \?/);
  assert.match(profile, /session\.sessionVersion \+ \(newPasswordHash \? 1 : 0\)/);
  assert.match(profile, /remember: session\.remember/);
  assert.match(profile, /customer-profile-reauth/);
  assert.match(profile, /isUserEmailConflict\(error\)/);
  assert.match(profile, /UNIQUE constraint failed:\\s\*users\\\.email/);

  assert.match(login, /password_hash = \?/);
  assert.match(login, /state\.session_version = \?/);
  assert.match(login, /sessionVersion: Number\(user\.session_version\)/);
  assert.match(login, /remember: payload\.remember === true/);
  assert.match(login, /authenticateAdminCredentials\(/);
  assert.match(login, /createAdminSessionCookie\(/);
  assert.match(login, /role: "admin"/);
  assert.match(login, /requestedPrimaryAdmin/);
  assert.match(login, /role: "member"/);
  assert.match(loginClient, /result\.role === "admin" \? "\/shop" : returnUrl/);
  assert.match(register, /INSERT INTO user_session_state/);
  assert.match(register, /sessionVersion: 1/);
  assert.match(register, /isUserIdentityConflict\(error\)/);
  assert.match(register, /users\\\.\(\?:login_id\|email\)/);
  assert.match(register, /export async function GET\(request: Request\)/);
  assert.match(register, /nickname: "nickname"/);
  assert.match(register, /public_profile, extra1/);
  assert.match(register, /body\.publicProfile \? 1 : 0/);
  assert.match(register, /scorePasswordStrength\(password\) < 2/);
  assert.match(strength, /PASSWORD_STRENGTH_LABELS/);
  assert.match(strength, /"매우약함"/);
  assert.match(strength, /"아주강함"/);
  assert.match(authPanels, /passwordStrengthMeter/);
  assert.match(authPanels, /비밀번호의 강도는 보통 이상이어야 합니다/);
  assert.match(authPanels, /availabilityPending/);
  assert.match(authPanels, /입력값이 변경되었습니다\. 다시 중복확인해 주세요/);
  assert.match(authPanels, /legacyCheckButtonVerified/);
  assert.match(authPanels, /aria-pressed=\{Boolean\(availabilityChecks\.userId\)\}/);
  assert.match(authPanels, /\? "확인완료"/);
  assert.match(
    commerceDb,
    /workerEnvironment\.SESSION_SECRET \?\? runtimeEnvironment\?\.SESSION_SECRET/,
  );
  assert.match(rate, /customer-profile-reauth/);
  const clientKey = rate.slice(rate.indexOf("async function authRateClientKey"));
  assert.match(clientKey, /cf-connecting-ip/);
  assert.doesNotMatch(clientKey, /x-forwarded-for|user-agent/);
  assert.match(clientKey, /"anonymous"/);
});
