import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as XLSX from "xlsx";

const files = {
  page: new URL(
    "../app/adm/(protected)/tools/[tool]/page.tsx",
    import.meta.url,
  ),
  manager: new URL(
    "../app/adm/(protected)/tools/[tool]/SmsAdminManager.tsx",
    import.meta.url,
  ),
  route: new URL(
    "../app/api/admin/sms/[section]/route.ts",
    import.meta.url,
  ),
  service: new URL("../lib/admin-sms.ts", import.meta.url),
  permissions: new URL("../lib/admin-permissions.ts", import.meta.url),
  genericRoute: new URL(
    "../app/api/admin/tools/[tool]/route.ts",
    import.meta.url,
  ),
  qa: new URL("../scripts/qa-admin-sms-local.mjs", import.meta.url),
};

test("all legacy SMS routes use the dedicated typed manager", async () => {
  const [page, manager, service, genericRoute] = await Promise.all([
    readFile(files.page, "utf8"),
    readFile(files.manager, "utf8"),
    readFile(files.service, "utf8"),
    readFile(files.genericRoute, "utf8"),
  ]);

  assert.match(page, /isSmsAdminTool\(tool\)/);
  assert.match(page, /<SmsAdminManager initialState=/);
  assert.doesNotMatch(manager, /LegacyAdminToolManager/);
  assert.doesNotMatch(service, /admin_tool_records/);
  assert.match(genericRoute, /isSmsAdminTool\(tool\)/);

  for (const tool of [
    "sms-settings",
    "sms-member-sync",
    "sms-send",
    "sms-history-message",
    "sms-history-number",
    "sms-emoticon-groups",
    "sms-emoticons",
    "sms-phone-groups",
    "sms-phones",
    "sms-phone-file",
  ]) {
    assert.match(service, new RegExp(`"${tool}"`));
  }
});

test("provider absence can never be represented as a successful send", async () => {
  const [service, route, manager] = await Promise.all([
    readFile(files.service, "utf8"),
    readFile(files.route, "utf8"),
    readFile(files.manager, "utf8"),
  ]);

  assert.match(service, /SMS_PROVIDER_URL/);
  assert.match(
    service,
    /status:\s*SmsQueueStatus\s*=\s*settings\.available\s*\?\s*"queued"\s*:\s*"waiting_provider"/s,
  );
  assert.match(
    service,
    /status IN \(\s*'waiting_provider', 'queued', 'sent', 'failed', 'cancelled'/s,
  );
  assert.doesNotMatch(service, /\bfetch\s*\(/);
  assert.doesNotMatch(route, /\bfetch\s*\(/);
  assert.match(route, /실제 전송은 처리되지 않았습니다/);
  assert.match(route, /공급사 처리 결과 전에는 성공으로 표시되지 않습니다/);
});

test("SMS API is authenticated, same-origin protected and bounded", async () => {
  const [route, permissions, manager] = await Promise.all([
    readFile(files.route, "utf8"),
    readFile(files.permissions, "utf8"),
    readFile(files.manager, "utf8"),
  ]);

  assert.match(route, /requireAdminApiSession\(request\)/);
  assert.match(route, /assertSameOrigin\(request\)/);
  assert.match(route, /MAX_UPLOAD_BYTES = 2 \* 1024 \* 1024/);
  assert.match(route, /MAX_IMPORT_ROWS = 1_000/);
  assert.match(manager, /accept="\.xls,\.csv,\.tsv"/);
  assert.match(route, /neutralSpreadsheetCell/);
  assert.match(route, /X-Content-Type-Options/);
  assert.match(permissions, /case "sms":/);
  assert.match(permissions, /segments\[3\] === "sms-settings"/);
});

test("legacy SMS lists preserve their original column contracts", async () => {
  const manager = await readFile(files.manager, "utf8");
  for (const label of [
    "메세지",
    "회신번호",
    "전송일시",
    "예약",
    "총건수",
    "성공",
    "실패",
    "중복",
    "재전송",
    "그룹",
    "회원ID",
    "전화번호",
    "이모티콘수",
    "비회원",
    "수신",
    "거부",
    "휴대폰",
    "아이디",
    "업데이트",
  ]) {
    assert.match(manager, new RegExp(label));
  }
});

test("member sync and address books are backed by dedicated tables", async () => {
  const [service, manager, route] = await Promise.all([
    readFile(files.service, "utf8"),
    readFile(files.manager, "utf8"),
    readFile(files.route, "utf8"),
  ]);
  for (const table of [
    "sms_config",
    "sms_phone_groups",
    "sms_phones",
    "sms_template_groups",
    "sms_templates",
    "sms_messages",
    "sms_message_recipients",
    "sms_sync_state",
  ]) {
    assert.match(service, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
  assert.match(service, /FROM users ORDER BY created_at ASC LIMIT \?/);
  assert.match(service, /sms_opt_in/);
  assert.match(service, /receipt/);
  assert.match(service, /duplicateCount/);
  assert.match(service, /normalizePhoneOrNull\(user\.phone\) \?\? ""/);
  assert.match(manager, /checked=\{includeMissing\}/);
  assert.match(manager, /no_hp: includeMissing \? "1" : "0"/);
  assert.doesNotMatch(manager, /휴대폰 번호 없는 회원 포함[\s\S]{0,80}disabled/u);
  assert.match(route, /url\.searchParams\.get\("no_hp"\) === "1"/);
  assert.match(route, /\["이름", "전화번호"\]/);
});

test("local SMS CRUD QA is repeatable and always cleans up", async () => {
  const qa = await readFile(files.qa, "utf8");
  assert.match(qa, /providerDisabledWaitingOnly: true/);
  assert.match(qa, /externalSendAttempted: false/);
  assert.match(qa, /historyMessage\.status, "waiting_provider"/);
  assert.match(qa, /historyRecipient\.status, "waiting_provider"/);
  assert.match(qa, /finally \{\s*cleanup\(\);\s*database\.close\(\);/s);
  assert.match(qa, /DELETE FROM sms_message_recipients/);
  assert.match(qa, /DELETE FROM sms_messages/);
});

test("Excel 97-2003 binary phone books are parsed without evaluating formulas", () => {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet([
    ["홍길동", "010-1234-5678", { f: "1+1" }],
    ["김키엘", "01098765432", "<script>alert(1)</script>"],
  ]);
  XLSX.utils.book_append_sheet(workbook, worksheet, "주소록");
  const binary = XLSX.write(workbook, {
    type: "array",
    bookType: "xls",
  });
  const parsed = XLSX.read(binary, {
    type: "array",
    raw: true,
    cellFormula: false,
    cellHTML: false,
    bookVBA: false,
    sheetRows: 1_001,
  });
  const rows = XLSX.utils.sheet_to_json(
    parsed.Sheets[parsed.SheetNames[0]],
    {
      header: 1,
      raw: false,
      defval: "",
      blankrows: false,
    },
  );
  assert.deepEqual(rows.map((row) => row.slice(0, 2)), [
    ["홍길동", "010-1234-5678"],
    ["김키엘", "01098765432"],
  ]);
  assert.equal(rows[0][2], "");
});
