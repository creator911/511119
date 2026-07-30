"use client";

/* eslint-disable @next/next/no-img-element -- local legacy paths are supplied at runtime */

import { useEffect, useState } from "react";
import styles from "./Storefront.module.css";
import type { ProductSummary } from "./types";
import { classNames } from "./utils";

let wishlistRequest: Promise<Set<string>> | null = null;

function loadWishlist(force = false) {
  if (force) wishlistRequest = null;
  wishlistRequest ??= fetch("/api/customer/wishlist", { cache: "no-store" })
    .then(async (response) => {
      if (!response.ok) return new Set<string>();
      const payload = (await response.json()) as { productIds?: string[] };
      return new Set(
        Array.isArray(payload.productIds) ? payload.productIds : [],
      );
    })
    .catch(() => new Set<string>());
  return wishlistRequest;
}

export interface ProductCardProps {
  product: ProductSummary;
  layout?: "grid" | "list" | "compact";
  initiallyWished?: boolean;
  onToggleWish?: (productId: string, wished: boolean) => void;
}

export function ProductCard({
  product,
  layout = "grid",
  initiallyWished = false,
  onToggleWish,
}: ProductCardProps) {
  const [wished, setWished] = useState(initiallyWished);
  const hasDiscount =
    typeof product.compareAtPrice === "number" &&
    product.compareAtPrice > product.price;
  const badgeClass = product.badgeTone
    ? styles[`badge_${product.badgeTone}` as keyof typeof styles]
    : styles.badge_neutral;

  useEffect(() => {
    let disposed = false;
    const refresh = (force = false) => {
      void loadWishlist(force).then((ids) => {
        if (!disposed) setWished(ids.has(product.id));
      });
    };
    const handleRefresh = () => refresh(true);
    refresh();
    window.addEventListener("kg-wishlist-change", handleRefresh);
    return () => {
      disposed = true;
      window.removeEventListener("kg-wishlist-change", handleRefresh);
    };
  }, [product.id]);

  async function toggleWish() {
    const next = !wished;
    if (onToggleWish) {
      onToggleWish(product.id, next);
      return;
    }
    try {
      const response = await fetch("/api/customer/wishlist", {
        method: next ? "POST" : "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ productId: product.id }),
      });
      if (response.status === 401) {
        window.location.assign(
          `/bbs/login.php?return_url=${encodeURIComponent(window.location.pathname + window.location.search)}`,
        );
        return;
      }
      if (!response.ok) {
        window.alert("위시리스트를 변경하지 못했습니다.");
        return;
      }
      setWished(next);
      wishlistRequest = null;
      window.dispatchEvent(new CustomEvent("kg-wishlist-change"));
    } catch {
      window.alert("위시리스트를 변경하지 못했습니다.");
    }
  }

  function share(network: "facebook" | "twitter") {
    const pageUrl = new URL(product.href, window.location.origin).href;
    const title = `${product.name} | 골드리안(GOLDRIAN)`;
    const shareUrl =
      network === "facebook"
        ? `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(pageUrl)}`
        : `https://twitter.com/intent/tweet?url=${encodeURIComponent(pageUrl)}&text=${encodeURIComponent(title)}`;
    window.open(
      shareUrl,
      `kiel-${network}-share`,
      "popup=yes,width=640,height=560,noopener,noreferrer",
    );
  }

  return (
    <article
      className={classNames(
        styles.productCard,
        layout === "list" && styles.productCardList,
        layout === "compact" && styles.productCardCompact,
      )}
    >
      <div className={styles.productImageArea}>
        <a href={product.href} className={styles.productImageLink}>
          <span className={styles.productImageFrame}>
            <img
              className={styles.productPrimaryImage}
              src={product.image}
              alt={`${product.name} 요약정보 및 구매`}
              loading="lazy"
            />
            {product.hoverImage ? (
              <img
                className={styles.productHoverImage}
                src={product.hoverImage}
                alt=""
                loading="lazy"
              />
            ) : null}
          </span>
          {product.discountPercent ? (
            <span className={styles.discountCorner}>
              <span>할인</span>
              {product.discountPercent}%
            </span>
          ) : null}
          {product.badge ? (
            <span className={classNames(styles.productBadge, badgeClass)}>
              {product.badge}
            </span>
          ) : null}
          {product.soldOut ? (
            <span className={styles.soldOutOverlay}>SOLD OUT</span>
          ) : null}
        </a>
        <div className={styles.productQuickActions}>
          <button
            type="button"
            onClick={() => void toggleWish()}
            className={wished ? styles.productActionActive : undefined}
            aria-label={`${product.name} 위시리스트 ${wished ? "해제" : "담기"}`}
          >
            {wished ? "♥" : "♡"}
          </button>
          <button
            type="button"
            onClick={() => share("facebook")}
            aria-label={`${product.name} 페이스북 공유`}
          >
            f
          </button>
          <button
            type="button"
            onClick={() => share("twitter")}
            aria-label={`${product.name} 트위터 공유`}
          >
            𝕏
          </button>
        </div>
      </div>

      <div className={styles.productDescription}>
        <div className={styles.productDescriptionMain}>
          <h3 className={styles.productName}>
            <a href={product.href}>{product.name}</a>
          </h3>
          <div className={styles.productPrices}>
            <strong>₩ {product.price.toLocaleString("ko-KR")}</strong>
            {hasDiscount ? (
              <del>
                ₩ {(product.compareAtPrice as number).toLocaleString("ko-KR")}
              </del>
            ) : null}
          </div>
          {product.description ? (
            <p className={styles.productInfo}>{product.description}</p>
          ) : null}
        </div>
        <div className={styles.productCardBottom}>
          <span
            className={styles.productRating}
            aria-label={`평점 ${product.rating ?? 0}점`}
          >
            {Array.from({ length: 5 }, (_, index) => (
              <span
                key={index}
                className={
                  index < Math.round(product.rating ?? 0)
                    ? styles.ratingSelected
                    : undefined
                }
              >
                ★
              </span>
            ))}
          </span>
          <a
            href={`${product.href}#product-tab-reviews`}
            className={styles.reviewLink}
          >
            리뷰보기
            {typeof product.reviewCount === "number" && product.reviewCount > 0
              ? ` (${product.reviewCount})`
              : ""}
          </a>
        </div>
      </div>
    </article>
  );
}
