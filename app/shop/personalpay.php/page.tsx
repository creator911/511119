import type { Metadata } from "next";
import { SiteFrame } from "@/app/components/SiteFrame";
import { PageHeading } from "@/app/components/storefront";
import {
  getPublicPersonalPayment,
  listPublicPersonalPayments,
} from "@/lib/personal-payments";
import { PersonalPaymentNoticeForm } from "./PersonalPaymentNoticeForm";
import styles from "./personal-payment.module.css";

export const metadata: Metadata = {
  title: "개인결제 리스트",
  robots: { index: false, follow: true },
};
export const dynamic = "force-dynamic";

interface PersonalPaymentPageProps {
  searchParams: Promise<{
    token?: string | string[];
    pp_id?: string | string[];
  }>;
}

export default async function PersonalPaymentPage({
  searchParams,
}: PersonalPaymentPageProps) {
  const query = await searchParams;
  const token = firstValue(query.token) || firstValue(query.pp_id);
  const selected = token ? await getPublicPersonalPayment(token) : null;
  const payments = token ? [] : await listPublicPersonalPayments();

  return (
    <SiteFrame>
      <PageHeading
        title="개인결제"
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "쇼핑몰", href: "/shop" },
          { label: "개인결제" },
        ]}
      />
      <main id="main-content" className={styles.page}>
        {token ? (
          selected ? (
            <section className={styles.detailCard}>
              <header>
                <span>개인결제</span>
                <h2>{selected.title}</h2>
              </header>
              <dl className={styles.priceRows}>
                <div>
                  <dt>주문금액</dt>
                  <dd>{formatWon(selected.orderAmount)}</dd>
                </div>
                <div>
                  <dt>입금확인금액</dt>
                  <dd>{formatWon(selected.receiptAmount)}</dd>
                </div>
                <div className={styles.outstanding}>
                  <dt>미수금액</dt>
                  <dd>{formatWon(selected.outstandingAmount)}</dd>
                </div>
                <div>
                  <dt>결제방법</dt>
                  <dd>{selected.paymentMethod || "관리자 확인 필요"}</dd>
                </div>
              </dl>
              {selected.content ? (
                <p className={styles.description}>{selected.content}</p>
              ) : null}
              <PersonalPaymentNoticeForm payment={selected} />
              <a className={styles.backLink} href="/shop/personalpay.php">
                개인결제 목록
              </a>
            </section>
          ) : (
            <div className={styles.empty}>
              <span aria-hidden="true">!</span>
              <p>사용할 수 있는 개인결제 요청을 찾지 못했습니다.</p>
              <a href="/shop/personalpay.php">개인결제 목록</a>
            </div>
          )
        ) : payments.length > 0 ? (
          <section className={styles.grid} aria-label="개인결제 목록">
            {payments.map((payment) => (
              <article className={styles.card} key={payment.publicToken}>
                <a
                  href={`/shop/personalpay.php?token=${encodeURIComponent(payment.publicToken)}`}
                >
                  <div className={styles.cardMark} aria-hidden="true">
                    RIAN
                  </div>
                  <h2>{payment.title}</h2>
                  <p className={styles.cardPrice}>
                    {formatWon(payment.outstandingAmount)}
                  </p>
                  <span>개인결제 확인</span>
                </a>
              </article>
            ))}
          </section>
        ) : (
          <div className={styles.empty}>
            <span aria-hidden="true">!</span>
            <p>등록된 개인결제가 없습니다.</p>
          </div>
        )}
      </main>
    </SiteFrame>
  );
}

function firstValue(value: string | string[] | undefined): string {
  return typeof value === "string" ? value.trim() : value?.[0]?.trim() ?? "";
}

function formatWon(value: number): string {
  return `${new Intl.NumberFormat("ko-KR").format(value)}원`;
}
