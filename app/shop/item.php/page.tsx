import type { Metadata } from "next";
import { SiteFrame } from "@/app/components/SiteFrame";
import { ProductCommerceClient } from "@/app/components/CommerceClients";
import {
  toProductDetail,
  toProductSummary,
} from "@/lib/catalog";
import {
  getCategoryPathFromSnapshot,
  getCategoryTreeIdsFromSnapshot,
  getEffectiveCategories,
} from "@/lib/categories";
import {
  getStorefrontProduct,
  getStorefrontProducts,
} from "@/lib/storefront-products";
import { getStorefrontProductOptions } from "@/lib/product-options";
import productNavigationSource from "@/data/product-navigation.json";

export const dynamic = "force-dynamic";

const productNavigation = productNavigationSource as Record<
  string,
  { previousId: string | null; nextId: string | null }
>;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const params = await searchParams;
  const product = await getStorefrontProduct(String(params.it_id ?? ""));
  return {
    title:
      product?.active
        ? product.name.replace(/\s*요약정보\s+및\s+구매.*$/u, "")
        : "상품정보",
    description:
      product?.active && product.basic
        ? product.basic
        : "키엘골드 상품정보",
  };
}

export default async function ProductPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const productId = String(params.it_id ?? "");
  const [product, categorySnapshot, productOptions] = await Promise.all([
    getStorefrontProduct(productId),
    getEffectiveCategories(),
    getStorefrontProductOptions(productId),
  ]);
  if (!product?.active) {
    return (
      <SiteFrame categorySnapshot={categorySnapshot}>
        <main id="main-content" className="simple-form-page">
          <div className="empty-card">상품을 찾을 수 없습니다.</div>
        </main>
      </SiteFrame>
    );
  }

  const categoryPath = getCategoryPathFromSnapshot(
    categorySnapshot,
    product.categoryId,
  );
  const navigationRootId = categoryPath[0]?.id ?? product.categoryId;
  const categoryIds = new Set(
    getCategoryTreeIdsFromSnapshot(categorySnapshot, navigationRootId),
  );
  const storefrontProducts = await getStorefrontProducts();
  const siblings = storefrontProducts.filter(
    (item) => item.active && categoryIds.has(item.categoryId),
  );
  const index = siblings.findIndex((item) => item.id === product.id);
  const importedNavigation = productNavigation[product.id];
  const mappedPrevious = importedNavigation?.previousId
    ? storefrontProducts.find(
        (item) => item.active && item.id === importedNavigation.previousId,
      )
    : undefined;
  const mappedNext = importedNavigation?.nextId
    ? storefrontProducts.find(
        (item) => item.active && item.id === importedNavigation.nextId,
      )
    : undefined;
  return (
    <SiteFrame categorySnapshot={categorySnapshot}>
      <ProductCommerceClient
        product={toProductDetail(product, categorySnapshot, productOptions)}
        breadcrumbs={[
          { label: "상점 메인", href: "/shop" },
          ...categoryPath.slice(0, -1).map((category) => ({
            label: category.name,
            href: `/shop/list.php?ca_id=${encodeURIComponent(category.id)}`,
          })),
        ]}
        previousProduct={
          importedNavigation
            ? mappedPrevious
              ? toProductSummary(mappedPrevious)
              : undefined
            : index > 0
              ? toProductSummary(siblings[index - 1])
              : undefined
        }
        nextProduct={
          importedNavigation
            ? mappedNext
              ? toProductSummary(mappedNext)
              : undefined
            : index >= 0 && index < siblings.length - 1
              ? toProductSummary(siblings[index + 1])
              : undefined
        }
        relatedProducts={[]}
      />
    </SiteFrame>
  );
}
