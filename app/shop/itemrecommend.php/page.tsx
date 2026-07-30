import type { Metadata } from "next";
import { getStorefrontProduct } from "@/lib/storefront-products";
import { RecommendationForm } from "./RecommendationForm";
import styles from "./RecommendationForm.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "상품 추천하기",
  robots: {
    index: false,
    follow: false,
  },
};

type SearchParams = Record<string, string | string[] | undefined>;

export default async function ItemRecommendationPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const rawId = firstParam(params.it_id);
  const productId = /^[A-Za-z0-9_-]{1,40}$/u.test(rawId) ? rawId : "";
  const product = productId
    ? await getStorefrontProduct(productId)
    : undefined;

  if (!product?.active) {
    return (
      <main className={styles.popup}>
        <h1 className={styles.title}>상품 추천하기</h1>
        <section className={styles.unavailable} role="alert">
          <strong>상품 정보를 찾을 수 없습니다.</strong>
          <p>창을 닫고 상품 페이지에서 다시 시도해 주세요.</p>
        </section>
      </main>
    );
  }

  const productName = cleanProductName(product.name);
  return (
    <RecommendationForm
      productId={product.id}
      productName={productName}
      productHref={`/shop/item.php?it_id=${encodeURIComponent(product.id)}`}
    />
  );
}

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? String(value[0] ?? "") : String(value ?? "");
}

function cleanProductName(value: string): string {
  return value
    .replace(/\s*요약정보\s*및\s*구매.*$/u, "")
    .trim();
}
