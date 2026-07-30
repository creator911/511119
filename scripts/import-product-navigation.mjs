import { readFile, writeFile } from "node:fs/promises";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  args.set(process.argv[index], process.argv[index + 1]);
}

const sourceOrigin = args.get("--source-origin");
if (!sourceOrigin) {
  throw new Error(
    "--source-origin을 지정해야 합니다. 기본 외부 주소는 사용하지 않습니다.",
  );
}

const normalizedOrigin = new URL(sourceOrigin);
const catalog = JSON.parse(
  await readFile(new URL("../data/catalog.json", import.meta.url), "utf8"),
);
const navigation = {};
let cursor = 0;
const failures = [];

async function worker() {
  while (cursor < catalog.products.length) {
    const product = catalog.products[cursor];
    cursor += 1;
    const target = new URL("/shop/item.php", normalizedOrigin);
    target.searchParams.set("it_id", product.id);
    try {
      const response = await fetch(target, {
        headers: {
          accept: "text/html,application/xhtml+xml",
          "user-agent": "kiel-product-navigation-import/1.0",
        },
      });
      if (!response.ok) {
        failures.push(`${product.id}: HTTP ${response.status}`);
        continue;
      }
      const html = await response.text();
      navigation[product.id] = {
        previousId: extractNavigationId(html, "product-prev"),
        nextId: extractNavigationId(html, "product-next"),
      };
    } catch (error) {
      failures.push(
        `${product.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

await Promise.all(Array.from({ length: 12 }, () => worker()));

if (failures.length > 0) {
  throw new Error(
    `상품 탐색 정보 ${failures.length}건을 가져오지 못했습니다.\n${failures.join("\n")}`,
  );
}

await writeFile(
  new URL("../data/product-navigation.json", import.meta.url),
  `${JSON.stringify(navigation, null, 2)}\n`,
  "utf8",
);

console.log(
  JSON.stringify(
    {
      imported: Object.keys(navigation).length,
      previousLinks: Object.values(navigation).filter(
        (entry) => entry.previousId,
      ).length,
      nextLinks: Object.values(navigation).filter((entry) => entry.nextId)
        .length,
    },
    null,
    2,
  ),
);

function extractNavigationId(html, className) {
  const pattern = new RegExp(
    `<a\\s+href="[^"]*?[?&]it_id=(\\d+)"\\s+class="${className}"`,
    "iu",
  );
  return html.match(pattern)?.[1] ?? null;
}
