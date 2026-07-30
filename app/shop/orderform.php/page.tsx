import type { Metadata } from "next";
import { CheckoutClient } from "@/app/components/CommerceClients";
import { SiteFrame } from "@/app/components/SiteFrame";
import { enabledPaymentMethods } from "@/lib/shop-settings";
import { getEffectiveSiteSettings } from "@/lib/site-content";

export const metadata: Metadata = { title: "주문/결제" };

export default async function OrderFormPage() {
  const settings = await getEffectiveSiteSettings();
  const bankLabel =
    settings.bankName && settings.bankAccount && settings.bankHolder
      ? `${settings.bankName} ${settings.bankAccount} (예금주 ${settings.bankHolder})`
      : "주문 확인 후 입금계좌 안내";
  return (
    <SiteFrame>
      <CheckoutClient
        bankLabel={bankLabel}
        paymentMethods={enabledPaymentMethods(settings)}
        pointUseEnabled={settings.pointUseEnabled}
        pointUseMinimum={settings.pointUseMinimum}
        pointUseMaximum={settings.pointUseMaximum}
        pointUseUnit={settings.pointUseUnit}
        shippingFee={settings.defaultShippingFee}
        shippingCarrier={settings.shippingCarrier}
        customerServicePhone={settings.customerServicePhone}
      />
    </SiteFrame>
  );
}
