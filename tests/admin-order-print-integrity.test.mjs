import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("order-print menu opens a dedicated original-style selector", async () => {
  const [toolPage, orderPage, manager, frame, css] = await Promise.all([
    source("app/adm/(protected)/tools/[tool]/page.tsx"),
    source("app/adm/(protected)/orders/page.tsx"),
    source("app/adm/(protected)/orders/OrderPrintManager.tsx"),
    source("app/adm/(protected)/AdminFrame.tsx"),
    source("app/adm/legacy-admin.css"),
  ]);

  assert.match(toolPage, /redirect\("\/adm\/orders\?print=1"\)/u);
  assert.match(orderPage, /readString\(params\.print\) === "1"/u);
  assert.match(orderPage, /return <OrderPrintManager today=\{koreaTodayYmd\(\)\} \/>/u);
  const orderPageBody = orderPage.slice(orderPage.indexOf("export default"));
  assert.ok(
    orderPageBody.indexOf("return <OrderPrintManager") <
      orderPageBody.indexOf("const initialResult = await getAdminOrdersPage"),
  );
  assert.match(frame, /active: "item-500-order-print"/u);
  assert.match(frame, /title: "주문내역출력"/u);

  const normalizedManager = manager.replace(/\s+/gu, " ");
  for (const text of [
    "기간별 출력",
    "주문번호구간별 출력",
    "MS엑셀 XLS 데이터",
    "MS엑셀 CSV 데이터",
    "출력 (새창)",
    "기간별 혹은 주문번호구간별 주문내역을 새창으로 출력할 수 있습니다.",
  ]) {
    assert.ok(
      normalizedManager.includes(text),
      `missing original label: ${text}`,
    );
  }
  for (const field of [
    "case",
    "csv",
    "ct_status",
    "fr_date",
    "to_date",
    "fr_od_id",
    "to_od_id",
  ]) {
    assert.match(manager, new RegExp(`name="${field}"`));
  }
  for (const status of [
    "주문",
    "입금",
    "준비",
    "배송",
    "완료",
    "취소",
    "반품",
    "품절",
  ]) {
    assert.match(manager, new RegExp(`"${status}"`));
  }
  assert.match(manager, /window\.open\(/u);
  assert.match(manager, /width=670,height=800/u);
  assert.match(manager, /anchor\.click\(\)/u);
  assert.match(css, /\.legacy-order-print-config \.local_sch03/u);
  assert.match(css, /background:\s*#e9ebf9/u);
});

test("order-print output is authenticated, bounded, and downloadable", async () => {
  const [route, library, orderManager] = await Promise.all([
    source("app/api/admin/orders/print/route.ts"),
    source("lib/admin-order-print.ts"),
    source("app/adm/(protected)/orders/OrdersManager.tsx"),
  ]);

  assert.match(route, /requireAdminApiSession\(request\)/u);
  assert.match(route, /parseAdminOrderPrintCriteria/u);
  assert.match(route, /text\/csv; charset=utf-8/u);
  assert.match(route, /application\/vnd\.ms-excel; charset=utf-8/u);
  assert.match(route, /text\/html; charset=utf-8/u);
  assert.match(route, /Content-Disposition/u);
  assert.match(route, /Content-Security-Policy/u);

  assert.match(library, /MAX_PRINT_ROWS = 20_000/u);
  assert.match(library, /o\.created_at >= \?/u);
  assert.match(library, /o\.id >= \?/u);
  assert.match(library, /escapeHtml/u);
  assert.match(library, /csvCell/u);
  assert.match(library, /__soldout__/u);
  assert.doesNotMatch(library, /kiel-gold\.com/iu);
  assert.doesNotMatch(orderManager, /printMode|window\.print/u);
});
