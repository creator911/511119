import type { Metadata } from "next";
import { CategoryListing } from "@/app/components/storefront";
import { SiteFrame } from "@/app/components/SiteFrame";
import {
  toProductSummary,
} from "@/lib/catalog";
import {
  findCategory,
  getCategoryTreeIdsFromSnapshot,
  getPublicCategories,
  getSubcategoriesFromSnapshot,
} from "@/lib/categories";
import {
  categoryListHref,
  readStorefrontProductSort,
  sortStorefrontProducts,
  type StorefrontProductSort,
} from "@/lib/storefront-sort";
import { getStorefrontProducts } from "@/lib/storefront-products";

export const metadata: Metadata = { title: "상품목록" };
export const dynamic = "force-dynamic";

export default async function CategoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const categoryId = firstParam(params.ca_id) || "10";
  const requestedPage = Math.max(1, Number(params.page ?? 1) || 1);
  const selectedSort = readStorefrontProductSort(
    String(params.sort ?? ""),
    String(params.sortodr ?? ""),
  );
  const [categorySnapshot, storefrontProducts] = await Promise.all([
    getPublicCategories(),
    getStorefrontProducts(),
  ]);
  const category = findCategory(categorySnapshot, categoryId);
  const categoryIds = new Set(
    category
      ? getCategoryTreeIdsFromSnapshot(categorySnapshot, categoryId)
      : [],
  );
  const allProducts = sortStorefrontProducts(
    storefrontProducts.filter(
      (product) => product.active && categoryIds.has(product.categoryId),
    ),
    selectedSort,
  );
  const pageSize = 15;
  const pageCount = Math.max(1, Math.ceil(allProducts.length / pageSize));
  const page = Math.min(requestedPage, pageCount);
  const visible = allProducts.slice((page - 1) * pageSize, page * pageSize);

  return (
    <SiteFrame categorySnapshot={categorySnapshot}>
      <CategoryListing
        title={category?.name ?? "상품"}
        products={visible.map(toProductSummary)}
        subcategories={getSubcategoriesFromSnapshot(
          categorySnapshot,
          categoryId,
        ).map((item) => ({
          id: item.id,
          label: item.name,
          href: `/shop/list.php?ca_id=${encodeURIComponent(item.id)}`,
        }))}
        totalCount={allProducts.length}
        page={page}
        pageCount={pageCount}
        initialSort={selectedSort}
        sortHrefs={buildSortHrefs(categoryId, page)}
        pageHrefs={buildPageHrefs(categoryId, selectedSort, pageCount)}
      />
    </SiteFrame>
  );
}

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? String(value[0] ?? "") : String(value ?? "");
}

function buildPageHrefs(
  categoryId: string,
  sort: StorefrontProductSort,
  pageCount: number,
): Record<number, string> {
  return Object.fromEntries(
    Array.from({ length: pageCount }, (_, index) => {
      const page = index + 1;
      return [page, categoryListHref(categoryId, sort, page)];
    }),
  ) as Record<number, string>;
}

function buildSortHrefs(
  categoryId: string,
  page: number,
): Record<StorefrontProductSort, string> {
  const sorts: StorefrontProductSort[] = [
    "recent",
    "popular",
    "price-low",
    "price-high",
    "rating",
    "reviews",
  ];
  return Object.fromEntries(
    sorts.map((sort) => [sort, categoryListHref(categoryId, sort, page)]),
  ) as Record<StorefrontProductSort, string>;
}
