import assert from "node:assert/strict";

const baseUrl = (process.env.QA_BASE_URL ?? "http://localhost:4173").replace(
  /\/+$/u,
  "",
);
const username = process.env.QA_ADMIN_USERNAME ?? "admin";
const password = process.env.QA_ADMIN_PASSWORD;

if (!password) {
  throw new Error("QA_ADMIN_PASSWORD is required.");
}

const login = await fetch(`${baseUrl}/api/admin/session`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Origin: baseUrl,
  },
  body: JSON.stringify({ username, password }),
  redirect: "manual",
});
assert.equal(login.status, 200, `administrator login returned ${login.status}`);
const setCookie = login.headers.get("set-cookie") ?? "";
const cookie = setCookie.split(";", 1)[0];
assert.ok(cookie.includes("="), "administrator session cookie was not issued");

const authenticatedHeaders = {
  Cookie: cookie,
  Origin: baseUrl,
};
const page = await fetch(
  `${baseUrl}/adm/settings?view=permissions`,
  {
    headers: { Cookie: cookie },
    redirect: "manual",
  },
);
assert.equal(page.status, 200, `permission page returned ${page.status}`);
const pageHtml = await page.text();
assert.match(pageHtml, /legacy-permission-manager/u);

const list = await fetch(
  `${baseUrl}/api/admin/accounts/menu-permissions`,
  { headers: authenticatedHeaders },
);
assert.equal(list.status, 200, `permission API returned ${list.status}`);
const payload = await list.json();
assert.equal(payload.ok, true);
assert.equal(String(payload.challenge?.code ?? "").length, 5);
assert.equal(
  payload.rows.some((row) => row.username === username),
  false,
  "the primary administrator must not appear in the permission list",
);

const writePermission = (origin, captchaAnswer) =>
  fetch(`${baseUrl}/api/admin/accounts/menu-permissions`, {
    method: "POST",
    headers: {
      Cookie: cookie,
      Origin: origin,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      username,
      menuCode: "100100",
      auth: ["r"],
      expectedRevision: 0,
      captchaId: payload.challenge.id,
      captchaAnswer,
    }),
  });

const foreignOrigin = await writePermission(
  "https://foreign-origin.invalid",
  payload.challenge.code,
);
assert.equal(foreignOrigin.status, 403);

const wrongCode =
  payload.challenge.code === "00000" ? "99999" : "00000";
const wrongCaptcha = await writePermission(baseUrl, wrongCode);
assert.equal(wrongCaptcha.status, 400);

const replayedCaptcha = await writePermission(
  baseUrl,
  payload.challenge.code,
);
assert.equal(
  replayedCaptcha.status,
  400,
  "a failed CAPTCHA challenge must not be reusable",
);

console.log(
  JSON.stringify(
    {
      login: login.status,
      page: page.status,
      api: list.status,
      permissionRows: payload.total,
      primaryExcluded: true,
      foreignOriginRejected: foreignOrigin.status,
      wrongCaptchaRejected: wrongCaptcha.status,
      captchaReplayRejected: replayedCaptcha.status,
    },
    null,
    2,
  ),
);
