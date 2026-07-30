import type { Metadata } from "next";
import { getAdminCategoryRecords } from "@/lib/admin-categories";
import { requireAdminPagePermission } from "@/lib/auth";
import { LegacyCategoriesManager } from "./LegacyCategoriesManager";

export const metadata: Metadata = {
  title: "상품분류 관리",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminCategoriesPage() {
  await requireAdminPagePermission("catalog.manage");
  const initialRecords = await getAdminCategoryRecords();
  return <LegacyCategoriesManager initialRecords={initialRecords} />;
}
