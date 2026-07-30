import type { Metadata } from "next";
import { CategoryListing } from "@/app/components/storefront";
import { SiteFrame } from "@/app/components/SiteFrame";
import { toProductSummary } from "@/lib/catalog";
import { getStorefrontProducts } from "@/lib/storefront-products";

const types = {
  "1": { title: "히트상품", flag: "hit" },
  "2": { title: "추천상품", flag: "recommend" },
  "3": { title: "최신상품", flag: "new" },
  "4": { title: "인기상품", flag: "popular" },
  "5": { title: "할인상품", flag: "sale" },
} as const;

export const metadata: Metadata = { title: "상품모음" };
export const dynamic = "force-dynamic";

export default async function ProductTypePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const selected = types[String(params.type ?? "1") as keyof typeof types] ?? types["1"];
  const items = (await getStorefrontProducts())
    .filter((product) => product.active && product.flags[selected.flag])
    .map(toProductSummary);
  return (
    <SiteFrame>
      <CategoryListing
        title={selected.title}
        products={items}
        showListToolbar={false}
      />
    </SiteFrame>
  );
}
