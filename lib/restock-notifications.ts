import { env } from "cloudflare:workers";
import { AdminApiError } from "@/lib/admin-api";
import {
  ensureAdminProductSchema,
  getEffectiveProduct,
  getAdminProductRecords,
  productDatabase,
} from "@/lib/admin-products";
import { commerceDb, ensureCommerceSchema } from "@/lib/commerce-db";
import {
  ensureProductOptionSchema,
  getProductOptionRows,
} from "@/lib/product-options";

export type RestockQueueStatus =
  | "waiting_provider"
  | "queued"
  | "sent"
  | "failed"
  | "cancelled";

export interface AdminRestockRequest {
  id: string;
  productId: string;
  productName: string;
  productImage: string;
  phone: string;
  maskedPhone: string;
  status: RestockQueueStatus;
  revision: number;
  queueRevision: number;
  attempts: number;
  lastError: string;
  adminMemo: string;
  createdAt: string;
  updatedAt: string;
  sentAt: string | null;
}

interface RestockReadOptions {
  database?: D1Database;
}

interface RestockEnvironment {
  SMS_PROVIDER_URL?: string;
}

interface RestockRequestRow {
  id: string;
  product_id: string;
  phone: string;
  status: RestockQueueStatus;
  revision: number;
  admin_memo: string;
  created_at: string;
  updated_at: string;
  queue_revision: number;
  attempts: number;
  last_error: string;
  sent_at: string | null;
}

const schemaInitializations = new WeakMap<object, Promise<void>>();
const productIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u;
const REQUEST_WINDOW_MS = 60 * 60 * 1_000;
const MAX_REQUESTS_PER_WINDOW = 5;

export async function ensureRestockNotificationSchema(
  database = commerceDb(),
): Promise<void> {
  const cacheKey = database as unknown as object;
  let initialization = schemaInitializations.get(cacheKey);
  if (!initialization) {
    initialization = database
      .batch([
        database.prepare(`CREATE TABLE IF NOT EXISTS restock_requests (
          id TEXT PRIMARY KEY,
          product_id TEXT NOT NULL,
          phone TEXT NOT NULL,
          phone_hash TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'waiting_provider'
            CHECK(status IN (
              'waiting_provider', 'queued', 'sent', 'failed', 'cancelled'
            )),
          revision INTEGER NOT NULL DEFAULT 1 CHECK(revision >= 1),
          admin_memo TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        database.prepare(
          "CREATE INDEX IF NOT EXISTS restock_requests_product_idx ON restock_requests(product_id, created_at)",
        ),
        database.prepare(
          "CREATE INDEX IF NOT EXISTS restock_requests_status_idx ON restock_requests(status, created_at)",
        ),
        database.prepare(
          `CREATE UNIQUE INDEX IF NOT EXISTS restock_requests_active_uq
           ON restock_requests(product_id, phone_hash)
           WHERE status IN ('waiting_provider', 'queued')`,
        ),
        database.prepare(`CREATE TABLE IF NOT EXISTS restock_sms_queue (
          id TEXT PRIMARY KEY,
          request_id TEXT NOT NULL UNIQUE,
          status TEXT NOT NULL DEFAULT 'waiting_provider'
            CHECK(status IN (
              'waiting_provider', 'queued', 'sent', 'failed', 'cancelled'
            )),
          attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts >= 0),
          last_error TEXT NOT NULL DEFAULT '',
          revision INTEGER NOT NULL DEFAULT 1 CHECK(revision >= 1),
          queued_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          sent_at TEXT,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        database.prepare(
          "CREATE INDEX IF NOT EXISTS restock_sms_queue_status_idx ON restock_sms_queue(status, queued_at)",
        ),
        database.prepare(`CREATE TABLE IF NOT EXISTS restock_request_rate_limits (
          client_key TEXT NOT NULL,
          window_start INTEGER NOT NULL,
          attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts >= 0),
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (client_key, window_start)
        )`),
        database.prepare(`CREATE TABLE IF NOT EXISTS restock_write_guards (
          operation_id TEXT PRIMARY KEY,
          request_id TEXT NOT NULL,
          guard_value INTEGER NOT NULL CHECK(guard_value = 1),
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        database.prepare(
          "CREATE INDEX IF NOT EXISTS restock_write_guards_request_idx ON restock_write_guards(request_id)",
        ),
        database.prepare(`CREATE TABLE IF NOT EXISTS admin_audit_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          admin_id INTEGER,
          action TEXT NOT NULL,
          entity_type TEXT NOT NULL,
          entity_id TEXT NOT NULL DEFAULT '',
          details TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
      ])
      .then(() => undefined)
      .catch((error) => {
        schemaInitializations.delete(cacheKey);
        throw error;
      });
    schemaInitializations.set(cacheKey, initialization);
  }
  await initialization;
}

export async function createRestockRequest(
  request: Request,
  productIdInput: string,
  input: unknown,
  options: RestockReadOptions = {},
): Promise<{
  id: string;
  status: RestockQueueStatus;
  message: string;
}> {
  const productId = productIdInput.trim();
  if (!productIdPattern.test(productId)) {
    throw new AdminApiError(400, "상품코드를 확인해 주세요.");
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new AdminApiError(400, "재입고 알림 신청 정보를 확인해 주세요.");
  }
  const phone = normalizePhone((input as { phone?: unknown }).phone);
  if (!options.database) await ensureCommerceSchema();
  const database = options.database ?? commerceDb();
  await Promise.all([
    ensureAdminProductSchema(database),
    ensureProductOptionSchema(database),
    ensureRestockNotificationSchema(database),
  ]);
  const product = await getEffectiveProduct(productId, {
    database,
    strict: true,
  });
  if (!product?.active || !product.restockNotification) {
    throw new AdminApiError(
      409,
      "이 상품은 현재 재입고 알림 신청을 받지 않습니다.",
    );
  }
  const optionRows = await getProductOptionRows([productId], { database });
  const groups = new Map<string, boolean>();
  for (const option of optionRows) {
    groups.set(
      option.optionName,
      Boolean(groups.get(option.optionName)) ||
        (option.saleEnabled && !option.soldOut && option.stock > 0),
    );
  }
  const optionUnavailable =
    groups.size > 0 && [...groups.values()].some((available) => !available);
  if (!product.soldOut && product.stock > 0 && !optionUnavailable) {
    throw new AdminApiError(409, "현재 구매 가능한 상품입니다.");
  }

  const rateLimit = await checkRestockRateLimit(request, database);
  if (rateLimit.limited) {
    throw new AdminApiError(
      429,
      "재입고 알림 신청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
    );
  }
  const phoneHash = await sha256(phone);
  const id = crypto.randomUUID();
  const queueId = crypto.randomUUID();
  const status: RestockQueueStatus = smsProviderConfigured()
    ? "queued"
    : "waiting_provider";
  try {
    await database.batch([
      database
        .prepare(
          `INSERT INTO restock_requests (
             id, product_id, phone, phone_hash, status
           ) VALUES (?, ?, ?, ?, ?)`,
        )
        .bind(id, productId, phone, phoneHash, status),
      database
        .prepare(
          `INSERT INTO restock_sms_queue (
             id, request_id, status, attempts
           ) VALUES (?, ?, ?, 0)`,
        )
        .bind(queueId, id, status),
    ]);
  } catch (error) {
    if (
      error instanceof Error &&
      /restock_requests_active_uq|unique|constraint/iu.test(error.message)
    ) {
      throw new AdminApiError(
        409,
        "이미 같은 상품의 재입고 알림을 신청하셨습니다.",
      );
    }
    throw error;
  }
  return {
    id,
    status,
    message:
      status === "queued"
        ? "재입고 알림 신청이 접수되어 발송 대기열에 등록되었습니다."
        : "재입고 알림 신청이 접수되었습니다. 문자 서비스 연결 후 순서대로 발송됩니다.",
  };
}

export async function listAdminRestockRequests(
  options: RestockReadOptions & {
    status?: string;
    query?: string;
  } = {},
): Promise<{
  requests: AdminRestockRequest[];
  providerConfigured: boolean;
}> {
  const database = options.database ?? productDatabase();
  await Promise.all([
    ensureAdminProductSchema(database),
    ensureRestockNotificationSchema(database),
  ]);
  const status = isRestockStatus(options.status) ? options.status : "";
  const query =
    typeof options.query === "string"
      ? options.query.replace(/\0/gu, "").trim().slice(0, 80)
      : "";
  const result = await database
    .prepare(
      `SELECT r.id, r.product_id, r.phone, r.status, r.revision,
              r.admin_memo, r.created_at, r.updated_at,
              q.revision AS queue_revision, q.attempts, q.last_error,
              q.sent_at
       FROM restock_requests r
       INNER JOIN restock_sms_queue q ON q.request_id = r.id
       WHERE (? = '' OR r.status = ?)
         AND (
           ? = '' OR r.product_id LIKE '%' || ? || '%'
           OR r.phone LIKE '%' || ? || '%'
         )
       ORDER BY r.created_at DESC
       LIMIT 500`,
    )
    .bind(status, status, query, query, query)
    .all<RestockRequestRow>();
  const products = await getAdminProductRecords({
    database,
    strict: true,
  });
  const productById = new Map(
    products.map(({ product }) => [product.id, product]),
  );
  return {
    requests: (result.results ?? []).map((row) => {
      const product = productById.get(row.product_id);
      return {
        id: row.id,
        productId: row.product_id,
        productName: product?.name ?? row.product_id,
        productImage: product?.images[0] || "/legacy/logo.png",
        phone: row.phone,
        maskedPhone: maskPhone(row.phone),
        status: row.status,
        revision: Number(row.revision),
        queueRevision: Number(row.queue_revision),
        attempts: Number(row.attempts),
        lastError: row.last_error,
        adminMemo: row.admin_memo,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        sentAt: row.sent_at,
      };
    }),
    providerConfigured: smsProviderConfigured(),
  };
}

export async function updateAdminRestockRequest(
  input: unknown,
  adminUsername: string,
  options: RestockReadOptions = {},
): Promise<AdminRestockRequest> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new AdminApiError(400, "처리 요청 형식을 확인해 주세요.");
  }
  const value = input as Record<string, unknown>;
  const id = typeof value.id === "string" ? value.id.trim() : "";
  if (!/^[a-f0-9-]{36}$/iu.test(id)) {
    throw new AdminApiError(400, "신청번호를 확인해 주세요.");
  }
  const expectedRevision = expectedPositiveInteger(
    value.expectedRevision,
    "신청 변경 기준값",
  );
  const expectedQueueRevision = expectedPositiveInteger(
    value.expectedQueueRevision,
    "발송대기열 변경 기준값",
  );
  const action =
    value.action === "queue" ||
    value.action === "retry" ||
    value.action === "mark_sent" ||
    value.action === "mark_failed" ||
    value.action === "cancel"
      ? value.action
      : null;
  if (!action) throw new AdminApiError(400, "처리 상태를 선택해 주세요.");
  const adminMemo =
    typeof value.adminMemo === "string"
      ? value.adminMemo.trim().slice(0, 1_000)
      : "";
  const nextStatus: RestockQueueStatus =
    action === "mark_sent"
      ? "sent"
      : action === "mark_failed"
        ? "failed"
        : action === "cancel"
          ? "cancelled"
          : smsProviderConfigured()
            ? "queued"
            : "waiting_provider";
  const database = options.database ?? productDatabase();
  await ensureRestockNotificationSchema(database);
  const operationId = crypto.randomUUID();
  const updatedBy = adminUsername.trim().slice(0, 128);
  try {
    await database.batch([
      database
        .prepare(
          `UPDATE restock_requests
           SET status = ?,
               admin_memo = ?,
               revision = revision + 1,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND revision = ?`,
        )
        .bind(nextStatus, adminMemo, id, expectedRevision),
      database
        .prepare(
          `INSERT INTO restock_write_guards (
             operation_id, request_id, guard_value
           ) VALUES (
             ?, ?,
             CASE WHEN changes() = 1 THEN 1 ELSE 0 END
           )`,
        )
        .bind(operationId, id),
      database
        .prepare(
          `UPDATE restock_sms_queue
           SET status = ?,
               attempts = attempts + ?,
               last_error = ?,
               revision = revision + 1,
               sent_at = CASE WHEN ? = 'sent' THEN CURRENT_TIMESTAMP ELSE sent_at END,
               updated_at = CURRENT_TIMESTAMP
           WHERE request_id = ? AND revision = ?`,
        )
        .bind(
          nextStatus,
          action === "retry" ? 1 : 0,
          action === "mark_failed" ? adminMemo : "",
          nextStatus,
          id,
          expectedQueueRevision,
        ),
      database
        .prepare(
          `INSERT INTO restock_write_guards (
             operation_id, request_id, guard_value
           ) VALUES (
             ?, ?,
             CASE WHEN changes() = 1 THEN 1 ELSE 0 END
           )`,
        )
        .bind(crypto.randomUUID(), id),
      database
        .prepare(
          `INSERT INTO admin_audit_logs (
             action, entity_type, entity_id, details
           ) VALUES ('restock.request.update', 'restock_request', ?, ?)`,
        )
        .bind(
          id,
          JSON.stringify({
            action,
            status: nextStatus,
            adminUsername: updatedBy,
          }),
        ),
    ]);
  } catch (error) {
    if (
      error instanceof Error &&
      /restock_requests|restock_sms_queue|restock_write_guards|guard_value|constraint|not null/iu.test(
        error.message,
      )
    ) {
      throw new AdminApiError(
        409,
        "신청 또는 발송대기열 상태가 변경되었습니다. 목록을 새로 불러와 주세요.",
      );
    }
    throw error;
  }
  const listed = await listAdminRestockRequests({ database });
  const updated = listed.requests.find((request) => request.id === id);
  if (!updated) throw new AdminApiError(404, "신청 내역을 찾을 수 없습니다.");
  return updated;
}

export async function deleteAdminRestockRequests(
  input: unknown,
  adminUsername: string,
  options: RestockReadOptions = {},
): Promise<{ deletedCount: number }> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new AdminApiError(400, "삭제 요청 형식을 확인해 주세요.");
  }
  const rows = (input as { requests?: unknown }).requests;
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > 100) {
    throw new AdminApiError(
      400,
      "삭제할 재입고 알림을 1건 이상 100건 이하로 선택해 주세요.",
    );
  }
  const targets = rows.map((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw new AdminApiError(400, "삭제할 신청 정보를 확인해 주세요.");
    }
    const value = row as Record<string, unknown>;
    const id = typeof value.id === "string" ? value.id.trim() : "";
    if (!/^[a-f0-9-]{36}$/iu.test(id)) {
      throw new AdminApiError(400, "삭제할 신청번호를 확인해 주세요.");
    }
    return {
      id,
      expectedRevision: expectedPositiveInteger(
        value.expectedRevision,
        "신청 변경 기준값",
      ),
      expectedQueueRevision: expectedPositiveInteger(
        value.expectedQueueRevision,
        "발송대기열 변경 기준값",
      ),
    };
  });
  if (new Set(targets.map((target) => target.id)).size !== targets.length) {
    throw new AdminApiError(400, "중복된 신청번호가 포함되어 있습니다.");
  }
  const database = options.database ?? productDatabase();
  await ensureRestockNotificationSchema(database);
  const operationId = crypto.randomUUID();
  const statements: D1PreparedStatement[] = [];
  for (const target of targets) {
    statements.push(
      database
        .prepare(
          "DELETE FROM restock_sms_queue WHERE request_id = ? AND revision = ?",
        )
        .bind(target.id, target.expectedQueueRevision),
      database
        .prepare(
          `INSERT INTO restock_write_guards (
             operation_id, request_id, guard_value
           ) VALUES (?, ?, CASE WHEN changes() = 1 THEN 1 ELSE 0 END)`,
        )
        .bind(crypto.randomUUID(), target.id),
      database
        .prepare(
          "DELETE FROM restock_requests WHERE id = ? AND revision = ?",
        )
        .bind(target.id, target.expectedRevision),
      database
        .prepare(
          `INSERT INTO restock_write_guards (
             operation_id, request_id, guard_value
           ) VALUES (?, ?, CASE WHEN changes() = 1 THEN 1 ELSE 0 END)`,
        )
        .bind(crypto.randomUUID(), target.id),
    );
  }
  statements.push(
    database
      .prepare(
        `INSERT INTO admin_audit_logs (
           action, entity_type, entity_id, details
         ) VALUES ('restock.request.delete', 'restock_request', ?, ?)`,
      )
      .bind(
        operationId,
        JSON.stringify({
          requestIds: targets.map((target) => target.id),
          adminUsername: adminUsername.trim().slice(0, 128),
        }),
      ),
  );
  try {
    await database.batch(statements);
  } catch (error) {
    if (
      error instanceof Error &&
      /restock_requests|restock_sms_queue|restock_write_guards|guard_value|constraint/iu.test(
        error.message,
      )
    ) {
      throw new AdminApiError(
        409,
        "신청 또는 발송대기열 상태가 변경되었습니다. 목록을 새로 불러와 주세요.",
      );
    }
    throw error;
  }
  return { deletedCount: targets.length };
}

async function checkRestockRateLimit(
  request: Request,
  database: D1Database,
): Promise<{ limited: boolean }> {
  const address =
    request.headers.get("cf-connecting-ip")?.trim().slice(0, 128) ||
    "anonymous";
  const clientKey = await sha256(`restock:${address}`);
  const windowStart = Math.floor(Date.now() / REQUEST_WINDOW_MS);
  const result = await database
    .prepare(
      `INSERT INTO restock_request_rate_limits (
         client_key, window_start, attempts, updated_at
       ) VALUES (?, ?, 1, CURRENT_TIMESTAMP)
       ON CONFLICT(client_key, window_start) DO UPDATE SET
         attempts = restock_request_rate_limits.attempts + 1,
         updated_at = CURRENT_TIMESTAMP
       RETURNING attempts`,
    )
    .bind(clientKey, windowStart)
    .first<{ attempts: number }>();
  return {
    limited: Number(result?.attempts ?? 1) > MAX_REQUESTS_PER_WINDOW,
  };
}

function normalizePhone(value: unknown): string {
  if (typeof value !== "string" || value.length > 40) {
    throw new AdminApiError(400, "휴대전화 번호를 확인해 주세요.");
  }
  const digits = value.replace(/\D/gu, "");
  if (!/^01[016789]\d{7,8}$/u.test(digits)) {
    throw new AdminApiError(400, "올바른 휴대전화 번호를 입력해 주세요.");
  }
  return digits;
}

function maskPhone(phone: string): string {
  if (phone.length < 7) return phone;
  return `${phone.slice(0, 3)}-${"*".repeat(phone.length - 7)}-${phone.slice(-4)}`;
}

function smsProviderConfigured(): boolean {
  const providerUrl = (env as unknown as RestockEnvironment).SMS_PROVIDER_URL;
  return Boolean(providerUrl && /^https:\/\//iu.test(providerUrl.trim()));
}

function isRestockStatus(value: unknown): value is RestockQueueStatus {
  return (
    value === "waiting_provider" ||
    value === "queued" ||
    value === "sent" ||
    value === "failed" ||
    value === "cancelled"
  );
}

function expectedPositiveInteger(value: unknown, label: string): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > 2_147_483_647
  ) {
    throw new AdminApiError(400, `${label}을 확인해 주세요.`);
  }
  return value;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
