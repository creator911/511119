import assert from "node:assert/strict";
import {
  existsSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const workspace = process.cwd();
const baseUrl =
  process.env.QA_BASE_URL?.replace(/\/+$/u, "") ??
  "http://localhost:4173";
const suffix = crypto.randomUUID().replace(/-/gu, "").slice(0, 12);
const loginId = `qamp${suffix}`.slice(0, 30);
const originalEmail = `${loginId}@qa.invalid`;
const updatedEmail = `${loginId}-updated@qa.invalid`;
const adminCookie = await createLocalAdminCookie();
let memberId = "";
const pointEntryIds = [];
const memberMediaUrls = [];

try {
  const crossOrigin = await fetch(`${baseUrl}/api/admin/points`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://example.invalid",
      Cookie: adminCookie,
    },
    body: JSON.stringify({
      loginId,
      reason: "교차 출처 차단",
      delta: 1,
    }),
  });
  assert.equal(crossOrigin.status, 403);

  const memberIcon = await uploadMemberImage(`qa-icon-${suffix}.png`);
  const memberImage = await uploadMemberImage(`qa-image-${suffix}.png`);

  const createResponse = await adminFetch("/api/admin/users", {
    method: "POST",
    body: JSON.stringify({
      loginId,
      password: `Qa!${suffix}safe`,
      name: "QA 회원",
      nickname: "QA닉네임",
      email: originalEmail,
      phone: "010-1234-5678",
      telephone: "02-123-4567",
      homepage: "https://example.invalid/member",
      postcode: "01234",
      address1: "QA 기본주소",
      address2: "QA 상세주소",
      address3: "QA 참고항목",
      adminMemo: `QA member ${suffix}`,
      identityMethod: "phone",
      identityVerified: true,
      emailVerified: true,
      adultVerified: true,
      publicProfile: true,
      signature: `QA signature ${suffix}`,
      profile: `QA profile ${suffix}`,
      verificationHistory: `QA verified ${suffix}`,
      memberIcon,
      memberImage,
      extra1: `QA extra1 ${suffix}`,
      extra10: `QA extra10 ${suffix}`,
      points: 125,
      level: 2,
      active: true,
      emailOptIn: true,
      smsOptIn: true,
    }),
  });
  assert.equal(createResponse.status, 201);
  const created = await createResponse.json();
  assert.equal(created.ok, true);
  assert.equal(created.member.loginId, loginId);
  assert.equal(created.member.telephone, "02-123-4567");
  assert.equal(created.member.identityMethod, "phone");
  assert.equal(created.member.identityVerified, true);
  assert.equal(created.member.emailVerified, true);
  assert.equal(created.member.adultVerified, true);
  assert.equal(created.member.publicProfile, true);
  assert.equal(created.member.extra10, `QA extra10 ${suffix}`);
  assert.equal(created.member.points, 125);
  memberId = created.member.id;

  const initialGroupsResponse = await adminFetch(
    `/api/admin/users/${encodeURIComponent(memberId)}/groups`,
  );
  assert.equal(initialGroupsResponse.status, 200);
  const initialGroups = await initialGroupsResponse.json();
  assert.equal(initialGroups.ok, true);
  assert.ok(initialGroups.groups.length > 0);
  const selectedGroupId = initialGroups.groups[0].id;
  const assignGroupResponse = await adminFetch(
    `/api/admin/users/${encodeURIComponent(memberId)}/groups`,
    {
      method: "PUT",
      body: JSON.stringify({
        groupIds: [selectedGroupId],
        expectedRevision: initialGroups.revision,
      }),
    },
  );
  assert.equal(assignGroupResponse.status, 200);
  const assignedGroups = await assignGroupResponse.json();
  assert.equal(assignedGroups.revision, initialGroups.revision + 1);
  assert.equal(
    assignedGroups.groups.find((group) => group.id === selectedGroupId)
      ?.selected,
    true,
  );
  const staleGroupResponse = await adminFetch(
    `/api/admin/users/${encodeURIComponent(memberId)}/groups`,
    {
      method: "PUT",
      body: JSON.stringify({
        groupIds: [],
        expectedRevision: initialGroups.revision,
      }),
    },
  );
  assert.equal(staleGroupResponse.status, 409);
  const releaseGroupResponse = await adminFetch(
    `/api/admin/users/${encodeURIComponent(memberId)}/groups`,
    {
      method: "PUT",
      body: JSON.stringify({
        groupIds: [],
        expectedRevision: assignedGroups.revision,
      }),
    },
  );
  assert.equal(releaseGroupResponse.status, 200);
  const releasedGroups = await releaseGroupResponse.json();
  assert.equal(
    releasedGroups.groups.some((group) => group.selected),
    false,
  );
  const rereadGroupsResponse = await adminFetch(
    `/api/admin/users/${encodeURIComponent(memberId)}/groups`,
  );
  assert.equal(rereadGroupsResponse.status, 200);
  const rereadGroups = await rereadGroupsResponse.json();
  assert.equal(rereadGroups.revision, releasedGroups.revision);
  assert.equal(rereadGroups.groups.some((group) => group.selected), false);

  const duplicateResponse = await adminFetch("/api/admin/users", {
    method: "POST",
    body: JSON.stringify({
      loginId,
      password: `Qa!${suffix}other`,
      name: "중복 QA",
      email: originalEmail,
    }),
  });
  assert.equal(duplicateResponse.status, 409);

  const detailResponse = await adminFetch(
    `/api/admin/users/${encodeURIComponent(memberId)}`,
  );
  assert.equal(detailResponse.status, 200);
  const detail = await detailResponse.json();
  const expectedUpdatedAt = detail.member.updatedAt;

  const updateResponse = await adminFetch(
    `/api/admin/users/${encodeURIComponent(memberId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        expectedUpdatedAt,
        name: "QA 수정회원",
        nickname: "QA수정닉",
        email: updatedEmail,
        phone: "010-9876-5432",
        telephone: "031-111-2222",
        homepage: "https://example.invalid/updated",
        postcode: "56789",
        address1: "QA 수정 기본주소",
        address2: "QA 수정 상세주소",
        address3: "QA 수정 참고항목",
        adminMemo: `QA updated ${suffix}`,
        identityMethod: "ipin",
        identityVerified: true,
        emailVerified: false,
        adultVerified: false,
        publicProfile: false,
        signature: `QA updated signature ${suffix}`,
        profile: `QA updated profile ${suffix}`,
        verificationHistory: `QA updated verification ${suffix}`,
        withdrawnAt: "2026-07-01",
        blockedAt: "2026-07-02",
        memberIcon: "",
        memberImage: "",
        extra1: `QA updated extra1 ${suffix}`,
        extra10: `QA updated extra10 ${suffix}`,
        emailOptIn: false,
        smsOptIn: false,
        level: 3,
        active: true,
      }),
    },
  );
  assert.equal(updateResponse.status, 200);
  const updated = await updateResponse.json();
  assert.equal(updated.member.name, "QA 수정회원");
  assert.equal(updated.member.email, updatedEmail);
  assert.equal(updated.member.telephone, "031-111-2222");
  assert.equal(updated.member.address3, "QA 수정 참고항목");
  assert.equal(updated.member.adminMemo, `QA updated ${suffix}`);
  assert.equal(updated.member.identityMethod, "ipin");
  assert.equal(updated.member.identityVerified, true);
  assert.equal(updated.member.emailVerified, false);
  assert.equal(updated.member.adultVerified, false);
  assert.equal(updated.member.publicProfile, false);
  assert.equal(updated.member.signature, `QA updated signature ${suffix}`);
  assert.equal(updated.member.withdrawnAt, "2026-07-01");
  assert.equal(updated.member.blockedAt, "2026-07-02");
  assert.equal(updated.member.extra1, `QA updated extra1 ${suffix}`);
  assert.equal(updated.member.extra10, `QA updated extra10 ${suffix}`);
  assert.equal(updated.member.memberIcon, "");
  assert.equal(updated.member.memberImage, "");
  assert.equal(updated.member.emailOptIn, false);
  assert.equal(updated.member.smsOptIn, false);

  const memberListResponse = await adminFetch(
    `/adm/users?q=${encodeURIComponent(loginId)}`,
  );
  assert.equal(memberListResponse.status, 200);
  const memberListHtml = await memberListResponse.text();
  assert.match(memberListHtml, /legacy-member-table/u);
  assert.match(memberListHtml, new RegExp(loginId, "u"));
  assert.match(memberListHtml, /QA 수정회원/u);
  assert.match(memberListHtml, /031-111-2222/u);

  for (const url of [...memberMediaUrls]) {
    const removed = await deleteUploadedMemberImage(url);
    assert.equal(removed.status, 200);
    const publicImage = await fetch(`${baseUrl}${url}`);
    assert.equal(publicImage.status, 404);
    memberMediaUrls.splice(memberMediaUrls.indexOf(url), 1);
  }

  const staleResponse = await adminFetch(
    `/api/admin/users/${encodeURIComponent(memberId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        expectedUpdatedAt,
        nickname: "stale-write",
      }),
    },
  );
  assert.equal(staleResponse.status, 409);

  const expiresAt = new Date(Date.now() + 7 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const creditResponse = await adminFetch("/api/admin/points", {
    method: "POST",
    body: JSON.stringify({
      loginId,
      reason: `QA 적립 ${suffix}`,
      delta: 350,
      expiresAt,
    }),
  });
  assert.equal(creditResponse.status, 201);
  const credit = await creditResponse.json();
  pointEntryIds.push(credit.entry.id);
  assert.equal(credit.entry.balanceAfter, 475);

  const debitResponse = await adminFetch("/api/admin/points", {
    method: "POST",
    body: JSON.stringify({
      loginId,
      reason: `QA 차감 ${suffix}`,
      delta: -100,
      expiresAt: "",
    }),
  });
  assert.equal(debitResponse.status, 201);
  const debit = await debitResponse.json();
  pointEntryIds.push(debit.entry.id);
  assert.equal(debit.entry.balanceAfter, 375);

  const balanceResponse = await adminFetch(
    `/api/admin/users/${encodeURIComponent(memberId)}`,
  );
  assert.equal(balanceResponse.status, 200);
  assert.equal((await balanceResponse.json()).member.points, 375);

  const deleteResponse = await adminFetch("/api/admin/points", {
    method: "DELETE",
    body: JSON.stringify({
      entries: [
        { id: credit.entry.id, revision: credit.entry.revision },
        { id: debit.entry.id, revision: debit.entry.revision },
      ],
      reason: `QA 선택삭제 ${suffix}`,
    }),
  });
  assert.equal(deleteResponse.status, 200);
  const deleted = await deleteResponse.json();
  assert.deepEqual(
    new Set(deleted.deletedIds),
    new Set(pointEntryIds),
  );

  const restoredResponse = await adminFetch(
    `/api/admin/users/${encodeURIComponent(memberId)}`,
  );
  assert.equal(restoredResponse.status, 200);
  assert.equal((await restoredResponse.json()).member.points, 125);

  const staleDeleteResponse = await adminFetch("/api/admin/points", {
    method: "DELETE",
    body: JSON.stringify({
      entries: [{ id: credit.entry.id, revision: 1 }],
      reason: "QA 중복삭제 확인",
    }),
  });
  assert.equal(staleDeleteResponse.status, 409);

  const reportResponse = await adminFetch(
    `/adm/reports?view=points&q=${encodeURIComponent(loginId)}`,
  );
  assert.equal(reportResponse.status, 200);
  const reportHtml = await reportResponse.text();
  assert.match(reportHtml, /포인트관리/);

  console.log(
    JSON.stringify({
      ok: true,
      memberCreate: true,
      memberUpdate: true,
      extendedMemberFields: true,
      memberMediaUploadDelete: true,
      memberListRender: true,
      memberAccessGroupAssignRelease: true,
      staleMemberAccessGroupWriteBlocked: true,
      staleMemberWriteBlocked: true,
      pointCreditDebit: true,
      pointDeleteRestoredBalance: true,
      stalePointDeleteBlocked: true,
      crossOriginBlocked: true,
    }),
  );
} finally {
  cleanupQaRows();
  await cleanupMemberMedia();
}

function adminFetch(pathname, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  headers.set("Cookie", adminCookie);
  headers.set("Origin", baseUrl);
  if (init.body) headers.set("Content-Type", "application/json");
  return fetch(`${baseUrl}${pathname}`, { ...init, headers });
}

async function uploadMemberImage(fileName) {
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );
  const form = new FormData();
  form.set("file", new File([png], fileName, { type: "image/png" }));
  const response = await fetch(`${baseUrl}/api/admin/users/media`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Cookie: adminCookie,
      Origin: baseUrl,
    },
    body: form,
  });
  assert.equal(response.status, 201);
  const result = await response.json();
  assert.equal(result.ok, true);
  assert.match(result.url, /^\/api\/media\/[a-f0-9]{32}\.png$/u);
  memberMediaUrls.push(result.url);
  const publicImage = await fetch(`${baseUrl}${result.url}`);
  assert.equal(publicImage.status, 200);
  assert.equal(publicImage.headers.get("content-type"), "image/png");
  return result.url;
}

function deleteUploadedMemberImage(url) {
  return adminFetch("/api/admin/users/media", {
    method: "DELETE",
    body: JSON.stringify({ url }),
  });
}

async function cleanupMemberMedia() {
  for (const url of memberMediaUrls.splice(0)) {
    try {
      const response = await deleteUploadedMemberImage(url);
      if (response.status !== 200 && response.status !== 404) {
        console.error(`QA member media cleanup failed: ${response.status}`);
      }
    } catch (error) {
      console.error("QA member media cleanup failed.", error);
    }
  }
}

async function createLocalAdminCookie() {
  const values = Object.fromEntries(
    readFileSync(resolve(workspace, ".env.local"), "utf8")
      .split(/\r?\n/u)
      .filter((line) => line && !line.trimStart().startsWith("#"))
      .map((line) => {
        const separator = line.indexOf("=");
        return separator < 0
          ? ["", ""]
          : [
              line.slice(0, separator).trim(),
              line.slice(separator + 1).trim(),
            ];
      })
      .filter(([key]) => key),
  );
  assert.ok(values.ADMIN_USERNAME);
  assert.ok(values.SESSION_SECRET?.length >= 32);
  const now = Math.floor(Date.now() / 1_000);
  const payload = {
    version: 1,
    subject: values.ADMIN_USERNAME,
    role: "admin",
    issuedAt: now,
    expiresAt: now + 60 * 60,
    nonce: crypto.randomUUID().replace(/-/gu, ""),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(values.SESSION_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(encoded),
  );
  return `admin_session=${encoded}.${Buffer.from(signature).toString("base64url")}`;
}

function cleanupQaRows() {
  const databaseDirectory = resolve(
    workspace,
    ".wrangler/state/v3/d1/miniflare-D1DatabaseObject",
  );
  if (!existsSync(databaseDirectory)) return;
  const databaseFiles = readdirSync(databaseDirectory)
    .filter((name) => name.endsWith(".sqlite") && name !== "metadata.sqlite")
    .map((name) => join(databaseDirectory, name));
  for (const databaseFile of databaseFiles) {
    const database = new DatabaseSync(databaseFile);
    database.exec("PRAGMA busy_timeout = 5000");
    try {
      if (!tableExists(database, "users")) continue;
      const storedMember = database
        .prepare("SELECT id FROM users WHERE login_id = ? LIMIT 1")
        .get(loginId);
      const cleanupMemberId = memberId || storedMember?.id || "";
      if (!cleanupMemberId && pointEntryIds.length === 0) continue;
      database.exec("BEGIN IMMEDIATE");
      try {
        if (
          tableExists(database, "admin_point_write_guards") &&
          cleanupMemberId
        ) {
          database
            .prepare(
              `DELETE FROM admin_point_write_guards
               WHERE target_id = ? OR target_id IN (
                 SELECT id FROM admin_point_ledger WHERE user_id = ?
               )`,
            )
            .run(cleanupMemberId, cleanupMemberId);
        }
        if (tableExists(database, "admin_point_ledger")) {
          if (pointEntryIds.length > 0) {
            const placeholders = pointEntryIds.map(() => "?").join(", ");
            database
              .prepare(
                `DELETE FROM admin_point_ledger
                 WHERE id IN (${placeholders})`,
              )
              .run(...pointEntryIds);
          }
          if (cleanupMemberId) {
            database
              .prepare("DELETE FROM admin_point_ledger WHERE user_id = ?")
              .run(cleanupMemberId);
          }
        }
        if (tableExists(database, "admin_audit_logs")) {
          const entityIds = [
            ...(cleanupMemberId ? [cleanupMemberId] : []),
            ...pointEntryIds,
          ];
          if (entityIds.length > 0) {
            const placeholders = entityIds.map(() => "?").join(", ");
            database
              .prepare(
                `DELETE FROM admin_audit_logs
                 WHERE entity_id IN (${placeholders})`,
              )
              .run(...entityIds);
          }
        }
        if (cleanupMemberId && tableExists(database, "user_session_state")) {
          database
            .prepare("DELETE FROM user_session_state WHERE user_id = ?")
            .run(cleanupMemberId);
        }
        if (cleanupMemberId) {
          database.prepare("DELETE FROM users WHERE id = ?").run(cleanupMemberId);
        }
        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
      const remains = database
        .prepare(
          `SELECT COUNT(*) AS count FROM users
           WHERE id = ? OR login_id = ? OR email IN (?, ?)`,
        )
        .get(cleanupMemberId, loginId, originalEmail, updatedEmail);
      assert.equal(Number(remains.count), 0, "QA 회원 정리가 완료돼야 합니다.");
    } finally {
      database.close();
    }
  }
}

function tableExists(database, table) {
  return Boolean(
    database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
      )
      .get(table),
  );
}
