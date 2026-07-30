import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("uses the Goldrian identity and exact business information", async () => {
  const [catalogSource, siteFrame, footer, layout, metaTools, siteContent] =
    await Promise.all([
      readSource("data/catalog.json"),
      readSource("app/components/SiteFrame.tsx"),
      readSource("app/components/storefront/Footer.tsx"),
      readSource("app/layout.tsx"),
      readSource("lib/storefront-admin-tools.ts"),
      readSource("lib/site-content.ts"),
    ]);
  const catalog = JSON.parse(catalogSource);

  assert.deepEqual(catalog.business, {
    companyName: "골드리안 마켓",
    representative: "전제민",
    businessNumber: "420-48-00768",
    mailOrderNumber: "2021-부산부산진-0536",
    address: "부산광역시 부산진구 백양산로 36",
    email: "goldrian@naver.com",
  });
  assert.match(siteFrame, /brandName="골드리안\(GOLDRIAN\)"/);
  assert.match(layout, /siteName: "GOLDRIAN"/);
  assert.match(metaTools, /DEFAULT_TITLE = "골드리안 \| GOLDRIAN"/);
  assert.match(siteContent, /__goldrian_business_migrated_v1/);

  const footerLabels = [
    "서비스이용약관",
    "개인정보처리방침",
    "이메일무단수집거부",
  ];
  for (const label of footerLabels) {
    assert.match(siteFrame, new RegExp(`label: "${label}"`));
  }
  assert.doesNotMatch(siteFrame, /label: "회사소개"/);
  assert.doesNotMatch(siteFrame, /label: "FAQ"/);
  assert.doesNotMatch(footer, />T\.\s*</);
  assert.doesNotMatch(footer, />F\.\s*/);
});

test("ships the supplied Goldrian logo at its original dimensions", async () => {
  const logo = await readFile(
    new URL("../public/legacy/logo.png", import.meta.url),
  );
  assert.equal(logo.readUInt32BE(16), 1983);
  assert.equal(logo.readUInt32BE(20), 793);

  const socialLogo = await readFile(
    new URL("../public/og.png", import.meta.url),
  );
  assert.equal(socialLogo.readUInt32BE(16), 1983);
  assert.equal(socialLogo.readUInt32BE(20), 793);
});

test("keeps all three footer policy pages available", async () => {
  const [siteContent, aliasPage] = await Promise.all([
    readSource("lib/site-content.ts"),
    readSource("app/bbs/content.php/page.tsx"),
  ]);
  for (const slug of ["provision", "privacy", "noemail"]) {
    assert.match(aliasPage, new RegExp(`"${slug}"`));
  }
  assert.match(siteContent, /id: "page-noemail"/);
  assert.match(siteContent, /body: legacyPoliciesSource\.noemail/);
  assert.match(siteContent, /INSERT OR IGNORE INTO content_entries/);
});

test("removes the retired visible brand from customer and admin chrome", async () => {
  const files = [
    "app/components/SiteFrame.tsx",
    "app/components/storefront/Header.tsx",
    "app/components/storefront/AuthPanels.tsx",
    "app/components/admin/AdminShell.tsx",
    "app/layout.tsx",
    "lib/storefront-admin-tools.ts",
  ];
  const sources = await Promise.all(files.map(readSource));
  for (const [index, source] of sources.entries()) {
    assert.doesNotMatch(
      source,
      /키엘\s*골드|KIEL[- ]?GOLD/iu,
      `${files[index]} still exposes the retired brand`,
    );
  }
});
