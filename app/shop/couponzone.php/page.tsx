import type { Metadata } from "next";
import { SiteFrame } from "@/app/components/SiteFrame";
import { PageHeading } from "@/app/components/storefront";
import { listCouponZoneCoupons } from "@/lib/commerce-promotions";
import { CouponZoneClient } from "./CouponZoneClient";

export const metadata: Metadata = { title: "쿠폰존" };
export const dynamic = "force-dynamic";

export default async function CouponZonePage() {
  const coupons = await listCouponZoneCoupons();
  return (
    <SiteFrame>
      <PageHeading
        title="쿠폰존"
        breadcrumbs={[
          { label: "Home", href: "/shop" },
          { label: "쇼핑몰", href: "/shop" },
          { label: "쿠폰존" },
        ]}
      />
      <main id="main-content" className="coupon-zone-page">
        <section className="coupon-zone-section">
          <header>
            <span aria-hidden="true">%</span>
            <div>
              <h2>다운로드 쿠폰</h2>
              <p>
                키엘골드(KIEL-GOLD) 회원이시라면 쿠폰 다운로드 후 바로
                사용하실 수 있습니다.
              </p>
            </div>
          </header>
          <CouponZoneClient initialCoupons={coupons} />
        </section>
        <section className="coupon-zone-section">
          <header>
            <span aria-hidden="true">P</span>
            <div>
              <h2>포인트 쿠폰</h2>
              <p>
                보유하신 키엘골드(KIEL-GOLD) 회원 포인트를 쿠폰으로
                교환하실 수 있습니다.
              </p>
            </div>
          </header>
          <div className="coupon-empty-state">
            사용할 수 있는 쿠폰이 없습니다.
          </div>
        </section>
      </main>
    </SiteFrame>
  );
}
