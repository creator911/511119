import { AdminApiError } from "@/lib/admin-api";
import {
  commerceDb,
  commerceEnvironment,
  ensureCommerceSchema,
} from "@/lib/commerce-db";

export type PersonalPaymentMethod =
  | ""
  | "무통장"
  | "계좌이체"
  | "가상계좌"
  | "신용카드"
  | "휴대폰";

export interface PersonalPayment {
  id: string;
  publicToken: string;
  title: string;
  orderId: string;
  orderAmount: number;
  receiptAmount: number;
  outstandingAmount: number;
  paymentMethod: PersonalPaymentMethod;
  receiptTime: string | null;
  content: string;
  shopMemo: string;
  enabled: boolean;
  noticeStatus: "none" | "pending_review" | "confirmed" | "rejected";
  noticeDepositor: string;
  noticePhoneMasked: string;
  noticeMessage: string;
  noticeAt: string | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
  publicHref: string;
}

export interface PublicPersonalPayment {
  publicToken: string;
  title: string;
  orderAmount: number;
  receiptAmount: number;
  outstandingAmount: number;
  paymentMethod: PersonalPaymentMethod;
  content: string;
  noticeStatus: PersonalPayment["noticeStatus"];
  noticeAt: string | null;
}

interface PersonalPaymentRow {
  id: string;
  public_token: string;
  title: string;
  order_id: string;
  order_amount: number;
  receipt_amount: number;
  payment_method: PersonalPaymentMethod;
  receipt_time: string | null;
  content: string;
  shop_memo: string;
  enabled: number;
  revision: number;
  created_at: string;
  updated_at: string;
  notice_status: PersonalPayment["noticeStatus"] | null;
  notice_depositor: string | null;
  notice_phone: string | null;
  notice_message: string | null;
  notice_at: string | null;
}

interface PersonalPaymentOptions {
  database?: D1Database;
}

const schemaInitializations = new WeakMap<object, Promise<void>>();
const paymentMethods = new Set<PersonalPaymentMethod>([
  "",
  "무통장",
  "계좌이체",
  "가상계좌",
  "신용카드",
  "휴대폰",
]);
const publicTokenPattern = /^[A-Za-z0-9_-]{32,96}$/u;
const paymentIdPattern = /^pp_[A-Za-z0-9_-]{12,40}$/u;
const MAX_AMOUNT = 2_000_000_000;
const NOTICE_WINDOW_SECONDS = 60 * 60;
const MAX_NOTICES_PER_WINDOW = 5;

export async function ensurePersonalPaymentSchema(
  database = commerceDb(),
): Promise<void> {
  const cacheKey = database as unknown as object;
  let initialization = schemaInitializations.get(cacheKey);
  if (!initialization) {
    initialization = database
      .batch([
        database.prepare(`CREATE TABLE IF NOT EXISTS personal_payments (
          id TEXT PRIMARY KEY,
          public_token TEXT NOT NULL UNIQUE,
          title TEXT NOT NULL,
          order_id TEXT NOT NULL DEFAULT '',
          order_amount INTEGER NOT NULL DEFAULT 0
            CHECK(order_amount >= 0 AND order_amount <= 2000000000),
          receipt_amount INTEGER NOT NULL DEFAULT 0
            CHECK(receipt_amount >= 0 AND receipt_amount <= order_amount),
          payment_method TEXT NOT NULL DEFAULT ''
            CHECK(payment_method IN (
              '', '무통장', '계좌이체', '가상계좌', '신용카드', '휴대폰'
            )),
          receipt_time TEXT,
          content TEXT NOT NULL DEFAULT '',
          shop_memo TEXT NOT NULL DEFAULT '',
          enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0, 1)),
          revision INTEGER NOT NULL DEFAULT 1 CHECK(revision >= 1),
          created_by TEXT NOT NULL DEFAULT '',
          updated_by TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        database.prepare(
          "CREATE INDEX IF NOT EXISTS personal_payments_order_idx ON personal_payments(order_id)",
        ),
        database.prepare(
          "CREATE INDEX IF NOT EXISTS personal_payments_enabled_idx ON personal_payments(enabled, updated_at)",
        ),
        database.prepare(`CREATE TABLE IF NOT EXISTS personal_payment_notices (
          payment_id TEXT PRIMARY KEY,
          depositor TEXT NOT NULL,
          phone TEXT NOT NULL,
          message TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'pending_review'
            CHECK(status IN ('pending_review', 'confirmed', 'rejected')),
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        database.prepare(`CREATE TABLE IF NOT EXISTS personal_payment_rate_limits (
          client_key TEXT NOT NULL,
          window_start INTEGER NOT NULL,
          attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts >= 0),
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (client_key, window_start)
        )`),
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

export async function listAdminPersonalPayments(
  input?: { field?: string; query?: string },
  options: PersonalPaymentOptions = {},
): Promise<PersonalPayment[]> {
  if (!options.database) await ensureCommerceSchema();
  const database = options.database ?? commerceDb();
  await ensurePersonalPaymentSchema(database);
  const field =
    input?.field === "id" || input?.field === "orderId"
      ? input.field
      : "title";
  const query = boundedText(input?.query, 100);
  const column =
    field === "id" ? "p.id" : field === "orderId" ? "p.order_id" : "p.title";
  const rows = await database
    .prepare(
      `SELECT p.id, p.public_token, p.title, p.order_id, p.order_amount,
              p.receipt_amount, p.payment_method, p.receipt_time, p.content,
              p.shop_memo, p.enabled, p.revision, p.created_at, p.updated_at,
              n.status AS notice_status, n.depositor AS notice_depositor,
              n.phone AS notice_phone, n.message AS notice_message,
              n.updated_at AS notice_at
       FROM personal_payments p
       LEFT JOIN personal_payment_notices n ON n.payment_id = p.id
       WHERE (? = '' OR ${column} LIKE ? ESCAPE '\\')
       ORDER BY p.created_at DESC, p.id DESC
       LIMIT 1000`,
    )
    .bind(query, `%${escapeLike(query)}%`)
    .all<PersonalPaymentRow>();
  return (rows.results ?? []).map(mapAdminPayment);
}

export async function createPersonalPayment(
  input: unknown,
  adminUsername: string,
  options: PersonalPaymentOptions = {},
): Promise<PersonalPayment> {
  if (!options.database) await ensureCommerceSchema();
  const database = options.database ?? commerceDb();
  await ensurePersonalPaymentSchema(database);
  const values = parseAdminPaymentInput(input, false);
  const id = `pp_${randomBase64Url(12)}`;
  const publicToken = randomBase64Url(32);
  await database.batch([
    database
      .prepare(
        `INSERT INTO personal_payments (
           id, public_token, title, order_id, order_amount, receipt_amount,
           payment_method, receipt_time, content, shop_memo, enabled,
           created_by, updated_by
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        publicToken,
        values.title,
        values.orderId,
        values.orderAmount,
        values.receiptAmount,
        values.paymentMethod,
        values.receiptTime,
        values.content,
        values.shopMemo,
        values.enabled ? 1 : 0,
        adminUsername,
        adminUsername,
      ),
    database
      .prepare(
        `INSERT INTO admin_audit_logs (
           action, entity_type, entity_id, details
         ) VALUES ('personal_payment.create', 'personal_payment', ?, ?)`,
      )
      .bind(id, JSON.stringify({ title: values.title })),
  ]);
  return requirePersonalPayment(id, database);
}

export async function updatePersonalPayment(
  id: string,
  input: unknown,
  adminUsername: string,
  options: PersonalPaymentOptions = {},
): Promise<PersonalPayment> {
  assertPaymentId(id);
  if (!options.database) await ensureCommerceSchema();
  const database = options.database ?? commerceDb();
  await ensurePersonalPaymentSchema(database);
  const values = parseAdminPaymentInput(input, true);
  const revision = readRevision(input);
  const result = await database
    .prepare(
      `UPDATE personal_payments
       SET title = ?, order_id = ?, order_amount = ?, receipt_amount = ?,
           payment_method = ?, receipt_time = ?, content = ?, shop_memo = ?,
           enabled = ?, revision = revision + 1, updated_by = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND revision = ?`,
    )
    .bind(
      values.title,
      values.orderId,
      values.orderAmount,
      values.receiptAmount,
      values.paymentMethod,
      values.receiptTime,
      values.content,
      values.shopMemo,
      values.enabled ? 1 : 0,
      adminUsername,
      id,
      revision,
    )
    .run();
  if (Number(result.meta.changes ?? 0) !== 1) {
    const exists = await database
      .prepare("SELECT id FROM personal_payments WHERE id = ?")
      .bind(id)
      .first<{ id: string }>();
    if (!exists) throw new AdminApiError(404, "개인결제 자료를 찾지 못했습니다.");
    throw new AdminApiError(
      409,
      "다른 관리자가 먼저 수정했습니다. 새로고침 후 다시 시도해 주세요.",
    );
  }
  await database
    .prepare(
      `INSERT INTO admin_audit_logs (
         action, entity_type, entity_id, details
       ) VALUES ('personal_payment.update', 'personal_payment', ?, ?)`,
    )
    .bind(
      id,
      JSON.stringify({
        receiptAmount: values.receiptAmount,
        enabled: values.enabled,
      }),
    )
    .run();
  return requirePersonalPayment(id, database);
}

export async function deletePersonalPayments(
  idsInput: unknown,
  adminUsername: string,
  options: PersonalPaymentOptions = {},
): Promise<number> {
  if (!Array.isArray(idsInput) || idsInput.length < 1 || idsInput.length > 100) {
    throw new AdminApiError(400, "삭제할 개인결제를 선택해 주세요.");
  }
  const ids = [...new Set(idsInput.map((id) => String(id)))];
  ids.forEach(assertPaymentId);
  if (!options.database) await ensureCommerceSchema();
  const database = options.database ?? commerceDb();
  await ensurePersonalPaymentSchema(database);
  let deleted = 0;
  for (const id of ids) {
    const result = await database.batch([
      database
        .prepare("DELETE FROM personal_payment_notices WHERE payment_id = ?")
        .bind(id),
      database.prepare("DELETE FROM personal_payments WHERE id = ?").bind(id),
    ]);
    deleted += Number(result[1]?.meta.changes ?? 0);
  }
  if (deleted > 0) {
    await database
      .prepare(
        `INSERT INTO admin_audit_logs (
           action, entity_type, entity_id, details
         ) VALUES ('personal_payment.delete', 'personal_payment', '', ?)`,
      )
      .bind(JSON.stringify({ ids, deleted, adminUsername }))
      .run();
  }
  return deleted;
}

export async function listPublicPersonalPayments(
  options: PersonalPaymentOptions = {},
): Promise<PublicPersonalPayment[]> {
  if (!options.database) await ensureCommerceSchema();
  const database = options.database ?? commerceDb();
  await ensurePersonalPaymentSchema(database);
  const rows = await database
    .prepare(
      `SELECT p.id, p.public_token, p.title, p.order_id, p.order_amount,
              p.receipt_amount, p.payment_method, p.receipt_time, p.content,
              p.shop_memo, p.enabled, p.revision, p.created_at, p.updated_at,
              n.status AS notice_status, n.depositor AS notice_depositor,
              n.phone AS notice_phone, n.message AS notice_message,
              n.updated_at AS notice_at
       FROM personal_payments p
       LEFT JOIN personal_payment_notices n ON n.payment_id = p.id
       WHERE p.enabled = 1 AND p.receipt_amount < p.order_amount
       ORDER BY p.created_at DESC
       LIMIT 100`,
    )
    .all<PersonalPaymentRow>();
  return (rows.results ?? []).map(mapPublicPayment);
}

export async function getPublicPersonalPayment(
  token: string,
  options: PersonalPaymentOptions = {},
): Promise<PublicPersonalPayment | null> {
  if (!publicTokenPattern.test(token)) return null;
  if (!options.database) await ensureCommerceSchema();
  const database = options.database ?? commerceDb();
  await ensurePersonalPaymentSchema(database);
  const row = await database
    .prepare(
      `SELECT p.id, p.public_token, p.title, p.order_id, p.order_amount,
              p.receipt_amount, p.payment_method, p.receipt_time, p.content,
              p.shop_memo, p.enabled, p.revision, p.created_at, p.updated_at,
              n.status AS notice_status, n.depositor AS notice_depositor,
              n.phone AS notice_phone, n.message AS notice_message,
              n.updated_at AS notice_at
       FROM personal_payments p
       LEFT JOIN personal_payment_notices n ON n.payment_id = p.id
       WHERE p.public_token = ? AND p.enabled = 1
       LIMIT 1`,
    )
    .bind(token)
    .first<PersonalPaymentRow>();
  return row ? mapPublicPayment(row) : null;
}

export async function submitPersonalPaymentNotice(
  request: Request,
  token: string,
  input: unknown,
  options: PersonalPaymentOptions = {},
): Promise<{ status: "pending_review"; message: string }> {
  if (!publicTokenPattern.test(token)) {
    throw new AdminApiError(404, "개인결제 요청을 찾지 못했습니다.");
  }
  const body = objectInput(input);
  const depositor = requiredText(body.depositor, "입금자명을 입력해 주세요.", 60);
  const phone = normalizePhone(body.phone);
  const message = boundedText(body.message, 500);
  if (!options.database) await ensureCommerceSchema();
  const database = options.database ?? commerceDb();
  await ensurePersonalPaymentSchema(database);
  const payment = await database
    .prepare(
      `SELECT id, order_amount, receipt_amount
       FROM personal_payments
       WHERE public_token = ? AND enabled = 1
       LIMIT 1`,
    )
    .bind(token)
    .first<{ id: string; order_amount: number; receipt_amount: number }>();
  if (!payment) {
    throw new AdminApiError(404, "개인결제 요청을 찾지 못했습니다.");
  }
  if (Number(payment.receipt_amount) >= Number(payment.order_amount)) {
    throw new AdminApiError(409, "이미 입금 확인이 완료된 개인결제입니다.");
  }

  const windowStart =
    Math.floor(Date.now() / (NOTICE_WINDOW_SECONDS * 1_000)) *
    NOTICE_WINDOW_SECONDS;
  const clientKey = await noticeClientKey(request);
  const rate = await database
    .prepare(
      `INSERT INTO personal_payment_rate_limits (
         client_key, window_start, attempts
       ) VALUES (?, ?, 1)
       ON CONFLICT(client_key, window_start) DO UPDATE SET
         attempts = personal_payment_rate_limits.attempts + 1,
         updated_at = CURRENT_TIMESTAMP
       RETURNING attempts`,
    )
    .bind(clientKey, windowStart)
    .first<{ attempts: number }>();
  if (Number(rate?.attempts ?? 1) > MAX_NOTICES_PER_WINDOW) {
    throw new AdminApiError(
      429,
      "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
    );
  }

  await database
    .prepare(
      `INSERT INTO personal_payment_notices (
         payment_id, depositor, phone, message, status
       ) VALUES (?, ?, ?, ?, 'pending_review')
       ON CONFLICT(payment_id) DO UPDATE SET
         depositor = excluded.depositor,
         phone = excluded.phone,
         message = excluded.message,
         status = 'pending_review',
         updated_at = CURRENT_TIMESTAMP`,
    )
    .bind(payment.id, depositor, phone, message)
    .run();
  return {
    status: "pending_review",
    message:
      "입금예정 정보가 접수되었습니다. 실제 입금 완료 여부는 관리자가 확인한 뒤 반영됩니다.",
  };
}

function parseAdminPaymentInput(
  input: unknown,
  requireRevision: boolean,
): {
  title: string;
  orderId: string;
  orderAmount: number;
  receiptAmount: number;
  paymentMethod: PersonalPaymentMethod;
  receiptTime: string | null;
  content: string;
  shopMemo: string;
  enabled: boolean;
} {
  const body = objectInput(input);
  if (requireRevision) readRevision(input);
  const title = requiredText(body.title, "제목을 입력해 주세요.", 120);
  const orderId = boundedText(body.orderId, 60);
  const orderAmount = amountValue(body.orderAmount, "주문금액");
  const receiptAmount = amountValue(body.receiptAmount, "입금금액");
  if (receiptAmount > orderAmount) {
    throw new AdminApiError(400, "입금금액은 주문금액보다 클 수 없습니다.", {
      receiptAmount: "입금금액을 다시 확인해 주세요.",
    });
  }
  const paymentMethod = String(
    typeof body.paymentMethod === "string" ? body.paymentMethod : "",
  ) as PersonalPaymentMethod;
  if (!paymentMethods.has(paymentMethod)) {
    throw new AdminApiError(400, "결제방법을 확인해 주세요.");
  }
  return {
    title,
    orderId,
    orderAmount,
    receiptAmount,
    paymentMethod,
    receiptTime: nullableDateTime(body.receiptTime),
    content: boundedText(body.content, 5_000),
    shopMemo: boundedText(body.shopMemo, 5_000),
    enabled: booleanValue(body.enabled, true),
  };
}

async function requirePersonalPayment(
  id: string,
  database: D1Database,
): Promise<PersonalPayment> {
  const row = await database
    .prepare(
      `SELECT p.id, p.public_token, p.title, p.order_id, p.order_amount,
              p.receipt_amount, p.payment_method, p.receipt_time, p.content,
              p.shop_memo, p.enabled, p.revision, p.created_at, p.updated_at,
              n.status AS notice_status, n.depositor AS notice_depositor,
              n.phone AS notice_phone, n.message AS notice_message,
              n.updated_at AS notice_at
       FROM personal_payments p
       LEFT JOIN personal_payment_notices n ON n.payment_id = p.id
       WHERE p.id = ? LIMIT 1`,
    )
    .bind(id)
    .first<PersonalPaymentRow>();
  if (!row) throw new AdminApiError(404, "개인결제 자료를 찾지 못했습니다.");
  return mapAdminPayment(row);
}

function mapAdminPayment(row: PersonalPaymentRow): PersonalPayment {
  const orderAmount = safeAmount(row.order_amount);
  const receiptAmount = Math.min(orderAmount, safeAmount(row.receipt_amount));
  return {
    id: row.id,
    publicToken: row.public_token,
    title: row.title,
    orderId: row.order_id,
    orderAmount,
    receiptAmount,
    outstandingAmount: Math.max(0, orderAmount - receiptAmount),
    paymentMethod: paymentMethods.has(row.payment_method)
      ? row.payment_method
      : "",
    receiptTime: row.receipt_time,
    content: row.content,
    shopMemo: row.shop_memo,
    enabled: Number(row.enabled) === 1,
    noticeStatus: row.notice_status ?? "none",
    noticeDepositor: row.notice_depositor ?? "",
    noticePhoneMasked: maskPhone(row.notice_phone ?? ""),
    noticeMessage: row.notice_message ?? "",
    noticeAt: row.notice_at,
    revision: Math.max(1, Math.trunc(Number(row.revision) || 1)),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publicHref: `/shop/personalpay.php?token=${encodeURIComponent(row.public_token)}`,
  };
}

function mapPublicPayment(row: PersonalPaymentRow): PublicPersonalPayment {
  const payment = mapAdminPayment(row);
  return {
    publicToken: payment.publicToken,
    title: payment.title,
    orderAmount: payment.orderAmount,
    receiptAmount: payment.receiptAmount,
    outstandingAmount: payment.outstandingAmount,
    paymentMethod: payment.paymentMethod,
    content: payment.content,
    noticeStatus: payment.noticeStatus,
    noticeAt: payment.noticeAt,
  };
}

function objectInput(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new AdminApiError(400, "요청 내용을 확인해 주세요.");
  }
  return input as Record<string, unknown>;
}

function requiredText(
  value: unknown,
  message: string,
  maxLength: number,
): string {
  const text = boundedText(value, maxLength);
  if (!text) throw new AdminApiError(400, message);
  return text;
}

function boundedText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    throw new AdminApiError(400, `입력값은 ${maxLength}자 이하여야 합니다.`);
  }
  return normalized;
}

function amountValue(value: unknown, label: string): number {
  const number =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^\d+$/u.test(value.trim())
        ? Number(value)
        : Number.NaN;
  if (
    !Number.isSafeInteger(number) ||
    number < 0 ||
    number > MAX_AMOUNT
  ) {
    throw new AdminApiError(400, `${label}은 0원 이상 숫자로 입력해 주세요.`);
  }
  return number;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1" || value === "true") return true;
  if (value === 0 || value === "0" || value === "false") return false;
  return fallback;
}

function nullableDateTime(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || value.length > 40) {
    throw new AdminApiError(400, "결제일시를 확인해 주세요.");
  }
  const normalized = value.trim().replace("T", " ");
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})?$/u.test(normalized)) {
    throw new AdminApiError(
      400,
      "결제일시는 YYYY-MM-DD HH:mm:ss 형식으로 입력해 주세요.",
    );
  }
  const withSeconds = normalized.length === 16 ? `${normalized}:00` : normalized;
  const parsed = Date.parse(`${withSeconds.replace(" ", "T")}+09:00`);
  if (!Number.isFinite(parsed)) {
    throw new AdminApiError(400, "결제일시를 확인해 주세요.");
  }
  return withSeconds;
}

function normalizePhone(value: unknown): string {
  if (typeof value !== "string") {
    throw new AdminApiError(400, "연락처를 입력해 주세요.");
  }
  const digits = value.replace(/\D/gu, "");
  if (!/^0\d{9,10}$/u.test(digits)) {
    throw new AdminApiError(400, "연락처 형식을 확인해 주세요.");
  }
  return digits;
}

function readRevision(input: unknown): number {
  const body = objectInput(input);
  const revision = Number(body.revision);
  if (!Number.isSafeInteger(revision) || revision < 1) {
    throw new AdminApiError(400, "자료 버전을 확인해 주세요.");
  }
  return revision;
}

function assertPaymentId(id: string): void {
  if (!paymentIdPattern.test(id)) {
    throw new AdminApiError(400, "개인결제 번호를 확인해 주세요.");
  }
}

function safeAmount(value: number): number {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0
    ? Math.min(number, MAX_AMOUNT)
    : 0;
}

function maskPhone(value: string): string {
  if (value.length < 7) return "";
  return `${value.slice(0, 3)}-${"*".repeat(value.length - 7)}-${value.slice(-4)}`;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/gu, (character) => `\\${character}`);
}

function randomBase64Url(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/gu, "-")
    .replace(/\//gu, "_")
    .replace(/=+$/gu, "");
}

async function noticeClientKey(request: Request): Promise<string> {
  const ip =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "local";
  const userAgent = (request.headers.get("user-agent") ?? "").slice(0, 300);
  const secret = commerceEnvironment().SESSION_SECRET ?? "local-personal-payment";
  const bytes = new TextEncoder().encode(`${secret}\0${ip}\0${userAgent}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
