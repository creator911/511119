import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("administrator sessions are rejected while a customer session is present", async () => {
  const auth = await source("lib/auth.ts");
  const sessionReader = auth.slice(
    auth.indexOf("export async function getAdminSession"),
    auth.indexOf("export async function requireAdminSession"),
  );

  assert.match(auth, /CUSTOMER_SESSION_COOKIE_NAME = "kg_customer"/u);
  assert.match(
    sessionReader,
    /readCookieFromHeader\(cookieHeader, CUSTOMER_SESSION_COOKIE_NAME\)/u,
  );
  assert.match(
    sessionReader,
    /cookieStore\.get\(CUSTOMER_SESSION_COOKIE_NAME\)\?\.value/u,
  );
});

test("customer and administrator logins expire the opposite role session", async () => {
  const [customerRoute, adminRoute] = await Promise.all([
    source("app/api/customer/session/route.ts"),
    source("app/api/admin/session/route.ts"),
  ]);

  assert.match(customerRoute, /expireAdminSessionCookies\(response\)/u);
  assert.match(
    customerRoute,
    /clearAdminSessionCookie\(true\)[\s\S]*clearAdminSessionCookie\(false\)/u,
  );
  assert.match(customerRoute, /clearCustomerSessionCookie\(request\)/u);
  assert.match(adminRoute, /clearCustomerSessionCookie\(request\)/u);
  assert.match(
    adminRoute,
    /clearAdminSessionCookie\(true\)[\s\S]*clearAdminSessionCookie\(false\)/u,
  );
});
