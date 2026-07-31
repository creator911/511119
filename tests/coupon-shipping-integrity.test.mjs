import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = async (path) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("coupon and shipping tools use dedicated operational tables", async () => {
  const [service, page, couponApi, shippingApi, permissions, migration] =
    await Promise.all([
      source("lib/commerce-promotions.ts"),
      source("app/adm/(protected)/tools/[tool]/page.tsx"),
      source("app/api/admin/coupons/route.ts"),
      source("app/api/admin/shipping-rules/route.ts"),
      source("lib/admin-permissions.ts"),
      source("drizzle/0008_coupon_shipping_operations.sql"),
    ]);

  assert.match(page, /tool === "coupons" \|\| tool === "coupon-zone"/);
  assert.match(page, /tool === "additional-shipping"/);
  assert.match(page, /CouponAdminManager/);
  assert.match(page, /AdditionalShippingManager/);
  assert.match(couponApi, /requireAdminApiSession\(request\)/);
  assert.match(couponApi, /assertSameOrigin\(request\)/);
  assert.match(shippingApi, /requireAdminApiSession\(request\)/);
  assert.match(shippingApi, /assertSameOrigin\(request\)/);
  assert.match(permissions, /case "coupons":\s+case "shipping-rules":/s);

  assert.match(service, /CREATE TABLE IF NOT EXISTS coupon_claims/);
  assert.match(service, /CREATE TABLE IF NOT EXISTS coupon_redemptions/);
  assert.match(service, /coupon_redemptions_customer_uq/);
  assert.match(service, /guard_value INTEGER NOT NULL CHECK\(guard_value = 1\)/);
  assert.match(service, /CREATE TABLE IF NOT EXISTS additional_shipping_rules/);
  assert.match(migration, /ALTER TABLE `coupons` ADD `zone_enabled`/);
  assert.match(migration, /coupon_redemptions_guard_check/);
});

test("checkout applies coupon and regional shipping with server authority", async () => {
  const [service, orderRoute, checkout, quoteRoute, shippingRoute] =
    await Promise.all([
      source("lib/commerce-promotions.ts"),
      source("app/api/orders/route.ts"),
      source("app/components/storefront/CartCheckoutPanels.tsx"),
      source("app/api/coupons/quote/route.ts"),
      source("app/api/shipping/quote/route.ts"),
    ]);

  assert.match(service, /if \(!coupon\.active\)/);
  assert.match(service, /couponIsWithinPeriod\(coupon, koreaToday\(\)\)/);
  assert.match(service, /input\.subtotal < minimumOrder/);
  assert.match(service, /이미 사용한 쿠폰입니다/);
  assert.match(service, /쿠폰존에서 쿠폰을 먼저 다운로드/);
  assert.match(service, /NOT EXISTS \(\s+SELECT 1 FROM coupon_redemptions/s);
  assert.match(service, /c\.minimum_order <= \?/);
  assert.match(service, /postcodeMatches \|\| addressMatches/);

  assert.match(orderRoute, /calculateShippingQuote\(\{/);
  assert.match(orderRoute, /validateCouponForOrder\(\{/);
  assert.match(orderRoute, /couponRedemptionStatement\(database/);
  assert.match(orderRoute, /couponDiscount \+ pointsUsed/);
  assert.match(
    orderRoute,
    /subtotal \+ shippingFee - couponDiscount/,
  );
  assert.match(orderRoute, /couponChanged: true/);

  assert.match(checkout, /\/api\/coupons\/quote/);
  assert.match(checkout, /\/api\/shipping\/quote/);
  assert.match(checkout, /label: "쿠폰 ?할인"/);
  assert.match(checkout, /couponCode: appliedCoupon\?\.code/);
  assert.match(quoteRoute, /validateCouponForOrder/);
  assert.match(shippingRoute, /getEffectiveSiteSettings\(\{ strict: true \}\)/);
});

test("coupon zone downloads real coupons for authenticated customers", async () => {
  const [page, client, claimRoute, service] = await Promise.all([
    source("app/shop/couponzone.php/page.tsx"),
    source("app/shop/couponzone.php/CouponZoneClient.tsx"),
    source("app/api/customer/coupons/[couponId]/claim/route.ts"),
    source("lib/commerce-promotions.ts"),
  ]);

  assert.match(page, /listCouponZoneCoupons\(\)/);
  assert.match(page, /CouponZoneClient initialCoupons=\{coupons\}/);
  assert.match(client, /쿠폰 다운로드/);
  assert.match(client, /코드 복사/);
  assert.match(client, /\/api\/customer\/coupons\//);
  assert.match(claimRoute, /getCustomerSession\(request\)/);
  assert.match(claimRoute, /status: 401/);
  assert.match(claimRoute, /claimCouponForCustomer/);
  assert.match(service, /INSERT OR IGNORE INTO coupon_claims/);
});
