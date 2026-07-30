import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const workspace = process.cwd();
const base = new URL(process.env.QA_BASE_URL || "http://localhost:4173");
const [adminShell, envSource] = await Promise.all([
  readFile(
    resolve(workspace, "app/components/admin/AdminShell.tsx"),
    "utf8",
  ),
  readFile(resolve(workspace, ".env.local"), "utf8"),
]);

const env = Object.fromEntries(
  envSource
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

assert.ok(env.ADMIN_USERNAME, "ADMIN_USERNAME이 필요합니다.");
assert.ok(
  env.SESSION_SECRET?.length >= 32,
  "32자 이상의 SESSION_SECRET이 필요합니다.",
);

const routes = new Set([
  "/adm",
  "/adm/banners",
  "/adm/categories",
  "/adm/content?view=faq",
  "/adm/content?view=inquiries",
  "/adm/content?view=reviews",
  "/adm/community?view=groups",
  "/adm/community?view=boards",
  "/adm/community?view=posts",
  "/adm/community?view=comments",
  "/adm/community?view=inquiries",
  "/adm/community?view=inquiry-settings",
  "/adm/orders",
  "/adm/orders?print=1",
  "/adm/products",
  "/adm/products?view=stock",
  "/adm/products/new",
  "/adm/reports",
  "/adm/reports?view=ranking",
  "/adm/reports?view=incomplete&mode=all",
  "/adm/reports?view=points",
  "/adm/settings",
  "/adm/settings?view=permissions",
  "/adm/settings?view=shop",
  "/adm/users",
  "/adm/wallet",
  "/adm/wallet?kind=charge",
  "/adm/wallet?kind=withdrawal",
]);

for (const match of adminShell.matchAll(/href:\s*"([^"]+)"/gu)) {
  if (match[1].startsWith("/adm")) routes.add(match[1]);
}

const cookie = await createAdminCookie(env.ADMIN_USERNAME, env.SESSION_SECRET);
const failures = [];
const results = [];
const routeList = [...routes].sort();

for (let offset = 0; offset < routeList.length; offset += 8) {
  const batch = routeList.slice(offset, offset + 8);
  const batchResults = await Promise.all(
    batch.map(async (route) => {
      try {
        const response = await fetch(new URL(route, base), {
          headers: {
            Accept: "text/html",
            Cookie: cookie,
          },
          redirect: "follow",
        });
        const body = await response.text();
        const finalPath = `${new URL(response.url).pathname}${
          new URL(response.url).search
        }`;
        const errorText =
          /Internal Server Error|Application error|Unhandled Runtime Error|This page could not be found/iu.test(
            body,
          );
        const result = {
          route,
          status: response.status,
          finalPath,
          administrator: body.includes("ADMINISTRATOR"),
          errorText,
        };
        if (
          response.status !== 200 ||
          new URL(response.url).pathname === "/adm/login" ||
          !result.administrator ||
          errorText
        ) {
          failures.push({
            ...result,
            bodySnippet: body
              .replace(/<[^>]*>/gu, " ")
              .replace(/\s+/gu, " ")
              .trim()
              .slice(0, 500),
          });
        }
        return result;
      } catch (error) {
        const result = {
          route,
          status: 0,
          finalPath: "",
          administrator: false,
          errorText: true,
          message: error instanceof Error ? error.message : String(error),
        };
        failures.push(result);
        return result;
      }
    }),
  );
  results.push(...batchResults);
}

console.log(
  JSON.stringify(
    {
      ok: failures.length === 0,
      checked: results.length,
      failures,
    },
    null,
    2,
  ),
);

if (failures.length > 0) process.exitCode = 1;

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
