"use client";

/* eslint-disable @next/next/no-img-element -- the cloned store uses local legacy image paths */

import { useEffect, useState } from "react";
import styles from "./HomeProductCard.module.css";
import type { ProductSummary } from "./types";

let homeWishlistRequest: Promise<Set<string>> | null = null;

function loadWishlist(force = false) {
  if (force) homeWishlistRequest = null;
  homeWishlistRequest ??= fetch("/api/customer/wishlist", { cache: "no-store" })
    .then(async (response) => {
      if (!response.ok) return new Set<string>();
      const payload = (await response.json()) as { productIds?: string[] };
      return new Set(Array.isArray(payload.productIds) ? payload.productIds : []);
    })
    .catch(() => new Set<string>());
  return homeWishlistRequest;
}

function joinClassNames(
  ...classNames: Array<string | false | null | undefined>
) {
  return classNames.filter(Boolean).join(" ");
}

export type HomeProductCardStyle = "bordered" | "plain";

export interface HomeProductCardProps {
  product: ProductSummary;
  cardStyle?: HomeProductCardStyle;
  saleBadge?: boolean;
  carousel?: boolean;
  countdownSpacer?: boolean;
}

const namesWithoutSuffixSpace = new Set([
  "토끼 골드바",
  "1캐럿 모이사나이트 반지 4프롱",
  "투자용 실버바 1000g",
]);

export function HomeProductCard({
  product,
  cardStyle = "bordered",
  saleBadge = false,
  carousel = false,
  countdownSpacer = false,
}: HomeProductCardProps) {
  const [wished, setWished] = useState(false);
  const hasComparePrice =
    typeof product.compareAtPrice === "number" && product.compareAtPrice > 0;
  const accessibleProductName = `${product.name}${
    namesWithoutSuffixSpace.has(product.name) ? "" : " "
  }요약정보 및 구매`;

  useEffect(() => {
    let disposed = false;

    const refresh = (force = false) => {
      void loadWishlist(force).then((productIds) => {
        if (!disposed) setWished(productIds.has(product.id));
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

    try {
      const response = await fetch("/api/customer/wishlist", {
        method: next ? "POST" : "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ productId: product.id }),
      });

      if (response.status === 401) {
        window.location.assign(
          `/bbs/login.php?return_url=${encodeURIComponent(
            window.location.pathname + window.location.search,
          )}`,
        );
        return;
      }
      if (!response.ok) {
        window.alert("위시리스트를 변경하지 못했습니다.");
        return;
      }

      setWished(next);
      homeWishlistRequest = null;
      window.dispatchEvent(new CustomEvent("kg-wishlist-change"));
    } catch {
      window.alert("위시리스트를 변경하지 못했습니다.");
    }
  }

  function share(network: "facebook" | "twitter") {
    const productUrl = new URL(product.href, window.location.origin).href;
    const title = `${accessibleProductName} | 키엘골드(KIEL-GOLD)`;
    const shareUrl =
      network === "facebook"
        ? `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(
            productUrl,
          )}`
        : `https://twitter.com/intent/tweet?url=${encodeURIComponent(
            productUrl,
          )}&text=${encodeURIComponent(title)}`;

    window.open(
      shareUrl,
      `kiel-${network}-share`,
      "popup=yes,width=640,height=560,noopener,noreferrer",
    );
  }

  const badgeTone = saleBadge
    ? styles.badgePurple
    : product.badgeTone
      ? styles[`badge_${product.badgeTone}` as keyof typeof styles]
      : styles.badgeNeutral;

  return (
    <article
      className={joinClassNames(
        styles.card,
        cardStyle === "bordered" ? styles.bordered : styles.plain,
        carousel && styles.carouselCard,
      )}
    >
      <a href={product.href} className={styles.imageLink}>
        <div className={styles.imageArea}>
          <div className={styles.imageFrame}>
            <div className={styles.primaryImage}>
              <img
                src={product.image}
                alt={accessibleProductName}
                loading="lazy"
              />
            </div>
            {product.hoverImage ? (
              <div className={styles.secondaryImage}>
                <img
                  src={product.hoverImage}
                  alt={accessibleProductName}
                  loading="lazy"
                />
              </div>
            ) : null}
            {saleBadge || product.badge ? (
              <div className={styles.badgeArea}>
                <span className={joinClassNames(styles.badge, badgeTone)}>
                  {saleBadge ? "할인" : product.badge}
                </span>
              </div>
            ) : null}
            {product.discountPercent ? (
              <span className={styles.discountPercent}>
                {product.discountPercent}%
              </span>
            ) : null}
            {product.soldOut ? (
              <span className={styles.soldOut}>SOLD OUT</span>
            ) : null}
          </div>
        </div>
      </a>

      <div className={styles.description}>
        <div className={styles.descriptionInner}>
          <h3 className={styles.name}>
            <a href={product.href}>{accessibleProductName}</a>
          </h3>
          <div className={styles.price}>
            <strong>₩ {product.price.toLocaleString("ko-KR")}</strong>
            {hasComparePrice ? (
              <>
                {" "}
                <del>
                  ₩ {(product.compareAtPrice as number).toLocaleString("ko-KR")}
                </del>
              </>
            ) : null}
          </div>
          {product.description ? (
            <div className={styles.info}>{product.description}</div>
          ) : null}
          {countdownSpacer ? (
            <div className={styles.countdownSpacer} aria-hidden="true" />
          ) : null}
          <div className={styles.social}>
            <ul>
              <li>
                <button
                  type="button"
                  className={joinClassNames(
                    styles.socialButton,
                    styles.wishButton,
                    wished && styles.wished,
                  )}
                  onClick={() => void toggleWish()}
                  title="위시리스트"
                  aria-label={`${product.name} 위시리스트 ${
                    wished ? "해제" : "추가"
                  }`}
                >
                  <span aria-hidden="true"></span>
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className={joinClassNames(
                    styles.socialButton,
                    styles.facebookButton,
                  )}
                  onClick={() => share("facebook")}
                  title="페이스북"
                  aria-label={`${product.name} 페이스북 공유`}
                >
                  <span aria-hidden="true"></span>
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className={joinClassNames(
                    styles.socialButton,
                    styles.twitterButton,
                  )}
                  onClick={() => share("twitter")}
                  title="트위터"
                  aria-label={`${product.name} 트위터 공유`}
                >
                  <span aria-hidden="true"></span>
                </button>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div className={styles.bottom}>
        <a href={`${product.href}#product-tab-reviews`}>
          리뷰보기
          {typeof product.reviewCount === "number" && product.reviewCount > 0
            ? ` (${product.reviewCount})`
            : ""}
        </a>
        <span
          className={styles.ratings}
          aria-label={`평점 ${product.rating ?? 0}점`}
        >
          {Array.from({ length: 5 }, (_, index) => (
            <span
              aria-hidden="true"
              className={
                index < Math.round(product.rating ?? 0)
                  ? styles.ratingSelected
                  : undefined
              }
              key={index}
            >
              
            </span>
          ))}
        </span>
      </div>
    </article>
  );
}
