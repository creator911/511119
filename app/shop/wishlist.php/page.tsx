import type { Metadata } from "next";
import { WishlistClient } from "@/app/components/CommerceClients";
import { SiteFrame } from "@/app/components/SiteFrame";
import { toProductSummary } from "@/lib/catalog";
import { getStorefrontProducts } from "@/lib/storefront-products";

export const metadata: Metadata = { title: "위시리스트" };
export const dynamic = "force-dynamic";

export default async function WishlistPage() {
  const products = (await getStorefrontProducts()).filter(
    (product) => product.active,
  );
  return (
    <SiteFrame>
      <WishlistClient products={products.map(toProductSummary)} />
    </SiteFrame>
  );
}
