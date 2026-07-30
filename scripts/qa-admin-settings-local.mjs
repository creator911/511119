import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const base = new URL(process.env.QA_BASE_URL || "http://localhost:4173");
const env = Object.fromEntries(
  (await readFile(resolve(process.cwd(), ".env.local"), "utf8"))
    .split(/\r?\n/u)
    .filter((line) => line && !line.trimStart().startsWith("#"))
    .map((line) => {
      const separator = line.indexOf("=");
      return separator < 0
        ? ["", ""]
        : [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
    })
    .filter(([key]) => key),
);
assert.ok(env.ADMIN_USERNAME);
assert.ok(env.SESSION_SECRET?.length >= 32);

const cookie = await createAdminCookie(
  env.ADMIN_USERNAME,
  env.SESSION_SECRET,
);
const headers = {
  Accept: "application/json",
  Cookie: cookie,
  Origin: base.origin,
  "Content-Type": "application/json",
};

const pageResponse = await fetch(new URL("/adm/settings", base), {
  headers: { Accept: "text/html", Cookie: cookie },
});
const pageHtml = await pageResponse.text();
assert.equal(pageResponse.status, 200);
assert.match(pageHtml, /id="anc_cf_basic"/u);
assert.match(pageHtml, /id="anc_cf_extra"/u);
assert.match(pageHtml, /name="cf_title"/u);
assert.match(pageHtml, /name="cf_10"/u);
assert.equal((pageHtml.match(/legacy-config-table"/gu) ?? []).length, 13);

const initial = await readSettings();
assert.ok(initial.settings);
assert.ok(initial.legacySettings);
assert.ok(initial.providerStatus);
assert.equal(initial.legacySettings.cf_title, initial.settings.companyName);
assert.equal(initial.legacySettings.cf_admin_email, initial.settings.email);
assert.equal(initial.legacySettings.cf_recaptcha_secret_key, "");
assert.equal(initial.legacySettings.cf_icode_token_key, "");

const changedPhone =
  initial.settings.customerServicePhone === "02-0000-0000"
    ? "02-0000-0001"
    : "02-0000-0000";
const changedExtra =
  initial.legacySettings.cf_10 === "설정 기능 검증"
    ? "설정 기능 재검증"
    : "설정 기능 검증";
let changed = false;
try {
  const updated = await patchSettings({
    siteSettings: {
      ...initial.settings,
      customerServicePhone: changedPhone,
    },
    legacySettings: {
      ...initial.legacySettings,
      cf_10: changedExtra,
    },
  });
  changed = true;
  assert.equal(updated.settings.customerServicePhone, changedPhone);
  assert.equal(updated.legacySettings.cf_10, changedExtra);

  const reloaded = await readSettings();
  assert.equal(reloaded.settings.customerServicePhone, changedPhone);
  assert.equal(reloaded.legacySettings.cf_10, changedExtra);

  const unknownResponse = await fetch(
    new URL("/api/admin/settings", base),
    {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        siteSettings: initial.settings,
        legacySettings: {
          ...initial.legacySettings,
          unexpectedSetting: "blocked",
        },
      }),
    },
  );
  assert.equal(unknownResponse.status, 400);

  if (!initial.providerStatus.sms.configured) {
    const failClosedResponse = await fetch(
      new URL("/api/admin/settings", base),
      {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          siteSettings: initial.settings,
          legacySettings: {
            ...initial.legacySettings,
            cf_sms_use: "icode",
          },
        }),
      },
    );
    assert.equal(failClosedResponse.status, 400);
  }
} finally {
  if (changed) {
    await patchSettings({
      siteSettings: initial.settings,
      legacySettings: initial.legacySettings,
    });
  }
}

const restored = await readSettings();
assert.deepEqual(restored.settings, initial.settings);
assert.deepEqual(restored.legacySettings, initial.legacySettings);

console.log(
  JSON.stringify({
    ok: true,
    actualSaveReloadRestore: true,
    storefrontFieldsPersisted: true,
    legacyAllowlistRejectedUnknown: true,
    providersFailClosed: true,
    secretsNotReturned: true,
  }),
);

async function readSettings() {
  const response = await fetch(new URL("/api/admin/settings", base), {
    headers,
  });
  const payload = await response.json();
  assert.equal(response.status, 200, payload.message);
  return payload;
}

async function patchSettings(body) {
  const response = await fetch(new URL("/api/admin/settings", base), {
    method: "PATCH",
    headers,
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  assert.equal(response.status, 200, payload.message);
  assert.ok(payload.settings);
  assert.ok(payload.legacySettings);
  return payload;
}

async function createAdminCookie(username, secret) {
  const now = Math.floor(Date.now() / 1_000);
  const payload = {
    version: 1,
    subject: username,
    role: "admin",
    issuedAt: now,
    expiresAt: now + 60 * 60,
    nonce: crypto.randomUUID().replace(/-/gu, ""),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(encoded),
  );
  return `admin_session=${encoded}.${Buffer.from(signature).toString(
    "base64url",
  )}`;
}
