import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("additional services renders and persists its settings editor", async () => {
  const [manager, maintenance, catalog, library] = await Promise.all([
    source("app/adm/(protected)/tools/[tool]/LegacyAdminToolManager.tsx"),
    source("app/adm/(protected)/tools/[tool]/SystemMaintenanceTool.tsx"),
    source("lib/admin-tool-catalog.ts"),
    source("lib/admin-tools.ts"),
  ]);

  assert.match(catalog, /slug: "additional-services"[\s\S]{0,500}kind: "settings"/u);
  assert.match(manager, /definition\.kind === "settings"/u);
  assert.doesNotMatch(
    manager,
    /"db-upgrade",\s*"additional-services"/u,
  );
  assert.doesNotMatch(
    maintenance,
    /definition\.slug === "additional-services"/u,
  );
  assert.match(library, /ON CONFLICT\(tool_key\) DO UPDATE/u);
});

test("clubs have dedicated durable public and administrative workflows", async () => {
  const [
    schema,
    migration,
    library,
    publicRoute,
    publicPage,
    publicClient,
    adminCollection,
    adminItem,
    adminManager,
    page,
    permissions,
  ] = await Promise.all([
    source("db/schema.ts"),
    source("drizzle/0010_clubs_mail_feed.sql"),
    source("lib/clubs.ts"),
    source("app/api/clubs/route.ts"),
    source("app/clubs/page.tsx"),
    source("app/clubs/ClubsClient.tsx"),
    source("app/api/admin/clubs/route.ts"),
    source("app/api/admin/clubs/[clubId]/route.ts"),
    source("app/adm/(protected)/tools/[tool]/ClubAdminManager.tsx"),
    source("app/adm/(protected)/tools/[tool]/page.tsx"),
    source("lib/admin-permissions.ts"),
  ]);

  assert.match(schema, /export const clubs = sqliteTable/u);
  assert.match(migration, /CREATE TABLE `clubs`/u);
  assert.match(library, /CREATE TABLE IF NOT EXISTS clubs/u);
  assert.match(library, /getLegacyAdminToolSettings\("club-settings"\)/u);
  assert.match(library, /status IN \('pending', 'approved'\)/u);
  assert.match(library, /WHERE status = 'approved'/u);
  assert.doesNotMatch(library, /admin_tool_records/u);

  assert.match(publicRoute, /getCustomerSession\(request\)/u);
  assert.match(publicRoute, /assertSameOrigin\(request\)/u);
  assert.match(publicRoute, /createClubApplication/u);
  assert.match(publicPage, /<ClubsClient/u);
  assert.match(publicClient, /\/api\/clubs/u);
  assert.match(publicClient, /viewer === undefined/u);

  for (const route of [adminCollection, adminItem]) {
    assert.match(route, /requireAdminApiSession\(request\)/u);
    assert.match(route, /assertSameOrigin\(request\)/u);
    assert.match(route, /adminApiErrorResponse/u);
  }
  assert.match(adminManager, /"approved" \| "applications"/u);
  assert.match(adminManager, /transition\(club, "approved"\)/u);
  assert.match(adminManager, /method: "DELETE"/u);
  assert.match(page, /tool === "approved-clubs"/u);
  assert.match(page, /tool === "club-applications"/u);
  assert.match(permissions, /case "clubs":\s+return "content\.manage"/u);
});

test("price comparison exposes a real read-only active catalog XML feed", async () => {
  const [feedLibrary, route, manager, page] = await Promise.all([
    source("lib/price-comparison.ts"),
    source("app/api/catalog/price-feed/route.ts"),
    source(
      "app/adm/(protected)/tools/[tool]/PriceComparisonManager.tsx",
    ),
    source("app/adm/(protected)/tools/[tool]/page.tsx"),
  ]);

  assert.match(feedLibrary, /getEffectiveProducts\(\{ strict: true \}\)/u);
  assert.match(feedLibrary, /\.filter\(\s*\(product\) => product\.active/u);
  assert.match(feedLibrary, /getLegacyAdminToolSettings\("price-comparison"\)/u);
  assert.match(feedLibrary, /<product_feed/u);
  assert.match(feedLibrary, /escapeXml/u);
  assert.match(route, /export async function GET/u);
  assert.match(route, /application\/xml; charset=utf-8/u);
  assert.doesNotMatch(route, /export async function POST/u);
  assert.match(manager, /navigator\.clipboard\.writeText\(feedUrl\)/u);
  assert.match(manager, /외부 가격비교 서비스에 제출되었다고 표시/u);
  assert.match(page, /feedUrl=\{`\$\{protocol\}:\/\/\$\{host\}\/api\/catalog\/price-feed`\}/u);
});

test("mail test fails closed and records only real provider attempts", async () => {
  const [library, route, manager, page] = await Promise.all([
    source("lib/admin-mail.ts"),
    source("app/api/admin/mail-test/route.ts"),
    source("app/adm/(protected)/tools/[tool]/MailTestManager.tsx"),
    source("app/adm/(protected)/tools/[tool]/page.tsx"),
  ]);

  assert.match(library, /RESEND_API_KEY/u);
  assert.match(library, /MAIL_PROVIDER_URL/u);
  assert.match(library, /if \(!configuration\.configured\)/u);
  assert.match(library, /throw new AdminApiError\(503/u);
  assert.match(library, /status TEXT NOT NULL CHECK\(status IN \('sent', 'failed'\)\)/u);
  assert.doesNotMatch(library, /status:\s*"completed"/u);
  assert.doesNotMatch(library, /status:\s*"queued"/u);
  assert.match(route, /sendAdminTestMail/u);
  assert.match(route, /requireAdminApiSession\(request\)/u);
  assert.match(route, /assertSameOrigin\(request\)/u);
  assert.match(manager, /window\.alert\(initialState\.configurationMessage\)/u);
  assert.match(manager, /window\.location\.replace\("\/adm"\)/u);
  assert.match(manager, /if \(!initialState\.providerConfigured\)/u);
  assert.match(manager, /if \(sending \|\| !initialState\.providerConfigured\) return/u);
  assert.match(page, /tool === "mail-test"/u);
  assert.match(
    await source("lib/admin-tools.ts"),
    /if \(slug === "mail-test"\)[\s\S]{0,200}전용 메일 API/u,
  );
});

test("dedicated operational tools cannot mutate generic admin records", async () => {
  const [collection, item, library] = await Promise.all([
    source("app/api/admin/tools/[tool]/route.ts"),
    source("app/api/admin/tools/[tool]/[recordId]/route.ts"),
    source("lib/admin-tools.ts"),
  ]);
  const dedicated = [
    "product-stock",
    "product-types",
    "product-option-stock",
    "restock-sms",
    "coupons",
    "coupon-zone",
    "additional-shipping",
    "approved-clubs",
    "club-applications",
    "mail-test",
  ];
  for (const slug of dedicated) {
    assert.match(collection, new RegExp(`tool === "${slug}"`, "u"));
    assert.match(item, new RegExp(`tool === "${slug}"`, "u"));
  }
  for (const slug of [
    "additional-services",
    "club-settings",
    "price-comparison",
  ]) {
    assert.match(item, new RegExp(`tool === "${slug}"`, "u"));
  }
  assert.match(library, /assertGenericRecordStorageAllowed\(slug\)/u);
  assert.match(library, /slug === "approved-clubs"/u);
  assert.match(library, /slug === "club-applications"/u);
});
