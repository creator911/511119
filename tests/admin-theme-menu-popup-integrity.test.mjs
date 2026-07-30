import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("theme cards preserve the original geometry and use local screenshots", async () => {
  const [manager, component, css, basicPng, responsivePng] = await Promise.all([
    source("app/adm/(protected)/tools/[tool]/LegacyAdminToolManager.tsx"),
    source("app/adm/(protected)/tools/[tool]/ThemeSettingsTool.tsx"),
    source("app/adm/(protected)/tools/[tool]/theme-settings.module.css"),
    readFile(
      new URL("../public/adm-assets/themes/basic.png", import.meta.url),
    ),
    readFile(
      new URL("../public/adm-assets/themes/eb4_basic.png", import.meta.url),
    ),
  ]);

  assert.match(manager, /definition\.slug === "theme-settings"/u);
  assert.match(manager, /<ThemeSettingsTool/u);
  assert.match(component, /\/adm-assets\/themes\/basic\.png/u);
  assert.match(component, /\/adm-assets\/themes\/eb4_basic\.png/u);
  assert.doesNotMatch(component, /kiel-gold\.com/iu);
  assert.equal(readPngSize(basicPng).width, 600);
  assert.equal(readPngSize(basicPng).height, 460);
  assert.equal(readPngSize(responsivePng).width, 600);
  assert.equal(readPngSize(responsivePng).height, 435);
  assert.match(css, /width:\s*1000px;[\s\S]*?height:\s*319px;/u);
  assert.match(css, /width:\s*302px;[\s\S]*?height:\s*299px;/u);
  assert.match(css, /width:\s*300px;[\s\S]*?height:\s*225px;/u);
  assert.match(css, /grid-template-columns:\s*58px 121px 60px 3px 60px/u);
});

test("menu settings use a durable structured model and 550 by 650 editor", async () => {
  const [manager, component, css, editor, parser, header] =
    await Promise.all([
      source("app/adm/(protected)/tools/[tool]/LegacyAdminToolManager.tsx"),
      source("app/adm/(protected)/tools/[tool]/MenuSettingsTool.tsx"),
      source("app/adm/(protected)/tools/[tool]/menu-settings.module.css"),
      source("app/adm/menu-editor/MenuEditorWindow.tsx"),
      source("lib/admin-menu-settings.ts"),
      source("app/components/storefront/Header.tsx"),
    ]);

  assert.match(manager, /definition\.slug === "menu-settings"/u);
  assert.match(component, /width=550,height=650/u);
  assert.match(component, /serializeManagedMenuEntries/u);
  assert.match(component, /상단 확인을 눌러 저장/u);
  for (const field of ["newWindow", "order", "usePc", "useMobile"]) {
    assert.match(editor, new RegExp(field, "u"));
    assert.match(parser, new RegExp(field, "u"));
  }
  assert.match(parser, /isSafeManagedMenuHref/u);
  assert.match(header, /item\.usePc !== false/u);
  assert.match(header, /item\.useMobile !== false/u);
  for (const width of [
    "119.484375px",
    "167.5px",
    "239.03125px",
    "119.53125px",
  ]) {
    assert.match(css, new RegExp(width.replace(".", "\\."), "u"));
  }
});

test("popup list and storefront consume device, geometry, and dismissal hours", async () => {
  const [component, css, library, storefront, popup] = await Promise.all([
    source("app/adm/(protected)/tools/[tool]/PopupLayersTool.tsx"),
    source("app/adm/(protected)/tools/[tool]/popup-layers.module.css"),
    source("lib/admin-tools.ts"),
    source("lib/storefront-admin-tools.ts"),
    source("app/components/storefront/StorefrontPopups.tsx"),
  ]);

  for (const header of [
    "접속기기",
    "시작일시",
    "종료일시",
    "Left",
    "Top",
    "Width",
    "Height",
  ]) {
    assert.match(component, new RegExp(header, "u"));
  }
  for (const field of [
    "device",
    "disableHours",
    "left",
    "top",
    "width",
    "height",
  ]) {
    assert.match(library, new RegExp(field, "u"));
    assert.match(storefront, new RegExp(field, "u"));
  }
  assert.match(component, /자료가 한건도 없습니다\./u);
  assert.match(popup, /deviceMatches/u);
  assert.match(popup, /popup\.disableHours \* 60 \* 60 \* 1_000/u);
  assert.match(popup, /"--popup-left"/u);
  assert.match(css, /height:\s*256px/u);
  assert.match(css, /width:\s*75\.140625px/u);
  assert.match(css, /width:\s*125\.28125px/u);
  assert.match(css, /width:\s*100\.984375px/u);
});

function readPngSize(buffer) {
  assert.equal(buffer.toString("ascii", 1, 4), "PNG");
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}
