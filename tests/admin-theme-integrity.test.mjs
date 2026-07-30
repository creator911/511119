import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("administrator shell uses the original fixed light interface", async () => {
  const [frame, shell, legacyCss] = await Promise.all([
    source("app/adm/(protected)/AdminFrame.tsx"),
    source("app/components/admin/AdminShell.tsx"),
    source("app/adm/legacy-admin.css"),
  ]);

  assert.doesNotMatch(frame, /data-admin-dark|ADMIN_THEME_STORAGE_KEY|darkMode/);
  assert.doesNotMatch(shell, /data-admin-dark|themeToggle/);
  assert.match(shell, /id="hd_top"/);
  assert.match(shell, /id="gnb"/);
  assert.match(shell, /id="container_title"/);
  assert.match(shell, /id="container_wr"/);
  assert.match(shell, /id="ft"/);
  assert.match(shell, /KIEL_ADMIN_NAVIGATION/);
  assert.match(shell, /group-100/);
  assert.match(shell, /group-999/);

  assert.match(legacyCss, /#3f51b5/);
  assert.match(legacyCss, /#6f809a/);
  assert.match(legacyCss, /padding:\s*0 0 0 220px/);
  assert.match(legacyCss, /padding:\s*0 20px 0 240px/);
  assert.match(legacyCss, /height:\s*51px/);
  assert.match(legacyCss, /min-width:\s*1200px/);
  assert.match(legacyCss, /animation-duration:\s*0s !important/);
  assert.match(legacyCss, /transition-duration:\s*0s !important/);
});

test("legacy skin covers tables, forms, filters, dialogs, and paging", async () => {
  const css = await source("app/adm/legacy-admin.css");
  const requiredPatterns = [
    /table thead th/,
    /table tbody td/,
    /\[class\*="formRow"\]/,
    /\[class\*="filterPanel"\]/,
    /\[role="dialog"\]/,
    /\[class\*="pagination"\]/,
    /\.btn_list03 a/,
    /\.local_desc/,
    /\.gnb_oparea/,
    /\.tnb_mb_area\.open/,
  ];

  for (const pattern of requiredPatterns) {
    assert.match(css, pattern);
  }
});

test("protected admin layout loads the legacy skin and keeps mobile fixed-width", async () => {
  const [layout, legacyCss] = await Promise.all([
    source("app/adm/(protected)/layout.tsx"),
    source("app/adm/legacy-admin.css"),
  ]);

  assert.match(layout, /import "\.\.\/legacy-admin\.css"/);
  assert.match(legacyCss, /@media \(max-width: 1200px\)/);
  assert.match(legacyCss, /body:has\(\.kiel-legacy-admin\)/);
  assert.match(legacyCss, /min-width:\s*1200px !important/);
});
