import type { Metadata } from "next";
import Link from "next/link";
import {
  getAdminShopOverviewData,
  type ShopOverviewFeedItem,
} from "@/lib/admin-shop-overview";
import { requireAdminPagePermission } from "@/lib/auth";

export const metadata: Metadata = {
  title: "쇼핑몰현황",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const ANCHORS = [
  ["#anc_sidx_ord", "주문현황"],
  ["#anc_sidx_rdy", "입금완료미배송내역"],
  ["#anc_sidx_wait", "미입금주문내역"],
  ["#anc_sidx_ps", "사용후기"],
  ["#anc_sidx_qna", "상품문의"],
] as const;

export default async function AdminShopOverviewPage() {
  await requireAdminPagePermission("dashboard.view");
  const dashboard = await getAdminShopOverviewData();
  const maxGraphAmount = Math.max(
    1,
    ...dashboard.graphDays.flatMap((day) => [
      day.orderAmount,
      day.cancelAmount,
    ]),
  );
  const graphScale = roundGraphScale(maxGraphAmount);

  return (
    <div className="legacy-shop-overview">
      <div className="sidx">
        <section id="anc_sidx_ord">
          <h2>주문현황</h2>
          <AnchorLinks />
          <div id="sidx_graph">
            <ul id="sidx_graph_price" aria-hidden="true">
              {[5, 4, 3, 2, 1].map((step) => (
                <li key={step}>
                  <span />
                  {Math.round((graphScale * step) / 5).toLocaleString("ko-KR")}
                </li>
              ))}
            </ul>
            <ul id="sidx_graph_area" aria-label="최근 7일 주문 및 취소 금액">
              {dashboard.graphDays.map((day, index) => (
                <li className={index % 2 ? "bg1" : "bg0"} key={day.date}>
                  <div
                    className="graph order"
                    title={`${day.label} 주문: ${day.orderAmount.toLocaleString("ko-KR")}원`}
                    style={{
                      height: `${Math.round((240 * day.orderAmount) / graphScale)}px`,
                    }}
                  />
                  <div
                    className="graph cancel"
                    title={`${day.label} 취소: ${day.cancelAmount.toLocaleString("ko-KR")}원`}
                    style={{
                      height: `${Math.round((240 * day.cancelAmount) / graphScale)}px`,
                    }}
                  />
                </li>
              ))}
            </ul>
            <ul id="sidx_graph_date" aria-hidden="true">
              {dashboard.graphDays.map((day) => (
                <li key={day.date}>
                  <span />
                  {day.label}
                </li>
              ))}
            </ul>
            <div id="sidx_graph_legend">
              <span id="legend_order" /> 주문
              <span id="legend_cancel" /> 취소
            </div>
          </div>
        </section>

        <div id="sidx_stat">
          <section id="anc_sidx_act">
            <h2>처리할 주문</h2>
            <AnchorLinks />
            <div id="sidx_take_act" className="tbl_head01 tbl_wrap">
              <table>
                <thead>
                  <tr>
                    <th scope="col" className="td_mng">
                      상태변경
                    </th>
                    <th scope="col">건수</th>
                    <th scope="col">금액</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.transitions.map((row) => (
                    <tr key={row.key}>
                      <th scope="row">{row.label}</th>
                      <td className="td_num">
                        <Link href={row.href}>
                          {row.count.toLocaleString("ko-KR")}
                        </Link>
                      </td>
                      <td className="td_price">
                        <Link href={row.href}>
                          {row.amount.toLocaleString("ko-KR")}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section id="anc_sidx_stock">
            <h2>재고현황</h2>
            <AnchorLinks />
            <div id="sidx_stock" className="tbl_head01 tbl_wrap">
              <table>
                <thead>
                  <tr>
                    <th scope="col">재고부족 상품</th>
                    <th scope="col">재고부족 옵션</th>
                    <th scope="col">SMS 잔여금액</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="td_num2">
                      <Link href="/adm/products?view=stock">
                        {dashboard.lowStockProducts.toLocaleString("ko-KR")}
                      </Link>
                    </td>
                    <td className="td_num2">
                      <Link href="/adm/tools/product-option-stock">
                        {dashboard.lowStockOptions.toLocaleString("ko-KR")}
                      </Link>
                    </td>
                    <td className="td_price">
                      {dashboard.smsBalance.toLocaleString("ko-KR")}원
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>

      <section id="anc_sidx_settle">
        <h2>결제수단별 주문현황</h2>
        <AnchorLinks />
        <div id="sidx_settle" className="tbl_head01 tbl_wrap">
          <table>
            <thead>
              <tr>
                <th scope="col" rowSpan={2}>
                  구분
                </th>
                {dashboard.paymentDays.map((day) => (
                  <th scope="col" colSpan={2} key={day.date}>
                    {day.label}
                  </th>
                ))}
              </tr>
              <tr>
                {dashboard.paymentDays.flatMap((day) => [
                  <th scope="col" key={`${day.date}-count`}>
                    건수
                  </th>,
                  <th scope="col" key={`${day.date}-amount`}>
                    금액
                  </th>,
                ])}
              </tr>
            </thead>
            <tbody>
              {dashboard.paymentRows.map((row) => (
                <tr key={row.key}>
                  <th scope="row" className="td_category">
                    {row.label}
                  </th>
                  {row.days.flatMap((day, index) => [
                    <td key={`${row.key}-${index}-count`}>
                      {day.count.toLocaleString("ko-KR")}
                    </td>,
                    <td key={`${row.key}-${index}-amount`}>
                      {day.amount.toLocaleString("ko-KR")}
                    </td>,
                  ])}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="sidx sidx_cs">
        <FeedSection
          id="anc_sidx_oneq"
          title="1:1문의"
          items={dashboard.inquiries}
          moreHref="/adm/community?view=inquiries"
          moreLabel="1:1문의 더보기"
        />
        <FeedSection
          id="anc_sidx_qna"
          title="상품문의"
          items={dashboard.productQuestions}
          moreHref="/adm/content?view=inquiries"
          moreLabel="상품문의 더보기"
        />
        <FeedSection
          id="anc_sidx_ps"
          title="사용후기"
          items={dashboard.reviews}
          moreHref="/adm/content?view=reviews"
          moreLabel="사용후기 더보기"
        />
      </div>
    </div>
  );
}

function AnchorLinks() {
  return (
    <ul className="anchor sidx_anchor">
      {ANCHORS.map(([href, label]) => (
        <li key={href}>
          <a href={href}>{label}</a>
        </li>
      ))}
    </ul>
  );
}

function FeedSection({
  id,
  title,
  items,
  moreHref,
  moreLabel,
}: {
  id: string;
  title: string;
  items: ShopOverviewFeedItem[];
  moreHref: string;
  moreLabel: string;
}) {
  return (
    <section id={id}>
      <h2>{title}</h2>
      <AnchorLinks />
      <div className="ul_01 ul_wrap">
        <ul>
          {items.length ? (
            items.map((item) => (
              <li key={item.id}>
                <Link href={moreHref} title={`${item.author} · ${item.createdAt}`}>
                  {item.title}
                </Link>
              </li>
            ))
          ) : (
            <li className="empty_list">자료가 없습니다.</li>
          )}
        </ul>
      </div>
      <div className="btn_list03 btn_list">
        <Link href={moreHref}>{moreLabel}</Link>
      </div>
    </section>
  );
}

function roundGraphScale(value: number): number {
  const unit = 10 ** Math.max(0, Math.floor(Math.log10(value)) - 1);
  return Math.max(5, Math.ceil(value / unit / 5) * unit * 5);
}
