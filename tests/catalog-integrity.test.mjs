import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import {
  categoryListHref,
  readStorefrontProductSort,
  sortStorefrontProducts,
} from "../lib/storefront-sort.ts";
import { filterStorefrontProducts } from "../lib/storefront-search.ts";
import {
  BannerValidationError,
  isSafeBannerHref,
  isSafeBannerImagePath,
  mergeBannerChanges,
  validateBannerInput,
} from "../lib/banner-contract.ts";

const projectRoot = new URL("../", import.meta.url);
const catalog = JSON.parse(
  await readFile(new URL("../data/catalog.json", import.meta.url), "utf8"),
);

test("preserves the complete public catalog with local media only", async () => {
  assert.equal(catalog.products.length, 274);
  assert.equal(catalog.categories.length, 31);
  assert.equal(catalog.banners.length, 2);
  assert.equal(
    catalog.products.filter((product) => product.flags.hit).length,
    5,
  );
  assert.equal(
    catalog.products.filter((product) => product.flags.recommend).length,
    5,
  );
  assert.equal(
    catalog.products.filter((product) => product.flags.new).length,
    4,
  );
  assert.equal(
    catalog.products.filter((product) => product.flags.popular).length,
    4,
  );
  assert.equal(
    catalog.products.filter((product) => product.flags.sale).length,
    6,
  );
  const reverseHeartBearNecklace = catalog.products.find(
    (product) => product.id === "1762010733",
  );
  assert.equal(reverseHeartBearNecklace?.price, 980_000);
  assert.equal(reverseHeartBearNecklace?.originalPrice, 980_000);

  const pumaRing = catalog.products.find(
    (product) => product.id === "1762011422",
  );
  assert.equal(pumaRing?.price, 1_710_000);
  assert.equal(pumaRing?.originalPrice, 1_958_000);
  assert.equal(pumaRing?.flags.sale, true);
  assert.equal(
    catalog.categories.find((category) => category.id === "9120")?.name,
    "랩다이아몬드",
  );

  for (let index = 1; index < catalog.products.length; index += 1) {
    assert.ok(
      Number(catalog.products[index - 1].id) >
        Number(catalog.products[index].id),
      `catalog products must stay newest-first at index ${index}`,
    );
  }

  for (const product of catalog.products) {
    assert.ok(product.id);
    assert.ok(product.name);
    assert.ok(product.images.length > 0);
    for (const image of product.images) {
      assert.match(image, /^\/legacy\//);
      await access(new URL(`../public${image}`, import.meta.url));
    }
  }

  for (const banner of catalog.banners) {
    assert.match(banner.image, /^\/legacy\//);
    assert.match(banner.mobileImage, /^\/legacy\//);
    await access(new URL(`../public${banner.image}`, import.meta.url));
    await access(new URL(`../public${banner.mobileImage}`, import.meta.url));
  }

  const serialized = JSON.stringify(catalog);
  assert.doesNotMatch(serialized, /https?:\/\//i);
});

test("includes public and administrator compatibility routes", async () => {
  const routes = [
    "app/page.tsx",
    "app/shop/list.php/page.tsx",
    "app/shop/item.php/page.tsx",
    "app/shop/cart.php/page.tsx",
    "app/shop/orderform.php/page.tsx",
    "app/shop/orderinquiry.php/page.tsx",
    "app/shop/orderinquiryview.php/page.tsx",
    "app/bbs/login.php/page.tsx",
    "app/bbs/register.php/page.tsx",
    "app/bbs/content.php/page.tsx",
    "app/adm/login/page.tsx",
    "app/adm/(protected)/page.tsx",
  ];
  await Promise.all(routes.map((route) => access(new URL(`../${route}`, import.meta.url))));
  await assert.rejects(
    access(new URL("../app/_sites-preview/SkeletonPreview.tsx", import.meta.url)),
  );
  await access(new URL("../drizzle/0000_lame_makkari.sql", import.meta.url));
  await access(projectRoot);

  const [adminLoginPage, adminLoginForm] = await Promise.all([
    readFile(new URL("../app/adm/login/page.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../app/adm/login/LoginForm.tsx", import.meta.url),
      "utf8",
    ),
  ]);
  assert.match(adminLoginPage, /safeAdminNextPath/);
  assert.match(adminLoginForm, /window\.location\.replace\(nextPath\)/);
  assert.doesNotMatch(adminLoginForm, /router\.refresh\(\)/);

  const [legacyContentAlias, legacyOrderAlias, productPage] =
    await Promise.all([
      readFile(
        new URL("../app/bbs/content.php/page.tsx", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL(
          "../app/shop/orderinquiryview.php/page.tsx",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL("../app/shop/item.php/page.tsx", import.meta.url),
        "utf8",
      ),
    ]);
  assert.match(legacyContentAlias, /get\("co_id"\)/);
  assert.match(legacyContentAlias, /window\.location\.replace/);
  assert.match(legacyOrderAlias, /get\("od_id"\)/);
  assert.match(productPage, /relatedProducts=\{\[\]\}/);
});

test("administrator lists use real pagination, filtering, and KST totals", async () => {
  const [adminData, orderManager, memberManager, dashboardPage, adminShell] =
    await Promise.all([
    readFile(new URL("../lib/admin-data.ts", import.meta.url), "utf8"),
    readFile(
      new URL(
        "../app/adm/(protected)/orders/OrdersManager.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../app/adm/(protected)/users/UsersManager.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL("../app/adm/(protected)/page.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/components/admin/AdminShell.tsx", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(adminData, /getAdminOrdersPage/);
  assert.match(adminData, /getAdminMembersPage/);
  assert.match(adminData, /getAdminDashboardData/);
  assert.match(adminData, /Asia\/Seoul/);
  assert.doesNotMatch(adminData, /catch\s*\{\s*return\s*\[\]/);

  assert.match(
    orderManager,
    /className="[^"]*legacy-order-search[^"]*"/,
  );
  assert.match(
    orderManager,
    /onSubmit=\{\(event\) => \{[\s\S]*?loadOrders\(\{ \.\.\.filters, page: 1 \}\)/,
  );
  assert.match(orderManager, /onPageChange=/);
  assert.match(orderManager, /onSort=/);
  assert.match(memberManager, /onSearch=/);
  assert.match(
    memberManager,
    /loadMembers\(\{\s*\.\.\.result\.filters,\s*page:\s*result\.page\s*-\s*1\s*\}\)/,
  );
  assert.match(
    memberManager,
    /loadMembers\(\{\s*\.\.\.result\.filters,\s*page:\s*result\.page\s*\+\s*1\s*\}\)/,
  );
  assert.match(memberManager, /changeMemberSort\("loginId"\)/);
  assert.match(memberManager, /changeMemberSort\("lastLoginAt"\)/);
  assert.match(memberManager, /changeMemberSort\("joinedAt"\)/);
  assert.match(memberManager, /changeMemberSort\("points"\)/);

  assert.match(dashboardPage, /href=\{`\/adm\/reports\?view=points/);
  assert.match(dashboardPage, /href="\/adm\/users"/);
  assert.match(dashboardPage, /href="\/adm\/community\?view=posts"/);
  assert.match(adminShell, /item\.href/);

  await Promise.all([
    access(new URL("../app/api/admin/orders/route.ts", import.meta.url)),
    access(new URL("../app/api/admin/users/route.ts", import.meta.url)),
  ]);
});

test("sorts the complete storefront result deterministically before paging", () => {
  const products = [
    {
      id: "100",
      price: 200,
      flags: { popular: false },
      rating: 5,
      reviewCount: 2,
    },
    {
      id: "400",
      price: 100,
      flags: { popular: false },
      rating: 1,
      reviewCount: 10,
    },
    {
      id: "300",
      price: 300,
      flags: { popular: true },
      rating: 2,
      reviewCount: 0,
    },
    {
      id: "200",
      price: 100,
      flags: { popular: false },
      rating: 4,
      reviewCount: 10,
    },
  ];
  const ids = (sort) =>
    sortStorefrontProducts(products, sort).map((product) => product.id);

  assert.deepEqual(ids("recent"), ["400", "300", "200", "100"]);
  assert.deepEqual(ids("popular"), ["300", "200", "400", "100"]);
  assert.deepEqual(ids("price-low"), ["400", "200", "100", "300"]);
  assert.deepEqual(ids("price-high"), ["300", "100", "400", "200"]);
  assert.deepEqual(ids("rating"), ["100", "200", "300", "400"]);
  assert.deepEqual(ids("reviews"), ["200", "400", "100", "300"]);

  assert.equal(
    readStorefrontProductSort("it_update_time", "desc"),
    "recent",
  );
  assert.equal(readStorefrontProductSort("it_sum_qty", "desc"), "popular");
  assert.equal(readStorefrontProductSort("it_price", "asc"), "price-low");
  assert.equal(readStorefrontProductSort("it_price", "desc"), "price-high");
  assert.equal(readStorefrontProductSort("it_use_avg", "desc"), "rating");
  assert.equal(readStorefrontProductSort("it_use_cnt", "desc"), "reviews");
  assert.equal(
    categoryListHref("10", "price-low", 3),
    "/shop/list.php?ca_id=10&sort=it_price&sortodr=asc&page=3",
  );
});

test("applies public search scope, price, and category filters before paging", () => {
  const products = [
    {
      id: "300",
      active: true,
      categoryId: "10",
      name: "골드 반지",
      basic: "웨딩 컬렉션",
      detailHtml: "<p>랩 다이아몬드 세팅</p>",
      model: "RING-300",
      price: 300_000,
    },
    {
      id: "200",
      active: true,
      categoryId: "20",
      name: "실버바",
      basic: "투자용 골드 컬렉션",
      detailHtml: "<p>순은 제품</p>",
      model: "BAR-200",
      price: 200_000,
    },
    {
      id: "100",
      active: false,
      categoryId: "10",
      name: "골드 목걸이",
      basic: "판매 중지",
      detailHtml: "",
      model: "NECK-100",
      price: 100_000,
    },
  ];

  assert.deepEqual(
    filterStorefrontProducts(products, {
      query: "골드",
      fields: ["name"],
    }).map((product) => product.id),
    ["300"],
  );
  assert.deepEqual(
    filterStorefrontProducts(products, {
      query: "골드",
      fields: ["basic"],
    }).map((product) => product.id),
    ["200"],
  );
  assert.deepEqual(
    filterStorefrontProducts(products, {
      query: "랩 다이아몬드",
      fields: ["explanation"],
    }).map((product) => product.id),
    ["300"],
  );
  assert.deepEqual(
    filterStorefrontProducts(products, {
      query: "200",
      fields: ["id"],
    }).map((product) => product.id),
    ["200"],
  );
  assert.deepEqual(
    filterStorefrontProducts(products, {
      query: "",
      fields: [],
      minimumPrice: 250_000,
      maximumPrice: 350_000,
      categoryIds: new Set(["10"]),
    }).map((product) => product.id),
    ["300"],
  );
});

test("keeps legacy search, FAQ, and coupon controls visible", async () => {
  const [searchPage, faqPage, couponPage] = await Promise.all([
    readFile(
      new URL("../app/shop/search.php/page.tsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../app/bbs/faq.php/page.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../app/shop/couponzone.php/page.tsx", import.meta.url),
      "utf8",
    ),
  ]);

  for (const field of ["qname", "qexplan", "qbasic", "qid"]) {
    assert.match(searchPage, new RegExp(`name:\\s*[\"']${field}[\"']`));
  }
  for (const field of ["qfrom", "qto"]) {
    assert.match(searchPage, new RegExp(`name=[\"']${field}[\"']`));
  }
  assert.match(searchPage, /sortStorefrontProducts/);
  assert.match(searchPage, /pageHrefs=/);
  assert.match(searchPage, /카테고리별 검색 결과/);
  assert.match(faqPage, /name="stx"/);
  assert.match(faqPage, /public-pagination/);
  assert.match(couponPage, /다운로드 쿠폰/);
  assert.match(couponPage, /포인트 쿠폰/);
});

test("provides live administrator sales, ranking, incomplete, and point reports", async () => {
  const [reportData, reportPage] = await Promise.all([
    readFile(new URL("../lib/admin-reports.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../app/adm/(protected)/reports/page.tsx", import.meta.url),
      "utf8",
    ),
  ]);

  for (const query of [
    "getSalesReport",
    "getProductRankingReport",
    "getIncompleteOrdersReport",
    "getPointReport",
  ]) {
    assert.match(reportData, new RegExp(`export async function ${query}`));
    assert.match(reportPage, new RegExp(query));
  }

  assert.match(reportData, /Asia\/Seoul/);
  assert.match(reportData, /order_point_debits/);
  assert.match(reportData, /order_point_credits/);
  assert.match(reportData, /order_point_reversals/);
  assert.match(reportData, /points_restore/);
  assert.match(reportData, /FROM wallet_ledger ledger/);
  assert.match(reportData, /action = 'member\.update'/);
  assert.match(reportData, /'adjusted' AS event_type/);
  assert.doesNotMatch(reportData, /catch\s*\{/);

  for (const view of ["sales", "ranking", "incomplete", "points"]) {
    assert.match(reportPage, new RegExp(`view=${view}`));
  }
  assert.match(reportPage, /method="get"/);
  assert.match(reportPage, /한국시간 기준/);
  assert.match(reportPage, /내보내기는 제공하지 않/);
});

test("uses saved delivery and customer-service settings on public order screens", async () => {
  const [siteFrame, orderForm, orderInquiry, commerceClients] =
    await Promise.all([
      readFile(new URL("../app/components/SiteFrame.tsx", import.meta.url), "utf8"),
      readFile(
        new URL("../app/shop/orderform.php/page.tsx", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../app/shop/orderinquiry.php/page.tsx", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../app/components/CommerceClients.tsx", import.meta.url),
        "utf8",
      ),
    ]);

  assert.match(siteFrame, /telephone: companySettings\.customerServicePhone/);
  assert.match(orderForm, /shippingCarrier=\{settings\.shippingCarrier\}/);
  assert.match(
    orderInquiry,
    /customerServicePhone=\{settings\.customerServicePhone\}/,
  );
  assert.match(commerceClients, /기본 택배사:/);
  assert.match(commerceClients, /배송 문의:/);
});

test("validates application-owned banner media and internal links", () => {
  assert.equal(
    isSafeBannerImagePath("/legacy/banners/banner-1.jpg"),
    true,
  );
  assert.equal(
    isSafeBannerImagePath(
      "/api/media/0123456789abcdef0123456789abcdef.webp",
    ),
    true,
  );
  assert.equal(isSafeBannerImagePath("/images/campaign/main.avif"), true);
  assert.equal(isSafeBannerHref("/shop/list.php?ca_id=10#items"), true);
  assert.equal(isSafeBannerHref(""), true);

  for (const unsafeImage of [
    "https://kiel-gold.com/banner.jpg",
    "//kiel-gold.com/banner.jpg",
    "/legacy/../secret.jpg",
    "/legacy/%2e%2e/secret.jpg",
    "/legacy/%252e%252e/secret.jpg",
    "/api/media/not-a-managed-object.jpg",
    "/images/kiel-gold.com/banner.jpg",
  ]) {
    assert.equal(
      isSafeBannerImagePath(unsafeImage),
      false,
      `${unsafeImage} must be rejected`,
    );
  }

  for (const unsafeHref of [
    "https://example.com",
    "//example.com/shop",
    "/go?next=https://example.com",
    "/legacy/%2e%2e/admin",
    "/legacy/%252e%252e/admin",
    "/shop?kiel=https%3A%2F%2Fkiel-gold.com",
    "/shop?next=https%253A%252F%252Fexample.com",
    "javascript:alert(1)",
  ]) {
    assert.equal(
      isSafeBannerHref(unsafeHref),
      false,
      `${unsafeHref} must be rejected`,
    );
  }

  assert.throws(
    () =>
      validateBannerInput({
        image: "https://kiel-gold.com/banner.jpg",
        mobileImage: "/legacy/banners/banner-1.jpg",
        href: "/shop",
        sortOrder: 1,
        active: true,
      }),
    BannerValidationError,
  );

  const valid = validateBannerInput({
    image: "/legacy/banners/banner-1.jpg",
    mobileImage: "",
    href: "/shop",
    sortOrder: 3,
    active: true,
  });
  assert.match(valid.id, /^banner-/);
  assert.equal(valid.mobileImage, valid.image);
});

test("merges static banner baselines with overrides, creations, and tombstones", () => {
  const baseline = [
    {
      id: "banner-1",
      image: "/legacy/banners/banner-1.jpg",
      mobileImage: "/legacy/banners/banner-1.jpg",
      href: "/shop",
      sortOrder: 1,
      active: true,
    },
    {
      id: "banner-2",
      image: "/legacy/banners/banner-2.jpg",
      mobileImage: "/legacy/banners/banner-2.jpg",
      href: "/shop",
      sortOrder: 2,
      active: true,
    },
  ];
  const changedBanner = {
    ...baseline[0],
    href: "/shop/list.php?ca_id=10",
    sortOrder: 4,
  };
  const createdBanner = {
    id: "banner-new",
    image: "/images/new-banner.webp",
    mobileImage: "/images/new-banner-mobile.webp",
    href: "/shop",
    sortOrder: 0,
    active: false,
  };
  const row = (id, changeType, banner, revision) => ({
    banner_id: id,
    change_type: changeType,
    payload_json: JSON.stringify(banner),
    revision,
    updated_by: "admin",
    created_at: "2026-07-29 00:00:00",
    updated_at: "2026-07-29 00:00:00",
  });

  const records = mergeBannerChanges(baseline, [
    row("banner-1", "override", changedBanner, 2),
    row("banner-2", "deleted", baseline[1], 1),
    row("banner-new", "created", createdBanner, 1),
  ]);

  assert.deepEqual(
    records.map((record) => record.banner.id),
    ["banner-new", "banner-1"],
  );
  assert.equal(records[0].source, "created");
  assert.equal(records[1].source, "override");
  assert.equal(records[1].updatedBy, "admin");
  assert.equal(records[1].banner.href, "/shop/list.php?ca_id=10");

  const includingDeleted = mergeBannerChanges(
    baseline,
    [row("banner-2", "deleted", baseline[1], 1)],
    true,
  );
  assert.equal(
    includingDeleted.find((record) => record.banner.id === "banner-2")
      ?.deleted,
    true,
  );
});

test("wires authenticated banner CRUD, managed uploads, and storefront fallback", async () => {
  const files = [
    "app/adm/(protected)/banners/page.tsx",
    "app/adm/(protected)/banners/BannerManager.tsx",
    "app/api/admin/banners/route.ts",
    "app/api/admin/banners/[id]/route.ts",
    "lib/admin-banners.ts",
  ];
  await Promise.all(
    files.map((file) => access(new URL(`../${file}`, import.meta.url))),
  );

  const [
    collectionRoute,
    itemRoute,
    manager,
    home,
    service,
    schema,
    migration,
  ] =
    await Promise.all([
      readFile(
        new URL("../app/api/admin/banners/route.ts", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../app/api/admin/banners/[id]/route.ts", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL(
          "../app/adm/(protected)/banners/BannerManager.tsx",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../lib/admin-banners.ts", import.meta.url), "utf8"),
      readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
      readFile(
        new URL(
          "../drizzle/0004_wealthy_wonder_man.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    ]);

  assert.match(collectionRoute, /requireAdminApiSession/);
  assert.match(collectionRoute, /assertSameOrigin/);
  assert.match(itemRoute, /requireAdminApiSession/);
  assert.equal(
    (itemRoute.match(/assertSameOrigin\(request\)/g) ?? []).length,
    2,
  );
  assert.match(manager, /\/api\/admin\/media/);
  assert.match(manager, /PC 이미지 선택/);
  assert.match(manager, /모바일 이미지 선택/);
  assert.match(home, /getEffectiveBanners/);
  assert.match(service, /catch \(error\)/);
  assert.match(service, /if \(options\.strict\) throw error/);
  assert.match(service, /updated_by/);
  assert.match(service, /change_type = NULL/);
  assert.match(service, /AND revision = \?/);
  assert.match(service, /RETURNING banner_id/);
  assert.match(manager, /expectedRevision/);
  assert.match(schema, /export const bannerChanges/);
  assert.match(migration, /CREATE TABLE `banner_changes`/);
  assert.match(migration, /banner_changes_updated_idx/);
});
