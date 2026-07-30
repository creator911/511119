import styles from "./Storefront.module.css";
import type { OrderSummary } from "./types";
import { EmptyState, Panel } from "./StorefrontPrimitives";
import { formatKRW } from "./utils";

export interface MyPagePanelProps {
  memberName: string;
  grade?: string;
  points: number;
  coupons?: number;
  balance?: number;
  orders?: OrderSummary[];
  menuLinks?: Array<{
    label: string;
    description: string;
    href: string;
    icon?: string;
  }>;
  editProfileHref?: string;
  ordersHref?: string;
}

const defaultMenuLinks = [
  {
    label: "주문/배송조회",
    description: "주문 내역과 배송 상태를 확인합니다.",
    href: "/shop/orderinquiry.php",
    icon: "▣",
  },
  {
    label: "충전신청",
    description: "입금 확인 후 사용할 포인트를 신청합니다.",
    href: "/bbs/writecz.php",
    icon: "₩",
  },
  {
    label: "출금신청",
    description: "보유 포인트의 출금을 신청합니다.",
    href: "/bbs/cashtx.php",
    icon: "↗",
  },
  {
    label: "충전·출금내역",
    description: "신청과 승인·반려 결과를 확인합니다.",
    href: "/bbs/withdrawal_list.php",
    icon: "≡",
  },
  {
    label: "위시리스트",
    description: "관심 상품을 한곳에서 확인합니다.",
    href: "/shop/wishlist.php",
    icon: "♡",
  },
  {
    label: "쿠폰존",
    description: "현재 발급 가능한 쿠폰을 확인합니다.",
    href: "/shop/couponzone.php",
    icon: "%",
  },
  {
    label: "장바구니",
    description: "담아 둔 상품과 주문 수량을 확인합니다.",
    href: "/shop/cart.php",
    icon: "▤",
  },
  {
    label: "자주 묻는 질문",
    description: "주문과 배송 관련 안내를 확인합니다.",
    href: "/bbs/faq.php",
    icon: "?",
  },
  {
    label: "쇼핑 계속하기",
    description: "골드리안 전체 상품을 둘러봅니다.",
    href: "/shop",
    icon: "◆",
  },
];

export function MyPagePanel({
  memberName,
  grade = "일반회원",
  points,
  coupons = 0,
  balance = 0,
  orders = [],
  menuLinks = defaultMenuLinks,
  editProfileHref = "/shop/profile.php",
  ordersHref = "/shop/orderinquiry.php",
}: MyPagePanelProps) {
  return (
    <main id="main-content" className={styles.formPage}>
      <div className={styles.container}>
        <header className={styles.formPageHeader}>
          <h1>마이페이지</h1>
          <p>회원 정보와 쇼핑 내역을 확인할 수 있습니다.</p>
        </header>

        <section className={styles.memberSummary}>
          <div className={styles.memberGreeting}>
            <span className={styles.memberAvatar} aria-hidden="true">
              {memberName.slice(0, 1)}
            </span>
            <div>
              <p>
                <strong>{memberName}</strong>님, 반갑습니다.
              </p>
              <span>{grade}</span>
            </div>
            <a href={editProfileHref}>회원정보 수정</a>
          </div>
          <dl className={styles.memberStats}>
            <div>
              <dt>보유 포인트</dt>
              <dd>{points.toLocaleString("ko-KR")}P</dd>
            </div>
            <div>
              <dt>사용가능 쿠폰</dt>
              <dd>{coupons.toLocaleString("ko-KR")}장</dd>
            </div>
            <div>
              <dt>보유 잔액</dt>
              <dd>{formatKRW(balance)}</dd>
            </div>
          </dl>
        </section>

        <div className={styles.myPageMenuGrid}>
          {menuLinks.map((link) => (
            <a href={link.href} key={link.href}>
              <span aria-hidden="true">{link.icon ?? "•"}</span>
              <strong>{link.label}</strong>
              <p>{link.description}</p>
              <em aria-hidden="true">›</em>
            </a>
          ))}
        </div>

        <Panel
          title="최근 주문내역"
          actions={
            <a className={styles.textLink} href={ordersHref}>
              전체보기
            </a>
          }
        >
          {orders.length > 0 ? (
            <div className={styles.orderTable}>
              <div className={styles.orderTableHeader}>
                <span>주문일자</span>
                <span>주문번호</span>
                <span>상품정보</span>
                <span>결제금액</span>
                <span>상태</span>
              </div>
              {orders.map((order) => (
                <a
                  href={
                    order.href ??
                    `${ordersHref}?order_id=${encodeURIComponent(order.id)}`
                  }
                  className={styles.orderTableRow}
                  key={order.id}
                >
                  <span data-label="주문일자">{order.orderedAt}</span>
                  <span data-label="주문번호">{order.id}</span>
                  <strong data-label="상품정보">{order.label}</strong>
                  <span data-label="결제금액">{formatKRW(order.amount)}</span>
                  <em data-label="상태">{order.status}</em>
                </a>
              ))}
            </div>
          ) : (
            <EmptyState title="최근 주문내역이 없습니다." />
          )}
        </Panel>
      </div>
    </main>
  );
}
