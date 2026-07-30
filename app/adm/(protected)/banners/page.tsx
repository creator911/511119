import type { Metadata } from "next";
import { getAdminBannerRecords } from "@/lib/admin-banners";
import { requireAdminPagePermission } from "@/lib/auth";
import { BannerManager } from "./BannerManager";

export const metadata: Metadata = {
  title: "배너관리",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminBannersPage() {
  await requireAdminPagePermission("catalog.manage");
  const initialBanners = await getAdminBannerRecords();
  return <BannerManager initialBanners={initialBanners} />;
}
