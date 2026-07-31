import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const files = {
  page: new URL("../app/shop/mypage.php/page.tsx", import.meta.url),
  client: new URL("../app/components/CommerceClients.tsx", import.meta.url),
  panel: new URL(
    "../app/components/storefront/MyPagePanel.tsx",
    import.meta.url,
  ),
  styles: new URL(
    "../app/components/storefront/Storefront.module.css",
    import.meta.url,
  ),
  session: new URL(
    "../app/api/customer/session/route.ts",
    import.meta.url,
  ),
  wishlist: new URL(
    "../app/api/customer/wishlist/route.ts",
    import.meta.url,
  ),
  confirm: new URL(
    "../app/api/customer/confirm/route.ts",
    import.meta.url,
  ),
  confirmPage: new URL(
    "../app/bbs/member_confirm.php/page.tsx",
    import.meta.url,
  ),
  confirmClient: new URL(
    "../app/bbs/member_confirm.php/MemberConfirmClient.tsx",
    import.meta.url,
  ),
  memos: new URL(
    "../app/api/customer/memos/route.ts",
    import.meta.url,
  ),
  database: new URL("../lib/commerce-db.ts", import.meta.url),
};

test("mypage uses the legacy Eyoom information, order, and wishlist structure", async () => {
  const [page, panel, styles] = await Promise.all([
    readFile(files.page, "utf8"),
    readFile(files.panel, "utf8"),
    readFile(files.styles, "utf8"),
  ]);

  assert.match(page, /<PageHeading/);
  assert.match(page, /title="마이페이지"/);
  assert.match(page, /label: "쇼핑몰"/);

  for (const label of [
    "쪽지함",
    "회원정보수정",
    "회원탈퇴",
    "보유포인트",
    "보유쿠폰",
    "연락처",
    "E-Mail",
    "최종접속일시",
    "회원가입일시",
    "주소",
    "최근 주문내역",
    "최근 위시리스트",
    "더보기",
  ]) {
    assert.match(panel, new RegExp(label));
  }
  assert.match(panel, /aria-expanded=\{profileOpen\}/);
  assert.match(panel, /orders\.slice\(0, 5\)/);
  assert.match(panel, /wishlist\.slice\(0, 8\)/);
  assert.match(panel, /role="dialog"/);
  assert.match(panel, /aria-modal="true"/);
  assert.doesNotMatch(panel, /만료일|expiresAt/u);
  assert.match(panel, /timeZone: "Asia\/Seoul"/u);
  assert.match(panel, /second: "2-digit"/u);
  assert.doesNotMatch(panel, /주문\/배송조회|충전신청|쇼핑 계속하기/);

  assert.match(styles, /\.myPageMemberPanel/);
  assert.match(styles, /grid-template-columns: 15% 35% 15% 35%/);
  assert.match(styles, /\.myPageProfileCollapse/);
  assert.match(styles, /grid-template-rows: 0fr/);
  assert.match(styles, /\.myPageProfileOpen/);
  assert.match(styles, /grid-template-rows: 1fr/);
  assert.match(styles, /grid-template-columns: repeat\(4,/);
  assert.match(styles, /@media \(max-width: 767px\)/);
  assert.match(styles, /grid-template-columns: 38% 62%/);
  assert.match(styles, /grid-template-columns: repeat\(2,/);
});

test("mypage APIs return complete member, wishlist, and memo data without weakening reauthentication", async () => {
  const [session, wishlist, confirm, client, confirmClient, memos, database] = await Promise.all([
    readFile(files.session, "utf8"),
    readFile(files.wishlist, "utf8"),
    readFile(files.confirm, "utf8"),
    readFile(files.client, "utf8"),
    readFile(files.confirmClient, "utf8"),
    readFile(files.memos, "utf8"),
    readFile(files.database, "utf8"),
  ]);

  for (const field of [
    "email",
    "phone",
    "postcode",
    "address1",
    "address2",
    "lastLoginAt",
    "joinedAt",
    "pointHistory",
  ]) {
    assert.match(session, new RegExp(field));
    assert.match(client, new RegExp(field));
  }
  assert.match(session, /ensureAdminPointSchema/);
  assert.match(session, /pointBalanceTimelineSql/);
  assert.match(session, /FROM wallet_ledger ledger/);
  assert.match(session, /WHEN 'charge' THEN '충전 승인'/);
  assert.match(session, /ELSE '출금 승인'/);
  assert.match(session, /COALESCE\([\s\S]*?charge\.created_at[\s\S]*?withdrawal\.created_at/);
  assert.match(session, /history\.created_at DESC/);
  assert.match(session, /deleted_at IS NULL/);
  assert.doesNotMatch(session, /expires_at|expiresAt/u);
  assert.doesNotMatch(client, /expiresAt/u);
  assert.match(session, /points: Math\.trunc/u);
  assert.match(client, /\? Math\.trunc\(user\.points\)/u);
  assert.match(wishlist, /rows\.slice\(0, 8\)/);
  assert.match(wishlist, /wishedAt: row\.created_at/);

  assert.match(confirm, /isSameOrigin\(request\)/);
  assert.match(confirm, /customer-confirm/);
  assert.match(confirm, /verifyCustomerPassword/);
  assert.match(confirm, /MIN_RESPONSE_TIME_MS/);
  assert.doesNotMatch(confirm, /createCustomerSessionCookie/);
  assert.match(confirmClient, /fetch\("\/api\/customer\/confirm"/);
  assert.match(confirmClient, /member_leave\.php/);
  assert.match(confirmClient, /method: "DELETE"/);

  assert.match(database, /CREATE TABLE IF NOT EXISTS member_memos/);
  assert.match(memos, /customer-memo-send/);
  assert.match(memos, /sender_deleted/);
  assert.match(memos, /recipient_deleted/);
  assert.match(memos, /export async function PATCH/);
  assert.match(memos, /export async function DELETE/);
});

test("legacy-compatible member confirmation route is present", async () => {
  await Promise.all([access(files.confirmPage), access(files.confirmClient)]);
});
