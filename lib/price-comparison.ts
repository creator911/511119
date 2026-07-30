import { getEffectiveProducts } from "@/lib/admin-products";
import { getLegacyAdminToolSettings } from "@/lib/admin-tools";

export interface PriceComparisonSettings {
  enabled: boolean;
  feedName: string;
  memo: string;
}

export async function getPriceComparisonSettings(): Promise<PriceComparisonSettings> {
  const settings = await getLegacyAdminToolSettings("price-comparison");
  return {
    enabled: settings.enabled === true,
    feedName:
      typeof settings.feedName === "string" && settings.feedName.trim()
        ? settings.feedName.trim().slice(0, 200)
        : "KIEL 상품 피드",
    memo:
      typeof settings.memo === "string"
        ? settings.memo.trim().slice(0, 5_000)
        : "",
  };
}

export async function buildPriceComparisonXml(
  requestUrl: string,
): Promise<{ xml: string; productCount: number; settings: PriceComparisonSettings }> {
  const settings = await getPriceComparisonSettings();
  const products = settings.enabled
    ? (await getEffectiveProducts({ strict: true })).filter(
        (product) => product.active,
      )
    : [];
  const generatedAt = new Date().toISOString();
  const entries = products.map((product) => {
    const productUrl = new URL("/shop/item.php", requestUrl);
    productUrl.searchParams.set("it_id", product.id);
    const imageUrl = product.images[0]
      ? new URL(product.images[0], requestUrl).toString()
      : "";
    const availability =
      product.soldOut || product.stock <= 0 ? "out_of_stock" : "in_stock";
    return [
      "  <product>",
      `    <id>${escapeXml(product.id)}</id>`,
      `    <name>${escapeXml(product.name)}</name>`,
      `    <description>${escapeXml(product.basic)}</description>`,
      `    <price currency="KRW">${Math.max(0, Math.trunc(product.price))}</price>`,
      `    <availability>${availability}</availability>`,
      `    <link>${escapeXml(productUrl.toString())}</link>`,
      `    <image>${escapeXml(imageUrl)}</image>`,
      `    <brand>${escapeXml(product.brand)}</brand>`,
      `    <maker>${escapeXml(product.maker)}</maker>`,
      `    <model>${escapeXml(product.model)}</model>`,
      `    <category_id>${escapeXml(product.categoryId)}</category_id>`,
      "  </product>",
    ].join("\n");
  });
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<product_feed name="${escapeXml(settings.feedName)}" generated_at="${generatedAt}">`,
    `  <product_count>${entries.length}</product_count>`,
    ...entries,
    "</product_feed>",
    "",
  ].join("\n");
  return { xml, productCount: entries.length, settings };
}

function escapeXml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&apos;");
}
