import type { SortableStorefrontProduct } from "./storefront-sort";

export type StorefrontSearchField =
  | "name"
  | "explanation"
  | "basic"
  | "id";

export interface SearchableStorefrontProduct
  extends SortableStorefrontProduct {
  active: boolean;
  categoryId: string;
  name: string;
  basic?: string;
  detailHtml?: string;
}

export interface StorefrontSearchFilters {
  query: string;
  fields: readonly StorefrontSearchField[];
  minimumPrice?: number;
  maximumPrice?: number;
  categoryIds?: ReadonlySet<string>;
}

const allSearchFields: readonly StorefrontSearchField[] = [
  "name",
  "explanation",
  "basic",
  "id",
];

function searchableText(
  product: SearchableStorefrontProduct,
  fields: readonly StorefrontSearchField[],
): string {
  const values: string[] = [];
  for (const field of fields.length ? fields : allSearchFields) {
    if (field === "name") values.push(product.name);
    if (field === "explanation") {
      values.push(String(product.detailHtml ?? "").replace(/<[^>]*>/gu, " "));
    }
    if (field === "basic") values.push(product.basic ?? "");
    if (field === "id") values.push(product.id);
  }
  return values.join(" ").toLocaleLowerCase("ko-KR");
}

export function filterStorefrontProducts<
  Product extends SearchableStorefrontProduct,
>(
  products: readonly Product[],
  filters: StorefrontSearchFilters,
): Product[] {
  const terms = filters.query
    .trim()
    .toLocaleLowerCase("ko-KR")
    .split(/\s+/u)
    .filter(Boolean);
  const minimumPrice =
    typeof filters.minimumPrice === "number" &&
    Number.isFinite(filters.minimumPrice)
      ? Math.max(0, filters.minimumPrice)
      : undefined;
  const maximumPrice =
    typeof filters.maximumPrice === "number" &&
    Number.isFinite(filters.maximumPrice)
      ? Math.max(0, filters.maximumPrice)
      : undefined;

  return products.filter((product) => {
    if (!product.active) return false;
    if (
      filters.categoryIds?.size &&
      !filters.categoryIds.has(product.categoryId)
    ) {
      return false;
    }
    if (minimumPrice !== undefined && product.price < minimumPrice) return false;
    if (maximumPrice !== undefined && product.price > maximumPrice) return false;
    if (!terms.length) return true;

    const haystack = searchableText(product, filters.fields);
    return terms.every((term) => haystack.includes(term));
  });
}
