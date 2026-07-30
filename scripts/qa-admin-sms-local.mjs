import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const workspace = process.cwd();
const databaseDirectory = resolve(
  workspace,
  ".wrangler/state/v3/d1/miniflare-D1DatabaseObject",
);
const databaseFile = readdirSync(databaseDirectory)
  .filter((name) => name.endsWith(".sqlite") && name !== "metadata.sqlite")
  .map((name) => join(databaseDirectory, name))
  .find(Boolean);
assert.ok(databaseFile, "로컬 D1 파일을 찾을 수 없습니다.");
assert.ok(
  resolve(databaseFile).startsWith(databaseDirectory),
  "로컬 D1 경로가 작업공간을 벗어났습니다.",
);

const baseUrl = (
  process.env.QA_BASE_URL || "http://localhost:4173"
).replace(/\/+$/u, "");
const adminCookie = await createLocalAdminCookie();
const runId = `QASMS-${Date.now().toString(36).toUpperCase()}`;
const database = new DatabaseSync(databaseFile);
const created = {
  phoneGroupId: "",
  phoneId: "",
  templateGroupId: "",
  templateId: "",
  messageId: "",
};
let configSnapshot;

try {
  const unauthorized = await fetch(
    `${baseUrl}/api/admin/sms/sms-phone-groups`,
  );
  assert.equal(unauthorized.status, 401);

  await getState("sms-settings");
  configSnapshot = database
    .prepare(
      `SELECT enabled, sender, provider_name, memo, revision, updated_at
       FROM sms_config WHERE id = 1`,
    )
    .get();
  assert.ok(configSnapshot, "SMS 설정 행이 없습니다.");
  database
    .prepare(
      `UPDATE sms_config
       SET enabled = 0, sender = '', updated_at = CURRENT_TIMESTAMP
       WHERE id = 1`,
    )
    .run();

  const phoneGroupCreated = await mutate(
    "POST",
    "sms-phone-groups",
    { name: `${runId} 번호그룹` },
    201,
  );
  created.phoneGroupId = requiredId(phoneGroupCreated.entity, "번호그룹");
  const phoneGroupUpdated = await mutate("PATCH", "sms-phone-groups", {
    id: created.phoneGroupId,
    name: `${runId} 번호그룹 수정`,
  });
  assert.equal(phoneGroupUpdated.entity.name, `${runId} 번호그룹 수정`);

  const phoneCreated = await mutate(
    "POST",
    "sms-phones",
    {
      name: `${runId} 수신자`,
      phone: "01012345678",
      groupId: created.phoneGroupId,
      receipt: true,
      memo: `${runId} 생성`,
    },
    201,
  );
  created.phoneId = requiredId(phoneCreated.entity, "휴대폰번호");
  const phoneUpdated = await mutate("PATCH", "sms-phones", {
    id: created.phoneId,
    name: `${runId} 수신자 수정`,
    phone: "01087654321",
    groupId: created.phoneGroupId,
    receipt: true,
    memo: `${runId} 수정`,
  });
  assert.equal(phoneUpdated.entity.phone, "01087654321");
  assert.equal(phoneUpdated.entity.memo, `${runId} 수정`);

  const templateGroupCreated = await mutate(
    "POST",
    "sms-emoticon-groups",
    { name: `${runId} 이모티콘그룹` },
    201,
  );
  created.templateGroupId = requiredId(
    templateGroupCreated.entity,
    "이모티콘그룹",
  );
  const templateGroupUpdated = await mutate(
    "PATCH",
    "sms-emoticon-groups",
    {
      id: created.templateGroupId,
      name: `${runId} 이모티콘그룹 수정`,
    },
  );
  assert.equal(
    templateGroupUpdated.entity.name,
    `${runId} 이모티콘그룹 수정`,
  );

  const templateCreated = await mutate(
    "POST",
    "sms-emoticons",
    {
      name: `${runId} 이모티콘`,
      content: `${runId} 생성 메시지`,
      groupId: created.templateGroupId,
    },
    201,
  );
  created.templateId = requiredId(templateCreated.entity, "이모티콘");
  const templateUpdated = await mutate("PATCH", "sms-emoticons", {
    id: created.templateId,
    name: `${runId} 이모티콘 수정`,
    content: `${runId} 수정 메시지`,
    groupId: created.templateGroupId,
  });
  assert.equal(templateUpdated.entity.content, `${runId} 수정 메시지`);

  const sent = await mutate(
    "POST",
    "sms-send",
    {
      content: `${runId} 외부 전송 금지 QA`,
      phoneIds: [created.phoneId],
      recipients: [],
      scheduledAt: null,
    },
    201,
  );
  created.messageId = requiredId(sent.entity, "문자 대기열");
  assert.equal(sent.entity.status, "waiting_provider");
  assert.match(sent.message, /실제 전송은 처리되지 않았습니다/u);

  const messageHistory = await getState("sms-history-message");
  const historyMessage = messageHistory.messages.find(
    (message) => message.id === created.messageId,
  );
  assert.ok(historyMessage, "건별 문자 이력에 QA 메시지가 없습니다.");
  assert.equal(historyMessage.status, "waiting_provider");

  const numberHistory = await getState("sms-history-number");
  const historyRecipient = numberHistory.recipients.find(
    (recipient) => recipient.messageId === created.messageId,
  );
  assert.ok(historyRecipient, "번호별 문자 이력에 QA 수신자가 없습니다.");
  assert.equal(historyRecipient.status, "waiting_provider");
  assert.equal(historyRecipient.phone, "01087654321");

  console.log(
    JSON.stringify({
      ok: true,
      runId,
      checks: {
        unauthorizedRejected: true,
        phoneGroupCreateUpdate: true,
        phoneCreateUpdate: true,
        templateGroupCreateUpdate: true,
        templateCreateUpdate: true,
        providerDisabledWaitingOnly: true,
        messageHistoryReflected: true,
        numberHistoryReflected: true,
        externalSendAttempted: false,
      },
    }),
  );
} finally {
  cleanup();
  database.close();
}

async function getState(section) {
  const response = await authFetch(
    `${baseUrl}/api/admin/sms/${encodeURIComponent(section)}`,
    { headers: { Accept: "application/json" } },
  );
  const payload = await readJson(response);
  assert.equal(response.status, 200, JSON.stringify(payload));
  assert.ok(payload.state, `${section} 상태가 없습니다.`);
  return payload.state;
}

async function mutate(method, section, body, expectedStatus = 200) {
  const response = await authFetch(
    `${baseUrl}/api/admin/sms/${encodeURIComponent(section)}`,
    {
      method,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Origin: baseUrl,
      },
      body: JSON.stringify(body),
    },
  );
  const payload = await readJson(response);
  assert.equal(response.status, expectedStatus, JSON.stringify(payload));
  assert.equal(payload.ok, true, JSON.stringify(payload));
  return payload;
}

async function readJson(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { responseText: text };
  }
}

function requiredId(entity, label) {
  assert.equal(typeof entity?.id, "string", `${label} ID가 없습니다.`);
  assert.ok(entity.id, `${label} ID가 비어 있습니다.`);
  return entity.id;
}

function cleanup() {
  database.exec("BEGIN IMMEDIATE");
  try {
    if (tableExists("sms_message_recipients")) {
      if (created.messageId) {
        database
          .prepare(
            "DELETE FROM sms_message_recipients WHERE message_id = ?",
          )
          .run(created.messageId);
      }
      database
        .prepare(
          `DELETE FROM sms_message_recipients
           WHERE message_id IN (
             SELECT id FROM sms_messages WHERE content LIKE ?
           )`,
        )
        .run(`${runId}%`);
    }
    if (tableExists("sms_messages")) {
      database
        .prepare("DELETE FROM sms_messages WHERE id = ? OR content LIKE ?")
        .run(created.messageId || "__none__", `${runId}%`);
    }
    if (tableExists("sms_templates")) {
      database
        .prepare("DELETE FROM sms_templates WHERE id = ? OR name LIKE ?")
        .run(created.templateId || "__none__", `${runId}%`);
    }
    if (tableExists("sms_template_groups")) {
      database
        .prepare(
          "DELETE FROM sms_template_groups WHERE id = ? OR name LIKE ?",
        )
        .run(created.templateGroupId || "__none__", `${runId}%`);
    }
    if (tableExists("sms_phones")) {
      database
        .prepare(
          `DELETE FROM sms_phones
           WHERE id = ? OR name LIKE ? OR memo LIKE ?`,
        )
        .run(
          created.phoneId || "__none__",
          `${runId}%`,
          `${runId}%`,
        );
    }
    if (tableExists("sms_phone_groups")) {
      database
        .prepare(
          "DELETE FROM sms_phone_groups WHERE id = ? OR name LIKE ?",
        )
        .run(created.phoneGroupId || "__none__", `${runId}%`);
    }
    if (configSnapshot && tableExists("sms_config")) {
      database
        .prepare(
          `UPDATE sms_config
           SET enabled = ?, sender = ?, provider_name = ?, memo = ?,
               revision = ?, updated_at = ?
           WHERE id = 1`,
        )
        .run(
          configSnapshot.enabled,
          configSnapshot.sender,
          configSnapshot.provider_name,
          configSnapshot.memo,
          configSnapshot.revision,
          configSnapshot.updated_at,
        );
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function tableExists(table) {
  return Boolean(
    database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
      )
      .get(table),
  );
}

function authFetch(url, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cookie", adminCookie);
  return fetch(url, { ...init, headers });
}

async function createLocalAdminCookie() {
  const values = Object.fromEntries(
    readFileSync(resolve(workspace, ".env.local"), "utf8")
      .split(/\r?\n/u)
      .filter((line) => line && !line.trimStart().startsWith("#"))
      .map((line) => {
        const separator = line.indexOf("=");
        return separator < 0
          ? ["", ""]
          : [
              line.slice(0, separator).trim(),
              line.slice(separator + 1).trim(),
            ];
      })
      .filter(([key]) => key),
  );
  assert.ok(values.ADMIN_USERNAME);
  assert.ok(values.SESSION_SECRET?.length >= 32);
  const now = Math.floor(Date.now() / 1_000);
  const payload = {
    version: 1,
    subject: values.ADMIN_USERNAME,
    role: "admin",
    issuedAt: now,
    expiresAt: now + 60 * 60,
    nonce: crypto.randomUUID().replace(/-/gu, ""),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(values.SESSION_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(encoded),
  );
  return `admin_session=${encoded}.${Buffer.from(signature).toString("base64url")}`;
}
