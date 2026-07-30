import { readFile } from "node:fs/promises";

const baseUrl = new URL(process.env.QA_BASE_URL || "http://localhost:4173/");
const catalog = JSON.parse(
  await readFile(new URL("../data/catalog.json", import.meta.url), "utf8"),
);
const adminShellSource = await readFile(
  new URL("../app/components/admin/AdminShell.tsx", import.meta.url),
  "utf8",
);
const adminToolRoutes = [
  ...new Set(
    [...adminShellSource.matchAll(/\bhref:\s*"(?<href>\/adm\/tools\/[^"]+)"/gu)]
      .map((match) => match.groups?.href)
      .filter(Boolean),
  ),
];
const firstProduct = catalog.products.find((product) => product.active);
const firstCategory = catalog.categories.find((category) => category.active);

if (!firstProduct || !firstCategory) {
  throw new Error("QA에 사용할 활성 상품 또는 분류가 없습니다.");
}

const publicRoutes = [
  "/",
  "/shop",
  "/page?pid=provision",
  "/page?pid=privacy",
  `/shop/list.php?ca_id=${encodeURIComponent(firstCategory.id)}`,
  "/shop/list.php?ca_id=__missing__",
  `/shop/item.php?it_id=${encodeURIComponent(firstProduct.id)}`,
  "/shop/item.php?it_id=__missing__",
  ...["1", "2", "3", "4", "5"].map(
    (type) => `/shop/listtype.php?type=${type}`,
  ),
  "/shop/search.php",
  "/shop/search.php?q=%EA%B3%A8%EB%93%9C",
  "/shop/search.php?q=%EA%B3%A8%EB%93%9C&page=999999",
  "/shop/cart.php",
  "/shop/couponzone.php",
  "/shop/event.php",
  "/shop/mypage.php",
  "/shop/orderform.php",
  "/shop/orderinquiry.php",
  "/shop/orderinquiryview.php",
  "/shop/profile.php",
  "/shop/wishlist.php",
  "/bbs/cashtx.php",
  "/bbs/content.php",
  "/bbs/faq.php",
  "/bbs/board.php",
  "/bbs/inquiry.php",
  "/bbs/login.php",
  "/bbs/password_lost.php",
  "/bbs/register.php",
  "/bbs/withdrawal_list.php",
  "/bbs/writecz.php",
];

const adminRoutes = [
  "/adm",
  "/adm/login",
  "/adm/banners",
  "/adm/categories",
  "/adm/content",
  "/adm/content?view=faq",
  "/adm/content?view=inquiries",
  "/adm/content?view=reviews",
  ...[
    "groups",
    "boards",
    "posts",
    "comments",
    "inquiries",
    "inquiry-settings",
  ].map((view) => `/adm/community?view=${view}`),
  "/adm/orders",
  "/adm/orders?print=1",
  "/adm/products",
  "/adm/products?view=stock",
  "/adm/products/new",
  `/adm/products/${encodeURIComponent(firstProduct.id)}`,
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
  ...adminToolRoutes,
];

const anonymousApiChecks = [
  { method: "GET", path: "/api/customer/profile", expected: [401] },
  { method: "GET", path: "/api/customer/wallet", expected: [401] },
  { method: "GET", path: "/api/customer/wishlist", expected: [401] },
  { method: "GET", path: "/api/inquiries", expected: [200] },
  { method: "GET", path: "/api/admin/session", expected: [200] },
  { method: "GET", path: "/api/admin/products", expected: [401] },
  { method: "GET", path: "/api/admin/categories", expected: [401] },
  { method: "GET", path: "/api/admin/banners", expected: [401] },
  { method: "GET", path: "/api/admin/content", expected: [401] },
  { method: "GET", path: "/api/admin/interactions", expected: [401] },
  { method: "GET", path: "/api/admin/community?resource=groups", expected: [401] },
  { method: "GET", path: "/api/admin/orders", expected: [401] },
  { method: "GET", path: "/api/admin/settings", expected: [401] },
  { method: "GET", path: "/api/admin/users", expected: [401] },
  { method: "GET", path: "/api/admin/wallet/requests", expected: [401] },
  {
    method: "POST",
    path: "/api/customer/session",
    expected: [400, 401],
    body: {},
  },
  {
    method: "POST",
    path: "/api/customer/register",
    expected: [400],
    body: {},
  },
  {
    method: "POST",
    path: "/api/inquiries",
    expected: [400],
    body: {},
  },
  {
    method: "POST",
    path: "/api/orders",
    expected: [400],
    body: {},
    headers: { "idempotency-key": `qa-invalid-${Date.now()}` },
  },
  {
    method: "POST",
    path: `/api/products/${encodeURIComponent(firstProduct.id)}/interactions`,
    expected: [401],
    body: {},
  },
];

const failures = [];
const assetUrls = new Set();
const routeResults = [];

for (const route of [...publicRoutes, ...adminRoutes]) {
  const target = new URL(route, baseUrl);
  try {
    const response = await fetch(target, {
      redirect: "follow",
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent": "kiel-local-qa/1.0",
      },
    });
    const contentType = response.headers.get("content-type") || "";
    const body = await response.text();
    routeResults.push({
      route,
      status: response.status,
      finalPath: new URL(response.url).pathname,
    });
    if (!response.ok || !contentType.includes("text/html")) {
      failures.push(
        `${route}: HTTP ${response.status}, content-type=${contentType || "(없음)"}`,
      );
      continue;
    }
    if (
      /Internal Server Error|Application error|server-side exception/iu.test(
        body,
      )
    ) {
      failures.push(`${route}: 서버 오류 문구가 HTML에 포함되어 있습니다.`);
    }
    if (/https?:\/\/(?:www\.)?kiel-gold\.com/iu.test(body)) {
      failures.push(`${route}: 기존 도메인 절대 참조가 남아 있습니다.`);
    }
    collectLocalAssets(body, response.url, assetUrls);
  } catch (error) {
    failures.push(
      `${route}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

const assetResults = [];
for (const assetUrl of [...assetUrls].sort()) {
  try {
    const response = await fetch(assetUrl, {
      redirect: "follow",
      headers: { "user-agent": "kiel-local-qa/1.0" },
    });
    assetResults.push({ url: assetUrl, status: response.status });
    if (!response.ok) {
      failures.push(`${assetUrl}: 자산 HTTP ${response.status}`);
    }
  } catch (error) {
    failures.push(
      `${assetUrl}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

const apiResults = [];
for (const check of anonymousApiChecks) {
  const target = new URL(check.path, baseUrl);
  try {
    const response = await fetch(target, {
      method: check.method,
      redirect: "manual",
      headers: {
        accept: "application/json",
        ...(check.body ? { "content-type": "application/json" } : {}),
        ...check.headers,
      },
      ...(check.body ? { body: JSON.stringify(check.body) } : {}),
    });
    apiResults.push({
      method: check.method,
      path: check.path,
      status: response.status,
    });
    if (!check.expected.includes(response.status)) {
      failures.push(
        `${check.method} ${check.path}: HTTP ${response.status}, 기대값 ${check.expected.join("/")}`,
      );
    }
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      failures.push(
        `${check.method} ${check.path}: JSON이 아닌 응답 ${contentType || "(없음)"}`,
      );
    }
  } catch (error) {
    failures.push(
      `${check.method} ${check.path}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

const protectedRedirects = routeResults.filter(
  (result) =>
    result.route.startsWith("/adm") &&
    result.route !== "/adm/login" &&
    result.finalPath !== "/adm/login",
);
for (const result of protectedRedirects) {
  failures.push(
    `${result.route}: 비로그인 접근이 관리자 로그인으로 이동하지 않았습니다 (${result.finalPath}).`,
  );
}

console.log(
  JSON.stringify(
    {
      ok: failures.length === 0,
      checked: {
        pages: routeResults.length,
        assets: assetResults.length,
        anonymousApis: apiResults.length,
      },
      routeResults,
      apiResults,
      failures,
    },
    null,
    2,
  ),
);

if (failures.length > 0) {
  process.exitCode = 1;
}

function collectLocalAssets(html, documentUrl, output) {
  const attributePattern =
    /\b(?:src|href|poster)=["']([^"'#]+)["']|\bsrcset=["']([^"']+)["']/giu;
  for (const match of html.matchAll(attributePattern)) {
    const candidates = match[1]
      ? [match[1]]
      : String(match[2] || "")
          .split(",")
          .map((entry) => entry.trim().split(/\s+/u)[0]);
    for (const candidate of candidates) {
      if (
        !candidate ||
        candidate.startsWith("data:") ||
        candidate.startsWith("mailto:") ||
        candidate.startsWith("tel:") ||
        candidate.startsWith("javascript:")
      ) {
        continue;
      }
      let resolved;
      try {
        resolved = new URL(candidate, documentUrl);
      } catch {
        continue;
      }
      if (
        resolved.origin === baseUrl.origin &&
        isAssetPath(resolved.pathname)
      ) {
        resolved.hash = "";
        output.add(resolved.href);
      }
    }
  }
}

function isAssetPath(pathname) {
  return (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/legacy/") ||
    pathname.startsWith("/api/media/") ||
    /\.(?:avif|css|gif|ico|jpe?g|js|mjs|png|svg|webp|woff2?)$/iu.test(pathname)
  );
}
