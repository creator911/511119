import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routePath = new URL(
  "../app/shop/itemrecommend.php/page.tsx",
  import.meta.url,
);
const clientPath = new URL(
  "../app/shop/itemrecommend.php/RecommendationForm.tsx",
  import.meta.url,
);
const cssPath = new URL(
  "../app/shop/itemrecommend.php/RecommendationForm.module.css",
  import.meta.url,
);

test("product recommendation route resolves a local product only", async () => {
  const route = await readFile(routePath, "utf8");

  assert.match(route, /getStorefrontProduct\(productId\)/u);
  assert.match(route, /\/shop\/item\.php\?it_id=/u);
  assert.match(route, /상품 정보를 찾을 수 없습니다/u);
  assert.doesNotMatch(route, /kiel-gold\.com|www\.kiel-gold/u);
});

test("recommendation form validates all legacy-compatible fields", async () => {
  const client = await readFile(clientPath, "utf8");

  for (const field of ["to_email", "subject", "content"]) {
    assert.match(client, new RegExp(`name="${field}"[\\s\\S]*?required`, "u"));
  }
  assert.doesNotMatch(client, /name="to_name"/u);
  assert.match(client, /type="email"/u);
  assert.match(client, /form\.reportValidity\(\)/u);
  assert.match(client, /new URL\(`mailto:/u);
  assert.doesNotMatch(client, /fetch\(|itemrecommendmail\.php|kiel-gold\.com/u);
});

test("recommendation popup keeps the legacy visual contract", async () => {
  const [client, css] = await Promise.all([
    readFile(clientPath, "utf8"),
    readFile(cssPath, "utf8"),
  ]);

  assert.match(client, /요약정보 및 구매 - 추천하기/u);
  assert.match(client, />\s*보내기\s*</u);
  assert.match(client, />\s*닫기\s*</u);
  assert.match(css, /height:\s*60px/u);
  assert.match(css, /background:\s*#353535/u);
  assert.match(css, /border-top:\s*8px solid #cc2300/u);
  assert.match(css, /padding:\s*15px/u);
  assert.match(css, /background:\s*#e53935/u);
});
