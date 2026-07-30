import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { hashAdminPassword } from "../lib/admin-password.ts";

const baseUrl = (process.env.QA_BASE_URL ?? "http://localhost:4173").replace(
  /\/+$/u,
  "",
);
const primaryUsername = process.env.QA_ADMIN_USERNAME ?? "admin";
const primaryPassword = process.env.QA_ADMIN_PASSWORD;
assert.ok(primaryPassword, "QA_ADMIN_PASSWORD is required.");

const databaseDirectory = resolve(
  process.cwd(),
  ".wrangler/state/v3/d1/miniflare-D1DatabaseObject",
);
const databaseFile = readdirSync(databaseDirectory)
  .filter((name) => name.endsWith(".sqlite") && name !== "metadata.sqlite")
  .map((name) => join(databaseDirectory, name))
  .find(Boolean);
assert.ok(databaseFile, "local D1 database was not found");
assert.ok(resolve(databaseFile).startsWith(`${databaseDirectory}\\`));

const suffix = `${Date.now().toString(36)}${crypto.randomUUID().slice(0, 6)}`;
const userId = `QAWALLET_USER_${suffix}`;
const loginId = `qawallet${suffix}`.slice(0, 40);
const adminPassword = `QaWallet-${suffix}!9`;
const modeAdmins = {
  r: `qawalletr${suffix}`.slice(0, 40),
  w: `qawalletw${suffix}`.slice(0, 40),
  d: `qawalletd${suffix}`.slice(0, 40),
};
const requestIds = {
  chargeApprove: `CHG-${crypto.randomUUID()}`,
  chargeReject: `CHG-${crypto.randomUUID()}`,
  withdrawalApprove: `WDR-${crypto.randomUUID()}`,
  withdrawalReject: `WDR-${crypto.randomUUID()}`,
};
const database = new DatabaseSync(databaseFile);
database.exec("PRAGMA busy_timeout = 5000");

try {
  const adminHash = await hashAdminPassword(adminPassword);
  database.exec("BEGIN IMMEDIATE");
  try {
    database
      .prepare(
        `INSERT INTO users (
           id, login_id, email, password_hash, name, nickname, phone, points
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        userId,
        loginId,
        `${loginId}@example.invalid`,
        "qa-password-hash-not-used",
        "지갑검증회원",
        "지갑QA",
        "010-0000-0000",
        10_000,
      );
    database
      .prepare(
        `INSERT INTO charge_requests (
           id, user_id, amount, depositor_name
         ) VALUES (?, ?, ?, ?)`,
      )
      .run(requestIds.chargeApprove, userId, 3_000, "지갑검증회원");
    database
      .prepare(
        `INSERT INTO charge_requests (
           id, user_id, amount, depositor_name
         ) VALUES (?, ?, ?, ?)`,
      )
      .run(requestIds.chargeReject, userId, 2_000, "지갑검증회원");
    database
      .prepare(
        `INSERT INTO withdrawal_requests (
           id, user_id, amount, bank_name, account_number, account_holder
         ) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        requestIds.withdrawalApprove,
        userId,
        4_000,
        "검증은행",
        "000-000-000000",
        "지갑검증회원",
      );
    database
      .prepare(
        `INSERT INTO withdrawal_requests (
           id, user_id, amount, bank_name, account_number, account_holder
         ) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        requestIds.withdrawalReject,
        userId,
        1_000,
        "검증은행",
        "111-111-111111",
        "지갑검증회원",
      );

    for (const [mode, username] of Object.entries(modeAdmins)) {
      const inserted = database
        .prepare(
          `INSERT INTO admins (
             username, password_hash, active, permissions_json, session_version
           ) VALUES (?, ?, 1, '[]', 1)
           RETURNING id`,
        )
        .get(username, adminHash);
      for (const menuCode of ["200900", "200300"]) {
        database
          .prepare(
            `INSERT INTO admin_menu_permissions (
               admin_id, menu_code, auth_flags
             ) VALUES (?, ?, ?)`,
          )
          .run(inserted.id, menuCode, mode);
      }
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }

  const primaryCookie = await login(primaryUsername, primaryPassword);
  const readCookie = await login(modeAdmins.r, adminPassword);
  const writeCookie = await login(modeAdmins.w, adminPassword);
  const deleteCookie = await login(modeAdmins.d, adminPassword);

  const unauthenticatedList = await fetch(
    `${baseUrl}/api/admin/wallet/requests`,
    { headers: { Origin: baseUrl } },
  );
  assert.equal(unauthenticatedList.status, 401);

  const chargePage = await fetch(
    `${baseUrl}/adm/wallet?kind=charge`,
    { headers: { Cookie: primaryCookie } },
  );
  const withdrawalPage = await fetch(
    `${baseUrl}/adm/wallet?kind=withdrawal`,
    { headers: { Cookie: primaryCookie } },
  );
  assert.equal(chargePage.status, 200);
  assert.equal(withdrawalPage.status, 200);
  assert.match(await chargePage.text(), /legacy-wallet-charge/u);
  assert.match(await withdrawalPage.text(), /legacy-wallet-withdrawal/u);

  const readList = await fetch(
    `${baseUrl}/api/admin/wallet/requests`,
    { headers: authHeaders(readCookie) },
  );
  assert.equal(readList.status, 200);
  const listPayload = await readList.json();
  const qaRequests = listPayload.requests.filter((request) =>
    Object.values(requestIds).includes(request.id),
  );
  assert.equal(qaRequests.length, 4);
  assert.ok(qaRequests.every((request) => request.memberNickname === "지갑QA"));
  assert.ok(qaRequests.every((request) => request.memberPoints === 10_000));

  assert.equal(
    (
      await decide(
        readCookie,
        requestIds.chargeApprove,
        "charge",
        "approve",
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await decide(
        writeCookie,
        requestIds.chargeReject,
        "charge",
        "reject",
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await decide(
        deleteCookie,
        requestIds.withdrawalApprove,
        "withdrawal",
        "approve",
      )
    ).status,
    403,
  );

  const foreignCancel = await decide(
    deleteCookie,
    requestIds.chargeReject,
    "charge",
    "reject",
    "https://foreign-origin.invalid",
  );
  assert.equal(foreignCancel.status, 403);

  const chargeApproved = await decide(
    writeCookie,
    requestIds.chargeApprove,
    "charge",
    "approve",
  );
  assert.equal(chargeApproved.status, 200);
  assert.equal(
    (
      await decide(
        writeCookie,
        requestIds.chargeApprove,
        "charge",
        "approve",
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await decide(
        writeCookie,
        requestIds.withdrawalApprove,
        "withdrawal",
        "approve",
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await decide(
        deleteCookie,
        requestIds.chargeReject,
        "charge",
        "reject",
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await decide(
        deleteCookie,
        requestIds.withdrawalReject,
        "withdrawal",
        "reject",
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await decide(
        deleteCookie,
        requestIds.withdrawalReject,
        "withdrawal",
        "reject",
      )
    ).status,
    409,
  );

  const points = database
    .prepare("SELECT points FROM users WHERE id = ?")
    .get(userId).points;
  assert.equal(points, 9_000);
  const ledger = database
    .prepare(
      `SELECT request_type, request_id, delta, balance_after
       FROM wallet_ledger
       WHERE request_id IN (?, ?, ?, ?)
       ORDER BY created_at, request_id`,
    )
    .all(...Object.values(requestIds));
  assert.equal(ledger.length, 2);
  assert.deepEqual(
    ledger.map(({ request_type, delta }) => [request_type, delta]).sort(),
    [
      ["charge", 3_000],
      ["withdrawal", -4_000],
    ].sort(),
  );
  const audits = database
    .prepare(
      `SELECT action, entity_id
       FROM admin_audit_logs
       WHERE entity_id IN (?, ?, ?, ?)`,
    )
    .all(...Object.values(requestIds));
  assert.equal(audits.length, 4);
  assert.deepEqual(
    audits.map(({ action }) => action).sort(),
    [
      "wallet.charge.approved",
      "wallet.charge.rejected",
      "wallet.withdrawal.approved",
      "wallet.withdrawal.rejected",
    ].sort(),
  );

  console.log(
    JSON.stringify(
      {
        pages: { charge: chargePage.status, withdrawal: withdrawalPage.status },
        permissions: {
          unauthenticatedRead: unauthenticatedList.status,
          readCannotApprove: 403,
          writeCannotCancel: 403,
          deleteCannotApprove: 403,
          foreignOrigin: foreignCancel.status,
        },
        transitions: {
          approved: 2,
          cancelled: 2,
          duplicateApproval: 409,
          duplicateCancellation: 409,
        },
        accounting: {
          startingPoints: 10_000,
          endingPoints: points,
          ledgerRows: ledger.length,
          auditRows: audits.length,
        },
      },
      null,
      2,
    ),
  );
} finally {
  cleanup();
  database.close();
}

async function login(username, password) {
  const response = await fetch(`${baseUrl}/api/admin/session`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: baseUrl,
    },
    body: JSON.stringify({ username, password }),
  });
  assert.equal(response.status, 200, `${username} login returned ${response.status}`);
  const cookie = (response.headers.get("set-cookie") ?? "").split(";", 1)[0];
  assert.ok(cookie.includes("="), `${username} session cookie was not issued`);
  return cookie;
}

function decide(cookie, id, kind, decision, origin = baseUrl) {
  return fetch(
    `${baseUrl}/api/admin/wallet/requests/${encodeURIComponent(id)}`,
    {
      method: decision === "approve" ? "PATCH" : "DELETE",
      headers: {
        ...authHeaders(cookie, origin),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        kind,
        decision,
        adminMemo: `QA ${decision}`,
      }),
    },
  );
}

function authHeaders(cookie, origin = baseUrl) {
  return {
    Accept: "application/json",
    Cookie: cookie,
    Origin: origin,
  };
}

function cleanup() {
  const ids = Object.values(requestIds);
  database.exec("BEGIN IMMEDIATE");
  try {
    database
      .prepare(
        `DELETE FROM wallet_ledger
         WHERE request_id IN (?, ?, ?, ?)`,
      )
      .run(...ids);
    database
      .prepare(
        `DELETE FROM wallet_processing_guards
         WHERE request_id IN (?, ?, ?, ?)`,
      )
      .run(...ids);
    database
      .prepare(
        `DELETE FROM admin_audit_logs
         WHERE entity_id IN (?, ?, ?, ?)`,
      )
      .run(...ids);
    database
      .prepare("DELETE FROM charge_requests WHERE id IN (?, ?)")
      .run(requestIds.chargeApprove, requestIds.chargeReject);
    database
      .prepare("DELETE FROM withdrawal_requests WHERE id IN (?, ?)")
      .run(requestIds.withdrawalApprove, requestIds.withdrawalReject);
    const adminRows = database
      .prepare(
        "SELECT id FROM admins WHERE username IN (?, ?, ?)",
      )
      .all(modeAdmins.r, modeAdmins.w, modeAdmins.d);
    for (const row of adminRows) {
      database
        .prepare("DELETE FROM admin_menu_permissions WHERE admin_id = ?")
        .run(row.id);
    }
    database
      .prepare("DELETE FROM admins WHERE username IN (?, ?, ?)")
      .run(modeAdmins.r, modeAdmins.w, modeAdmins.d);
    database.prepare("DELETE FROM users WHERE id = ?").run(userId);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }

  assert.equal(
    database
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM users WHERE id = ?) +
           (SELECT COUNT(*) FROM charge_requests WHERE id IN (?, ?)) +
           (SELECT COUNT(*) FROM withdrawal_requests WHERE id IN (?, ?)) +
           (SELECT COUNT(*) FROM wallet_ledger
              WHERE request_id IN (?, ?, ?, ?)) +
           (SELECT COUNT(*) FROM wallet_processing_guards
              WHERE request_id IN (?, ?, ?, ?)) AS total`,
      )
      .get(
        userId,
        requestIds.chargeApprove,
        requestIds.chargeReject,
        requestIds.withdrawalApprove,
        requestIds.withdrawalReject,
        ...ids,
        ...ids,
      ).total,
    0,
  );
}
