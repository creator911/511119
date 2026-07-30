import catalogSource from "@/data/catalog.json";
import legacyPoliciesSource from "@/data/legacy-policies.json";
import type {
  LocalAssetPath,
  ProductDetailData,
  ProductOption,
  ProductSummary,
} from "@/app/components/storefront/types";
import { sanitizeProductDetailHtml } from "@/lib/admin-products";
import {
  findCategory,
  getCategoryPathFromSnapshot,
} from "@/lib/categories";
import type { ManagedCategory } from "@/lib/category-contract";

export interface CatalogCategory {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
  active: boolean;
}

export interface CatalogProduct {
  id: string;
  categoryId: string;
  name: string;
  basic: string;
  price: number;
  originalPrice: number;
  stock: number;
  maker: string;
  origin: string;
  brand: string;
  model: string;
  flags: {
    hit: boolean;
    recommend: boolean;
    new: boolean;
    popular: boolean;
    sale: boolean;
  };
  images: LocalAssetPath[];
  detailHtml: string;
  active: boolean;
}

export interface CatalogProductShape
  extends Omit<CatalogProduct, "images"> {
  images: readonly string[];
  soldOut?: boolean;
  restockNotification?: boolean;
  rewardPoints?: number;
  rating?: number;
  reviewCount?: number;
  questionCount?: number;
}

interface CatalogData {
  version: number;
  importedAt: string;
  categories: CatalogCategory[];
  products: CatalogProduct[];
  banners: Array<{
    id: string;
    image: LocalAssetPath;
    mobileImage: LocalAssetPath;
    href: string;
    sortOrder: number;
    active: boolean;
  }>;
  business: {
    companyName: string;
    representative: string;
    businessNumber: string;
    mailOrderNumber: string;
    address: string;
    email: string;
  };
}

export const catalog = catalogSource as CatalogData;
export const categories = catalog.categories.filter((category) => category.active);
export const products = catalog.products.filter((product) => product.active);

const categoryById = new Map(categories.map((category) => [category.id, category]));
const productById = new Map(products.map((product) => [product.id, product]));
const legacyShippingLines = legacyPoliciesSource.shipping.split("\n");
const legacyExchangeLines = legacyPoliciesSource.exchange.split("\n");

function withoutLegacyBullet(value: string): string {
  return value.replace(/^•\s*/u, "");
}

export function getCategory(id: string | null | undefined) {
  return id ? categoryById.get(id) : undefined;
}

export function getProduct(id: string | null | undefined) {
  return id ? productById.get(id) : undefined;
}

export function getCategoryTreeIds(id: string): string[] {
  const found = new Set<string>([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const category of categories) {
      if (category.parentId && found.has(category.parentId) && !found.has(category.id)) {
        found.add(category.id);
        changed = true;
      }
    }
  }
  return [...found];
}

export function getCategoryProducts(id: string): CatalogProduct[] {
  const categoryIds = new Set(getCategoryTreeIds(id));
  return products.filter((product) => categoryIds.has(product.categoryId));
}

export function getSubcategories(id: string) {
  return categories
    .filter((category) => category.parentId === id)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export function getFlaggedProducts(flag: keyof CatalogProduct["flags"]) {
  return products.filter((product) => product.flags[flag]);
}

export function searchProducts(query: string) {
  const needle = query.trim().toLocaleLowerCase("ko-KR");
  if (!needle) return products;
  return products.filter((product) =>
    [product.name, product.basic, product.model, product.brand, product.maker]
      .join(" ")
      .toLocaleLowerCase("ko-KR")
      .includes(needle),
  );
}

function localAssetPath(value: string | undefined): LocalAssetPath {
  return value?.startsWith("/") && !value.startsWith("//")
    ? (value as LocalAssetPath)
    : "/legacy/logo.png";
}

function badgeFor(product: CatalogProductShape) {
  if (product.flags.recommend) return { badge: "1+1", badgeTone: "recommend" as const };
  if (product.flags.new) return { badge: "신상", badgeTone: "new" as const };
  if (product.flags.popular) return { badge: "인기", badgeTone: "popular" as const };
  if (product.flags.hit) return { badge: "히트", badgeTone: "hit" as const };
  return {};
}

export function toProductSummary(product: CatalogProductShape): ProductSummary {
  const image = localAssetPath(product.images[0]);
  const compareAtPrice =
    product.originalPrice > 0 ? product.originalPrice : undefined;
  return {
    id: product.id,
    name: product.name.replace(/\s*요약정보\s+및\s+구매.*$/u, ""),
    href: `/shop/item.php?it_id=${encodeURIComponent(product.id)}`,
    image,
    hoverImage: product.images[1]
      ? localAssetPath(product.images[1])
      : undefined,
    price: product.price,
    compareAtPrice,
    description: product.basic,
    model: product.model,
    discountPercent: compareAtPrice
      ? Math.max(
          0,
          Math.round(((compareAtPrice - product.price) / compareAtPrice) * 100),
        )
      : undefined,
    soldOut: Boolean(product.soldOut) || product.stock <= 0,
    maximumQuantity: Math.max(1, Math.min(99, product.stock)),
    rating: product.rating ?? 0,
    reviewCount: product.reviewCount ?? 0,
    ...badgeFor(product),
  };
}

export function toProductDetail(
  product: CatalogProductShape,
  categorySnapshot: readonly ManagedCategory[] = categories,
  productOptions: readonly ProductOption[] = [],
): ProductDetailData {
  const categoryPath = getCategoryPathFromSnapshot(
    categorySnapshot,
    product.categoryId,
  );
  const category =
    categoryPath[categoryPath.length - 1] ??
    findCategory(categorySnapshot, product.categoryId);
  const localImages = product.images
    .filter((image) => image.startsWith("/") && !image.startsWith("//"))
    .map((image) => image as LocalAssetPath);
  const optionUnavailable =
    productOptions.length > 0 &&
    productOptions.some(
      (option) =>
        option.values.length === 0 ||
        option.values.every((value) => value.disabled),
    );
  return {
    ...toProductSummary(product),
    soldOut:
      Boolean(product.soldOut) || product.stock <= 0 || optionUnavailable,
    images: localImages.length ? localImages : ["/legacy/logo.png"],
    categoryLabel: category?.name ?? "상품",
    categoryHref: category
      ? `/shop/list.php?ca_id=${encodeURIComponent(category.id)}`
      : "/shop",
    maker: product.maker,
    origin: product.origin,
    brand: product.brand,
    rewardPoints: product.rewardPoints ?? 0,
    shippingLabel: "주문시 결제",
    options: productOptions.length ? [...productOptions] : undefined,
    restockNotification: Boolean(product.restockNotification),
    shortDescription: product.basic,
    details: product.detailHtml ? (
      <div
        dangerouslySetInnerHTML={{
          __html: sanitizeProductDetailHtml(product.detailHtml),
        }}
      />
    ) : undefined,
    noticeRows: [
      { label: "제품소재", value: "상품페이지 참고" },
      { label: "색상", value: "상품페이지 참고" },
      { label: "치수", value: "상품페이지 참고" },
      { label: "제조자", value: "상품페이지 참고" },
      { label: "세탁방법 및 취급시 주의사항", value: "상품페이지 참고" },
      { label: "제조연월", value: "상품페이지 참고" },
      { label: "품질보증기준", value: "상품페이지 참고" },
      { label: "A/S 책임자와 전화번호", value: "상품페이지 참고" },
    ],
    shippingInfo: (
      <>
        <p>
          <strong style={{ fontSize: "12pt" }}>
            {legacyShippingLines[0]}
            <br />
          </strong>
          <span style={{ fontSize: "12pt" }} aria-hidden="true">
            {"\u200b"}
          </span>
          {legacyShippingLines[1]}
        </p>
        <p>{legacyShippingLines[3]}</p>
      </>
    ),
    exchangeInfo: (
      <>
        <p>
          <b style={{ fontSize: "12pt" }} aria-hidden="true">
            {"\u200b\u200b\u200b"}
          </b>
          <strong>
            {legacyExchangeLines[0]
              .replace(/^\u200b+\s*/u, "")
              .trimEnd()}
          </strong>
          {"\u00a0"}
        </p>
        <p>{"\u00a0"}</p>
        <ul>
          {legacyExchangeLines.slice(2, 8).map((line) => (
            <li key={line}>{withoutLegacyBullet(line)}</li>
          ))}
        </ul>
        <p>{"\u00a0"}</p>
        <p>
          <strong>{legacyExchangeLines[10]}</strong>
        </p>
        <p>{"\u00a0"}</p>
        <ul>
          {legacyExchangeLines.slice(12, 18).map((line) => (
            <li key={line}>{withoutLegacyBullet(line)}</li>
          ))}
        </ul>
        <p>
          <br />
        </p>
      </>
    ),
    reviewCount: product.reviewCount ?? 0,
    questionCount: product.questionCount ?? 0,
  };
}

export const companyInfo = {
  ...catalog.business,
  copyright: `Copyright © ${catalog.business.companyName}. All Rights Reserved.`,
};
