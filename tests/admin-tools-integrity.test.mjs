import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("every legacy administrator tool link has a durable implementation", async () => {
  const [shell, catalog, library, page] = await Promise.all([
    source("app/components/admin/AdminShell.tsx"),
    source("lib/admin-tool-catalog.ts"),
    source("lib/admin-tools.ts"),
    source("app/adm/(protected)/tools/[tool]/page.tsx"),
  ]);

  const menuSlugs = [
    ...shell.matchAll(/href: "\/adm\/tools\/([a-z0-9-]+)"/gu),
  ].map((match) => match[1]);
  assert.ok(menuSlugs.length >= 40);
  assert.equal(new Set(menuSlugs).size, menuSlugs.length);
  for (const slug of menuSlugs) {
    assert.match(catalog, new RegExp(`slug: "${slug}"`));
  }

  assert.match(library, /CREATE TABLE IF NOT EXISTS admin_tool_settings/);
  assert.match(library, /CREATE TABLE IF NOT EXISTS admin_tool_records/);
  assert.match(library, /CREATE TABLE IF NOT EXISTS admin_tool_runs/);
  assert.match(library, /admin_audit_logs/);
  assert.match(library, /ON CONFLICT\(tool_key\) DO UPDATE/);
  assert.match(page, /getLegacyAdminToolState/);
  assert.match(page, /notFound\(\)/);
});

test("legacy tool mutations are authenticated, same-origin, and bounded", async () => {
  const [collectionRoute, recordRoute, manager] = await Promise.all([
    source("app/api/admin/tools/[tool]/route.ts"),
    source("app/api/admin/tools/[tool]/[recordId]/route.ts"),
    source(
      "app/adm/(protected)/tools/[tool]/LegacyAdminToolManager.tsx",
    ),
  ]);

  for (const route of [collectionRoute, recordRoute]) {
    assert.match(route, /requireAdminApiSession\(request\)/);
    assert.match(route, /assertSameOrigin\(request\)/);
    assert.match(route, /readAdminJson\(request, 30_000\)/);
    assert.match(route, /adminApiErrorResponse/);
  }
  assert.match(manager, /window\.confirm/);
  assert.match(manager, /response\.status === 401/);
  assert.match(manager, /maxLength=\{5_000\}/);
  assert.match(manager, /timeZone: "Asia\/Seoul"/);
});

test("external SMS and comparison work stays queued without credentials", async () => {
  const [catalog, library] = await Promise.all([
    source("lib/admin-tool-catalog.ts"),
    source("lib/admin-tools.ts"),
  ]);

  for (const slug of [
    "restock-sms",
    "price-comparison",
    "sms-settings",
    "sms-send",
  ]) {
    const definition = catalog.slice(catalog.indexOf(`slug: "${slug}"`));
    assert.match(definition.slice(0, 2_500), /externalService: true/);
  }
  assert.match(library, /status: queued \? "queued" : "completed"/);
  assert.match(library, /외부 서비스 계정 연결 전까지 전송 대기/);
});

test("legacy maintenance screens execute only local recoverable operations", async () => {
  const [manager, maintenance, library, stylesheet] = await Promise.all([
    source(
      "app/adm/(protected)/tools/[tool]/LegacyAdminToolManager.tsx",
    ),
    source(
      "app/adm/(protected)/tools/[tool]/SystemMaintenanceTool.tsx",
    ),
    source("lib/admin-tools.ts"),
    source("app/adm/legacy-admin.css"),
  ]);

  for (const slug of [
    "session-files-delete",
    "cache-files-delete",
    "captcha-files-delete",
    "thumbnail-files-delete",
    "phpinfo",
    "browscap-update",
    "access-log-convert",
    "db-upgrade",
  ]) {
    assert.match(manager, new RegExp(`"${slug}"`));
  }
  assert.doesNotMatch(
    manager,
    /"db-upgrade",\s*"additional-services"/u,
  );
  assert.doesNotMatch(
    maintenance,
    /definition\.slug === "additional-services"/u,
  );
  assert.match(manager, /definition\.kind === "settings"/u);
  assert.match(maintenance, /automaticTools/);
  assert.match(maintenance, /완료 메세지가 나오기 전에/);
  assert.match(maintenance, /프로그램의 실행을 끝마치셔도 좋습니다/);
  assert.match(maintenance, /Cloudflare Workers \/ vinext/);
  assert.match(library, /revalidatePath\("\/", "layout"\)/);
  assert.match(library, /세션데이터 0건 삭제 완료됐습니다/);
  assert.doesNotMatch(
    stylesheet,
    /#hd_top\s*\{[^}]*min-width:\s*1200px/su,
  );
});

test("signed-in storefront administrator controls mirror the legacy header", async () => {
  const [header, storefrontCss, loader, loaderCss] = await Promise.all([
    source("app/components/storefront/Header.tsx"),
    source("app/components/storefront/Storefront.module.css"),
    source("app/components/storefront/PageLoader.tsx"),
    source("app/components/storefront/PageLoader.module.css"),
  ]);

  assert.match(header, /className=\{styles\.adminEditMode\}/);
  assert.match(header, /role="switch"/);
  assert.match(header, /"\\uf013"/);
  assert.match(header, /"\\uf2bd"/);
  assert.match(header, /"\\uf2f5"/);
  assert.match(storefrontCss, /\.adminEditSwitch\s*\{[^}]*width:\s*45px/su);
  assert.match(storefrontCss, /background:\s*#43a047/);
  assert.match(
    storefrontCss,
    /@media \(max-width: 575px\)[\s\S]*?\.adminEditMode\s*\{\s*display:\s*none;/u,
  );
  assert.match(loader, /window\.addEventListener\("load", finish/);
  assert.match(loader, /kiel-page-loaded/);
  assert.match(loaderCss, /transition:[\s\S]*transform 0\.3s ease-out 1s/u);
  assert.match(
    loaderCss,
    /transform 0\.7s cubic-bezier\(0\.645, 0\.045, 0\.355, 1\) 0\.3s/u,
  );
});

test("theme, menu, and metadata saves are consumed by the storefront", async () => {
  const [catalog, library, storefrontTools, layout, frame, storefrontCss] =
    await Promise.all([
      source("lib/admin-tool-catalog.ts"),
      source("lib/admin-tools.ts"),
      source("lib/storefront-admin-tools.ts"),
      source("app/layout.tsx"),
      source("app/components/SiteFrame.tsx"),
      source("app/components/storefront/Storefront.module.css"),
    ]);

  for (const slug of ["theme-settings", "menu-settings", "meta-tags"]) {
    assert.match(
      storefrontTools,
      new RegExp(`getLegacyAdminToolStoredSettings\\("${slug}"\\)`),
    );
  }
  assert.match(
    storefrontTools,
    /listLegacyAdminToolRecords\("popup-layers"\)/,
  );
  assert.match(catalog, /defaultValue: "#3949ab"/);
  assert.match(catalog, /defaultValue: "키엘골드 \| KIEL GOLD"/);
  assert.match(library, /validateStorefrontSettings\(slug, settings/);
  assert.match(layout, /getStorefrontMetaSettings\(\)/);
  assert.match(layout, /getStorefrontThemeSettings\(\)/);
  assert.match(layout, /data-site-theme=/);
  assert.match(layout, /"--site-primary-color"/);
  assert.match(frame, /getStorefrontMenuSettings\(\)/);
  assert.match(frame, /resolveManagedNavigation\(/);
  assert.match(storefrontTools, /isLegacyMenuPlaceholder/);
  assert.match(storefrontTools, /isLegacyThemePlaceholder/);
  assert.match(storefrontTools, /isLegacyMetaPlaceholder/);
  assert.match(storefrontCss, /var\(--site-primary-color, #3949ab\)/);
  assert.match(
    storefrontCss,
    /html\[data-site-theme="kiel-mobile"\]/,
  );
});

test("popup saves flow to active storefront dialogs with date and dismissal controls", async () => {
  const [library, manager, popupManager, home, popup] = await Promise.all([
    source("lib/admin-tools.ts"),
    source(
      "app/adm/(protected)/tools/[tool]/LegacyAdminToolManager.tsx",
    ),
    source("app/adm/(protected)/tools/[tool]/PopupLayersTool.tsx"),
    source("app/page.tsx"),
    source("app/components/storefront/StorefrontPopups.tsx"),
  ]);

  assert.match(manager, /definition\.slug === "popup-layers"/);
  assert.match(manager, /<PopupLayersTool/);
  assert.match(popupManager, /type="datetime-local"/);
  assert.match(popupManager, /JSON\.stringify\(\{/);
  assert.match(popupManager, /startsAt: form\.startsAt/);
  assert.match(popupManager, /endsAt: form\.endsAt/);
  assert.match(library, /slug === "popup-layers"/);
  assert.match(library, /isSafeInternalHref/);
  assert.match(library, /노출 종료는 노출 시작 이후/);
  assert.match(home, /getStorefrontPopupLayers\(\)/);
  assert.match(home, /<StorefrontPopups popups=\{popups\}/);
  assert.match(popup, /role="dialog"/);
  assert.match(popup, /오늘 하루 보지 않기/);
  assert.match(popup, /window\.localStorage\.setItem/);
  assert.match(popup, /timeZone: "Asia\/Seoul"/);
});

test("events use dedicated management APIs and published legacy-compatible routes", async () => {
  const [
    page,
    library,
    collectionRoute,
    itemRoute,
    bulkRoute,
    manager,
    storefront,
    permissions,
    genericCollection,
    genericItem,
    assignmentLibrary,
    assignmentRoute,
    assignmentManager,
    assignmentStyles,
  ] = await Promise.all([
    source("app/adm/(protected)/tools/[tool]/page.tsx"),
    source("lib/store-events.ts"),
    source("app/api/admin/events/route.ts"),
    source("app/api/admin/events/[eventId]/route.ts"),
    source("app/api/admin/events/bulk/route.ts"),
    source("app/adm/(protected)/tools/[tool]/EventAdminManagers.tsx"),
    source("app/shop/event.php/page.tsx"),
    source("lib/admin-permissions.ts"),
    source("app/api/admin/tools/[tool]/route.ts"),
    source("app/api/admin/tools/[tool]/[recordId]/route.ts"),
    source("lib/event-product-assignments.ts"),
    source("app/api/admin/events/assignments/route.ts"),
    source("app/adm/(protected)/tools/[tool]/EventBulkManager.tsx"),
    source("app/adm/(protected)/tools/[tool]/event-bulk.module.css"),
  ]);

  assert.match(page, /tool === "events"/);
  assert.match(page, /tool === "event-bulk"/);
  assert.match(page, /<EventAdminManager/);
  assert.match(page, /<EventBulkManager/);
  assert.match(library, /listLegacyAdminToolRecords\("events", 1_000\)/);
  assert.match(library, /event\.endsAt < today/);
  assert.match(library, /active: false/);
  assert.match(library, /isSafeInternalHref/);
  assert.match(manager, /type="date"/);
  assert.match(bulkRoute, /expireStoreEvents/);
  assert.match(assignmentLibrary, /const PAGE_SIZE = 15/);
  assert.match(assignmentLibrary, /store_event_products/);
  assert.match(assignmentLibrary, /products\.filter\(\(product\) => product\.active\)/);
  assert.match(assignmentLibrary, /event\.products\.update/);
  assert.match(assignmentManager, /\/api\/admin\/events\/assignments/);
  assert.match(assignmentManager, /이벤트를 선택하세요/);
  assert.match(assignmentManager, /visibleProductIds/);
  assert.match(assignmentManager, /selectedProductIds/);
  assert.match(assignmentManager, /\/shop\/item\.php\?it_id=/);
  assert.match(assignmentStyles, /width: 146px/);
  assert.match(assignmentStyles, /width: 124px/);
  assert.match(assignmentStyles, /width: 77\.09375px/);
  assert.match(assignmentStyles, /width: 856\.90625px/);
  assert.match(assignmentStyles, /height: 61px/);
  assert.match(assignmentStyles, /display: block !important/);
  assert.match(assignmentStyles, /margin: 0 0 20px !important/);
  assert.doesNotMatch(
    assignmentStyles,
    /legacy-event-bulk-table \.td_left a\)[\s\S]{0,80}inline-flex/,
  );
  assert.match(assignmentRoute, /export async function GET/);
  assert.match(assignmentRoute, /export async function PATCH/);
  assert.match(assignmentRoute, /assertSameOrigin\(request\)/);
  assert.match(assignmentRoute, /requireAdminApiSession\(request\)/);
  assert.match(storefront, /searchParams/);
  assert.match(storefront, /params\.ev_id/);
  assert.match(storefront, /listPublishedStoreEvents/);
  assert.match(storefront, /getPublishedStoreEvent/);
  assert.match(permissions, /case "events":\s+return "content\.manage"/);
  assert.match(genericCollection, /isDedicatedOperationalTool\(tool\)/);
  assert.match(genericCollection, /tool === "events"/);
  assert.match(genericCollection, /tool === "event-bulk"/);
  assert.match(genericItem, /tool === "events"/);

  for (const route of [collectionRoute, itemRoute, bulkRoute]) {
    assert.match(route, /requireAdminApiSession\(request\)/);
    assert.match(route, /adminApiErrorResponse/);
  }
  for (const route of [collectionRoute, itemRoute, bulkRoute]) {
    if (!route.includes("export async function GET")) {
      assert.match(route, /assertSameOrigin\(request\)/);
    }
  }
  assert.match(collectionRoute, /readAdminJson\(request, 20_000\)/);
  assert.match(itemRoute, /readAdminJson\(request, 20_000\)/);
});

test("saved-items reports query real wishlists and render the source ranking view", async () => {
  const [page, library, route, manager, permissions] = await Promise.all([
    source("app/adm/(protected)/tools/[tool]/page.tsx"),
    source("lib/admin-operational-reports.ts"),
    source("app/api/admin/saved-items/route.ts"),
    source(
      "app/adm/(protected)/tools/[tool]/OperationalReportManagers.tsx",
    ),
    source("lib/admin-permissions.ts"),
  ]);

  assert.match(page, /tool === "saved-items"/);
  assert.match(page, /getSavedItemReport\(\{/);
  assert.match(library, /FROM wishlist_items w/);
  assert.match(library, /LEFT JOIN users u ON u\.id = w\.owner_key/);
  assert.match(library, /getEffectiveProducts\(\)/);
  assert.match(library, /uniqueMembers:/);
  assert.match(library, /uniqueProducts:/);
  assert.match(route, /requireAdminApiSession\(request\)/);
  assert.match(route, /params\.get\("member"\)/);
  assert.match(route, /params\.get\("product"\)/);
  assert.match(route, /params\.get\("categoryId"\)/);
  assert.match(route, /params\.get\("dateStart"\)/);
  assert.match(manager, /상품별 보관 순위/);
  assert.match(manager, /<th scope="col">순위<\/th>/);
  assert.match(manager, /report\.products\.map/);
  assert.match(manager, /\/api\/admin\/saved-items/);
  assert.match(
    permissions,
    /case "saved-items":\s+return "reports\.view"/,
  );
});

test("visitor search reads bounded real daily visit aggregates", async () => {
  const [page, library, route, manager, permissions] = await Promise.all([
    source("app/adm/(protected)/tools/[tool]/page.tsx"),
    source("lib/admin-operational-reports.ts"),
    source("app/api/admin/visitors/route.ts"),
    source(
      "app/adm/(protected)/tools/[tool]/OperationalReportManagers.tsx",
    ),
    source("lib/admin-permissions.ts"),
  ]);

  assert.match(page, /tool === "visitor-search"/);
  assert.match(page, /getAdminVisitReport\(\)/);
  assert.match(page, /initialQuery=\{one\(query\.stx\)\.slice\(0, 100\)\}/);
  assert.match(library, /ensureSiteVisitSchema\(\)/);
  assert.match(library, /FROM site_visit_daily/);
  assert.match(library, /MAX_VISIT_RANGE_DAYS = 366/);
  assert.match(library, /averageDailyViews:/);
  assert.match(route, /requireAdminApiSession\(request\)/);
  assert.match(route, /params\.get\("from"\)/);
  assert.match(route, /params\.get\("to"\)/);
  assert.match(manager, /일자별 접속 현황/);
  assert.match(manager, /\/api\/admin\/visitors/);
  assert.match(manager, /useState\(initialQuery\)/);
  assert.match(
    permissions,
    /case "visitors":\s+return "members\.manage"/,
  );
});
