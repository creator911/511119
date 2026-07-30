"use client";

import styles from "./Storefront.module.css";
import type { ProductSectionData } from "./types";
import { ProductCard } from "./ProductCard";
import { HomeProductCard } from "./HomeProductCard";
import { HomeProductCarousel } from "./HomeProductCarousel";
import { SectionTitle } from "./StorefrontPrimitives";
import { classNames } from "./utils";

export function ProductSection({
  section,
  className,
}: {
  section: ProductSectionData;
  className?: string;
}) {
  if (section.products.length === 0) return null;

  const isHomeSection = section.variant?.startsWith("home-") ?? false;
  const isHomeCarousel =
    section.variant === "home-sale" || section.variant === "home-popular";
  const isPlain =
    section.variant === "home-plain" || section.variant === "home-popular";

  return (
    <section
      className={classNames(
        styles.productSection,
        isHomeSection && styles.homeProductSection,
        className,
      )}
      aria-labelledby={`product-section-${section.id}`}
    >
      <div id={`product-section-${section.id}`}>
        <SectionTitle
          lead={section.lead}
          suffix={section.suffix}
          href={section.href}
        />
      </div>
      {isHomeCarousel ? (
        <div className={styles.homeCarouselFrame}>
          <HomeProductCarousel
            products={section.products}
            mode={section.variant === "home-sale" ? "sale" : "popular"}
            renderProduct={(product) => (
              <HomeProductCard
                product={product}
                cardStyle={
                  section.variant === "home-sale" ? "bordered" : "plain"
                }
                saleBadge={section.variant === "home-sale"}
                carousel
              />
            )}
          />
        </div>
      ) : isHomeSection ? (
        <div
          className={classNames(
            styles.homeProductGrid,
            isPlain && styles.homeProductGridPlain,
          )}
        >
          {section.products.map((product) => (
            <div className={styles.homeProductGridItem} key={product.id}>
              <HomeProductCard
                product={product}
                cardStyle={isPlain ? "plain" : "bordered"}
                countdownSpacer={section.variant === "home-plain"}
              />
            </div>
          ))}
        </div>
      ) : (
        <div
          className={classNames(
            styles.productGrid,
            section.variant === "compact" && styles.productGridCompact,
          )}
        >
          {section.products.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              layout={section.variant === "compact" ? "compact" : "grid"}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export function ProductSections({
  sections,
  className,
}: {
  sections: ProductSectionData[];
  className?: string;
}) {
  return (
    <div className={classNames(styles.container, styles.productSections, className)}>
      {sections.map((section) => (
        <ProductSection section={section} key={section.id} />
      ))}
    </div>
  );
}
