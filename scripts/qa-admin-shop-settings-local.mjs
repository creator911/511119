import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const workspace = process.cwd();
const baseUrl =
  process.env.QA_BASE_URL?.replace(/\/+$/u, "") ??
  "http://localhost:4173";
const adminCookie = await createLocalAdminCookie();
let before;
let wroteSettings = false;

try {
  const initialResponse = await adminFetch("/api/admin/shop-settings");
  assert.equal(initialResponse.status, 200);
  const initial = await initialResponse.json();
  assert.equal(initial.ok, true);
  assert.equal(typeof initial.revision, "number");
  assert.equal(Object.keys(initial.values).length, 195);
  assert.equal(initial.providerStatus.pg.configured, false);
  assert.equal(initial.values.de_card_use, "0");
  assert.equal(initial.values.de_iche_use, "0");
  assert.equal(initial.values.de_vbank_use, "0");
  assert.equal(initial.values.de_hp_use, "0");
  before = structuredClone(initial);

  const pageResponse = await adminFetch("/adm/settings?view=shop");
  assert.equal(pageResponse.status, 200);
  const pageHtml = await pageResponse.text();
  for (const caption of [
    "사업자정보 입력",
    "스킨설정",
    "쇼핑몰 초기화면 설정",
    "모바일 쇼핑몰 초기화면 설정",
    "결제설정 입력",
    "배송설정 입력",
    "기타 설정",
    "SMS 설정",
  ]) {
    assert.match(pageHtml, new RegExp(`<caption>${caption}</caption>`, "u"));
  }
  for (const label of [
    "사업자정보",
    "스킨설정",
    "쇼핑몰 초기화면",
    "모바일 초기화면",
    "결제설정",
    "배송설정",
    "기타설정",
    "SMS설정",
    "사전에 정의된 SMS프리셋",
    "테마 스킨설정 가져오기",
    "테마설정 가져오기",
    "쇼핑몰",
    "확인",
  ]) {
    assert.match(pageHtml, new RegExp(label, "u"));
  }
  const formMatch = pageHtml.match(
    /<form\b[^>]*name="fconfig"[^>]*>([\s\S]*?)<\/form>/u,
  );
  assert.ok(formMatch, "fconfig form should render");
  const formHtml = formMatch[1];
  const namedControls =
    formHtml.match(
      /<(?:input|select|textarea|button)\b[^>]*\bname="[^"]+"[^>]*>/gu,
    ) ?? [];
  assert.equal(namedControls.length, 198);
  const allFormControls =
    formHtml.match(/<(?:input|select|textarea|button)\b[^>]*>/gu) ?? [];
  assert.equal(allFormControls.length, 217);

  const crossOrigin = await fetch(`${baseUrl}/api/admin/shop-settings`, {
    method: "PATCH",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Cookie: adminCookie,
      Origin: "https://example.invalid",
    },
    body: JSON.stringify({
      expectedRevision: before.revision,
      values: before.values,
    }),
  });
  assert.equal(crossOrigin.status, 403);

  const secretAttempt = await adminFetch("/api/admin/shop-settings", {
    method: "PATCH",
    body: JSON.stringify({
      expectedRevision: before.revision,
      values: { ...before.values, de_kcp_site_key: "must-not-persist" },
    }),
  });
  assert.equal(secretAttempt.status, 400);

  const unknownAttempt = await adminFetch("/api/admin/shop-settings", {
    method: "PATCH",
    body: JSON.stringify({
      expectedRevision: before.revision,
      values: { ...before.values, unexpected_setting: "blocked" },
    }),
  });
  assert.equal(unknownAttempt.status, 400);

  const pgAttempt = await adminFetch("/api/admin/shop-settings", {
    method: "PATCH",
    body: JSON.stringify({
      expectedRevision: before.revision,
      values: { ...before.values, de_card_use: "1" },
    }),
  });
  assert.equal(pgAttempt.status, 400);

  const marker = `QA-${crypto.randomUUID().slice(0, 8)}`;
  const updateResponse = await adminFetch("/api/admin/shop-settings", {
    method: "PATCH",
    body: JSON.stringify({
      expectedRevision: before.revision,
      values: { ...before.values, de_admin_company_fax: marker },
    }),
  });
  assert.equal(updateResponse.status, 200);
  const updated = await updateResponse.json();
  wroteSettings = true;
  assert.equal(updated.ok, true);
  assert.equal(updated.revision, before.revision + 1);
  assert.equal(updated.values.de_admin_company_fax, marker);

  const reloadResponse = await adminFetch("/api/admin/shop-settings");
  assert.equal(reloadResponse.status, 200);
  const reloaded = await reloadResponse.json();
  assert.equal(reloaded.revision, updated.revision);
  assert.equal(reloaded.values.de_admin_company_fax, marker);
  assert.equal(reloaded.values.de_kcp_site_key, "");

  const staleResponse = await adminFetch("/api/admin/shop-settings", {
    method: "PATCH",
    body: JSON.stringify({
      expectedRevision: before.revision,
      values: { ...before.values, de_admin_company_fax: "stale" },
    }),
  });
  assert.equal(staleResponse.status, 409);

  const restoreResponse = await adminFetch("/api/admin/shop-settings", {
    method: "PATCH",
    body: JSON.stringify({
      expectedRevision: updated.revision,
      values: before.values,
    }),
  });
  assert.equal(restoreResponse.status, 200);
  const restored = await restoreResponse.json();
  wroteSettings = false;
  assert.deepEqual(restored.values, before.values);
  assert.equal(restored.values.de_kcp_site_key, "");
  assert.equal(restored.values.cf_icode_pw, "");
  assert.equal(restored.values.cf_icode_token_key, "");

  console.log(
    JSON.stringify(
      {
        ok: true,
        checks: [
          "eightLegacyTablesRendered",
          "namedControls198",
          "allFormControls217",
          "smsPresetEditorsRendered",
          "crossOriginBlocked",
          "secretWriteBlocked",
          "unknownFieldBlocked",
          "unconfiguredPgActivationBlocked",
          "safeSettingSavedAndReloaded",
          "staleRevisionBlocked",
          "effectiveValuesRestored",
        ],
      },
      null,
      2,
    ),
  );
} finally {
  if (before && wroteSettings) {
    try {
      const currentResponse = await adminFetch("/api/admin/shop-settings");
      if (currentResponse.ok) {
        const current = await currentResponse.json();
        await adminFetch("/api/admin/shop-settings", {
          method: "PATCH",
          body: JSON.stringify({
            expectedRevision: current.revision,
            values: before.values,
          }),
        });
      }
    } catch {
      // Best-effort restore while preserving the original assertion failure.
    }
  }
}

function adminFetch(pathname, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  headers.set("Cookie", adminCookie);
  headers.set("Origin", baseUrl);
  if (init.body) headers.set("Content-Type", "application/json");
  return fetch(`${baseUrl}${pathname}`, { ...init, headers });
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
    nonce: crypto.randomUUID().replaceAll("-", ""),
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
