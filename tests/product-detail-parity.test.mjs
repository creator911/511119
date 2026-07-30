import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const workspaceRoot = process.cwd();
const productDetailSource = await readFile(
  join(
    workspaceRoot,
    "app",
    "components",
    "storefront",
    "ProductDetail.tsx",
  ),
  "utf8",
);
const productDetailStyles = await readFile(
  join(
    workspaceRoot,
    "app",
    "components",
    "storefront",
    "Storefront.module.css",
  ),
  "utf8",
);
const productPageSource = await readFile(
  join(workspaceRoot, "app", "shop", "item.php", "page.tsx"),
  "utf8",
);
const floatingControlsSource = await readFile(
  join(
    workspaceRoot,
    "app",
    "components",
    "storefront",
    "FloatingControls.tsx",
  ),
  "utf8",
);
const catalog = JSON.parse(
  await readFile(join(workspaceRoot, "data", "catalog.json"), "utf8"),
);
const productNavigation = JSON.parse(
  await readFile(
    join(workspaceRoot, "data", "product-navigation.json"),
    "utf8",
  ),
);

test("legacy product detail structure keeps every interactive control local", () => {
  for (const marker of [
    'data-legacy-role="shop-list-nav"',
    'data-legacy-role="shop-product"',
    'data-legacy-role="sit-rel"',
    'id="sit_inf"',
    'id="sit_use"',
    'id="sit_qa"',
    'id="sit_dvr"',
    'id="sit_ex"',
    "onPointerDown={startGalleryDrag}",
    "showImage(imageIndex - 1)",
    "showImage(imageIndex + 1)",
    "selectTab(tab.id)",
    "toggleWish",
    "purchase(onAddToCart)",
    "purchase(onBuyNow)",
  ]) {
    assert.match(productDetailSource, new RegExp(escapeRegExp(marker)));
  }
  assert.doesNotMatch(
    productDetailSource,
    /https?:\/\/(?:www\.)?kiel-gold\.com/iu,
  );
});

test("desktop product shell keeps the measured legacy geometry", () => {
  for (const declaration of [
    "padding: 30px 0;",
    "height: 33.5px;",
    "min-height: 648px;",
    "padding: 10px 0;",
    "margin: 20px 0 40px;",
    "font-size: 22px;",
    "line-height: 22.5px;",
  ]) {
    assert.ok(
      productDetailStyles.includes(declaration),
      `missing geometry declaration: ${declaration}`,
    );
  }
  assert.match(
    productDetailStyles,
    /grid-template-columns:\s*calc\(41\.666667% - 14px\)\s*calc\(58\.333333% - 10px\)/u,
  );
  assert.match(
    productDetailStyles,
    /@media \(max-width: 767px\)[\s\S]*?\.productDetailTop\s*\{[\s\S]*?grid-template-columns: 1fr;/u,
  );
});

test("detail navigation uses the root family while related products stay manual", () => {
  assert.match(
    productPageSource,
    /navigationRootId = categoryPath\[0\]\?\.id \?\? product\.categoryId/u,
  );
  assert.match(productPageSource, /relatedProducts=\{\[\]\}/u);
  assert.match(productPageSource, /categoryPath\.slice\(0, -1\)/u);
  assert.match(productPageSource, /productNavigation\[product\.id\]/u);
});

test("desktop right remote exposes every original shopping section", () => {
  for (const label of [
    "나의 쇼핑 박스",
    "오늘본상품",
    "장바구니",
    "위시리스트",
    "LOGIN",
    "회원가입",
    "아이디/비번찾기",
  ]) {
    assert.ok(
      floatingControlsSource.includes(label),
      `right remote is missing ${label}`,
    );
  }
  assert.match(
    productDetailStyles,
    /@keyframes shoppingPanelEnter[\s\S]*?translateX\(100%\)/u,
  );
  assert.match(floatingControlsSource, /id="shopping-panel"/u);
  assert.match(floatingControlsSource, /aria-controls="shopping-panel"/u);
  assert.match(floatingControlsSource, /목록의 처음입니다\./u);
  assert.match(floatingControlsSource, /더 이상 목록이 없습니다\./u);
  assert.match(floatingControlsSource, /buyCartFromPanel/u);
  assert.match(floatingControlsSource, /kg_checkout_v1/u);
  assert.match(floatingControlsSource, /shoppingPanelBuyNow/u);
});

test("gallery and utility controls keep the legacy edge behavior", () => {
  assert.match(productDetailSource, /const galleryLoops = gallery\.length > 2/u);
  assert.match(productDetailSource, /disabled=\{!galleryLoops && imageIndex === 0\}/u);
  assert.match(
    productDetailSource,
    /!galleryLoops && imageIndex === gallery\.length - 1/u,
  );
  assert.match(productDetailSource, /recentPointerMotion/u);
  assert.match(productDetailSource, /window\.confirm\("회원만 추천하실 수 있습니다\."\)/u);
  assert.match(productDetailSource, /CUSTOMER_SESSION_EVENT/u);
  assert.match(productDetailSource, /document\.addEventListener\("pointerdown", closeOutside\)/u);
  assert.match(productDetailSource, /event\.key === "Escape"/u);
  assert.match(productDetailSource, /selectProductOption\(option\.id, event\.target\.value\)/u);
  assert.doesNotMatch(productDetailSource, /onWheel=\{wheelGallery\}/u);
});

test("review and question dialogs retain the legacy modal geometry and controls", () => {
  for (const marker of [
    "interactionModalRef",
    "interactionOpenerRef",
    "postingInteractionRef",
    'document.addEventListener("keydown", handleModalKeyDown)',
    'document.body.style.overflow = "hidden"',
    "사용후기 작성하기",
    "상품문의 작성하기",
    'name="secret"',
    'name="email"',
    'name="phone"',
    'name="rating"',
    "interactionEditorToolbar",
    "interactionModalFrame",
  ]) {
    assert.ok(
      productDetailSource.includes(marker),
      `detail modal is missing ${marker}`,
    );
  }
  for (const declaration of [
    "max-width: 800px;",
    "height: 50px;",
    "min-height: 612.5px;",
    "height: 576px;",
    "margin: 28px auto;",
  ]) {
    assert.ok(
      productDetailStyles.includes(declaration),
      `detail modal geometry is missing ${declaration}`,
    );
  }
});

test("reference product gallery and long description are bundled locally", async () => {
  const product = catalog.products.find(
    (entry) => entry.id === "1762002856",
  );
  assert.ok(product, "reference product is missing");
  assert.equal(product.categoryId, "7010");
  assert.equal(product.images.length, 4);
  assert.doesNotMatch(
    JSON.stringify(product),
    /https?:\/\/(?:www\.)?kiel-gold\.com/iu,
  );

  for (const assetPath of product.images) {
    assert.match(assetPath, /^\/legacy\//u);
    const info = await stat(join(workspaceRoot, "public", assetPath.slice(1)));
    assert.ok(info.isFile() && info.size > 0, `${assetPath} is unavailable`);
  }

  const detailImage = product.detailHtml.match(/\bsrc="([^"]+)"/u)?.[1];
  assert.ok(detailImage?.startsWith("/legacy/"));
  const detailInfo = await stat(
    join(workspaceRoot, "public", detailImage.slice(1)),
  );
  assert.ok(detailInfo.isFile() && detailInfo.size > 0);
});

test("every imported product has local-only previous and next navigation", () => {
  const productIds = new Set(catalog.products.map((product) => product.id));
  assert.equal(Object.keys(productNavigation).length, catalog.products.length);
  for (const product of catalog.products) {
    assert.ok(productNavigation[product.id], `${product.id} navigation missing`);
    for (const linkedId of [
      productNavigation[product.id].previousId,
      productNavigation[product.id].nextId,
    ]) {
      if (linkedId) {
        assert.ok(productIds.has(linkedId), `${product.id} links ${linkedId}`);
      }
    }
  }
  assert.deepEqual(productNavigation["1762002856"], {
    previousId: "1762002871",
    nextId: "1762002842",
  });
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
