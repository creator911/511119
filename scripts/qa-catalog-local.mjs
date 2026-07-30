import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

const workspaceRoot = process.cwd();
const baseUrl = new URL(
  process.env.QA_BASE_URL || "http://localhost:4173/",
);
const catalog = JSON.parse(
  await readFile(new URL("../data/catalog.json", import.meta.url), "utf8"),
);
const failures = [];
const checkedAssets = new Set();
let detailImageReferences = 0;

await mapLimit(catalog.products, 6, async (product) => {
  const target = new URL(
    `/shop/item.php?it_id=${encodeURIComponent(product.id)}`,
    baseUrl,
  );
  try {
    const response = await fetch(target, {
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent": "kiel-local-catalog-qa/1.0",
      },
    });
    const html = await response.text();
    if (response.status !== 200) {
      failures.push(`product ${product.id}: HTTP ${response.status}`);
    }
    if (!decodedHtmlIncludes(html, product.name)) {
      failures.push(`product ${product.id}: name is absent from rendered HTML`);
    }
    if (/https?:\/\/(?:www\.)?kiel-gold\.com/iu.test(html)) {
      failures.push(`product ${product.id}: old-domain reference remains`);
    }
  } catch (error) {
    failures.push(`product ${product.id}: ${formatError(error)}`);
  }
});

await mapLimit(catalog.categories, 6, async (category) => {
  const target = new URL(
    `/shop/list.php?ca_id=${encodeURIComponent(category.id)}`,
    baseUrl,
  );
  try {
    const response = await fetch(target, {
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent": "kiel-local-catalog-qa/1.0",
      },
    });
    const html = await response.text();
    if (response.status !== 200) {
      failures.push(`category ${category.id}: HTTP ${response.status}`);
    }
    if (!decodedHtmlIncludes(html, category.name)) {
      failures.push(
        `category ${category.id}: name is absent from rendered HTML`,
      );
    }
    if (/https?:\/\/(?:www\.)?kiel-gold\.com/iu.test(html)) {
      failures.push(`category ${category.id}: old-domain reference remains`);
    }
  } catch (error) {
    failures.push(`category ${category.id}: ${formatError(error)}`);
  }
});

for (const product of catalog.products) {
  for (const image of product.images ?? []) {
    checkedAssets.add(image);
  }
  const detailHtml = String(product.detailHtml ?? "");
  if (/loading\s*=\s*["']lazy["']/iu.test(detailHtml)) {
    failures.push(`product ${product.id}: detail image still uses lazy loading`);
  }
  if (
    /(?:https?:)?\/\/|https?%3a%2f%2f|kiel-gold\.com/iu.test(detailHtml)
  ) {
    failures.push(`product ${product.id}: external detail reference remains`);
  }
  for (const match of detailHtml.matchAll(
    /\b(?:src|data-src|data-original)=["']([^"']+)["']/giu,
  )) {
    detailImageReferences += 1;
    const assetPath = match[1];
    if (!assetPath.startsWith("/legacy/")) {
      failures.push(
        `product ${product.id}: non-local detail asset ${assetPath}`,
      );
      continue;
    }
    checkedAssets.add(assetPath);
  }
}

for (const banner of catalog.banners) {
  checkedAssets.add(banner.image);
  checkedAssets.add(banner.mobileImage);
}

await mapLimit([...checkedAssets], 16, async (assetPath) => {
  if (
    typeof assetPath !== "string" ||
    !assetPath.startsWith("/legacy/") ||
    /https?:|(?:^|\/)\.\.(?:\/|$)/iu.test(assetPath)
  ) {
    failures.push(`unsafe catalog asset path: ${String(assetPath)}`);
    return;
  }
  try {
    const info = await stat(join(workspaceRoot, "public", assetPath.slice(1)));
    if (!info.isFile() || info.size <= 0) {
      failures.push(`empty catalog asset: ${assetPath}`);
    }
  } catch {
    failures.push(`missing catalog asset: ${assetPath}`);
  }
});

const detailImageProducts = catalog.products.filter((product) =>
  /<img\b/iu.test(String(product.detailHtml ?? "")),
);

console.log(
  JSON.stringify(
    {
      ok: failures.length === 0,
      checked: {
        products: catalog.products.length,
        categories: catalog.categories.length,
        catalogAssets: checkedAssets.size,
        productsWithDetailImages: detailImageProducts.length,
        detailImageReferences,
      },
      failures,
    },
    null,
    2,
  ),
);

if (failures.length > 0) {
  process.exitCode = 1;
}

async function mapLimit(values, limit, worker) {
  let cursor = 0;
  async function runner() {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      await worker(values[index], index);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, values.length) }, () => runner()),
  );
}

function formatError(error) {
  if (!(error instanceof Error)) return String(error);
  const causeCode =
    error.cause &&
    typeof error.cause === "object" &&
    "code" in error.cause &&
    typeof error.cause.code === "string"
      ? error.cause.code
      : "";
  return causeCode || error.message;
}

function decodedHtmlIncludes(html, expectedText) {
  const decoded = String(html)
    .replace(/&amp;/giu, "&")
    .replace(/&quot;/giu, '"')
    .replace(/&#0?39;|&apos;/giu, "'")
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">")
    .replace(/&#(\d+);/gu, (_, value) =>
      String.fromCodePoint(Number.parseInt(value, 10)),
    )
    .replace(/&#x([0-9a-f]+);/giu, (_, value) =>
      String.fromCodePoint(Number.parseInt(value, 16)),
    );
  return decoded.includes(String(expectedText));
}
