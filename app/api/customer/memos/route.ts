import { checkAuthRateLimit } from "@/lib/auth-rate";
import { commerceDb, ensureCommerceSchema } from "@/lib/commerce-db";
import { getCustomerSession } from "@/lib/customer-auth";
import {
  HttpBoundaryError,
  isJsonObject,
  noStoreJson,
  readBoundedJson,
} from "@/lib/http-boundary";

interface MemoRow {
  id: string;
  sender_user_id: string;
  sender_login_id: string;
  sender_name: string;
  recipient_user_id: string;
  recipient_login_id: string;
  recipient_name: string;
  body: string;
  read_at: string | null;
  created_at: string;
}

const MAX_BODY_BYTES = 16_384;
const MAX_MEMO_LENGTH = 2_000;
const memoIdPattern = /^[0-9a-f-]{36}$/iu;
const loginIdPattern = /^[A-Za-z0-9_-]{4,30}$/u;

export async function GET(request: Request) {
  const session = await getCustomerSession(request);
  if (!session) {
    return noStoreJson({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  try {
    await ensureCommerceSchema();
    const database = commerceDb();
    const [inbox, sent] = await Promise.all([
      database
        .prepare(
          `${memoSelect()}
           WHERE memo.recipient_user_id = ? AND memo.recipient_deleted = 0
           ORDER BY memo.created_at DESC, memo.id DESC
           LIMIT 100`,
        )
        .bind(session.userId)
        .all<MemoRow>(),
      database
        .prepare(
          `${memoSelect()}
           WHERE memo.sender_user_id = ? AND memo.sender_deleted = 0
           ORDER BY memo.created_at DESC, memo.id DESC
           LIMIT 100`,
        )
        .bind(session.userId)
        .all<MemoRow>(),
    ]);
    return noStoreJson({
      inbox: (inbox.results ?? []).map((memo) => publicMemo(memo, "inbox")),
      sent: (sent.results ?? []).map((memo) => publicMemo(memo, "sent")),
    });
  } catch {
    return noStoreJson(
      { error: "쪽지함을 불러오지 못했습니다." },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  try {
    if (!isSameOrigin(request)) {
      return noStoreJson({ error: "잘못된 요청입니다." }, { status: 403 });
    }
    const session = await getCustomerSession(request);
    if (!session) {
      return noStoreJson({ error: "로그인이 필요합니다." }, { status: 401 });
    }
    const payload = await readBoundedJson<unknown>(request, MAX_BODY_BYTES);
    if (
      !isJsonObject(payload) ||
      typeof payload.recipientId !== "string" ||
      typeof payload.body !== "string"
    ) {
      return noStoreJson({ error: "쪽지 내용을 확인해 주세요." }, { status: 400 });
    }
    const recipientId = payload.recipientId.trim();
    const body = payload.body.trim();
    if (
      !loginIdPattern.test(recipientId) ||
      body.length < 1 ||
      body.length > MAX_MEMO_LENGTH
    ) {
      return noStoreJson(
        { error: "받는 회원아이디와 쪽지 내용을 확인해 주세요." },
        { status: 400 },
      );
    }

    await ensureCommerceSchema();
    const database = commerceDb();
    const rateLimit = await checkAuthRateLimit(
      request,
      "customer-memo-send",
      10 * 60 * 1_000,
      8,
      database,
    );
    if (rateLimit.limited) {
      return noStoreJson(
        { error: "쪽지를 너무 자주 보냈습니다. 잠시 후 다시 시도해 주세요." },
        {
          status: 429,
          headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
        },
      );
    }
    const recipient = await database
      .prepare(
        `SELECT id FROM users
         WHERE login_id = ? AND active = 1 LIMIT 1`,
      )
      .bind(recipientId)
      .first<{ id: string }>();
    if (!recipient) {
      return noStoreJson(
        { error: "받는 회원아이디를 찾을 수 없습니다." },
        { status: 404 },
      );
    }
    const id = crypto.randomUUID();
    await database
      .prepare(
        `INSERT INTO member_memos (
           id, sender_user_id, recipient_user_id, body
         ) VALUES (?, ?, ?, ?)`,
      )
      .bind(id, session.userId, recipient.id, body)
      .run();
    return noStoreJson({ ok: true, id }, { status: 201 });
  } catch (error) {
    if (error instanceof HttpBoundaryError) {
      return noStoreJson(
        { error: "쪽지 내용을 확인해 주세요." },
        { status: error.status },
      );
    }
    return noStoreJson(
      { error: "쪽지를 보내지 못했습니다." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  return updateMemo(request, "read");
}

export async function DELETE(request: Request) {
  return updateMemo(request, "delete");
}

async function updateMemo(request: Request, action: "read" | "delete") {
  try {
    if (!isSameOrigin(request)) {
      return noStoreJson({ error: "잘못된 요청입니다." }, { status: 403 });
    }
    const session = await getCustomerSession(request);
    if (!session) {
      return noStoreJson({ error: "로그인이 필요합니다." }, { status: 401 });
    }
    const payload = await readBoundedJson<unknown>(request, MAX_BODY_BYTES);
    if (
      !isJsonObject(payload) ||
      typeof payload.id !== "string" ||
      !memoIdPattern.test(payload.id) ||
      (payload.box !== undefined &&
        payload.box !== "inbox" &&
        payload.box !== "sent")
    ) {
      return noStoreJson({ error: "쪽지를 확인해 주세요." }, { status: 400 });
    }
    await ensureCommerceSchema();
    const database = commerceDb();
    if (action === "read") {
      const result = await database
        .prepare(
          `UPDATE member_memos
           SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
           WHERE id = ? AND recipient_user_id = ? AND recipient_deleted = 0`,
        )
        .bind(payload.id, session.userId)
        .run();
      if (!result.meta.changes) {
        return noStoreJson({ error: "쪽지를 찾을 수 없습니다." }, { status: 404 });
      }
      return noStoreJson({ ok: true });
    }

    const box = payload.box === "sent" ? "sent" : "inbox";
    const result =
      box === "sent"
        ? await database
            .prepare(
              `UPDATE member_memos SET sender_deleted = 1
               WHERE id = ? AND sender_user_id = ? AND sender_deleted = 0`,
            )
            .bind(payload.id, session.userId)
            .run()
        : await database
            .prepare(
              `UPDATE member_memos SET recipient_deleted = 1
               WHERE id = ? AND recipient_user_id = ? AND recipient_deleted = 0`,
            )
            .bind(payload.id, session.userId)
            .run();
    if (!result.meta.changes) {
      return noStoreJson({ error: "쪽지를 찾을 수 없습니다." }, { status: 404 });
    }
    await database
      .prepare(
        `DELETE FROM member_memos
         WHERE id = ? AND sender_deleted = 1 AND recipient_deleted = 1`,
      )
      .bind(payload.id)
      .run();
    return noStoreJson({ ok: true });
  } catch (error) {
    if (error instanceof HttpBoundaryError) {
      return noStoreJson(
        { error: "쪽지를 확인해 주세요." },
        { status: error.status },
      );
    }
    return noStoreJson(
      { error: "쪽지를 처리하지 못했습니다." },
      { status: 500 },
    );
  }
}

function memoSelect() {
  return `SELECT memo.id, memo.sender_user_id,
                 sender.login_id AS sender_login_id,
                 sender.name AS sender_name,
                 memo.recipient_user_id,
                 recipient.login_id AS recipient_login_id,
                 recipient.name AS recipient_name,
                 memo.body, memo.read_at, memo.created_at
          FROM member_memos memo
          JOIN users sender ON sender.id = memo.sender_user_id
          JOIN users recipient ON recipient.id = memo.recipient_user_id`;
}

function publicMemo(memo: MemoRow, box: "inbox" | "sent") {
  return {
    id: memo.id,
    counterpartId:
      box === "inbox" ? memo.sender_login_id : memo.recipient_login_id,
    counterpartName:
      box === "inbox" ? memo.sender_name : memo.recipient_name,
    body: memo.body,
    readAt: memo.read_at ?? "",
    createdAt: memo.created_at,
  };
}

function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}
