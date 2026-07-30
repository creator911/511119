import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("phpinfo renders a shell-free 95-table safe compatibility report", async () => {
  const [component, css, frame, page] = await Promise.all([
    source("app/adm/(protected)/tools/[tool]/SystemMaintenanceTool.tsx"),
    source("app/adm/(protected)/tools/[tool]/system-maintenance.module.css"),
    source("app/adm/(protected)/AdminFrame.tsx"),
    source("app/adm/(protected)/tools/[tool]/page.tsx"),
  ]);
  assert.match(component, /Array\.from\(\{ length: 91 \}/u);
  assert.match(component, /tables\.map\(\(table, index\) => \(\s*<table/su);
  assert.match(component, /비밀번호, 토큰, 세션/u);
  assert.match(component, /data-admin-marker="ADMINISTRATOR"/u);
  assert.match(
    component,
    /document\.body\.style\.setProperty\("margin", "8px", "important"\)/u,
  );
  assert.doesNotMatch(component, /process\.env|SESSION_SECRET|ADMIN_PASSWORD_HASH/u);
  assert.match(frame, /pathname === "\/adm\/tools\/phpinfo"/u);
  assert.match(page, /PHP 7\.3\.33 - phpinfo\(\)/u);
  assert.match(css, /height:\s*26316\.546875px/u);
  assert.match(css, /width:\s*934px/u);
  assert.match(css, /margin:\s*8px/u);
  assert.match(css, /padding-top:\s*8px/u);
  assert.match(css, /\.heroTable\s*\{\s*height:\s*74px/u);
  assert.match(css, /\.systemTable\s*\{\s*height:\s*745px/u);
});

test("additional services use local cards and persist without a table", async () => {
  const [manager, component] = await Promise.all([
    source("app/adm/(protected)/tools/[tool]/LegacyAdminToolManager.tsx"),
    source("app/adm/(protected)/tools/[tool]/AdditionalServicesTool.tsx"),
  ]);
  assert.match(manager, /definition\.slug === "additional-services"/u);
  assert.match(manager, /<AdditionalServicesTool/u);
  assert.doesNotMatch(component, /<table/u);
  assert.match(component, /method:\s*"PATCH"/u);
  assert.match(component, /\/adm\/tools\/sms-settings/u);
  assert.match(component, /\/adm\/settings\?view=shop/u);
  assert.match(component, /href:\s*"\/adm\/settings"/u);
  assert.doesNotMatch(component, /https?:\/\//u);
});

test("unconfigured mail test alerts and returns to the local admin menu", async () => {
  const component = await source(
    "app/adm/(protected)/tools/[tool]/MailTestManager.tsx",
  );
  assert.match(component, /window\.alert\(initialState\.configurationMessage\)/u);
  assert.match(component, /window\.location\.replace\("\/adm"\)/u);
  assert.match(component, /if \(!initialState\.providerConfigured\)/u);
  assert.match(component, /if \(sending \|\| !initialState\.providerConfigured\) return/u);
});
