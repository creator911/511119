import assert from "node:assert/strict";
import { pbkdf2Sync, randomBytes } from "node:crypto";
import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { hashAdminPassword } from "../lib/admin-password.ts";

const baseUrl = (process.env.QA_BASE_URL ?? "http://localhost:4173").replace(
  /\/+$/u,
  "",
);
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
const customerPassword = `QaCustomer-${suffix}!9`;
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
  const customerHash = await hashCustomerPassword(customerPassword);
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
        customerHash,
        "지갑검증회원",
        "지갑QA",
        "010-0000-0000",
        10_000,
      );
    database
      .prepare(
        `INSERT INTO user_session_state (user_id, session_version)
         VALUES (?, 1)`,
      )
      .run(userId);
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
    { headers: { Cookie: readCookie } },
  );
  const withdrawalPage = await fetch(
    `${baseUrl}/adm/wallet?kind=withdrawal`,
    { headers: { Cookie: readCookie } },
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
  const chargeApprovedPayload = await chargeApproved.json();
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

  const editedChargeAt = "2026-06-01T01:02:03.000Z";
  const editedCharge = await fetch(
    `${baseUrl}/api/admin/wallet/requests/${encodeURIComponent(requestIds.chargeApprove)}`,
    {
      method: "PUT",
      headers: {
        ...authHeaders(writeCookie),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        kind: "charge",
        id: requestIds.chargeApprove,
        amount: 3_500,
        status: "approved",
        depositorName: "지갑검증회원",
        adminMemo: "QA 수정",
        createdAt: editedChargeAt,
        expectedUpdatedAt: chargeApprovedPayload.request.updatedAt,
      }),
    },
  );
  assert.equal(editedCharge.status, 200);
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
  assert.equal(points, 9_500);
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
      ["charge", 3_500],
      ["withdrawal", -4_000],
    ].sort(),
  );
  assert.equal(
    database
      .prepare(
        `SELECT created_at FROM wallet_ledger
         WHERE request_type = 'charge' AND request_id = ?`,
      )
      .get(requestIds.chargeApprove).created_at,
    "2026-06-01 01:02:03",
  );

  const customerCookie = await customerLogin(loginId, customerPassword);
  const customerSession = await fetch(`${baseUrl}/api/customer/session`, {
    headers: { Cookie: customerCookie },
  });
  assert.equal(customerSession.status, 200);
  const customerSessionPayload = await customerSession.json();
  const walletHistory = customerSessionPayload.pointHistory.filter((entry) =>
    entry.id.startsWith("wallet:"),
  );
  assert.equal(walletHistory.length, 2);
  assert.deepEqual(
    walletHistory.map(({ reason, delta }) => [reason, delta]).sort(),
    [
      ["충전 승인", 3_500],
      ["출금 승인", -4_000],
    ].sort(),
  );
  const correctedCharge = walletHistory.find(
    (entry) => entry.reason === "충전 승인",
  );
  assert.equal(correctedCharge.createdAt, "2026-06-01 01:02:03");
  assert.equal(correctedCharge.balanceAfter, 13_500);
  const audits = database
    .prepare(
      `SELECT action, entity_id
       FROM admin_audit_logs
       WHERE entity_id IN (?, ?, ?, ?)`,
    )
    .all(...Object.values(requestIds));
  assert.equal(audits.length, 5);
  assert.deepEqual(
    audits.map(({ action }) => action).sort(),
    [
      "wallet.charge.approved",
      "wallet.charge.rejected",
      "wallet.withdrawal.approved",
      "wallet.withdrawal.rejected",
      "wallet.request.edit",
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
          editedChargeVisibleInMypage: true,
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

async function customerLogin(userId, password) {
  const response = await fetch(`${baseUrl}/api/customer/session`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: baseUrl,
    },
    body: JSON.stringify({ userId, password }),
  });
  assert.equal(response.status, 200, `customer login returned ${response.status}`);
  const cookie = (response.headers.get("set-cookie") ?? "").split(";", 1)[0];
  assert.ok(cookie.includes("="), "customer session cookie was not issued");
  return cookie;
}

function hashCustomerPassword(password) {
  const salt = randomBytes(16);
  const digest = pbkdf2Sync(password, salt, 100_000, 32, "sha256");
  return `pbkdf2$100000$${salt.toString("hex")}$${digest.toString("hex")}`;
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
    database.prepare("DELETE FROM user_session_state WHERE user_id = ?").run(userId);
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
