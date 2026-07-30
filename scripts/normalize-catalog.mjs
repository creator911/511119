import { readFile, writeFile } from "node:fs/promises";

const catalogPath = new URL("../data/catalog.json", import.meta.url);
const mapPath = new URL("../data/legacy-product-map.json", import.meta.url);
const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
const categoryMap = JSON.parse(await readFile(mapPath, "utf8"));

for (const product of catalog.products) {
  const mapped = categoryMap[product.id];
  if (typeof mapped === "string") product.categoryId = mapped;
  else if (mapped?.categoryId) product.categoryId = mapped.categoryId;
  product.name = product.name
    .replace(/\s*요약정보\s+및\s+구매.*$/u, "")
    .trim();
}

await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
console.log(`Normalized ${catalog.products.length} products.`);
