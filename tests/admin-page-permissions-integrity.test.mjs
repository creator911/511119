import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  canAccessAdminRequirement,
  LEGACY_ADMIN_TOOL_PERMISSION_BY_SLUG,
  requiredAdminApiPermission,
  requiredLegacyAdminToolPermission,
} from "../lib/admin-permissions.ts";
import { legacyAdminToolDefinitions } from "../lib/admin-tool-catalog.ts";

const source = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("page access checks are deny-by-default for secondary administrators", () => {
  const secondary = {
    accountType: "secondary",
    permissions: ["catalog.manage"],
  };
  assert.equal(
    canAccessAdminRequirement(secondary, "catalog.manage"),
    true,
  );
  assert.equal(
    canAccessAdminRequirement(secondary, "orders.manage"),
    false,
  );
  assert.equal(canAccessAdminRequirement(secondary, "primary"), false);
  assert.equal(
    canAccessAdminRequirement(
      { accountType: "primary", permissions: ["*"] },
      "primary",
    ),
    true,
  );
});

test("every legacy tool has an explicit least-privilege scope", () => {
  for (const definition of legacyAdminToolDefinitions) {
    assert.equal(
      Object.hasOwn(LEGACY_ADMIN_TOOL_PERMISSION_BY_SLUG, definition.slug),
      true,
      `${definition.slug} must have an explicit permission`,
    );
  }

  assert.equal(
    requiredLegacyAdminToolPermission("product-stock"),
    "catalog.manage",
  );
  assert.equal(
    requiredLegacyAdminToolPermission("personal-payments"),
    "orders.manage",
  );
  assert.equal(
    requiredLegacyAdminToolPermission("visitor-search"),
    "members.manage",
  );
  assert.equal(
    requiredLegacyAdminToolPermission("admin-permissions"),
    "admins.manage",
  );
  assert.equal(
    requiredLegacyAdminToolPermission("db-upgrade"),
    "primary",
  );
  assert.equal(
    requiredLegacyAdminToolPermission("unknown-future-tool"),
    "primary",
  );
});

test("tool APIs use the tool scope and unknown tools remain primary-only", () => {
  assert.equal(
    requiredAdminApiPermission("/api/admin/tools/product-types"),
    "catalog.manage",
  );
  assert.equal(
    requiredAdminApiPermission("/api/admin/tools/sms-phones/record-1"),
    "members.manage",
  );
  assert.equal(
    requiredAdminApiPermission("/api/admin/tools/db-upgrade"),
    "primary",
  );
  assert.equal(
    requiredAdminApiPermission("/api/admin/tools/future-tool"),
    "primary",
  );
});

test("every data-bearing administrator page checks its server-side scope", async () => {
  const expectedGuards = new Map([
    ["app/adm/(protected)/page.tsx", "dashboard.view"],
    ["app/adm/(protected)/banners/page.tsx", "catalog.manage"],
    ["app/adm/(protected)/categories/page.tsx", "catalog.manage"],
    ["app/adm/(protected)/community/page.tsx", "content.manage"],
    ["app/adm/(protected)/content/page.tsx", "content.manage"],
    ["app/adm/(protected)/orders/page.tsx", "orders.manage"],
    ["app/adm/(protected)/products/page.tsx", "catalog.manage"],
    ["app/adm/(protected)/products/new/page.tsx", "catalog.manage"],
    ["app/adm/(protected)/products/[id]/page.tsx", "catalog.manage"],
    ["app/adm/(protected)/users/page.tsx", "members.manage"],
    ["app/adm/(protected)/wallet/page.tsx", "wallet.manage"],
  ]);

  for (const [path, permission] of expectedGuards) {
    const page = await source(path);
    const body = page.slice(page.indexOf("export default"));
    assert.match(
      body,
      new RegExp(
        `await requireAdminPagePermission\\("${permission.replace(".", "\\.")}"\\)`,
        "u",
      ),
      `${path} must check ${permission}`,
    );
  }
});

test("dynamic administrator views resolve permissions before rendering", async () => {
  const [settings, tools, reports, auth, forbidden] = await Promise.all([
    source("app/adm/(protected)/settings/page.tsx"),
    source("app/adm/(protected)/tools/[tool]/page.tsx"),
    source("app/adm/(protected)/reports/page.tsx"),
    source("lib/auth.ts"),
    source("app/adm/(protected)/forbidden/page.tsx"),
  ]);

  assert.match(
    settings,
    /activeView === "permissions" \? "admins\.manage" : "settings\.manage"/u,
  );
  assert.match(tools, /requiredLegacyAdminToolPermission\(tool\)/u);
  assert.match(
    tools,
    /requireAdminPagePermission\([\s\S]*requiredLegacyAdminToolPermission/u,
  );
  assert.match(
    reports,
    /activeView === "incomplete"[\s\S]*\? "orders\.manage"[\s\S]*activeView === "points"[\s\S]*\? "members\.manage"[\s\S]*: "reports\.view"/u,
  );
  assert.ok(
    reports.indexOf("await requireAdminPagePermission") <
      reports.indexOf("let reportPayload"),
  );
  assert.match(auth, /canAccessAdminRequirement\(session, required\)/u);
  assert.match(auth, /redirect\("\/adm\/forbidden"\)/u);
  assert.match(forbidden, /접근 권한 없음/u);
  assert.doesNotMatch(forbidden, /requireAdminPagePermission/u);
});
