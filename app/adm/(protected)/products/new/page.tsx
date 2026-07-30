import type { Metadata } from "next";
import { requireAdminPagePermission } from "@/lib/auth";
import { getEffectiveCategories } from "@/lib/categories";
import { ProductEditor } from "../ProductEditor";

export const metadata: Metadata = {
  title: "상품 등록",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function NewProductPage() {
  await requireAdminPagePermission("catalog.manage");
  const categories = await getEffectiveCategories();
  return (
    <ProductEditor
      mode="create"
      categories={categories.map((category) => ({
        id: category.id,
        label: `${category.parentId ? "└ " : ""}${category.name}${
          category.active ? "" : " (비활성)"
        }`,
      }))}
    />
  );
}
