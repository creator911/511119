import type { ReactNode } from "react";
import { connection } from "next/server";
import {
  FloatingControls,
  StorefrontFooter,
  StorefrontHeader,
  kielProductTypeLinks,
} from "@/app/components/storefront";
import { PageLoader } from "@/app/components/storefront/PageLoader";
import { VisitorTracker } from "@/app/components/storefront/VisitorTracker";
import {
  buildStorefrontCategoryNavigation,
  getPublicCategories,
  getPublicCategorySnapshot,
} from "@/lib/categories";
import type { ManagedCategory } from "@/lib/category-contract";
import { getEffectiveSiteSettings } from "@/lib/site-content";
import { getLegacyShopSettings } from "@/lib/legacy-shop-settings";
import {
  getStorefrontMenuSettings,
  resolveManagedNavigation,
} from "@/lib/storefront-admin-tools";

export async function SiteFrame({
  children,
  categorySnapshot,
}: {
  children: ReactNode;
  categorySnapshot?: readonly ManagedCategory[];
}) {
  await connection();
  const [
    companySettings,
    publicCategories,
    menuSettings,
    shopSettings,
  ] =
    await Promise.all([
      getEffectiveSiteSettings(),
      categorySnapshot
        ? Promise.resolve(getPublicCategorySnapshot(categorySnapshot))
        : getPublicCategories(),
      getStorefrontMenuSettings(),
      getLegacyShopSettings(),
    ]);
  const navigation = resolveManagedNavigation(
    menuSettings,
    buildStorefrontCategoryNavigation(publicCategories),
  );
  return (
    <>
      <VisitorTracker />
      <PageLoader />
      <StorefrontHeader
        logo={localShopLogo(shopSettings.values.logo_img)}
        mobileLogo={localShopLogo(
          shopSettings.values.mobile_logo_img,
          undefined,
        )}
        brandName="골드리안(GOLDRIAN)"
        navigation={navigation}
        quickProductLinks={kielProductTypeLinks}
        searchAction="/shop/search.php"
        utilityLinks={[
          { label: "회원가입", href: "/bbs/register.php", icon: "user" },
          { label: "로그인", href: "/bbs/login.php", icon: "lock" },
        ]}
        extraLinks={[
          { label: "장바구니", href: "/shop/cart.php", icon: "cart" },
          { label: "위시리스트", href: "/shop/wishlist.php", icon: "heart" },
          { label: "주문/배송조회", href: "/shop/orderinquiry.php", icon: "order" },
          { label: "충전신청", href: "/bbs/writecz.php", icon: "wallet" },
          { label: "출금신청", href: "/bbs/cashtx.php", icon: "wallet" },
          {
            label: "출금내역",
            href: "/bbs/withdrawal_list.php",
            icon: "order",
          },
        ]}
      />
      {children}
      <StorefrontFooter
        company={{
          ...companySettings,
          telephone: companySettings.customerServicePhone,
          copyright: `Copyright © ${companySettings.companyName}. All Rights Reserved.`,
        }}
        logo="/legacy/goldrian-logo.png"
        primaryLinks={[
          {
            label: "서비스이용약관",
            href: "/bbs/content.php?co_id=provision",
          },
          {
            label: "개인정보처리방침",
            href: "/bbs/content.php?co_id=privacy",
            important: true,
          },
          {
            label: "이메일무단수집거부",
            href: "/bbs/content.php?co_id=noemail",
          },
        ]}
      />
      <FloatingControls />
    </>
  );
}

function localShopLogo(value: unknown): `/${string}`;
function localShopLogo(
  value: unknown,
  fallback: undefined,
): `/${string}` | undefined;
function localShopLogo(
  value: unknown,
  fallback: `/${string}` | undefined = "/legacy/goldrian-logo.png",
): `/${string}` | undefined {
  if (
    typeof value === "string" &&
    /^\/api\/media\/[a-f0-9]{32}\.(?:jpg|png|webp|gif)$/u.test(value)
  ) {
    return value as `/${string}`;
  }
  return fallback;
}
