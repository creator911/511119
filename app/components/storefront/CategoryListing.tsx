"use client";

import { useMemo, useState, type ReactNode } from "react";
import styles from "./Storefront.module.css";
import type {
  BreadcrumbItem,
  NavigationItem,
  ProductSummary,
} from "./types";
import { ProductCard } from "./ProductCard";
import { EmptyState, PageHeading } from "./StorefrontPrimitives";
import { classNames } from "./utils";

export type ProductSort =
  | "recent"
  | "popular"
  | "price-low"
  | "price-high"
  | "rating"
  | "reviews";

const sortOptions: Array<{ value: ProductSort; label: string }> = [
  { value: "recent", label: "최근등록순" },
  { value: "popular", label: "판매많은순" },
  { value: "price-low", label: "낮은가격순" },
  { value: "price-high", label: "높은가격순" },
  { value: "rating", label: "평점높은순" },
  { value: "reviews", label: "후기많은순" },
];

export interface CategoryListingProps {
  title: string;
  pageTitle?: string;
  breadcrumbs?: BreadcrumbItem[];
  subcategories?: NavigationItem[];
  products: ProductSummary[];
  beforeToolbar?: ReactNode;
  initialSort?: ProductSort;
  initialView?: "grid" | "list";
  totalCount?: number;
  page?: number;
  pageCount?: number;
  pageHrefPrefix?: string;
  pageHrefs?: Partial<Record<number, string>>;
  onSortChange?: (sort: ProductSort) => void;
  sortHrefs?: Partial<Record<ProductSort, string>>;
  showListToolbar?: boolean;
}

export function CategoryListing({
  title,
  pageTitle,
  breadcrumbs = [
    { label: "Home", href: "/shop" },
    { label: pageTitle ?? title },
  ],
  subcategories = [],
  products,
  beforeToolbar,
  initialSort = "recent",
  initialView = "grid",
  totalCount = products.length,
  page = 1,
  pageCount = 1,
  pageHrefPrefix = "",
  pageHrefs,
  onSortChange,
  sortHrefs,
  showListToolbar = true,
}: CategoryListingProps) {
  const [sort, setSort] = useState<ProductSort>(initialSort);
  const [view, setView] = useState<"grid" | "list">(initialView);
  const pageHref = (targetPage: number) =>
    pageHrefs?.[targetPage] ??
    `${pageHrefPrefix}${pageHrefPrefix.includes("?") ? "&" : "?"}page=${targetPage}`;

  const sortedProducts = useMemo(() => {
    if (sortHrefs) return products;
    const copy = [...products];
    if (sort === "price-low") copy.sort((a, b) => a.price - b.price);
    if (sort === "price-high") copy.sort((a, b) => b.price - a.price);
    if (sort === "popular")
      copy.sort(
        (a, b) =>
          Number(b.badgeTone === "popular") - Number(a.badgeTone === "popular") ||
          (b.reviewCount ?? 0) - (a.reviewCount ?? 0) ||
          (b.rating ?? 0) - (a.rating ?? 0) ||
          Number(b.id) - Number(a.id),
      );
    if (sort === "rating")
      copy.sort(
        (a, b) =>
          (b.rating ?? 0) - (a.rating ?? 0) ||
          (b.reviewCount ?? 0) - (a.reviewCount ?? 0) ||
          Number(b.id) - Number(a.id),
      );
    if (sort === "reviews")
      copy.sort(
        (a, b) =>
          (b.reviewCount ?? 0) - (a.reviewCount ?? 0) ||
          (b.rating ?? 0) - (a.rating ?? 0) ||
          Number(b.id) - Number(a.id),
      );
    if (sort === "recent")
      copy.sort((a, b) => Number(b.id) - Number(a.id));
    return copy;
  }, [products, sort, sortHrefs]);

  function updateSort(value: ProductSort) {
    setSort(value);
    onSortChange?.(value);
  }

  return (
    <>
      <PageHeading title={pageTitle ?? title} breadcrumbs={breadcrumbs} />
      <main id="main-content" className={classNames(styles.container, styles.categoryPage)}>
        {subcategories.length > 0 ? (
          <nav className={styles.subcategoryNav} aria-label={`${title} 하위 분류`}>
            <a href="/shop" className={styles.subcategoryHome}>
              상점 메인
            </a>
            {subcategories.map((category) => (
              <a href={category.href} key={category.id}>
                {category.label}
              </a>
            ))}
          </nav>
        ) : null}

        {beforeToolbar}

        {showListToolbar ? (
          <div className={styles.listToolbar}>
            <span className={styles.productCount}>
              상품 <strong>{totalCount.toLocaleString("ko-KR")}</strong>개
            </span>
            <div className={styles.sortButtons} aria-label="상품 정렬">
              {sortOptions.map((option) =>
                sortHrefs?.[option.value] ? (
                  <a
                    key={option.value}
                    href={sortHrefs[option.value]}
                    aria-current={sort === option.value ? "page" : undefined}
                    className={
                      sort === option.value ? styles.sortActive : undefined
                    }
                  >
                    {option.label}
                  </a>
                ) : (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => updateSort(option.value)}
                    className={
                      sort === option.value ? styles.sortActive : undefined
                    }
                  >
                    {option.label}
                  </button>
                ),
              )}
            </div>
            <label className={styles.mobileSort}>
              <span className={styles.srOnly}>상품 정렬</span>
              <select
                value={sort}
                onChange={(event) => {
                  const nextSort = event.target.value as ProductSort;
                  const href = sortHrefs?.[nextSort];
                  if (href) {
                    window.location.assign(href);
                    return;
                  }
                  updateSort(nextSort);
                }}
              >
                {sortOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <div className={styles.viewButtons}>
              <button
                type="button"
                onClick={() => setView("list")}
                className={view === "list" ? styles.viewActive : undefined}
                aria-label="리스트뷰"
                title="리스트뷰"
              >
                ≡
              </button>
              <button
                type="button"
                onClick={() => setView("grid")}
                className={view === "grid" ? styles.viewActive : undefined}
                aria-label="갤러리뷰"
                title="갤러리뷰"
              >
                ▦
              </button>
            </div>
          </div>
        ) : null}

        {sortedProducts.length > 0 ? (
          <div
            className={classNames(
              styles.productGrid,
              view === "list" && styles.productListView,
            )}
          >
            {sortedProducts.map((product) => (
              <ProductCard product={product} key={product.id} layout={view} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="등록된 상품이 없습니다."
            description="새로운 상품을 준비하고 있습니다."
          />
        )}

        {pageCount > 1 ? (
          <nav className={styles.pagination} aria-label="상품 목록 페이지">
            {page > 1 ? (
              <a href={pageHref(page - 1)} aria-label="이전 페이지">
                ‹
              </a>
            ) : null}
            {Array.from({ length: pageCount }, (_, index) => index + 1).map(
              (pageNumber) => (
                <a
                  key={pageNumber}
                  href={pageHref(pageNumber)}
                  aria-current={pageNumber === page ? "page" : undefined}
                >
                  {pageNumber}
                  <span className={styles.srOnly}> 페이지</span>
                </a>
              ),
            )}
            {page < pageCount ? (
              <a href={pageHref(page + 1)} aria-label="다음 페이지">
                ›
              </a>
            ) : null}
          </nav>
        ) : null}
      </main>
    </>
  );
}
