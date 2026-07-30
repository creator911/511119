import type { Metadata } from "next";
import { OrderInquiryClient } from "@/app/components/CommerceClients";
import { SiteFrame } from "@/app/components/SiteFrame";
import { getEffectiveSiteSettings } from "@/lib/site-content";

export const metadata: Metadata = { title: "주문/배송조회" };

export default async function OrderInquiryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const settings = await getEffectiveSiteSettings();
  return (
    <SiteFrame>
      <OrderInquiryClient
        initialOrderId={String(params.order_id ?? "")}
        shippingCarrier={settings.shippingCarrier}
        customerServicePhone={settings.customerServicePhone}
      />
    </SiteFrame>
  );
}
