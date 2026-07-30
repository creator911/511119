import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("order operations persist the original admin delivery and refund fields", async () => {
  const [schema, commerceDb, operations, manager] = await Promise.all([
    read("db/schema.ts"),
    read("lib/commerce-db.ts"),
    read("lib/admin-operations.ts"),
    read("app/adm/(protected)/orders/OrdersManager.tsx"),
  ]);

  for (const field of [
    "shipping_carrier",
    "refund_amount",
    "admin_memo",
  ]) {
    assert.match(schema, new RegExp(field));
    assert.match(commerceDb, new RegExp(field));
    assert.match(operations, new RegExp(field));
  }
  assert.match(operations, /refundAmount > current\.total/);
  assert.match(operations, /nextAdminMemo\.length > 5_000/);
  assert.match(operations, /shippingCarrierPattern/);
  assert.match(manager, /결제취소·환불금액/);
  assert.match(manager, /상점메모/);
  assert.match(manager, /shippingCarrier,\s*trackingNumber,\s*refundAmount:/s);
});

test("admin order summaries use consistent sales, payment, and missing-product rules", async () => {
  const [data, manager, editProductPage] = await Promise.all([
    read("lib/admin-data.ts"),
    read("app/adm/(protected)/orders/OrdersManager.tsx"),
    read("app/adm/(protected)/products/[id]/page.tsx"),
  ]);

  assert.match(
    data,
    /WHEN created_at >= \? AND created_at < \?\s+AND payment_status = 'paid'\s+AND status NOT IN \('cancelled', 'refunded'\)\s+THEN total/s,
  );
  for (const [method, label] of [
    ["card", "신용카드"],
    ["transfer", "실시간 계좌이체"],
    ["virtual", "가상계좌"],
    ["virtual_account", "가상계좌"],
    ["mobile", "휴대폰결제"],
  ]) {
    assert.match(manager, new RegExp(`${method}: "${label}"`));
  }
  assert.match(manager, /paymentMethodLabel\(order\.paymentMethod\)/);
  assert.match(editProductPage, /import \{ notFound \} from "next\/navigation"/);
  assert.match(editProductPage, /if \(!record\) notFound\(\)/);
  assert.doesNotMatch(editProductPage, /AdminProduct \| null/);
});

test("product interaction administration supports answer, visibility, and deletion", async () => {
  const [library, route, manager] = await Promise.all([
    read("lib/admin-interactions.ts"),
    read("app/api/admin/interactions/[id]/route.ts"),
    read("app/adm/(protected)/content/InteractionManager.tsx"),
  ]);

  assert.match(library, /deleteAdminProductInteraction/);
  assert.match(library, /interaction\.update/);
  assert.match(library, /interaction\.delete/);
  assert.match(library, /answerLength: answer\.length/);
  assert.match(library, /const results = await database\.batch/);
  assert.match(library, /DELETE FROM product_interactions WHERE id = \?/);
  assert.match(route, /session\.username/);
  assert.match(route, /export async function DELETE/);
  assert.match(route, /assertSameOrigin\(request\)/);
  assert.match(manager, /method: "DELETE"/);
  assert.match(manager, /<ConfirmDialog/);
  assert.match(manager, /답변·상태/);
});

test("legacy dashboard and menu retain inquiry and review operations", async () => {
  const [dashboard, shell, contentPage, interactionManager] = await Promise.all([
    read("app/adm/(protected)/page.tsx"),
    read("app/components/admin/AdminShell.tsx"),
    read("app/adm/(protected)/content/page.tsx"),
    read("app/adm/(protected)/content/InteractionManager.tsx"),
  ]);

  assert.match(dashboard, /최근게시물/);
  assert.match(dashboard, /\/adm\/community\?view=posts/);
  assert.match(shell, /label: "상품문의"/);
  assert.match(shell, /href: "\/adm\/content\?view=inquiries"/);
  assert.match(shell, /label: "사용후기"/);
  assert.match(shell, /href: "\/adm\/content\?view=reviews"/);
  assert.match(contentPage, /<InteractionManager/);
  assert.match(interactionManager, /\/api\/admin\/interactions/);
});

test("point reporting stays below the local D1 compound-select limit", async () => {
  const reports = await read("lib/admin-reports.ts");

  assert.match(reports, /\) order_events\s+UNION ALL\s+SELECT event_type/s);
  assert.match(reports, /\) account_events/);

  const ledgerSql = reports.match(
    /function pointLedgerUnionSql\(\): string \{\s+return `([\s\S]*?)`;\s+\}/,
  )?.[1];
  assert.ok(ledgerSql);
  const orderStart = ledgerSql.indexOf("FROM (");
  const orderEnd = ledgerSql.indexOf(") order_events", orderStart);
  const accountStart = ledgerSql.indexOf("FROM (", orderEnd);
  const accountEnd = ledgerSql.lastIndexOf(") account_events");
  assert.ok(
    orderStart >= 0 &&
      orderEnd > orderStart &&
      accountStart > orderEnd &&
      accountEnd > accountStart,
  );
  const nestedGroups = [
    ledgerSql.slice(orderStart, orderEnd),
    ledgerSql.slice(accountStart, accountEnd),
  ];
  for (const group of nestedGroups) {
    assert.ok(
      (group.match(/\bUNION ALL\b/gu) ?? []).length <= 3,
      "each nested D1 compound must contain at most four SELECT terms",
    );
  }
});

test("legacy order list keeps the original three-row table and controls", async () => {
  const [manager, styles, orderList, page, route] = await Promise.all([
    read("app/adm/(protected)/orders/OrdersManager.tsx"),
    read("app/adm/legacy-admin.css"),
    read("lib/admin-order-list.ts"),
    read("app/adm/(protected)/orders/page.tsx"),
    read("app/api/admin/orders/route.ts"),
  ]);

  for (const label of [
    "전체취소",
    "부분취소",
    "PG간편결제",
    "KAKAOPAY",
    "미수금",
    "반품,품절",
    "포인트주문",
    "지난달",
    "선택수정",
    "선택삭제",
  ]) {
    assert.match(manager, new RegExp(label));
  }

  const tableHead = manager.match(/<thead>([\s\S]*?)<\/thead>/)?.[1] ?? "";
  assert.equal((tableHead.match(/<tr>/gu) ?? []).length, 3);
  assert.match(manager, /<Fragment key=\{order\.id\}>[\s\S]*?<tr[\s\S]*?<tr[\s\S]*?<tr/s);
  assert.match(manager, /rowSpan=\{3\}/);
  assert.match(manager, /colSpan=\{2\}/);
  assert.match(manager, /legacyBulkTransition/);
  assert.match(manager, /method: "PATCH"/);
  assert.match(manager, /method: "DELETE"/);
  assert.match(manager, /legacy-order-shipping-input/);
  assert.match(manager, /paginationPages\(page, totalPages\)/);
  assert.match(manager, /\{result\.total > 0 \? \(/);
  assert.match(manager, /무통장&gt;인 경우에만/);
  assert.match(manager, /에스크로배송등록&gt;을 체크하시면/);
  assert.match(manager, /className="btn_submit legacy-order-delete"/);

  for (const declaration of [
    /width: 1005px !important/,
    /height: 118\.765625px/,
    /height: 96px/,
    /input\.frm_input\[type="text"\]/,
    /height: 222px/,
    /height: 84\.78125px/,
    /height: 64\.78125px/,
    /width: 57\.609375px !important/,
    /\.legacy-order-col-check \{\s*width: 37\.53125px;/s,
    /\.legacy-order-col-order-half \{\s*width: 86\.28125px;/s,
    /\.legacy-order-col-total \{\s*width: 138\.078125px;/s,
    /\.legacy-order-col-receipt \{\s*width: 86\.28125px;/s,
    /\.legacy-order-col-coupon \{\s*width: 51\.75px;/s,
    /\.legacy-order-col-outstanding \{\s*width: 69\.015625px;/s,
  ]) {
    assert.match(styles, declaration);
  }

  for (const filter of [
    "outstandingOnly",
    "cancelledOnly",
    "refundedOnly",
    "pointsOrderOnly",
    "couponOnly",
    "paymentMethod",
    "searchField",
  ]) {
    assert.match(orderList, new RegExp(filter));
    assert.match(route, new RegExp(filter));
    assert.match(page, new RegExp(filter));
  }
  assert.match(orderList, /const SEARCH_FIELDS = new Set/);
  assert.match(orderList, /const SORTS = new Set/);
  assert.match(orderList, /LIMIT \? OFFSET \?/);
  assert.match(orderList, /GROUP BY o\.id/);
  assert.match(page, /readString\(params\.q\) \|\| readString\(params\.search\)/);
  assert.match(page, /readString\(params\.searchField\) \|\| readString\(params\.sel_field\)/);
  assert.match(page, /od_id: "orderNumber"/);
});
