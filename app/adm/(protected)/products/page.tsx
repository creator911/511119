import type { Metadata } from "next";
import { getAdminProductStockRows } from "@/lib/admin-product-stock";
import { getAdminProductRecords } from "@/lib/admin-products";
import { requireAdminPagePermission } from "@/lib/auth";
import { getEffectiveCategories } from "@/lib/categories";
import { ProductStockManager } from "./ProductStockManager";
import { LegacyProductsTable } from "./LegacyProductsTable";
import type {
  AdminProduct,
  AdminProductCategory,
} from "./product-contract";

export const metadata: Metadata = {
  title: "상품관리",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

interface AdminProductsPageProps {
  searchParams: Promise<{ view?: string | string[] }>;
}

export default async function AdminProductsPage({
  searchParams,
}: AdminProductsPageProps) {
  await requireAdminPagePermission("catalog.manage");
  const params = await searchParams;
  const requestedView = Array.isArray(params.view) ? params.view[0] : params.view;

  if (requestedView === "stock") {
    const [rows, categories] = await Promise.all([
      getAdminProductStockRows(),
      getEffectiveCategories(),
    ]);
    return (
      <ProductStockManager
        initialRows={rows}
        categories={categoryOptions(categories)}
      />
    );
  }

  const [products, categories] = await Promise.all([
    getAdminProductRecords({ strict: true }),
    getEffectiveCategories(),
  ]);
  const initialProducts: AdminProduct[] = products.map((record) => ({
    ...record.product,
    revision: record.revision,
    stockControlRevision: record.stockControlRevision,
  }));
  /*
   * Keep this mapping explicit at the server boundary so the client never
   * receives D1 row metadata that is unrelated to the legacy item list.
   */
  const normalizedProducts: AdminProduct[] = initialProducts.map((product) => ({
    id: product.id,
    categoryId: product.categoryId,
    primaryCategoryId: product.primaryCategoryId,
    secondaryCategoryId: product.secondaryCategoryId,
    tertiaryCategoryId: product.tertiaryCategoryId,
    name: product.name,
    basic: product.basic,
    detailHtml: product.detailHtml,
    price: product.price,
    originalPrice: product.originalPrice,
    stock: product.stock,
    maker: product.maker,
    origin: product.origin,
    brand: product.brand,
    model: product.model,
    images: [...product.images],
    flags: { ...product.flags },
    active: product.active,
    sortOrder: product.sortOrder,
    viewCount: product.viewCount,
    rewardPoints: product.rewardPoints,
    desktopSkin: product.desktopSkin,
    mobileSkin: product.mobileSkin,
    revision: product.revision,
    stockControlRevision: product.stockControlRevision,
    soldOut: product.soldOut,
    stockNotificationQuantity: product.stockNotificationQuantity,
    restockNotification: product.restockNotification,
  }));

  return (
    <LegacyProductsTable
      initialProducts={normalizedProducts}
      categories={categoryOptions(categories)}
    />
  );
}

function categoryOptions(
  categories: Awaited<ReturnType<typeof getEffectiveCategories>>,
): AdminProductCategory[] {
  return categories.map((category) => ({
    id: category.id,
    label: `${category.parentId ? "└ " : ""}${category.name}${
      category.active ? "" : " (비활성)"
    }`,
  }));
}
