import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { legacyAdminToolDefinitions } from "../lib/admin-tool-catalog.ts";

const source = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

const pageByPath = new Map([
  ["/", "app/page.tsx"],
  ["/shop", "app/shop/page.tsx"],
  ["/adm", "app/adm/(protected)/page.tsx"],
  ["/adm/banners", "app/adm/(protected)/banners/page.tsx"],
  ["/adm/categories", "app/adm/(protected)/categories/page.tsx"],
  ["/adm/community", "app/adm/(protected)/community/page.tsx"],
  ["/adm/content", "app/adm/(protected)/content/page.tsx"],
  ["/adm/orders", "app/adm/(protected)/orders/page.tsx"],
  ["/adm/products", "app/adm/(protected)/products/page.tsx"],
  ["/adm/reports", "app/adm/(protected)/reports/page.tsx"],
  ["/adm/settings", "app/adm/(protected)/settings/page.tsx"],
  ["/adm/shop-overview", "app/adm/(protected)/shop-overview/page.tsx"],
  ["/adm/users", "app/adm/(protected)/users/page.tsx"],
  ["/adm/wallet", "app/adm/(protected)/wallet/page.tsx"],
]);

const allowedQueryValues = new Map([
  ["/adm/community:view", new Set(["boards", "groups", "inquiry-settings", "posts"])],
  ["/adm/content:view", new Set(["inquiries", "reviews"])],
  ["/adm/reports:view", new Set(["incomplete", "points", "ranking", "sales"])],
  ["/adm/settings:view", new Set(["permissions", "shop"])],
  ["/adm/wallet:kind", new Set(["charge", "withdrawal"])],
]);

test("all administrator shell links resolve to implemented pages", async () => {
  const shell = await source("app/components/admin/AdminShell.tsx");
  const navigationBlock = shell.slice(
    shell.indexOf("export const KIEL_ADMIN_NAVIGATION"),
    shell.indexOf("export const KIEL_ADMIN_UTILITY_ACTIONS"),
  );
  const navigationHrefs = [
    ...navigationBlock.matchAll(/href:\s*"([^"]+)"/gu),
  ].map((match) => match[1]);
  assert.equal(navigationHrefs.length, 66);
  assert.equal(new Set(navigationHrefs).size, navigationHrefs.length);

  const jsxHrefs = [...shell.matchAll(/href="([^"]+)"/gu)].map(
    (match) => match[1],
  );
  const hrefs = new Set([...navigationHrefs, ...jsxHrefs]);
  const toolSlugs = new Set(
    legacyAdminToolDefinitions.map((definition) => definition.slug),
  );
  const toolPage = await source(
    "app/adm/(protected)/tools/[tool]/page.tsx",
  );

  for (const href of hrefs) {
    if (href.startsWith("#")) {
      assert.match(shell, new RegExp(`id="${href.slice(1)}"`));
      continue;
    }

    const url = new URL(href, "https://local.invalid");
    if (url.pathname.startsWith("/adm/tools/")) {
      const slug = url.pathname.slice("/adm/tools/".length);
      assert.ok(toolSlugs.has(slug), `${href} has no tool definition`);
      assert.match(toolPage, /getLegacyAdminToolDefinition\(tool\)/u);
      continue;
    }

    const pagePath = pageByPath.get(url.pathname);
    assert.ok(pagePath, `${href} has no page route mapping`);
    await assert.doesNotReject(source(pagePath));

    for (const [key, value] of url.searchParams) {
      const allowed = allowedQueryValues.get(`${url.pathname}:${key}`);
      assert.ok(allowed, `${href} uses an unsupported query key`);
      assert.ok(allowed.has(value), `${href} uses an unsupported query value`);
      const page = await source(pagePath);
      assert.ok(
        page.includes(`"${value}"`),
        `${href} is not recognized by its page`,
      );
    }
  }
});

test("all administrator client API families have authenticated route handlers", async () => {
  const routeFiles = [
    "app/api/admin/accounts/route.ts",
    "app/api/admin/accounts/[id]/route.ts",
    "app/api/admin/accounts/[id]/password/route.ts",
    "app/api/admin/banners/route.ts",
    "app/api/admin/banners/[id]/route.ts",
    "app/api/admin/categories/route.ts",
    "app/api/admin/categories/[id]/route.ts",
    "app/api/admin/community/route.ts",
    "app/api/admin/content/route.ts",
    "app/api/admin/content/[id]/route.ts",
    "app/api/admin/interactions/route.ts",
    "app/api/admin/interactions/[id]/route.ts",
    "app/api/admin/media/route.ts",
    "app/api/admin/orders/route.ts",
    "app/api/admin/orders/[id]/route.ts",
    "app/api/admin/orders/print/route.ts",
    "app/api/admin/products/route.ts",
    "app/api/admin/products/[id]/route.ts",
    "app/api/admin/products/bulk/route.ts",
    "app/api/admin/settings/route.ts",
    "app/api/admin/tools/[tool]/route.ts",
    "app/api/admin/tools/[tool]/[recordId]/route.ts",
    "app/api/admin/users/route.ts",
    "app/api/admin/users/[id]/route.ts",
    "app/api/admin/wallet/requests/route.ts",
    "app/api/admin/wallet/requests/[id]/route.ts",
  ];

  for (const routeFile of routeFiles) {
    const route = await source(routeFile);
    assert.match(
      route,
      /requireAdminApiSession\(request\)/u,
      `${routeFile} must authenticate the administrator`,
    );
  }

  const sessionRoute = await source("app/api/admin/session/route.ts");
  assert.match(sessionRoute, /export async function POST/u);
  assert.match(sessionRoute, /export async function DELETE/u);
});

test("administrator redirects land on guarded implemented pages", async () => {
  const [tools, products, orders, settings] = await Promise.all([
    source("app/adm/(protected)/tools/[tool]/page.tsx"),
    source("app/adm/(protected)/products/page.tsx"),
    source("app/adm/(protected)/orders/page.tsx"),
    source("app/adm/(protected)/settings/page.tsx"),
  ]);

  assert.match(tools, /redirect\("\/adm\/products\?view=stock"\)/u);
  assert.match(tools, /redirect\("\/adm\/orders\?print=1"\)/u);
  assert.match(
    tools,
    /redirect\("\/adm\/settings\?view=permissions"\)/u,
  );
  assert.match(products, /requireAdminPagePermission\("catalog\.manage"\)/u);
  assert.match(orders, /requireAdminPagePermission\("orders\.manage"\)/u);
  assert.match(settings, /"admins\.manage"/u);
});
