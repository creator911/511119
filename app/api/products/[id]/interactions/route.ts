import { NextResponse } from "next/server";
import { commerceDb, ensureCommerceSchema } from "@/lib/commerce-db";
import { getCustomerSession } from "@/lib/customer-auth";
import { getEffectiveProduct } from "@/lib/admin-products";
import {
  HttpBoundaryError,
  isJsonObject,
  readBoundedJson,
} from "@/lib/http-boundary";

interface RouteContext {
  params: Promise<{ id: string }>;
}

interface InteractionBody {
  kind?: string;
  title?: string;
  body?: string;
  rating?: number;
}

interface InteractionRow {
  id: string;
  kind: "review" | "question";
  author_name: string;
  title: string;
  body: string;
  rating: number;
  answer: string;
  created_at: string;
}

const INTERACTION_RATE_WINDOW_MS = 60 * 60 * 1_000;
const MAX_INTERACTIONS_PER_WINDOW = 10;

export async function GET(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    const { id } = await context.params;
    const product = await getEffectiveProduct(id);
    if (!product?.active) {
      return NextResponse.json(
        { error: "상품을 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    await ensureCommerceSchema();
    const url = new URL(request.url);
    const kind =
      url.searchParams.get("kind") === "review" ||
      url.searchParams.get("kind") === "question"
        ? url.searchParams.get("kind")
        : null;
    const pageSize = boundedInteger(
      url.searchParams.get("pageSize"),
      10,
      1,
      30,
    );
    const requestedPage = boundedInteger(
      url.searchParams.get("page"),
      1,
      1,
      100_000,
    );
    const query = (url.searchParams.get("q") ?? "")
      .replace(/\0/gu, "")
      .trim()
      .slice(0, 80);
    const pattern = `%${query.replace(/[\\%_]/gu, (value) => `\\${value}`)}%`;
    const kindClause = kind ? " AND kind = ?" : "";
    const searchClause = query
      ? " AND (title LIKE ? ESCAPE '\\' OR body LIKE ? ESCAPE '\\')"
      : "";
    const bindings = [
      id,
      ...(kind ? [kind] : []),
      ...(query ? [pattern, pattern] : []),
    ];
    const database = commerceDb();
    const count = await database
      .prepare(
        `SELECT COUNT(*) AS count
         FROM product_interactions
         WHERE product_id = ? AND active = 1${kindClause}${searchClause}`,
      )
      .bind(...bindings)
      .first<{ count: number }>();
    const total = Number(count?.count ?? 0);
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(requestedPage, pageCount);
    const result = await database
      .prepare(
        `SELECT id, kind, author_name, title, body, rating, answer, created_at
         FROM product_interactions
         WHERE product_id = ? AND active = 1${kindClause}${searchClause}
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`,
      )
      .bind(...bindings, pageSize, (page - 1) * pageSize)
      .all<InteractionRow>();

    return NextResponse.json({
      items: (result.results ?? []).map((item) => ({
        id: item.id,
        kind: item.kind,
        authorName: maskName(item.author_name),
        title: item.title,
        body: item.body,
        rating: Number(item.rating),
        answer: item.answer,
        createdAt: item.created_at,
      })),
      pagination: {
        page,
        pageSize,
        pageCount,
        total,
      },
    });
  } catch {
    return NextResponse.json(
      { error: "후기·문의 정보를 불러오지 못했습니다." },
      { status: 500 },
    );
  }
}

function boundedInteger(
  value: string | null,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.min(maximum, Math.max(minimum, Math.trunc(parsed)))
    : fallback;
}

export async function POST(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    if (!isSameOrigin(request)) {
      return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
    }
    const session = await getCustomerSession(request);
    if (!session) {
      return NextResponse.json(
        { error: "로그인 후 작성할 수 있습니다." },
        { status: 401 },
      );
    }

    const { id } = await context.params;
    const product = await getEffectiveProduct(id);
    if (!product?.active) {
      return NextResponse.json(
        { error: "상품을 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    const payload = await readBoundedJson<unknown>(request, 16_384);
    if (!isJsonObject(payload) || !isInteractionBody(payload)) {
      return NextResponse.json(
        { error: "후기·문의 요청 형식을 확인해 주세요." },
        { status: 400 },
      );
    }
    const kind =
      payload.kind === "review" || payload.kind === "question"
        ? payload.kind
        : null;
    const title = payload.title?.trim() ?? "";
    const body = payload.body?.trim() ?? "";
    const rating =
      kind === "review" ? Math.round(Number(payload.rating ?? 5)) : 0;
    if (
      !kind ||
      title.length < 2 ||
      title.length > 120 ||
      body.length < 5 ||
      body.length > 5_000 ||
      (kind === "review" && (rating < 1 || rating > 5))
    ) {
      return NextResponse.json(
        { error: "제목, 내용과 평점을 확인해 주세요." },
        { status: 400 },
      );
    }

    await ensureCommerceSchema();
    const database = commerceDb();
    const windowStart = Math.floor(Date.now() / INTERACTION_RATE_WINDOW_MS);
    const rate = await database
      .prepare(
        `INSERT INTO product_interaction_rate_limits (
           user_id, window_start, attempts, updated_at
         ) VALUES (?, ?, 1, CURRENT_TIMESTAMP)
         ON CONFLICT(user_id, window_start) DO UPDATE SET
           attempts = product_interaction_rate_limits.attempts + 1,
           updated_at = CURRENT_TIMESTAMP
         RETURNING attempts`,
      )
      .bind(session.userId, windowStart)
      .first<{ attempts: number }>();
    if (Math.random() < 0.02) {
      await database
        .prepare(
          "DELETE FROM product_interaction_rate_limits WHERE window_start < ?",
        )
        .bind(windowStart - 168)
        .run()
        .catch(() => undefined);
    }
    if (Number(rate?.attempts ?? 1) > MAX_INTERACTIONS_PER_WINDOW) {
      const elapsed = Date.now() - windowStart * INTERACTION_RATE_WINDOW_MS;
      return NextResponse.json(
        { error: "후기·문의 작성 횟수를 초과했습니다. 잠시 후 다시 시도해 주세요." },
        {
          status: 429,
          headers: {
            "Retry-After": Math.max(
              1,
              Math.ceil((INTERACTION_RATE_WINDOW_MS - elapsed) / 1_000),
            ).toString(),
          },
        },
      );
    }
    if (kind === "review") {
      const purchase = await database
        .prepare(
          `SELECT 1
           FROM orders o
           INNER JOIN order_items oi ON oi.order_id = o.id
           WHERE o.user_id = ? AND oi.product_id = ?
             AND o.payment_status = 'paid'
             AND o.status IN ('shipped', 'delivered')
           LIMIT 1`,
        )
        .bind(session.userId, id)
        .first<{ "1": number }>();
      if (!purchase) {
        return NextResponse.json(
          { error: "구매 내역이 있는 회원만 후기를 작성할 수 있습니다." },
          { status: 403 },
        );
      }
      const existingReview = await database
        .prepare(
          `SELECT 1
           FROM product_interactions
           WHERE user_id = ? AND product_id = ? AND kind = 'review'
           LIMIT 1`,
        )
        .bind(session.userId, id)
        .first<{ "1": number }>();
      if (existingReview) {
        return NextResponse.json(
          { error: "이 상품에는 후기를 한 번만 작성할 수 있습니다." },
          { status: 409 },
        );
      }
    }

    const interactionId = crypto.randomUUID();
    await database
      .prepare(
        `INSERT INTO product_interactions (
          id, product_id, user_id, kind, author_name, title, body, rating
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        interactionId,
        id,
        session.userId,
        kind,
        session.name.slice(0, 80),
        title,
        body,
        rating,
      )
      .run();

    return NextResponse.json({ ok: true, id: interactionId }, { status: 201 });
  } catch (cause) {
    if (cause instanceof HttpBoundaryError) {
      return NextResponse.json(
        {
          error:
            cause.status === 413
              ? "작성 내용이 너무 큽니다."
              : cause.status === 415
                ? "JSON 형식의 요청만 사용할 수 있습니다."
                : "요청 내용을 확인해 주세요.",
        },
        { status: cause.status },
      );
    }
    const message = cause instanceof Error ? cause.message : "";
    if (
      /product_interactions_review_user_product_uq|unique constraint/iu.test(
        message,
      )
    ) {
      return NextResponse.json(
        { error: "이 상품에는 후기를 한 번만 작성할 수 있습니다." },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: "후기·문의를 등록하지 못했습니다." },
      { status: 500 },
    );
  }
}

function maskName(name: string): string {
  if (name.length <= 1) return `${name}*`;
  return `${name.slice(0, 1)}${"*".repeat(Math.min(3, name.length - 1))}`;
}

function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

function isInteractionBody(
  value: Record<string, unknown>,
): value is Record<string, unknown> & InteractionBody {
  for (const field of ["kind", "title", "body"]) {
    if (value[field] !== undefined && typeof value[field] !== "string") {
      return false;
    }
  }
  return value.rating === undefined || typeof value.rating === "number";
}
