import { commerceDb, ensureCommerceSchema } from "@/lib/commerce-db";
import { getCustomerSession } from "@/lib/customer-auth";
import {
  HttpBoundaryError,
  isJsonObject,
  noStoreJson,
  readBoundedJson,
} from "@/lib/http-boundary";
import { toProductSummary } from "@/lib/catalog";
import { getStorefrontProduct } from "@/lib/storefront-products";

const MAX_BODY_BYTES = 8_192;
const MAX_WISHLIST_ITEMS = 500;
const productIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u;

export async function GET(request: Request) {
  const session = await getCustomerSession(request);
  if (!session) {
    return noStoreJson({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  try {
    await ensureCommerceSchema();
    const result = await commerceDb()
      .prepare(
        `SELECT product_id
         FROM wishlist_items
         WHERE owner_key = ?
         ORDER BY created_at DESC, id DESC
         LIMIT ?`,
      )
      .bind(session.userId, MAX_WISHLIST_ITEMS)
      .all<{ product_id: string }>();
    const productIds = (result.results ?? []).map((row) => row.product_id);
    const products = (
      await Promise.all(
        productIds.slice(0, 3).map((productId) =>
          getStorefrontProduct(productId),
        ),
      )
    ).flatMap((product) =>
      product?.active ? [toProductSummary(product)] : [],
    );
    return noStoreJson({ productIds, products });
  } catch {
    return noStoreJson(
      { error: "위시리스트를 불러오지 못했습니다." },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  return updateWishlist(request, true);
}

export async function DELETE(request: Request) {
  return updateWishlist(request, false);
}

async function updateWishlist(request: Request, add: boolean) {
  if (!isSameOrigin(request)) {
    return noStoreJson({ error: "요청을 확인해 주세요." }, { status: 403 });
  }
  const session = await getCustomerSession(request);
  if (!session) {
    return noStoreJson({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  try {
    const payload = await readBoundedJson<unknown>(request, MAX_BODY_BYTES);
    if (
      !isJsonObject(payload) ||
      typeof payload.productId !== "string" ||
      !productIdPattern.test(payload.productId)
    ) {
      return noStoreJson(
        { error: "상품을 확인해 주세요." },
        { status: 400 },
      );
    }
    const productId = payload.productId;
    await ensureCommerceSchema();
    const database = commerceDb();
    if (add) {
      const product = await getStorefrontProduct(productId, { strict: true });
      if (!product?.active) {
        return noStoreJson(
          { error: "판매 중인 상품을 찾을 수 없습니다." },
          { status: 404 },
        );
      }
      const count = await database
        .prepare(
          "SELECT COUNT(*) AS count FROM wishlist_items WHERE owner_key = ?",
        )
        .bind(session.userId)
        .first<{ count: number }>();
      if (Number(count?.count ?? 0) >= MAX_WISHLIST_ITEMS) {
        return noStoreJson(
          { error: "위시리스트에는 최대 500개까지 저장할 수 있습니다." },
          { status: 409 },
        );
      }
      await database
        .prepare(
          `INSERT OR IGNORE INTO wishlist_items(owner_key, product_id)
           VALUES (?, ?)`,
        )
        .bind(session.userId, productId)
        .run();
    } else {
      await database
        .prepare(
          "DELETE FROM wishlist_items WHERE owner_key = ? AND product_id = ?",
        )
        .bind(session.userId, productId)
        .run();
    }
    return noStoreJson({ ok: true, wished: add });
  } catch (error) {
    if (error instanceof HttpBoundaryError) {
      return noStoreJson(
        { error: "요청을 확인해 주세요." },
        { status: error.status },
      );
    }
    return noStoreJson(
      { error: "위시리스트를 변경하지 못했습니다." },
      { status: 503 },
    );
  }
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
