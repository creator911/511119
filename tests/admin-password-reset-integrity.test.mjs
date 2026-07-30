import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = async (path) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("admin member password resets require reauthentication and bounded input", async () => {
  const route = await source("app/api/admin/users/[id]/route.ts");

  assert.match(route, /assertSameOrigin\(request\)/);
  assert.match(route, /requireAdminApiSession\(request\)/);
  assert.match(route, /readAdminJson\(request,\s*10_000\)/);
  assert.match(route, /verifyAdminCredentials\(adminUsername,\s*adminPassword\)/);
  assert.match(route, /delete sanitizedInput\.adminPassword/);
  assert.match(route, /passwordResetAuthorized/);
  assert.doesNotMatch(route, /console\.(?:log|info|warn|error)/);
});

test("admin member password reset hashes only validated values and audits no secret", async () => {
  const operations = await source("lib/admin-operations.ts");

  assert.match(operations, /body\.newPassword\.length < 8/);
  assert.match(operations, /body\.newPassword\.length > 128/);
  assert.match(
    operations,
    /await hashCustomerPassword\(body\.newPassword as string\)/,
  );
  assert.match(operations, /assignments\.push\("password_hash = \?"\)/);
  assert.match(operations, /passwordReset: true/);
  const passwordResetFlag = operations.indexOf("passwordReset: true");
  const auditStart = operations.lastIndexOf(
    "const auditDetails = JSON.stringify",
    passwordResetFlag,
  );
  const auditEnd = operations.indexOf(
    "const assignments: string[]",
    auditStart,
  );
  assert.ok(auditStart >= 0 && auditEnd > auditStart);
  const auditDetailsSource = operations.slice(auditStart, auditEnd);
  assert.match(auditDetailsSource, /passwordReset: true/);
  assert.doesNotMatch(
    auditDetailsSource,
    /newPassword|adminPassword|password_hash|passwordHash/,
  );
  assert.doesNotMatch(operations, /before\.password/);
  assert.doesNotMatch(operations, /after\.password/);
  assert.doesNotMatch(operations, /console\.(?:log|info|warn|error)/);
});

test("password hash updates invalidate customer sessions", async () => {
  const commerceDatabase = await source("lib/commerce-db.ts");

  assert.match(
    commerceDatabase,
    /CREATE TRIGGER IF NOT EXISTS users_password_session_invalidate/,
  );
  assert.match(commerceDatabase, /AFTER UPDATE OF password_hash ON users/);
  assert.match(
    commerceDatabase,
    /session_version = user_session_state\.session_version \+ 1/,
  );
});

test("admin password inputs are optional, uncontrolled, and cleared after submit", async () => {
  const manager = await source(
    "app/adm/(protected)/users/UsersManager.tsx",
  );

  assert.match(manager, /name="newPassword"/);
  assert.match(manager, /minLength=\{8\}/);
  assert.match(manager, /maxLength=\{128\}/);
  assert.match(manager, /name="adminPassword"/);
  assert.match(manager, /autoComplete="current-password"/);
  assert.match(manager, /newPasswordInput\.value = ""/);
  assert.match(manager, /adminPasswordInput\.value = ""/);
  assert.doesNotMatch(manager, /useState\([^)]*newPassword/i);
  assert.doesNotMatch(manager, /useState\([^)]*adminPassword/i);
});

test("admin JSON routes stop oversized chunked bodies while streaming", async () => {
  const adminApi = await source("lib/admin-api.ts");

  assert.match(
    adminApi,
    /readBoundedJson<unknown>\(request, maximumBytes\)/,
  );
  assert.match(adminApi, /error instanceof HttpBoundaryError/);
  assert.doesNotMatch(adminApi, /await request\.text\(\)/);
});
