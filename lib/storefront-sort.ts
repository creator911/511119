export type StorefrontProductSort =
  | "recent"
  | "popular"
  | "price-low"
  | "price-high"
  | "rating"
  | "reviews";

export interface SortableStorefrontProduct {
  id: string;
  price: number;
  flags?: {
    popular?: boolean;
  };
  rating?: number;
  reviewCount?: number;
}

const sortQuery: Record<
  StorefrontProductSort,
  { field: string; direction: "asc" | "desc" }
> = {
  recent: { field: "it_update_time", direction: "desc" },
  popular: { field: "it_sum_qty", direction: "desc" },
  "price-low": { field: "it_price", direction: "asc" },
  "price-high": { field: "it_price", direction: "desc" },
  rating: { field: "it_use_avg", direction: "desc" },
  reviews: { field: "it_use_cnt", direction: "desc" },
};

const productSorts = new Set<StorefrontProductSort>(
  Object.keys(sortQuery) as StorefrontProductSort[],
);

function finiteMetric(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : -1;
}

function newestFirst(
  left: SortableStorefrontProduct,
  right: SortableStorefrontProduct,
): number {
  const leftNumber = Number(left.id);
  const rightNumber = Number(right.id);
  if (Number.isSafeInteger(leftNumber) && Number.isSafeInteger(rightNumber)) {
    return rightNumber - leftNumber;
  }
  return right.id.localeCompare(left.id, "ko-KR", {
    numeric: true,
    sensitivity: "base",
  });
}

function descendingMetric(left: unknown, right: unknown): number {
  return finiteMetric(right) - finiteMetric(left);
}

function popularFirst(
  left: SortableStorefrontProduct,
  right: SortableStorefrontProduct,
): number {
  return Number(Boolean(right.flags?.popular)) - Number(Boolean(left.flags?.popular));
}

export function sortStorefrontProducts<
  Product extends SortableStorefrontProduct,
>(
  products: readonly Product[],
  sort: StorefrontProductSort,
): Product[] {
  return [...products].sort((left, right) => {
    switch (sort) {
      case "popular":
        return (
          popularFirst(left, right) ||
          descendingMetric(left.reviewCount, right.reviewCount) ||
          descendingMetric(left.rating, right.rating) ||
          newestFirst(left, right)
        );
      case "price-low":
        return left.price - right.price || newestFirst(left, right);
      case "price-high":
        return right.price - left.price || newestFirst(left, right);
      case "rating":
        return (
          descendingMetric(left.rating, right.rating) ||
          descendingMetric(left.reviewCount, right.reviewCount) ||
          popularFirst(left, right) ||
          newestFirst(left, right)
        );
      case "reviews":
        return (
          descendingMetric(left.reviewCount, right.reviewCount) ||
          descendingMetric(left.rating, right.rating) ||
          popularFirst(left, right) ||
          newestFirst(left, right)
        );
      case "recent":
      default:
        return newestFirst(left, right);
    }
  });
}

export function readStorefrontProductSort(
  rawSort: string | null | undefined,
  rawDirection: string | null | undefined,
): StorefrontProductSort {
  const requestedSort = String(rawSort ?? "").trim();
  const direction = String(rawDirection ?? "desc").toLowerCase();

  if (productSorts.has(requestedSort as StorefrontProductSort)) {
    return requestedSort as StorefrontProductSort;
  }

  switch (requestedSort) {
    case "it_sum_qty":
      return "popular";
    case "it_price":
      return direction === "asc" ? "price-low" : "price-high";
    case "it_use_avg":
      return "rating";
    case "it_use_cnt":
      return "reviews";
    case "it_update_time":
    default:
      return "recent";
  }
}

export function storefrontProductSortQuery(sort: StorefrontProductSort): {
  field: string;
  direction: "asc" | "desc";
} {
  return sortQuery[sort];
}

export function categoryListHref(
  categoryId: string,
  sort: StorefrontProductSort,
  page: number,
): string {
  const query = storefrontProductSortQuery(sort);
  const params = new URLSearchParams({
    ca_id: categoryId,
    sort: query.field,
    sortodr: query.direction,
    page: String(Math.max(1, Math.trunc(page) || 1)),
  });
  return `/shop/list.php?${params.toString()}`;
}
