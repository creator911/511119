import {
  getAdminProductRecords,
  getEffectiveProduct,
  type AdminProductRecord,
  type ManagedCatalogProduct,
} from "@/lib/admin-products";
import { releaseExpiredOrderReservations } from "@/lib/order-safety";
import { commerceDb, ensureCommerceSchema } from "@/lib/commerce-db";
import { getProductOptionRows } from "@/lib/product-options";

type InteractionStats = {
  rating: number;
  reviewCount: number;
  questionCount: number;
};

export async function getStorefrontProducts(
  options: { strict?: boolean } = {},
): Promise<ManagedCatalogProduct[]> {
  const records = await getStorefrontProductRecords(options);
  const products = records.map((record) => record.product);
  const enriched = await attachInteractionStats(products, options.strict);
  return attachOptionAvailability(enriched, options.strict);
}

export async function getStorefrontProductRecords(
  options: { strict?: boolean } = {},
): Promise<AdminProductRecord[]> {
  try {
    await releaseExpiredOrderReservations();
  } catch (error) {
    if (options.strict) throw error;
  }
  return getAdminProductRecords({ strict: options.strict });
}

export async function getStorefrontProduct(
  id: string | null | undefined,
  options: { strict?: boolean } = {},
): Promise<ManagedCatalogProduct | undefined> {
  try {
    await releaseExpiredOrderReservations();
  } catch (error) {
    if (options.strict) throw error;
  }
  const product = await getEffectiveProduct(id, { strict: options.strict });
  if (!product) return undefined;
  const [enriched] = await attachInteractionStats([product], options.strict);
  const [available] = await attachOptionAvailability(
    [enriched],
    options.strict,
  );
  return available;
}

async function attachOptionAvailability(
  products: ManagedCatalogProduct[],
  strict = false,
): Promise<ManagedCatalogProduct[]> {
  if (!products.length) return products;
  try {
    await ensureCommerceSchema();
    const rows = await getProductOptionRows(
      products.map((product) => product.id),
      { database: commerceDb() },
    );
    const availability = new Map<string, Map<string, boolean>>();
    for (const row of rows) {
      const groups =
        availability.get(row.productId) ?? new Map<string, boolean>();
      groups.set(
        row.optionName,
        Boolean(groups.get(row.optionName)) ||
          (row.saleEnabled && !row.soldOut && row.stock > 0),
      );
      availability.set(row.productId, groups);
    }
    return products.map((product) => {
      const groups = availability.get(product.id);
      if (!groups?.size) return product;
      const optionUnavailable = [...groups.values()].some(
        (available) => !available,
      );
      return optionUnavailable
        ? { ...product, soldOut: true }
        : product;
    });
  } catch (error) {
    if (strict) throw error;
    return products;
  }
}

async function attachInteractionStats(
  products: ManagedCatalogProduct[],
  strict = false,
): Promise<ManagedCatalogProduct[]> {
  if (products.length === 0) return products;
  try {
    await ensureCommerceSchema();
    const result = await commerceDb()
      .prepare(
        `SELECT product_id,
                SUM(CASE WHEN kind = 'review' THEN 1 ELSE 0 END) AS review_count,
                SUM(CASE WHEN kind = 'question' THEN 1 ELSE 0 END) AS question_count,
                COALESCE(AVG(CASE WHEN kind = 'review' THEN rating END), 0) AS rating
         FROM product_interactions
         WHERE active = 1
         GROUP BY product_id`,
      )
      .all<{
        product_id: string;
        review_count: number;
        question_count: number;
        rating: number;
      }>();
    const stats = new Map<string, InteractionStats>(
      (result.results ?? []).map((row) => [
        row.product_id,
        {
          rating: Number(row.rating) || 0,
          reviewCount: Number(row.review_count) || 0,
          questionCount: Number(row.question_count) || 0,
        },
      ]),
    );
    return products.map((product) =>
      Object.assign({}, product, stats.get(product.id) ?? {
        rating: 0,
        reviewCount: 0,
        questionCount: 0,
      }),
    );
  } catch (error) {
    if (strict) throw error;
    return products;
  }
}
