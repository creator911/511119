import type { Metadata } from "next";
import { CartClient } from "@/app/components/CommerceClients";
import { SiteFrame } from "@/app/components/SiteFrame";

export const metadata: Metadata = { title: "장바구니" };

export default function CartPage() {
  return (
    <SiteFrame>
      <CartClient />
    </SiteFrame>
  );
}
