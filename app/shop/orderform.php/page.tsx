import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { CheckoutClient } from "@/app/components/CommerceClients";
import { SiteFrame } from "@/app/components/SiteFrame";
import { PageHeading } from "@/app/components/storefront";
import { getCustomerSession } from "@/lib/customer-auth";
import { enabledPaymentMethods } from "@/lib/shop-settings";
import { getEffectiveSiteSettings } from "@/lib/site-content";

export const metadata: Metadata = { title: "주문/결제" };

export default async function OrderFormPage() {
  const requestHeaders = await headers();
  const forwardedHost = requestHeaders
    .get("x-forwarded-host")
    ?.split(",")[0]
    ?.trim();
  const requestedHost = forwardedHost || requestHeaders.get("host") || "";
  const safeHost = /^[A-Za-z0-9.-]+(?::[0-9]{1,5})?$/u.test(requestedHost)
    ? requestedHost
    : "localhost";
  const forwardedProtocol = requestHeaders
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim()
    .toLowerCase();
  const protocol =
    forwardedProtocol === "http" || forwardedProtocol === "https"
      ? forwardedProtocol
      : safeHost.startsWith("localhost") || safeHost.startsWith("127.0.0.1")
        ? "http"
        : "https";
  const session = await getCustomerSession(
    new Request(`${protocol}://${safeHost}/shop/orderform.php`, {
      headers: requestHeaders,
    }),
  );
  if (!session) {
    redirect(
      `/bbs/login.php?return_url=${encodeURIComponent("/shop/orderform.php")}`,
    );
  }

  const settings = await getEffectiveSiteSettings();
  const bankLabel =
    settings.bankName && settings.bankAccount && settings.bankHolder
      ? `${settings.bankName} ${settings.bankAccount} (예금주 ${settings.bankHolder})`
      : "주문 확인 후 입금계좌 안내";
  return (
    <SiteFrame>
      <PageHeading
        title="주문하기"
        breadcrumbs={[
          { label: "Home", href: "/shop" },
          { label: "쇼핑몰", href: "/shop" },
          { label: "주문하기" },
        ]}
      />
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
