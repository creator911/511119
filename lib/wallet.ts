import { AdminApiError } from "@/lib/admin-api";
import { commerceDb, ensureCommerceSchema } from "@/lib/commerce-db";
import { MAX_POINTS } from "@/lib/commerce-limits";
import {
  MAX_WALLET_REQUEST_AMOUNT,
  MIN_WALLET_REQUEST_AMOUNT,
  type MemberWalletRequest,
  type WalletDecision,
  type WalletRequest,
  type WalletRequestKind,
  type WalletRequestStatus,
} from "@/lib/wallet-contract";

const REQUEST_RATE_WINDOW_MS = 60 * 60 * 1_000;
const MAX_REQUESTS_PER_WINDOW = 5;
const requestIdPattern =
  /^(?:CHG|WDR)-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const accountNumberPattern = /^[0-9A-Za-z -]{4,80}$/u;

interface ChargeRow {
  id: string;
  user_id: string;
  login_id: string;
  member_name: string;
  member_nickname: string;
  member_phone: string;
  member_points: number;
  amount: number;
  depositor_name: string;
  status: string;
  admin_memo: string;
  created_at: string;
  updated_at: string;
}

interface WithdrawalRow {
  id: string;
  user_id: string;
  login_id: string;
  member_name: string;
  member_nickname: string;
  member_phone: string;
  member_points: number;
  amount: number;
  bank_name: string;
  account_number: string;
  account_holder: string;
  status: string;
  admin_memo: string;
  created_at: string;
  updated_at: string;
}

export class WalletInputError extends Error {
  constructor(
    message: string,
    readonly status = 400,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "WalletInputError";
  }
}

export async function getMemberWalletOverview(
  userId: string,
): Promise<{
  points: number;
  member: { loginId: string; name: string; phone: string };
  requests: MemberWalletRequest[];
}> {
  await ensureCommerceSchema();
  const database = commerceDb();
  const [user, charges, withdrawals] = await Promise.all([
    database
      .prepare(
        `SELECT points, login_id, name, phone
         FROM users WHERE id = ? AND active = 1 LIMIT 1`,
      )
      .bind(userId)
      .first<{
        points: number;
        login_id: string;
        name: string;
        phone: string;
      }>(),
    database
      .prepare(
        `SELECT id, amount, depositor_name, status, admin_memo,
                created_at, updated_at
         FROM charge_requests
         WHERE user_id = ?
         ORDER BY created_at DESC
         LIMIT 100`,
      )
      .bind(userId)
      .all<{
        id: string;
        amount: number;
        depositor_name: string;
        status: string;
        admin_memo: string;
        created_at: string;
        updated_at: string;
      }>(),
    database
      .prepare(
        `SELECT id, amount, bank_name, account_number, status, admin_memo,
                created_at, updated_at
         FROM withdrawal_requests
         WHERE user_id = ?
         ORDER BY created_at DESC
         LIMIT 100`,
      )
      .bind(userId)
      .all<{
        id: string;
        amount: number;
        bank_name: string;
        account_number: string;
        status: string;
        admin_memo: string;
        created_at: string;
        updated_at: string;
      }>(),
  ]);
  if (!user) {
    throw new WalletInputError("회원 정보를 찾을 수 없습니다.", 404);
  }

  const requests: MemberWalletRequest[] = [
    ...(charges.results ?? []).flatMap((row) => {
      const status = parseWalletStatus(row.status);
      return status
        ? [
            {
              id: row.id,
              kind: "charge" as const,
              amount: Number(row.amount),
              status,
              summary: `입금자 ${row.depositor_name}`,
              adminMemo: row.admin_memo,
              createdAt: row.created_at,
              updatedAt: row.updated_at,
            },
          ]
        : [];
    }),
    ...(withdrawals.results ?? []).flatMap((row) => {
      const status = parseWalletStatus(row.status);
      return status
        ? [
            {
              id: row.id,
              kind: "withdrawal" as const,
              amount: Number(row.amount),
              status,
              summary: `${row.bank_name} ${maskAccountNumber(row.account_number)}`,
              adminMemo: row.admin_memo,
              createdAt: row.created_at,
              updatedAt: row.updated_at,
            },
          ]
        : [];
    }),
  ].sort((left, right) => right.createdAt.localeCompare(left.createdAt));

  return {
    points: Math.max(0, Math.trunc(Number(user.points) || 0)),
    member: {
      loginId: user.login_id,
      name: user.name,
      phone: user.phone,
    },
    requests: requests.slice(0, 100),
  };
}

export async function createWalletRequest(
  userId: string,
  input: unknown,
): Promise<MemberWalletRequest> {
  const request = validateWalletRequest(input);
  await ensureCommerceSchema();
  const database = commerceDb();
  await enforceWalletRequestRateLimit(userId, request.kind, database);

  const user = await database
    .prepare("SELECT points FROM users WHERE id = ? AND active = 1 LIMIT 1")
    .bind(userId)
    .first<{ points: number }>();
  if (!user) {
    throw new WalletInputError("회원 정보를 찾을 수 없습니다.", 404);
  }
  const points = Math.max(0, Math.trunc(Number(user.points) || 0));
  if (request.kind === "withdrawal" && request.amount > points) {
    throw new WalletInputError("보유 포인트보다 큰 금액은 출금 신청할 수 없습니다.");
  }

  const id = `${request.kind === "charge" ? "CHG" : "WDR"}-${crypto.randomUUID()}`;
  if (request.kind === "charge") {
    await database
      .prepare(
        `INSERT INTO charge_requests (
           id, user_id, amount, depositor_name, status
         ) VALUES (?, ?, ?, ?, 'requested')`,
      )
      .bind(id, userId, request.amount, request.depositorName)
      .run();
    return {
      id,
      kind: "charge",
      amount: request.amount,
      status: "requested",
      summary: `입금자 ${request.depositorName}`,
      adminMemo: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  await database
    .prepare(
      `INSERT INTO withdrawal_requests (
         id, user_id, amount, bank_name, account_number, account_holder, status
       ) VALUES (?, ?, ?, ?, ?, ?, 'requested')`,
    )
    .bind(
      id,
      userId,
      request.amount,
      request.bankName,
      request.accountNumber,
      request.accountHolder,
    )
    .run();
  return {
    id,
    kind: "withdrawal",
    amount: request.amount,
    status: "requested",
    summary: `${request.bankName} ${maskAccountNumber(request.accountNumber)}`,
    adminMemo: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export async function listAdminWalletRequests(): Promise<WalletRequest[]> {
  await ensureCommerceSchema();
  const database = commerceDb();
  const [charges, withdrawals] = await Promise.all([
    database
      .prepare(
        `SELECT cr.id, cr.user_id, u.login_id, u.name AS member_name,
                u.nickname AS member_nickname, u.phone AS member_phone,
                u.points AS member_points,
                cr.amount, cr.depositor_name, cr.status, cr.admin_memo,
                cr.created_at, cr.updated_at
         FROM charge_requests cr
         LEFT JOIN users u ON u.id = cr.user_id
         ORDER BY cr.created_at DESC
         LIMIT 500`,
      )
      .all<ChargeRow>(),
    database
      .prepare(
        `SELECT wr.id, wr.user_id, u.login_id, u.name AS member_name,
                u.nickname AS member_nickname, u.phone AS member_phone,
                u.points AS member_points,
                wr.amount, wr.bank_name, wr.account_number, wr.account_holder,
                wr.status, wr.admin_memo, wr.created_at, wr.updated_at
         FROM withdrawal_requests wr
         LEFT JOIN users u ON u.id = wr.user_id
         ORDER BY wr.created_at DESC
         LIMIT 500`,
      )
      .all<WithdrawalRow>(),
  ]);

  const requests = [
    ...(charges.results ?? []).flatMap(parseChargeRow),
    ...(withdrawals.results ?? []).flatMap(parseWithdrawalRow),
  ];
  return requests
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, 500);
}

export async function processWalletRequest(
  kind: WalletRequestKind,
  id: string,
  decision: WalletDecision,
  adminMemo: string,
  adminUsername: string,
): Promise<WalletRequest> {
  if (!requestIdPattern.test(id)) {
    throw new AdminApiError(400, "요청 식별값이 올바르지 않습니다.");
  }
  if (decision !== "approve" && decision !== "reject") {
    throw new AdminApiError(400, "처리 결과가 올바르지 않습니다.");
  }
  let memo: string;
  try {
    memo = normalizeText(adminMemo, "관리자 메모", 500);
  } catch (error) {
    if (error instanceof WalletInputError) {
      throw new AdminApiError(error.status, error.message);
    }
    throw error;
  }
  await ensureCommerceSchema();
  const database = commerceDb();
  const current = await readAdminWalletRequest(kind, id, database);
  if (!current) {
    throw new AdminApiError(404, "충전·출금 요청을 찾을 수 없습니다.");
  }
  if (current.status !== "requested") {
    throw new AdminApiError(409, "이미 처리된 요청입니다.");
  }
  if (
    !Number.isSafeInteger(current.amount) ||
    current.amount < MIN_WALLET_REQUEST_AMOUNT ||
    current.amount > MAX_WALLET_REQUEST_AMOUNT
  ) {
    throw new AdminApiError(409, "처리할 수 없는 신청 금액입니다.");
  }

  const table =
    kind === "charge" ? "charge_requests" : "withdrawal_requests";
  const nextStatus: WalletRequestStatus =
    decision === "approve" ? "approved" : "rejected";
  const auditDetails = JSON.stringify({
    adminUsername: adminUsername.slice(0, 128),
    decision,
    requestKind: kind,
    amount: current.amount,
  });
  const transition = database
    .prepare(
      `UPDATE ${table}
       SET status = ?, admin_memo = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = 'requested'`,
    )
    .bind(nextStatus, memo, id);
  const transitionGuard = database
    .prepare(
      `INSERT INTO wallet_processing_guards (
         request_type, request_id, transition_guard, balance_guard
       ) VALUES (?, ?, changes(), 1)`,
    )
    .bind(kind, id);
  const audit = database
    .prepare(
      `INSERT INTO admin_audit_logs (
         admin_id, action, entity_type, entity_id, details
       ) VALUES (NULL, ?, ?, ?, ?)`,
    )
    .bind(
      `wallet.${kind}.${nextStatus}`,
      `${kind}_request`,
      id,
      auditDetails,
    );

  try {
    if (decision === "reject") {
      await database.batch([transition, transitionGuard, audit]);
    } else {
      const delta = kind === "charge" ? current.amount : -current.amount;
      const updatePoints =
        kind === "charge"
          ? database
              .prepare(
                `UPDATE users
                 SET points = points + ?, updated_at = CURRENT_TIMESTAMP
                 WHERE id = ? AND active = 1 AND points <= ?`,
              )
              .bind(current.amount, current.userId, MAX_POINTS - current.amount)
          : database
              .prepare(
                `UPDATE users
                 SET points = points - ?, updated_at = CURRENT_TIMESTAMP
                 WHERE id = ? AND active = 1 AND points >= ?`,
              )
              .bind(current.amount, current.userId, current.amount);
      const balanceGuard = database
        .prepare(
          `UPDATE wallet_processing_guards
           SET balance_guard = CASE WHEN changes() = 1 THEN 1 ELSE 0 END
           WHERE request_type = ? AND request_id = ?`,
        )
        .bind(kind, id);
      const ledger = database
        .prepare(
          `INSERT INTO wallet_ledger (
             id, request_type, request_id, user_id, delta, balance_after,
             admin_username
           )
           SELECT ?, ?, ?, u.id, ?, u.points, ?
           FROM users u
           WHERE u.id = ?`,
        )
        .bind(
          crypto.randomUUID(),
          kind,
          id,
          delta,
          adminUsername.slice(0, 128),
          current.userId,
        );
      await database.batch([
        transition,
        transitionGuard,
        updatePoints,
        balanceGuard,
        ledger,
        audit,
      ]);
    }
  } catch (error) {
    if (looksLikeWalletConflict(error)) {
      const latest = await readAdminWalletRequest(kind, id, database);
      if (!latest || latest.status !== "requested") {
        throw new AdminApiError(409, "이미 처리된 요청입니다.");
      }
      const user = await database
        .prepare("SELECT points, active FROM users WHERE id = ? LIMIT 1")
        .bind(current.userId)
        .first<{ points: number; active: number }>();
      if (!user?.active) {
        throw new AdminApiError(409, "활성 회원 계정이 아닙니다.");
      }
      if (kind === "withdrawal" && Number(user.points) < current.amount) {
        throw new AdminApiError(409, "회원의 보유 포인트가 부족합니다.");
      }
      if (
        kind === "charge" &&
        Number(user.points) > MAX_POINTS - current.amount
      ) {
        throw new AdminApiError(409, "포인트 상한을 초과할 수 없습니다.");
      }
      throw new AdminApiError(
        409,
        "다른 처리와 충돌했습니다. 최신 상태를 확인해 주세요.",
      );
    }
    throw error;
  }

  const updated = await readAdminWalletRequest(kind, id, database);
  if (!updated) {
    throw new AdminApiError(500, "처리된 요청을 불러오지 못했습니다.");
  }
  return updated;
}

function validateWalletRequest(input: unknown):
  | {
      kind: "charge";
      amount: number;
      depositorName: string;
    }
  | {
      kind: "withdrawal";
      amount: number;
      bankName: string;
      accountNumber: string;
      accountHolder: string;
    } {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new WalletInputError("요청 형식이 올바르지 않습니다.");
  }
  const value = input as Record<string, unknown>;
  const kind = value.kind;
  const amount = Number(value.amount);
  if (
    !Number.isSafeInteger(amount) ||
    amount < MIN_WALLET_REQUEST_AMOUNT ||
    amount > MAX_WALLET_REQUEST_AMOUNT
  ) {
    throw new WalletInputError(
      `금액은 ${MIN_WALLET_REQUEST_AMOUNT.toLocaleString("ko-KR")}원부터 ${MAX_WALLET_REQUEST_AMOUNT.toLocaleString("ko-KR")}원까지 입력해 주세요.`,
    );
  }
  if (kind === "charge") {
    return {
      kind,
      amount,
      depositorName: normalizeText(value.depositorName, "입금자명", 80, true),
    };
  }
  if (kind === "withdrawal") {
    const accountNumber = normalizeText(
      value.accountNumber,
      "계좌번호",
      80,
      true,
    );
    if (
      !accountNumberPattern.test(accountNumber) ||
      accountNumber.replace(/[^0-9A-Za-z]/gu, "").length < 4
    ) {
      throw new WalletInputError("계좌번호 형식을 확인해 주세요.");
    }
    return {
      kind,
      amount,
      bankName: normalizeText(value.bankName, "은행명", 80, true),
      accountNumber,
      accountHolder: normalizeText(value.accountHolder, "예금주", 80, true),
    };
  }
  throw new WalletInputError("충전 또는 출금 종류를 확인해 주세요.");
}

async function enforceWalletRequestRateLimit(
  userId: string,
  kind: WalletRequestKind,
  database: D1Database,
): Promise<void> {
  const windowStart = Math.floor(Date.now() / REQUEST_RATE_WINDOW_MS);
  const result = await database
    .prepare(
      `INSERT INTO wallet_request_rate_limits (
         user_id, request_type, window_start, attempts, updated_at
       ) VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP)
       ON CONFLICT(user_id, request_type, window_start) DO UPDATE SET
         attempts = wallet_request_rate_limits.attempts + 1,
         updated_at = CURRENT_TIMESTAMP
       RETURNING attempts`,
    )
    .bind(userId, kind, windowStart)
    .first<{ attempts: number }>();
  if (Math.random() < 0.02) {
    await database
      .prepare(
        "DELETE FROM wallet_request_rate_limits WHERE window_start < ?",
      )
      .bind(windowStart - 48)
      .run()
      .catch(() => undefined);
  }
  if (Number(result?.attempts ?? 1) > MAX_REQUESTS_PER_WINDOW) {
    const elapsed = Date.now() - windowStart * REQUEST_RATE_WINDOW_MS;
    throw new WalletInputError(
      "신청 횟수가 너무 많습니다. 잠시 후 다시 시도해 주세요.",
      429,
      Math.max(1, Math.ceil((REQUEST_RATE_WINDOW_MS - elapsed) / 1_000)),
    );
  }
}

async function readAdminWalletRequest(
  kind: WalletRequestKind,
  id: string,
  database: D1Database,
): Promise<WalletRequest | null> {
  if (kind === "charge") {
    const row = await database
      .prepare(
        `SELECT cr.id, cr.user_id, COALESCE(u.login_id, '') AS login_id,
                COALESCE(u.name, '') AS member_name,
                COALESCE(u.nickname, '') AS member_nickname,
                COALESCE(u.phone, '') AS member_phone,
                COALESCE(u.points, 0) AS member_points, cr.amount,
                cr.depositor_name, cr.status, cr.admin_memo,
                cr.created_at, cr.updated_at
         FROM charge_requests cr
         LEFT JOIN users u ON u.id = cr.user_id
         WHERE cr.id = ?
         LIMIT 1`,
      )
      .bind(id)
      .first<ChargeRow>();
    return row ? (parseChargeRow(row)[0] ?? null) : null;
  }
  const row = await database
    .prepare(
      `SELECT wr.id, wr.user_id, COALESCE(u.login_id, '') AS login_id,
              COALESCE(u.name, '') AS member_name,
              COALESCE(u.nickname, '') AS member_nickname,
              COALESCE(u.phone, '') AS member_phone,
              COALESCE(u.points, 0) AS member_points,
              wr.amount, wr.bank_name,
              wr.account_number, wr.account_holder, wr.status, wr.admin_memo,
              wr.created_at, wr.updated_at
       FROM withdrawal_requests wr
       LEFT JOIN users u ON u.id = wr.user_id
       WHERE wr.id = ?
       LIMIT 1`,
    )
    .bind(id)
    .first<WithdrawalRow>();
  return row ? (parseWithdrawalRow(row)[0] ?? null) : null;
}

function parseChargeRow(row: ChargeRow): WalletRequest[] {
  const status = parseWalletStatus(row.status);
  if (!status) return [];
  return [
    {
      id: row.id,
      kind: "charge",
      userId: row.user_id,
      loginId: row.login_id ?? "",
      memberName: row.member_name ?? "",
      memberNickname: row.member_nickname ?? "",
      memberPhone: row.member_phone ?? "",
      memberPoints: Math.max(0, Math.trunc(Number(row.member_points) || 0)),
      amount: Number(row.amount),
      status,
      depositorName: row.depositor_name,
      bankName: "",
      accountNumber: "",
      accountHolder: "",
      adminMemo: row.admin_memo,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
  ];
}

function parseWithdrawalRow(row: WithdrawalRow): WalletRequest[] {
  const status = parseWalletStatus(row.status);
  if (!status) return [];
  return [
    {
      id: row.id,
      kind: "withdrawal",
      userId: row.user_id,
      loginId: row.login_id ?? "",
      memberName: row.member_name ?? "",
      memberNickname: row.member_nickname ?? "",
      memberPhone: row.member_phone ?? "",
      memberPoints: Math.max(0, Math.trunc(Number(row.member_points) || 0)),
      amount: Number(row.amount),
      status,
      depositorName: "",
      bankName: row.bank_name,
      accountNumber: row.account_number,
      accountHolder: row.account_holder,
      adminMemo: row.admin_memo,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
  ];
}

function parseWalletStatus(value: string): WalletRequestStatus | null {
  return value === "requested" || value === "approved" || value === "rejected"
    ? value
    : null;
}

function normalizeText(
  value: unknown,
  label: string,
  maximumLength: number,
  required = false,
): string {
  if (value === undefined || value === null) {
    if (required) throw new WalletInputError(`${label}을 입력해 주세요.`);
    return "";
  }
  if (typeof value !== "string") {
    throw new WalletInputError(`${label} 형식이 올바르지 않습니다.`);
  }
  const text = value.replace(/\0/gu, "").trim();
  if (required && !text) {
    throw new WalletInputError(`${label}을 입력해 주세요.`);
  }
  if (text.length > maximumLength) {
    throw new WalletInputError(
      `${label}은 ${maximumLength.toLocaleString("ko-KR")}자 이하로 입력해 주세요.`,
    );
  }
  return text;
}

function maskAccountNumber(value: string): string {
  const compact = value.replace(/\s+/gu, "");
  if (compact.length <= 4) return "*".repeat(compact.length);
  return `${"*".repeat(Math.min(8, compact.length - 4))}${compact.slice(-4)}`;
}

function looksLikeWalletConflict(error: unknown): boolean {
  return (
    error instanceof Error &&
    /wallet_processing_guards|wallet_ledger|constraint|unique/iu.test(
      error.message,
    )
  );
}
