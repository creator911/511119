import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import http from "node:http";
import https from "node:https";

const sourceOrigin = new URL(process.argv[2] ?? "");
const workspaceRoot = process.cwd();
const publicRoot = join(workspaceRoot, "public", "legacy");
const dataRoot = join(workspaceRoot, "data");
const catalogPath = join(dataRoot, "catalog.json");

const knownCategoryIds = [
  "10",
  "20",
  "2010",
  "2030",
  "40",
  "4010",
  "4020",
  "50",
  "5020",
  "5040",
  "60",
  "6010",
  "6020",
  "6030",
  "6040",
  "6070",
  "70",
  "7010",
  "7020",
  "7030",
  "7040",
  "80",
  "8030",
  "90",
  "9010",
  "9020",
  "91",
  "9110",
  "9120",
  "9130",
  "9140",
];

const fallbackCategoryNames = {
  "10": "테마주얼리",
  "20": "골드바",
  "2010": "자사골드바",
  "2030": "십이지신 골드바",
  "40": "실버바",
  "4010": "고급형실버바",
  "4020": "투자형실버바",
  "50": "돌선물",
  "5020": "돌팔찌",
  "5040": "금수저",
  "60": "여성순금",
  "6010": "목걸이",
  "6020": "팔찌",
  "6030": "귀걸이",
  "6040": "반지",
  "6070": "펜던트",
  "70": "남성순금",
  "7010": "목걸이",
  "7020": "팔찌",
  "7030": "반지",
  "7040": "펜던트",
  "80": "커플",
  "8030": "커플링",
  "90": "기업&GIFT선물",
  "9010": "소장품(동물)",
  "9020": "골프",
  "91": "웨딩",
  "9110": "꼬냑다이아몬드",
  "9120": "랩다이아몬드",
  "9130": "모이사나이트",
  "9140": "지르코니아",
};

if (!/^https?:$/.test(sourceOrigin.protocol)) {
  throw new Error(
    "Usage: node scripts/import-legacy-catalog.mjs https://source.example",
  );
}

await Promise.all([
  mkdir(publicRoot, { recursive: true }),
  mkdir(join(publicRoot, "banners"), { recursive: true }),
  mkdir(join(publicRoot, "products"), { recursive: true }),
  mkdir(join(publicRoot, "fonts"), { recursive: true }),
  mkdir(dataRoot, { recursive: true }),
]);

function cleanText(value = "") {
  return decodeEntities(stripTags(value))
    .replace(/\s+/g, " ")
    .trim();
}

function stripTags(value = "") {
  return value
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ");
}

function decodeEntities(value = "") {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&#(\d+);/g, (_, code) =>
      String.fromCodePoint(Number.parseInt(code, 10)),
    )
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function parseAttributes(tag) {
  const attributes = {};
  const matcher =
    /([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  let match;
  while ((match = matcher.exec(tag))) {
    attributes[match[1].toLowerCase()] =
      match[2] ?? match[3] ?? match[4] ?? "";
  }
  return attributes;
}

function metaMap(html) {
  const output = new Map();
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attributes = parseAttributes(match[0]);
    const key = attributes.property ?? attributes.name ?? attributes.itemprop;
    if (key && attributes.content && !output.has(key.toLowerCase())) {
      output.set(key.toLowerCase(), decodeEntities(attributes.content));
    }
  }
  return output;
}

function absoluteUrl(value) {
  if (!value || value.startsWith("data:") || value.startsWith("inline-svg:")) {
    return null;
  }
  try {
    return new URL(decodeEntities(value), sourceOrigin).href;
  } catch {
    return null;
  }
}

function extractImageUrls(html) {
  const urls = [];
  for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
    const attributes = parseAttributes(match[0]);
    const url = absoluteUrl(
      attributes["data-lazy"] ?? attributes["data-src"] ?? attributes.src,
    );
    if (url) urls.push(url);
  }
  return [...new Set(urls)];
}

function extensionFor(url, fallback = ".jpg") {
  try {
    const candidate = extname(new URL(url).pathname).toLowerCase();
    if (/^\.(?:jpe?g|png|webp|gif|avif)$/.test(candidate)) {
      return candidate === ".jpeg" ? ".jpg" : candidate;
    }
  } catch {
    // Ignore and use a safe image fallback.
  }
  return fallback;
}

function productIdsFromHtml(html) {
  return [
    ...new Set(
      [...html.matchAll(/(?:\/shop\/)?item\.php\?it_id=(\d+)/gi)].map(
        (match) => match[1],
      ),
    ),
  ];
}

function pageNumbersFromHtml(html) {
  const pages = [...html.matchAll(/(?:[?&]|&amp;)page=(\d+)/gi)].map((match) =>
    Number.parseInt(match[1], 10),
  );
  return pages.length ? Math.max(...pages, 1) : 1;
}

function categoryLinksFromHtml(html) {
  const links = [];
  const matcher =
    /<a\b[^>]*href=(?:"[^"]*list\.php\?ca_id=(\d+)[^"]*"|'[^']*list\.php\?ca_id=(\d+)[^']*')[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = matcher.exec(html))) {
    const id = match[1] ?? match[2];
    const name = cleanText(match[3]).replace(/\s*\[\d+\]\s*$/, "");
    if (id && name && !/^\d+\s*페이지$/u.test(name)) {
      links.push({ id, name });
    }
  }
  return links;
}

function firstMatch(html, expression, group = 1) {
  const match = expression.exec(html);
  return match?.[group] ?? "";
}

function tableValue(html, label) {
  const rows = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
  for (const row of rows) {
    const heading = cleanText(
      firstMatch(row[1], /<th\b[^>]*>([\s\S]*?)<\/th>/i),
    );
    if (heading === label) {
      return cleanText(
        firstMatch(row[1], /<td\b[^>]*>([\s\S]*?)<\/td>/i),
      );
    }
  }
  return "";
}

function integerFromText(value) {
  const parsed = Number.parseInt(String(value).replace(/[^\d-]/g, ""), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function mapLimit(values, limit, worker) {
  const output = new Array(values.length);
  let cursor = 0;
  async function runner() {
    while (cursor < values.length) {
      const index = cursor++;
      output[index] = await worker(values[index], index);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, values.length) }, () => runner()),
  );
  return output;
}

async function requestBuffer(url, { insecure = false, redirects = 0 } = {}) {
  if (redirects > 5) throw new Error(`Too many redirects for ${url}`);
  const parsed = new URL(url);
  const transport = parsed.protocol === "http:" ? http : https;

  return new Promise((resolve, reject) => {
    const request = transport.get(
      parsed,
      {
        headers: {
          "user-agent":
            "Mozilla/5.0 (compatible; catalog preservation for site owner)",
          accept: "*/*",
        },
        rejectUnauthorized: !insecure,
      },
      async (response) => {
        const status = response.statusCode ?? 0;
        if (
          status >= 300 &&
          status < 400 &&
          response.headers.location
        ) {
          response.resume();
          try {
            resolve(
              await requestBuffer(
                new URL(response.headers.location, parsed).href,
                { insecure, redirects: redirects + 1 },
              ),
            );
          } catch (error) {
            reject(error);
          }
          return;
        }
        if (status < 200 || status >= 300) {
          response.resume();
          reject(new Error(`HTTP ${status} for ${url}`));
          return;
        }
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () =>
          resolve({
            body: Buffer.concat(chunks),
            contentType: response.headers["content-type"] ?? "",
          }),
        );
        response.on("error", reject);
      },
    );
    request.setTimeout(30_000, () => {
      request.destroy(new Error(`Timeout fetching ${url}`));
    });
    request.on("error", reject);
  });
}

async function fetchBuffer(url) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await requestBuffer(url, { insecure: attempt > 0 });
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
    }
  }
  throw lastError;
}

async function fetchText(pathOrUrl) {
  const url = new URL(pathOrUrl, sourceOrigin).href;
  const { body } = await fetchBuffer(url);
  return body.toString("utf8");
}

async function downloadAsset(url, destination) {
  try {
    try {
      const existing = await stat(destination);
      if (existing.isFile() && existing.size > 0) return true;
    } catch {
      // Download when the file is not present yet.
    }
    const { body } = await fetchBuffer(url);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, body);
    return true;
  } catch (error) {
    console.warn(
      `[asset] ${url} failed: ${error instanceof Error ? error.message : error}`,
    );
    return false;
  }
}

console.log("[1/5] Discovering categories and products...");
const homeHtml = await fetchText("/");
const categoryNames = new Map(Object.entries(fallbackCategoryNames));
for (const category of categoryLinksFromHtml(homeHtml)) {
  categoryNames.set(category.id, category.name);
}

const categoryPages = await mapLimit(knownCategoryIds, 6, async (id) => {
  const html = await fetchText(`/shop/list.php?ca_id=${id}`);
  for (const category of categoryLinksFromHtml(html)) {
    if (knownCategoryIds.includes(category.id)) {
      categoryNames.set(category.id, category.name);
    }
  }
  return { id, html, pages: pageNumbersFromHtml(html) };
});

const productIds = new Set();
const productCategoryCandidates = new Map();
function rememberCategoryProducts(categoryId, html) {
  for (const productId of productIdsFromHtml(html)) {
    productIds.add(productId);
    const candidates = productCategoryCandidates.get(productId) ?? new Set();
    candidates.add(categoryId);
    productCategoryCandidates.set(productId, candidates);
  }
}
for (const page of categoryPages) {
  rememberCategoryProducts(page.id, page.html);
}

const extraCategoryRequests = categoryPages.flatMap(({ id, pages }) =>
  Array.from({ length: Math.max(0, pages - 1) }, (_, index) => ({
    id,
    page: index + 2,
  })),
);
await mapLimit(extraCategoryRequests, 6, async ({ id, page }) => {
  const html = await fetchText(`/shop/list.php?ca_id=${id}&page=${page}`);
  rememberCategoryProducts(id, html);
});

const typeSets = {
  hit: new Set(),
  recommend: new Set(),
  new: new Set(),
  popular: new Set(),
  sale: new Set(),
};
const typeNames = ["hit", "recommend", "new", "popular", "sale"];
await mapLimit([1, 2, 3, 4, 5], 5, async (typeNumber) => {
  const first = await fetchText(`/shop/listtype.php?type=${typeNumber}`);
  const pages = pageNumbersFromHtml(first);
  const htmlPages = [first];
  if (pages > 1) {
    htmlPages.push(
      ...(await mapLimit(
        Array.from({ length: pages - 1 }, (_, index) => index + 2),
        4,
        (page) =>
          fetchText(`/shop/listtype.php?type=${typeNumber}&page=${page}`),
      )),
    );
  }
  for (const html of htmlPages) {
    productIdsFromHtml(html).forEach((id) =>
      typeSets[typeNames[typeNumber - 1]].add(id),
    );
  }
});

console.log(
  `[2/5] Reading ${productIds.size} public product pages (no customer data)...`,
);
const sortedProductIds = [...productIds].sort(
  (left, right) => Number(right) - Number(left),
);
let parsedCount = 0;
const products = await mapLimit(sortedProductIds, 7, async (id) => {
  const html = await fetchText(`/shop/item.php?it_id=${id}`);
  const meta = metaMap(html);
  const galleryBlock = firstMatch(
    html,
    /<div\b[^>]*class=(?:"[^"]*\bproduct-img-big\b[^"]*\bfotorama\b[^"]*"|'[^']*\bproduct-img-big\b[^']*\bfotorama\b[^']*')[^>]*>([\s\S]*?)<\/div>/i,
  );
  const galleryUrls = extractImageUrls(galleryBlock);
  const fallbackImage = absoluteUrl(
    meta.get("og:image") ?? meta.get("twitter:image") ?? "",
  );
  if (!galleryUrls.length && fallbackImage) galleryUrls.push(fallbackImage);

  const detailHtmlRaw = firstMatch(
    html,
    /<div\s+id=(?:"sit_inf_explan"|'sit_inf_explan')[^>]*>([\s\S]*?)<\/div>\s*(?=<h3\b[^>]*class=(?:"[^"]*\bh-hidden\b[^"]*"|'[^']*\bh-hidden\b[^']*'))/i,
  );
  const detailUrls = extractImageUrls(detailHtmlRaw).slice(0, 20);
  const activeCategories = [
    ...html.matchAll(
      /list\.php\?ca_id=(\d+)"\s+class=(?:"[^"]*\bsct_here\b[^"]*"|'[^']*\bsct_here\b[^']*')/gi,
    ),
  ].map((match) => match[1]);
  const discoveredCategories = [...(productCategoryCandidates.get(id) ?? [])]
    .sort((a, b) => b.length - a.length);
  const categoryId =
    activeCategories.at(-1) ??
    discoveredCategories[0] ??
    "10";
  const name = (
    cleanText(
      firstMatch(
        html,
        /<h3\b[^>]*class=(?:"[^"]*\bproduct-title\b[^"]*"|'[^']*\bproduct-title\b[^']*')[^>]*>[\s\S]*?<strong\b[^>]*>([\s\S]*?)<\/strong>/i,
      ),
    ) ||
    cleanText(meta.get("og:title") ?? "")
      .replace(/\s+요약정보\s+및\s+구매.*$/u, "")
      .replace(/\s*[-|]\s*키엘골드.*$/u, "") ||
    `상품 ${id}`
  ).replace(/\s*요약정보\s+및\s+구매.*$/u, "").trim();
  const basic = cleanText(
    firstMatch(
      html,
      /<h3\b[^>]*class=(?:"[^"]*\bproduct-title\b[^"]*"|'[^']*\bproduct-title\b[^']*')[^>]*>[\s\S]*?<\/h3>\s*[\s\S]*?<p\b[^>]*class=(?:"[^"]*\btext-gray\b[^"]*"|'[^']*\btext-gray\b[^']*')[^>]*>([\s\S]*?)<\/p>/i,
    ),
  );
  const price = integerFromText(
    firstMatch(
      html,
      /<input\b(?=[^>]*\bid=(?:"it_price"|'it_price'))[^>]*\bvalue=(?:"([^"]*)"|'([^']*)')[^>]*>/i,
      1,
    ) ||
      firstMatch(
        html,
        /<strong\b[^>]*class=(?:"[^"]*\bshop-product-prices\b[^"]*"|'[^']*\bshop-product-prices\b[^']*')[^>]*>([\s\S]*?)<\/strong>/i,
      ),
  );
  const originalPrice = integerFromText(
    firstMatch(
      html,
      /<span\b[^>]*class=(?:"[^"]*\bline-through\b[^"]*"|'[^']*\bline-through\b[^']*')[^>]*>([\s\S]*?)<\/span>/i,
    ),
  );
  const stock = integerFromText(
    firstMatch(
      html,
      /<input\b(?=[^>]*\bclass=(?:"[^"]*\bio_stock\b[^"]*"|'[^']*\bio_stock\b[^']*'))[^>]*\bvalue=(?:"([^"]*)"|'([^']*)')[^>]*>/i,
      1,
    ),
  );

  parsedCount += 1;
  if (parsedCount % 25 === 0 || parsedCount === sortedProductIds.length) {
    console.log(`[product] ${parsedCount}/${sortedProductIds.length}`);
  }

  return {
    id,
    categoryId,
    name,
    basic,
    price,
    originalPrice: originalPrice || price,
    stock,
    maker: tableValue(html, "제조사"),
    origin: tableValue(html, "원산지"),
    brand: tableValue(html, "브랜드"),
    model: tableValue(html, "모델"),
    galleryUrls,
    detailUrls,
    detailHtmlRaw,
    flags: {
      hit: typeSets.hit.has(id),
      recommend: typeSets.recommend.has(id),
      new: typeSets.new.has(id),
      popular: typeSets.popular.has(id),
      sale: typeSets.sale.has(id),
    },
  };
});

console.log("[3/5] Copying product and detail images into the new site...");
const assetJobs = [];
for (const product of products) {
  const productDirectory = join(publicRoot, "products", product.id);
  const imagePaths = [];
  for (const [index, url] of product.galleryUrls.entries()) {
    const localPath = `/legacy/products/${product.id}/gallery-${index + 1}${extensionFor(url)}`;
    imagePaths.push(localPath);
    assetJobs.push({
      url,
      destination: join(workspaceRoot, "public", localPath.slice(1)),
      assign(success) {
        if (!success) imagePaths[index] = "";
      },
    });
  }
  const detailReplacements = new Map();
  for (const [index, url] of product.detailUrls.entries()) {
    const localPath = `/legacy/products/${product.id}/detail-${index + 1}${extensionFor(url)}`;
    detailReplacements.set(url, localPath);
    assetJobs.push({
      url,
      destination: join(workspaceRoot, "public", localPath.slice(1)),
      assign(success) {
        if (!success) detailReplacements.set(url, "");
      },
    });
  }
  product.images = imagePaths;
  product.detailReplacements = detailReplacements;
  await mkdir(productDirectory, { recursive: true });
}

let assetCount = 0;
await mapLimit(assetJobs, 8, async (job) => {
  const success = await downloadAsset(job.url, job.destination);
  job.assign(success);
  assetCount += 1;
  if (assetCount % 100 === 0 || assetCount === assetJobs.length) {
    console.log(`[asset] ${assetCount}/${assetJobs.length}`);
  }
});

console.log("[4/5] Copying logo, banners, and fonts...");
const homeImages = extractImageUrls(homeHtml);
const bannerUrls = [
  ...new Set(
    homeImages.filter((url) => /\/data\/ebslider\/.+\.(?:jpe?g|png|webp)/i.test(url)),
  ),
];
const logoUrl =
  homeImages.find((url) => /\/data\/common\/.+\.(?:png|jpe?g|webp)/i.test(url)) ??
  homeImages.find((url) => /logo/i.test(url));

const banners = [];
await mapLimit(bannerUrls, 4, async (url, index) => {
  const localPath = `/legacy/banners/banner-${index + 1}${extensionFor(url)}`;
  if (
    await downloadAsset(
      url,
      join(workspaceRoot, "public", localPath.slice(1)),
    )
  ) {
    banners.push({
      id: `banner-${index + 1}`,
      image: localPath,
      mobileImage: localPath,
      href: "/shop",
      sortOrder: index + 1,
      active: true,
    });
  }
});

if (logoUrl) {
  await downloadAsset(logoUrl, join(publicRoot, `logo${extensionFor(logoUrl, ".png")}`));
}
const fontSources = [
  [
    new URL(
      "/theme/eb4_basic/plugins/font/S-Core_Dream/scdream3-webfont.woff",
      sourceOrigin,
    ).href,
    "scdream3.woff",
  ],
  [
    new URL(
      "/theme/eb4_basic/plugins/font/S-Core_Dream/scdream5-webfont.woff",
      sourceOrigin,
    ).href,
    "scdream5.woff",
  ],
  [
    new URL(
      "/theme/eb4_basic/plugins/font/S-Core_Dream/scdream6-webfont.woff",
      sourceOrigin,
    ).href,
    "scdream6.woff",
  ],
  [
    new URL(
      "/theme/eb4_basic/plugins/font/S-Core_Dream/scdream7-webfont.woff",
      sourceOrigin,
    ).href,
    "scdream7.woff",
  ],
];
await mapLimit(fontSources, 4, ([url, filename]) =>
  downloadAsset(url, join(publicRoot, "fonts", filename)),
);

for (const product of products) {
  let detailHtml = product.detailHtmlRaw
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "")
    .replace(/<iframe\b[\s\S]*?<\/iframe>/gi, "")
    .replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*')/gi, "")
    .replace(/\s(?:href|src)\s*=\s*(?:"javascript:[^"]*"|'javascript:[^']*')/gi, "");
  detailHtml = detailHtml.replace(/<img\b[^>]*>/gi, (tag) => {
    const attributes = parseAttributes(tag);
    const source = absoluteUrl(
      attributes["data-lazy"] ?? attributes["data-src"] ?? attributes.src,
    );
    const localPath = source ? product.detailReplacements.get(source) : "";
    if (!localPath) return "";
    const alt = (attributes.alt ?? product.name)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    return `<img src="${localPath}" alt="${alt}" loading="lazy">`;
  });
  for (const [remoteUrl, localPath] of product.detailReplacements.entries()) {
    detailHtml = detailHtml.split(remoteUrl).join(localPath || "");
    detailHtml = detailHtml
      .split(remoteUrl.replace(/&/g, "&amp;"))
      .join(localPath || "");
  }
  product.detailHtml = detailHtml;
  delete product.galleryUrls;
  delete product.detailUrls;
  delete product.detailHtmlRaw;
  delete product.detailReplacements;
  product.images = product.images.filter(Boolean);
  product.active = true;
}

const categories = knownCategoryIds.map((id, sortOrder) => ({
  id,
  name: categoryNames.get(id) ?? fallbackCategoryNames[id] ?? id,
  parentId: id.length > 2 ? id.slice(0, 2) : null,
  sortOrder: sortOrder + 1,
  active: true,
}));

const catalog = {
  version: 1,
  importedAt: new Date().toISOString(),
  categories,
  products,
  banners: banners.sort((a, b) => a.sortOrder - b.sortOrder),
  business: {
    companyName: "골드리안 마켓",
    representative: "전제민",
    businessNumber: "420-48-00768",
    mailOrderNumber: "2021-부산부산진-0536",
    address: "부산광역시 부산진구 백양산로 36",
    email: "goldrian@naver.com",
  },
};

console.log("[5/5] Writing the local catalog...");
await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
await writeFile(
  join(publicRoot, "README.txt"),
  [
    "These assets were copied from the owner's legacy storefront for the independent rebuild.",
    "The production site must use only these local paths or newly uploaded media.",
    "",
  ].join("\n"),
  "utf8",
);

console.log(
  `Done: ${catalog.products.length} products, ${catalog.categories.length} categories, ${assetJobs.length} product assets.`,
);
