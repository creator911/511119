import type { Metadata } from "next";
import { SiteFrame } from "@/app/components/SiteFrame";
import { PageHeading } from "@/app/components/storefront";
import {
  listPublishedFaqs,
  type ContentEntry,
} from "@/lib/site-content";

export const metadata: Metadata = { title: "자주하시는 질문" };

const categoryLabels: Record<string, string> = {
  general: "일반",
  product: "상품",
  order: "주문",
  payment: "결제",
  shipping: "배송",
  exchange: "교환·반품",
};

export default async function FaqPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = firstParam(params.stx).trim().slice(0, 80);
  const terms = query
    .toLocaleLowerCase("ko-KR")
    .split(/\s+/u)
    .filter(Boolean);
  const allFaqs = await listPublishedFaqs();
  const matches = allFaqs.filter((faq) => {
    if (!terms.length) return true;
    const text = `${faq.title} ${faq.body} ${categoryLabels[faq.category] ?? faq.category}`
      .toLocaleLowerCase("ko-KR");
    return terms.every((term) => text.includes(term));
  });
  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(matches.length / pageSize));
  const requestedPage = positiveInteger(firstParam(params.page), 1);
  const page = Math.min(requestedPage, pageCount);
  const faqs = matches.slice((page - 1) * pageSize, page * pageSize);

  return (
    <SiteFrame>
      <PageHeading
        title="자주하시는 질문"
        breadcrumbs={[
          { label: "Home", href: "/shop" },
          { label: "자주하시는 질문" },
        ]}
      />
      <main id="main-content" className="legal-page faq-page">
        <form className="faq-search" action="/bbs/faq.php" method="get">
          <label htmlFor="faq-search-keyword">FAQ 검색</label>
          <input
            id="faq-search-keyword"
            type="search"
            name="stx"
            defaultValue={query}
            placeholder="FAQ 검색"
            maxLength={80}
          />
          <button type="submit">검색</button>
        </form>
        {faqs.length > 0 ? (
          <div className="faq-list">
            {faqs.map((faq) => (
              <FaqItem faq={faq} key={faq.id} />
            ))}
          </div>
        ) : (
          <div className="empty-card">등록된 FAQ가 없습니다.</div>
        )}
        <nav className="public-pagination" aria-label="FAQ 페이지">
          {page > 1 ? (
            <a href={faqHref(query, page - 1)} aria-label="이전 페이지">
              ‹
            </a>
          ) : null}
          {Array.from({ length: pageCount }, (_, index) => index + 1).map(
            (pageNumber) => (
              <a
                href={faqHref(query, pageNumber)}
                aria-current={pageNumber === page ? "page" : undefined}
                key={pageNumber}
              >
                {pageNumber}
                <span className="visually-hidden"> 페이지</span>
              </a>
            ),
          )}
          {page < pageCount ? (
            <a href={faqHref(query, page + 1)} aria-label="다음 페이지">
              ›
            </a>
          ) : null}
        </nav>
      </main>
    </SiteFrame>
  );
}

function FaqItem({ faq }: { faq: ContentEntry }) {
  return (
    <details className="faq-item">
      <summary>
        <span className="faq-category">
          {categoryLabels[faq.category] ?? faq.category}
        </span>
        <strong>{faq.title}</strong>
      </summary>
      <div className="faq-answer">
        {faq.body.split(/\n{2,}/u).map((paragraph, index) => (
          <p key={`${faq.id}-${index}`}>{paragraph}</p>
        ))}
      </div>
    </details>
  );
}

function faqHref(query: string, page: number): string {
  const params = new URLSearchParams();
  if (query) params.set("stx", query);
  params.set("page", String(Math.max(1, Math.trunc(page) || 1)));
  return `/bbs/faq.php?${params.toString()}`;
}

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? String(value[0] ?? "") : String(value ?? "");
}

function positiveInteger(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0
    ? Math.max(1, Math.trunc(parsed))
    : fallback;
}
