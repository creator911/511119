import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAdminProductRecords } from "@/lib/admin-products";
import { requireAdminPagePermission } from "@/lib/auth";
import { getEffectiveCategories } from "@/lib/categories";
import { ProductEditor } from "../ProductEditor";
import type { AdminProduct } from "../product-contract";

export const metadata: Metadata = {
  title: "상품 수정",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

interface EditProductPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string | string[] }>;
}

export default async function EditProductPage({
  params,
  searchParams,
}: EditProductPageProps) {
  await requireAdminPagePermission("catalog.manage");
  const [{ id }, query, categories] = await Promise.all([
    params,
    searchParams,
    getEffectiveCategories(),
  ]);
  const record = (
    await getAdminProductRecords({
      strict: true,
    })
  ).find((entry) => entry.product.id === id);
  if (!record) notFound();
  const catalogProduct = record.product;
  const initialProduct: AdminProduct = {
    id: catalogProduct.id,
    categoryId: catalogProduct.categoryId,
    primaryCategoryId: catalogProduct.primaryCategoryId,
    secondaryCategoryId: catalogProduct.secondaryCategoryId,
    tertiaryCategoryId: catalogProduct.tertiaryCategoryId,
    name: catalogProduct.name,
    basic: catalogProduct.basic,
    detailHtml: catalogProduct.detailHtml,
    price: catalogProduct.price,
    originalPrice: catalogProduct.originalPrice,
    stock: catalogProduct.stock,
    maker: catalogProduct.maker,
    origin: catalogProduct.origin,
    brand: catalogProduct.brand,
    model: catalogProduct.model,
    images: [...catalogProduct.images],
    flags: { ...catalogProduct.flags },
    active: catalogProduct.active,
    sortOrder: catalogProduct.sortOrder,
    viewCount: catalogProduct.viewCount,
    rewardPoints: catalogProduct.rewardPoints,
    desktopSkin: catalogProduct.desktopSkin,
    mobileSkin: catalogProduct.mobileSkin,
    revision: record.revision,
    stockControlRevision: record.stockControlRevision,
    soldOut: catalogProduct.soldOut,
    stockNotificationQuantity: catalogProduct.stockNotificationQuantity,
    restockNotification: catalogProduct.restockNotification,
  };
  const created = Array.isArray(query.created)
    ? query.created[0] === "1"
    : query.created === "1";

  return (
    <ProductEditor
      mode="edit"
      productId={id}
      initialProduct={initialProduct}
      initialRevision={record.revision}
      initialMessage={created ? "상품이 등록되었습니다." : ""}
      categories={categories.map((category) => ({
        id: category.id,
        label: `${category.parentId ? "└ " : ""}${category.name}${
          category.active ? "" : " (비활성)"
        }`,
      }))}
    />
  );
}
