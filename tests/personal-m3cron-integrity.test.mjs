import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("personal payments use dedicated durable CRUD and a non-PG public review flow", async () => {
  const [
    library,
    adminRoute,
    itemRoute,
    publicRoute,
    manager,
    publicPage,
    genericRoute,
  ] =
    await Promise.all([
      source("lib/personal-payments.ts"),
      source("app/api/admin/personal-payments/route.ts"),
      source("app/api/admin/personal-payments/[id]/route.ts"),
      source("app/api/personal-payments/[token]/notice/route.ts"),
      source(
        "app/adm/(protected)/tools/[tool]/PersonalPaymentsManager.tsx",
      ),
      source("app/shop/personalpay.php/page.tsx"),
      source("app/api/admin/tools/[tool]/route.ts"),
    ]);

  assert.match(library, /CREATE TABLE IF NOT EXISTS personal_payments/);
  assert.match(library, /public_token TEXT NOT NULL UNIQUE/);
  assert.match(library, /receipt_amount <= order_amount/);
  assert.match(library, /CREATE TABLE IF NOT EXISTS personal_payment_notices/);
  assert.match(library, /CREATE TABLE IF NOT EXISTS personal_payment_rate_limits/);
  assert.match(library, /status = 'pending_review'/);
  assert.doesNotMatch(library, /payment_status\s*=\s*'paid'/);

  for (const route of [adminRoute, itemRoute]) {
    assert.match(route, /requireAdminApiSession\(request\)/);
    assert.match(route, /assertSameOrigin\(request\)/);
    assert.match(route, /adminApiErrorResponse/);
  }
  assert.match(publicRoute, /assertSameOrigin\(request\)/);
  assert.match(publicRoute, /readAdminJson\(request, 10_000\)/);
  assert.match(manager, /선택삭제/);
  assert.match(manager, /개인결제 추가/);
  assert.match(manager, /입금확인 요청/);
  assert.match(manager, /공개 개인결제 링크/);
  assert.match(publicPage, /getPublicPersonalPayment/);
  assert.match(publicPage, /listPublicPersonalPayments/);
  assert.match(genericRoute, /tool === "personal-payments"/);
});

test("m3cron exposes only known internal jobs and records actual outcomes", async () => {
  const [
    library,
    jobsRoute,
    runRoute,
    logsRoute,
    manager,
    page,
    permissions,
    genericRoute,
  ] =
    await Promise.all([
      source("lib/admin-m3cron.ts"),
      source("app/api/admin/m3cron/jobs/route.ts"),
      source("app/api/admin/m3cron/jobs/[jobId]/run/route.ts"),
      source("app/api/admin/m3cron/logs/route.ts"),
      source("app/adm/(protected)/tools/[tool]/M3CronManagers.tsx"),
      source("app/adm/(protected)/tools/[tool]/page.tsx"),
      source("lib/admin-permissions.ts"),
      source("app/api/admin/tools/[tool]/route.ts"),
    ]);

  assert.match(library, /CREATE TABLE IF NOT EXISTS m3cron_jobs/);
  assert.match(library, /CREATE TABLE IF NOT EXISTS m3cron_runs/);
  assert.match(library, /CREATE TABLE IF NOT EXISTS m3cron_run_guards/);
  assert.match(library, /m3cron\.job\.update/);
  assert.match(library, /m3cron\.job\.reorder/);
  assert.match(
    library,
    /sort_order = CASE WHEN revision = \? THEN \? ELSE NULL END/,
  );
  assert.match(library, /const results = await database\.batch\(statements\)/);
  assert.match(library, /visitor-retention/);
  assert.match(library, /request-rate-limit-cleanup/);
  assert.match(library, /fileName: "gr_sample\/sample"/);
  assert.match(library, /fileName: "sample"/);
  assert.doesNotMatch(library, /sample\.php/);
  assert.match(library, /DELETE FROM site_visit_uniques/);
  assert.match(library, /DELETE FROM restock_request_rate_limits/);
  assert.match(library, /status: M3CronRun\["status"\] = "completed"/);
  assert.match(library, /status = "failed"/);

  for (const route of [jobsRoute, runRoute, logsRoute]) {
    assert.match(route, /requireAdminApiSession\(request\)/);
    assert.match(route, /adminApiErrorResponse/);
  }
  assert.match(runRoute, /assertSameOrigin\(request\)/);
  assert.match(logsRoute, /verifyAdminCredentials/);
  assert.match(manager, /현재는 ‘지금 실행’ 버튼/);
  assert.match(manager, /순서변경/);
  assert.match(manager, /관리자 비밀번호/);
  assert.match(page, /tool === "m3cron-settings"/);
  assert.match(page, /tool === "m3cron-logs"/);
  assert.match(genericRoute, /tool === "m3cron-settings"/);
  assert.match(genericRoute, /tool === "m3cron-logs"/);
  assert.match(
    permissions,
    /case "m3cron":\s+return segments\[3\] === "logs" \? "reports\.view" : "settings\.manage"/,
  );
});
