import { env as cloudflareEnv } from "cloudflare:workers";
import { AdminApiError } from "@/lib/admin-api";
import { commerceDb, ensureCommerceSchema } from "@/lib/commerce-db";
import { isJsonObject } from "@/lib/http-boundary";

export interface AdminMailTestRun {
  id: string;
  recipient: string;
  subject: string;
  provider: string;
  status: "sent" | "failed";
  providerMessageId: string;
  errorMessage: string;
  createdAt: string;
}

export interface AdminMailTestState {
  providerConfigured: boolean;
  providerName: string;
  fromAddress: string;
  configurationMessage: string;
  runs: AdminMailTestRun[];
}

interface MailEnvironment {
  MAIL_PROVIDER_URL?: string;
  MAIL_PROVIDER_TOKEN?: string;
  MAIL_FROM?: string;
  RESEND_API_KEY?: string;
}

interface MailProviderConfiguration {
  configured: boolean;
  providerName: string;
  endpoint: string;
  token: string;
  fromAddress: string;
  message: string;
}

interface MailRunRow {
  id: string;
  recipient: string;
  subject: string;
  provider: string;
  status: "sent" | "failed";
  provider_message_id: string;
  error_message: string;
  created_at: string;
}

let mailSchemaInitialization: Promise<void> | null = null;

async function ensureAdminMailSchema(): Promise<void> {
  if (!mailSchemaInitialization) {
    mailSchemaInitialization = ensureCommerceSchema()
      .then(async () => {
        const database = commerceDb();
        await database.batch([
          database.prepare(`CREATE TABLE IF NOT EXISTS admin_mail_test_runs (
            id TEXT PRIMARY KEY,
            recipient TEXT NOT NULL,
            subject TEXT NOT NULL,
            provider TEXT NOT NULL,
            status TEXT NOT NULL CHECK(status IN ('sent', 'failed')),
            provider_message_id TEXT NOT NULL DEFAULT '',
            error_message TEXT NOT NULL DEFAULT '',
            created_by TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
          )`),
          database.prepare(
            "CREATE INDEX IF NOT EXISTS admin_mail_test_runs_created_idx ON admin_mail_test_runs(created_at)",
          ),
        ]);
      })
      .catch((error) => {
        mailSchemaInitialization = null;
        throw error;
      });
  }
  await mailSchemaInitialization;
}

export async function getAdminMailTestState(): Promise<AdminMailTestState> {
  const configuration = mailProviderConfiguration();
  await ensureAdminMailSchema();
  const result = await commerceDb()
    .prepare(
      `SELECT id, recipient, subject, provider, status, provider_message_id,
              error_message, created_at
       FROM admin_mail_test_runs
       ORDER BY created_at DESC
       LIMIT 50`,
    )
    .all<MailRunRow>();
  return {
    providerConfigured: configuration.configured,
    providerName: configuration.providerName,
    fromAddress: configuration.fromAddress,
    configurationMessage: configuration.message,
    runs: (result.results ?? []).map(mapMailRun),
  };
}

export async function sendAdminTestMail(
  input: unknown,
  adminUsername: string,
): Promise<AdminMailTestRun> {
  const payload = parseMailTestInput(input);
  const configuration = mailProviderConfiguration();
  if (!configuration.configured) {
    // Fail before a run is created. A missing provider is configuration state,
    // not a successful or queued delivery attempt.
    throw new AdminApiError(503, configuration.message);
  }

  await ensureAdminMailSchema();
  const database = commerceDb();
  const id = crypto.randomUUID();
  let response: Response;
  try {
    response = await fetch(configuration.endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${configuration.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: configuration.fromAddress,
        to: [payload.recipient],
        subject: payload.subject,
        text: payload.message,
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    const errorMessage = "메일 공급자에 연결하지 못했습니다.";
    await insertMailRun(database, {
      id,
      recipient: payload.recipient,
      subject: payload.subject,
      provider: configuration.providerName,
      status: "failed",
      providerMessageId: "",
      errorMessage,
      adminUsername,
    });
    throw new AdminApiError(502, errorMessage);
  }

  if (!response.ok) {
    const errorMessage = `메일 공급자가 전송을 거부했습니다. (HTTP ${response.status})`;
    await insertMailRun(database, {
      id,
      recipient: payload.recipient,
      subject: payload.subject,
      provider: configuration.providerName,
      status: "failed",
      providerMessageId: "",
      errorMessage,
      adminUsername,
    });
    throw new AdminApiError(502, errorMessage);
  }

  const providerMessageId = (
    response.headers.get("x-message-id") ??
    response.headers.get("x-request-id") ??
    ""
  ).slice(0, 300);
  await insertMailRun(database, {
    id,
    recipient: payload.recipient,
    subject: payload.subject,
    provider: configuration.providerName,
    status: "sent",
    providerMessageId,
    errorMessage: "",
    adminUsername,
  });
  const run = await findMailRun(database, id);
  if (!run) throw new Error("메일 전송 기록을 찾을 수 없습니다.");
  return run;
}

function mailProviderConfiguration(): MailProviderConfiguration {
  const worker = cloudflareEnv as unknown as MailEnvironment;
  const runtime = typeof process === "undefined" ? undefined : process.env;
  const value = (key: keyof MailEnvironment): string =>
    (worker[key] ?? runtime?.[key] ?? "").trim();
  const fromAddress = value("MAIL_FROM");
  const resendToken = value("RESEND_API_KEY");
  const customEndpoint = value("MAIL_PROVIDER_URL");
  const customToken = value("MAIL_PROVIDER_TOKEN");
  const endpoint = resendToken
    ? "https://api.resend.com/emails"
    : customEndpoint;
  const token = resendToken || customToken;
  const providerName = resendToken ? "Resend" : customEndpoint ? "HTTP" : "";
  const endpointValid = isSafeProviderUrl(endpoint);
  const configured =
    endpointValid &&
    token.length >= 8 &&
    token.length <= 8_192 &&
    isEmail(fromAddress);
  return {
    configured,
    providerName: providerName || "미구성",
    endpoint: configured ? endpoint : "",
    token: configured ? token : "",
    fromAddress: isEmail(fromAddress) ? fromAddress : "",
    message: configured
      ? `${providerName} 메일 공급자가 연결되어 있습니다.`
      : "메일 공급자가 구성되지 않았습니다. RESEND_API_KEY 또는 MAIL_PROVIDER_URL/MAIL_PROVIDER_TOKEN과 MAIL_FROM을 설정해 주세요.",
  };
}

function parseMailTestInput(input: unknown): {
  recipient: string;
  subject: string;
  message: string;
} {
  if (!isJsonObject(input)) {
    throw new AdminApiError(400, "테스트 메일 내용을 확인해 주세요.");
  }
  const recipient =
    typeof input.recipient === "string"
      ? input.recipient.trim().toLowerCase()
      : "";
  const subject =
    typeof input.subject === "string" ? input.subject.trim() : "";
  const message =
    typeof input.message === "string" ? input.message.trim() : "";
  const errors: Record<string, string> = {};
  if (!isEmail(recipient)) {
    errors.recipient = "올바른 수신 이메일 주소를 입력해 주세요.";
  }
  if (!subject || subject.length > 200) {
    errors.subject = "제목을 1~200자로 입력해 주세요.";
  }
  if (!message || message.length > 5_000) {
    errors.message = "본문을 1~5,000자로 입력해 주세요.";
  }
  if (Object.keys(errors).length > 0) {
    throw new AdminApiError(400, "입력 내용을 확인해 주세요.", errors);
  }
  return { recipient, subject, message };
}

async function insertMailRun(
  database: D1Database,
  input: {
    id: string;
    recipient: string;
    subject: string;
    provider: string;
    status: "sent" | "failed";
    providerMessageId: string;
    errorMessage: string;
    adminUsername: string;
  },
): Promise<void> {
  await database.batch([
    database
      .prepare(
        `INSERT INTO admin_mail_test_runs (
           id, recipient, subject, provider, status, provider_message_id,
           error_message, created_by
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        input.id,
        input.recipient,
        input.subject,
        input.provider,
        input.status,
        input.providerMessageId,
        input.errorMessage,
        input.adminUsername.trim().slice(0, 128) || "admin",
      ),
    database
      .prepare(
        `INSERT INTO admin_audit_logs (
           action, entity_type, entity_id, details
         ) VALUES (?, 'mail_test', ?, ?)`,
      )
      .bind(
        `mail_test.${input.status}`,
        input.id,
        `${input.provider}: ${input.recipient}`,
      ),
  ]);
}

async function findMailRun(
  database: D1Database,
  id: string,
): Promise<AdminMailTestRun | null> {
  const row = await database
    .prepare(
      `SELECT id, recipient, subject, provider, status, provider_message_id,
              error_message, created_at
       FROM admin_mail_test_runs
       WHERE id = ?
       LIMIT 1`,
    )
    .bind(id)
    .first<MailRunRow>();
  return row ? mapMailRun(row) : null;
}

function mapMailRun(row: MailRunRow): AdminMailTestRun {
  return {
    id: row.id,
    recipient: row.recipient,
    subject: row.subject,
    provider: row.provider,
    status: row.status,
    providerMessageId: row.provider_message_id,
    errorMessage: row.error_message,
    createdAt: row.created_at,
  };
}

function isEmail(value: string): boolean {
  return (
    value.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value)
  );
}

function isSafeProviderUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" ||
      (url.protocol === "http:" &&
        (url.hostname === "localhost" || url.hostname === "127.0.0.1"))
    );
  } catch {
    return false;
  }
}
