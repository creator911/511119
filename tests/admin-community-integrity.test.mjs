import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

const files = [
  "lib/admin-community.ts",
  "app/api/admin/community/route.ts",
  "app/api/inquiries/route.ts",
  "app/api/inquiries/lookup/route.ts",
  "app/adm/(protected)/community/CommunityManager.tsx",
  "app/adm/(protected)/community/page.tsx",
  "app/bbs/board.php/page.tsx",
  "app/bbs/board.php/public-board.module.css",
  "app/bbs/inquiry.php/InquiryForm.tsx",
  "app/bbs/inquiry.php/page.tsx",
];

test("community administration has independent local operating surfaces", async () => {
  await Promise.all(
    files.map((file) => access(new URL(`../${file}`, import.meta.url))),
  );
  const sources = await Promise.all(files.map(source));
  for (const fileSource of sources) {
    assert.doesNotMatch(fileSource, /kiel-gold\.com/iu);
    assert.doesNotMatch(fileSource, /https?:\/\/[^"'\s]+/iu);
    assert.doesNotMatch(fileSource, /console\.(?:log|info|warn|error)/u);
  }
});

test("all community admin mutations require session and same-origin checks", async () => {
  const route = await source("app/api/admin/community/route.ts");
  assert.match(route, /requireAdminApiSession\(request\)/);
  assert.match(route, /assertSameOrigin\(request\)/);
  assert.match(route, /readAdminJson\(request,\s*80_000\)/);
  assert.match(route, /createCommunityResource/);
  assert.match(route, /updateCommunityResource/);
  assert.match(route, /deleteCommunityResource/);
});

test("board hierarchy protects parent deletion and audits mutations", async () => {
  const service = await source("lib/admin-community.ts");
  assert.match(
    service,
    /게시판이 연결된 그룹은 삭제할 수 없습니다/,
  );
  assert.match(
    service,
    /게시물이 등록된 게시판은 삭제할 수 없습니다/,
  );
  assert.match(service, /DELETE FROM community_comments WHERE post_id = \?/);
  assert.match(service, /INSERT INTO admin_audit_logs/);
  assert.match(service, /community\.post\.create/);
  assert.match(service, /community\.comment\.update/);
});

test("public inquiry intake is bounded, rate-limited, and returns no private body", async () => {
  const [route, service] = await Promise.all([
    source("app/api/inquiries/route.ts"),
    source("lib/admin-community.ts"),
  ]);
  assert.match(route, /assertSameOrigin\(request\)/);
  assert.match(route, /readBoundedJson<unknown>\(request,\s*80_000\)/);
  assert.match(route, /getCustomerSession\(request\)/);
  assert.match(route, /id: created\.inquiry\.id/);
  assert.doesNotMatch(route, /content: created\.inquiry\.content/);
  const clientKey = route.slice(route.indexOf("async function inquiryClientKey"));
  assert.match(clientKey, /cf-connecting-ip/);
  assert.doesNotMatch(clientKey, /user-agent/);
  assert.doesNotMatch(clientKey, /x-forwarded-for/);
  assert.match(clientKey, /"anonymous"/);
  assert.match(service, /CREATE TABLE IF NOT EXISTS inquiry_rate_limits/);
  assert.match(service, /Number\(row\?\.attempts \?\? 0\) > 5/);
  assert.match(service, /현재 1:1 문의 접수를 받지 않습니다/);
  assert.match(service, /회원 로그인 후 문의할 수 있습니다/);
  assert.match(service, /lookup_token_hash/);
  assert.match(service, /hashLookupToken/);
  assert.match(service, /crypto\.getRandomValues\(new Uint8Array\(32\)\)/);
  assert.match(service, /inquiry_lookup_rate_limits/);
  assert.match(service, /probabilisticRateLimitCleanup/);
});

test("guest inquiry lookup keeps raw tokens out of storage and returns no contact data", async () => {
  const [route, service, schema, client] = await Promise.all([
    source("app/api/inquiries/lookup/route.ts"),
    source("lib/admin-community.ts"),
    source("db/schema.ts"),
    source("app/bbs/inquiry.php/InquiryForm.tsx"),
  ]);
  assert.match(route, /assertSameOrigin\(request\)/);
  assert.match(route, /readBoundedJson<unknown>\(request,\s*4_096\)/);
  assert.match(route, /getGuestInquiryByToken/);
  assert.doesNotMatch(route, /\bemail\b|\bphone\b|\bauthorName\b/u);
  assert.match(service, /WHERE user_id = '' AND lookup_token_hash = \?/);
  assert.match(schema, /lookupTokenHash: text\("lookup_token_hash"\)/);
  assert.match(client, /window\.localStorage\.setItem/);
  assert.match(client, /MAX_STORED_TOKENS = 10/);
});

test("public boards expose only active published content with bounded pagination", async () => {
  const [page, service] = await Promise.all([
    source("app/bbs/board.php/page.tsx"),
    source("lib/admin-community.ts"),
  ]);
  assert.match(page, /listPublicCommunityBoards/);
  assert.match(page, /listPublicCommunityPosts/);
  assert.match(page, /getPublicCommunityPost/);
  assert.match(service, /p\.status = 'published'/);
  assert.match(service, /b\.active = 1 AND b\.read_level = 0/);
  assert.match(service, /c\.visible = 1/);
  assert.match(service, /boundedPageSize\(options\.pageSize,\s*20,\s*50\)/);
  assert.match(service, /boundedPageSize\(\s*options\.commentPageSize,\s*30,\s*50/);
});

test("community hierarchy has database-level race guards and comment cascade", async () => {
  const service = await source("lib/admin-community.ts");
  for (const trigger of [
    "community_boards_parent_insert",
    "community_boards_parent_update",
    "community_posts_parent_insert",
    "community_posts_parent_update",
    "community_comments_parent_insert",
    "community_comments_parent_update",
    "community_groups_child_guard",
    "community_boards_child_guard",
    "community_posts_comment_cascade",
  ]) {
    assert.match(service, new RegExp(`CREATE TRIGGER IF NOT EXISTS ${trigger}`));
  }
  assert.match(service, /SELECT RAISE\(ABORT, 'community_group_parent_missing'\)/);
  assert.match(service, /SELECT RAISE\(ABORT, 'community_group_has_boards'\)/);
});

test("product reviews and questions use bounded searchable pagination", async () => {
  const [publicRoute, adminService, adminRoute, publicUi, adminUi] =
    await Promise.all([
      source("app/api/products/[id]/interactions/route.ts"),
      source("lib/admin-interactions.ts"),
      source("app/api/admin/interactions/route.ts"),
      source("app/components/storefront/ProductDetail.tsx"),
      source("app/adm/(protected)/content/InteractionManager.tsx"),
    ]);
  assert.doesNotMatch(publicRoute, /LIMIT 100\b/u);
  assert.doesNotMatch(adminService, /LIMIT 500\b/u);
  assert.match(publicRoute, /pageSize[\s\S]*30/);
  assert.match(publicRoute, /url\.searchParams\.get\("q"\)/);
  assert.match(adminService, /boundedInteger\(options\.pageSize,\s*30,\s*1,\s*100\)/);
  assert.match(adminRoute, /pagination/);
  assert.match(publicUi, /interactionPagination/);
  assert.match(adminUi, /className=\{styles\.pagination\}/);
});

test("community UI keeps wide data tables inside local overflow wrappers", async () => {
  const [manager, stylesheet, route, service] = await Promise.all([
    source("app/adm/(protected)/community/CommunityManager.tsx"),
    source(
      "app/adm/(protected)/community/community-manager.module.css",
    ),
    source("app/api/admin/community/route.ts"),
    source("lib/admin-community.ts"),
  ]);
  assert.match(manager, /className=\{styles\.tableWrap\}/);
  assert.match(stylesheet, /\.tableWrap\s*\{[\s\S]*overflow-x:\s*auto/);
  assert.match(
    stylesheet,
    /@media \(max-width: 640px\)[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
  );
  assert.match(route, /pageSize:\s*positiveInteger/);
  assert.match(route, /query:\s*url\.searchParams\.get\("q"\)/);
  assert.match(service, /boundedPageSize\(options\.pageSize,\s*100,\s*200\)/);
  assert.doesNotMatch(service, /LIMIT 1000/u);
  assert.match(manager, /className=\{styles\.listPagination\}/);
});
