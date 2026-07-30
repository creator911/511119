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
} from "@/lib/categories";
import type { ManagedCategory } from "@/lib/category-contract";
import {
  filterStorefrontProducts,
  type StorefrontSearchField,
} from "@/lib/storefront-search";
import {
  readStorefrontProductSort,
  sortStorefrontProducts,
  storefrontProductSortQuery,
  type StorefrontProductSort,
} from "@/lib/storefront-sort";
import { getStorefrontProducts } from "@/lib/storefront-products";

export const metadata: Metadata = { title: "상품 검색 결과" };
export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

interface SearchState {
  query: string;
  fields: StorefrontSearchField[];
  minimumPrice?: number;
  maximumPrice?: number;
  categoryId: string;
}

interface CategoryResult {
  id: string;
  label: string;
  count: number;
}

const searchFields: Array<{
  id: StorefrontSearchField;
  name: string;
  label: string;
}> = [
  { id: "name", name: "qname", label: "상품명" },
  { id: "explanation", name: "qexplan", label: "상품설명" },
  { id: "basic", name: "qbasic", label: "기본설명" },
  { id: "id", name: "qid", label: "상품코드" },
];

const productSorts: StorefrontProductSort[] = [
  "recent",
  "popular",
  "price-low",
  "price-high",
  "rating",
  "reviews",
];

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const [categorySnapshot, products] = await Promise.all([
    getPublicCategories(),
    getStorefrontProducts(),
  ]);
  const state = readSearchState(params, categorySnapshot);
  const selectedSort = readStorefrontProductSort(
    firstParam(params.qsort) || firstParam(params.sort),
    firstParam(params.qorder) || firstParam(params.sortodr),
  );
  const requestedPage = positiveInteger(firstParam(params.page), 1);
  const baseMatches = filterStorefrontProducts(products, {
    query: state.query,
    fields: state.fields,
    minimumPrice: state.minimumPrice,
    maximumPrice: state.maximumPrice,
  });
  const categoryIds =
    state.categoryId && findCategory(categorySnapshot, state.categoryId)
      ? new Set(
          getCategoryTreeIdsFromSnapshot(
            categorySnapshot,
            state.categoryId,
          ),
        )
      : undefined;
  const matches = sortStorefrontProducts(
    filterStorefrontProducts(baseMatches, {
      query: "",
      fields: state.fields,
      categoryIds,
    }),
    selectedSort,
  );
  const pageSize = 15;
  const pageCount = Math.max(1, Math.ceil(matches.length / pageSize));
  const page = Math.min(requestedPage, pageCount);
  const visible = matches.slice((page - 1) * pageSize, page * pageSize);
  const categoryResults = summarizeCategories(baseMatches, categorySnapshot);
  const resultTitle = state.query
    ? `${state.query} 검색결과 (총 ${matches.length.toLocaleString("ko-KR")} 건)`
    : `전체 상품 검색결과 (총 ${matches.length.toLocaleString("ko-KR")} 건)`;

  return (
    <SiteFrame categorySnapshot={categorySnapshot}>
      <CategoryListing
        pageTitle="상품 검색 결과"
        title={resultTitle}
        breadcrumbs={[
          { label: "Home", href: "/shop" },
          { label: "상품 검색 결과" },
        ]}
        products={visible.map(toProductSummary)}
        totalCount={matches.length}
        page={page}
        pageCount={pageCount}
        initialSort={selectedSort}
        sortHrefs={buildSortHrefs(state, page)}
        pageHrefs={buildPageHrefs(state, selectedSort, pageCount)}
        beforeToolbar={
          <SearchControls
            state={state}
            selectedSort={selectedSort}
            totalCount={baseMatches.length}
            categoryResults={categoryResults}
            resultTitle={resultTitle}
            categories={categorySnapshot}
          />
        }
      />
    </SiteFrame>
  );
}

function SearchControls({
  state,
  selectedSort,
  totalCount,
  categoryResults,
  resultTitle,
  categories,
}: {
  state: SearchState;
  selectedSort: StorefrontProductSort;
  totalCount: number;
  categoryResults: CategoryResult[];
  resultTitle: string;
  categories: ManagedCategory[];
}) {
  const currentSort = storefrontProductSortQuery(selectedSort);
  return (
    <div className="search-page-controls">
      <section className="advanced-product-search" aria-labelledby="search-options-title">
        <h2 id="search-options-title">전체검색</h2>
        <form action="/shop/search.php" method="get">
          <fieldset>
            <legend>검색범위</legend>
            <div className="search-scope-options">
              {searchFields.map((field) => (
                <label key={field.id}>
                  <input
                    type="checkbox"
                    name={field.name}
                    value="1"
                    defaultChecked={state.fields.includes(field.id)}
                  />
                  <span>{field.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="search-price-fields">
            <label>
              <span>최소 가격</span>
              <input
                type="number"
                name="qfrom"
                min="0"
                inputMode="numeric"
                defaultValue={state.minimumPrice}
              />
              <em>원</em>
            </label>
            <label>
              <span>최대 가격</span>
              <input
                type="number"
                name="qto"
                min="0"
                inputMode="numeric"
                defaultValue={state.maximumPrice}
              />
              <em>원</em>
            </label>
          </div>
          <label className="search-category-field">
            <span>상품분류</span>
            <select name="qcaid" defaultValue={state.categoryId}>
              <option value="">전체분류</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.parentId ? "└ " : ""}
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <div className="search-keyword-field">
            <label htmlFor="product-search-keyword">검색어 입력</label>
            <input
              id="product-search-keyword"
              type="search"
              name="q"
              maxLength={30}
              defaultValue={state.query}
              placeholder="검색어"
              required
            />
            <button type="submit">검색</button>
          </div>
          <input type="hidden" name="qsort" value={currentSort.field} />
          <input type="hidden" name="qorder" value={currentSort.direction} />
          <input type="hidden" name="page" value="1" />
          <p>
            상세검색을 선택하지 않거나 상품가격을 입력하지 않으면 전체에서
            검색합니다. 검색어는 최대 30글자까지, 여러 검색어는 공백으로
            구분해 입력할 수 있습니다.
          </p>
        </form>
      </section>

      <nav className="search-category-summary" aria-label="카테고리별 검색 결과">
        <a
          href={searchResultsHref(
            { ...state, categoryId: "" },
            selectedSort,
            1,
          )}
          aria-current={!state.categoryId ? "page" : undefined}
        >
          전체분류 <strong>({totalCount.toLocaleString("ko-KR")})</strong>
        </a>
        {categoryResults.map((category) => (
          <a
            href={searchResultsHref(
              { ...state, categoryId: category.id },
              selectedSort,
              1,
            )}
            aria-current={
              state.categoryId === category.id ? "page" : undefined
            }
            key={category.id}
          >
            {category.label}{" "}
            <strong>({category.count.toLocaleString("ko-KR")})</strong>
          </a>
        ))}
      </nav>
      <h2 className="search-result-heading">{resultTitle}</h2>
    </div>
  );
}

function readSearchState(
  params: SearchParams,
  categories: readonly ManagedCategory[],
): SearchState {
  const requestedCategoryId = firstParam(params.qcaid).slice(0, 20);
  const explicitlySelectedFields = searchFields
    .filter((field) => firstParam(params[field.name]) !== "")
    .map((field) => field.id);
  const hasFieldParameter = searchFields.some(
    (field) => params[field.name] !== undefined,
  );
  return {
    query: (firstParam(params.q) || firstParam(params.stx)).slice(0, 30),
    fields:
      hasFieldParameter && explicitlySelectedFields.length
        ? explicitlySelectedFields
        : searchFields.map((field) => field.id),
    minimumPrice: optionalNonNegativeNumber(firstParam(params.qfrom)),
    maximumPrice: optionalNonNegativeNumber(firstParam(params.qto)),
    categoryId: findCategory(categories, requestedCategoryId)
      ? requestedCategoryId
      : "",
  };
}

function summarizeCategories(
  products: Array<{ categoryId: string }>,
  categories: readonly ManagedCategory[],
): CategoryResult[] {
  const counts = new Map<string, number>();
  for (const product of products) {
    counts.set(product.categoryId, (counts.get(product.categoryId) ?? 0) + 1);
  }
  return categories
    .filter((category) => counts.has(category.id))
    .map((category) => ({
      id: category.id,
      label: category.name,
      count: counts.get(category.id) ?? 0,
    }));
}

function buildSortHrefs(
  state: SearchState,
  page: number,
): Record<StorefrontProductSort, string> {
  return Object.fromEntries(
    productSorts.map((sort) => [
      sort,
      searchResultsHref(state, sort, page),
    ]),
  ) as Record<StorefrontProductSort, string>;
}

function buildPageHrefs(
  state: SearchState,
  sort: StorefrontProductSort,
  pageCount: number,
): Record<number, string> {
  return Object.fromEntries(
    Array.from({ length: pageCount }, (_, index) => {
      const page = index + 1;
      return [page, searchResultsHref(state, sort, page)];
    }),
  ) as Record<number, string>;
}

function searchResultsHref(
  state: SearchState,
  sort: StorefrontProductSort,
  page: number,
): string {
  const query = storefrontProductSortQuery(sort);
  const params = new URLSearchParams();
  if (state.query) params.set("q", state.query);
  for (const field of searchFields) {
    if (state.fields.includes(field.id)) params.set(field.name, "1");
  }
  if (state.minimumPrice !== undefined) {
    params.set("qfrom", String(state.minimumPrice));
  }
  if (state.maximumPrice !== undefined) {
    params.set("qto", String(state.maximumPrice));
  }
  if (state.categoryId) params.set("qcaid", state.categoryId);
  params.set("qsort", query.field);
  params.set("qorder", query.direction);
  params.set("page", String(Math.max(1, Math.trunc(page) || 1)));
  return `/shop/search.php?${params.toString()}`;
}

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? String(value[0] ?? "") : String(value ?? "");
}

function positiveInteger(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0
    ? Math.max(1, Math.trunc(parsed))
    : fallback;
}

function optionalNonNegativeNumber(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : undefined;
}
