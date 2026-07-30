import { HeroCarousel, ProductSections } from "@/app/components/storefront";
import { homeProductThumbnails } from "@/app/components/storefront/home-thumbnails";
import styles from "@/app/components/storefront/Storefront.module.css";
import type { LocalAssetPath } from "@/app/components/storefront";
import { SiteFrame } from "@/app/components/SiteFrame";
import { StorefrontPopups } from "@/app/components/storefront/StorefrontPopups";
import { ThemePreviewBridge } from "@/app/components/storefront/ThemePreviewBridge";
import { getEffectiveBanners } from "@/lib/admin-banners";
import { toProductSummary } from "@/lib/catalog";
import { getStorefrontPopupLayers } from "@/lib/storefront-admin-tools";
import { getStorefrontProducts } from "@/lib/storefront-products";

export const dynamic = "force-dynamic";

const sectionDefinitions = [
  {
    id: "sale",
    lead: "할인",
    suffix: "상품",
    flag: "sale" as const,
    type: 5,
    variant: "home-sale" as const,
  },
  {
    id: "recommend",
    lead: "추천",
    suffix: "상품",
    flag: "recommend" as const,
    type: 2,
    variant: "home-bordered" as const,
  },
  {
    id: "new",
    lead: "최신",
    suffix: "상품",
    flag: "new" as const,
    type: 3,
    variant: "home-plain" as const,
  },
  {
    id: "popular",
    lead: "인기",
    suffix: "상품",
    flag: "popular" as const,
    type: 4,
    variant: "home-popular" as const,
  },
  {
    id: "hit",
    lead: "히트",
    suffix: "상품",
    flag: "hit" as const,
    type: 1,
    variant: "home-bordered" as const,
  },
];

interface HomePageProps {
  searchParams: Promise<{ theme_preview?: string | string[] }>;
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const query = await searchParams;
  const requestedPreview = Array.isArray(query.theme_preview)
    ? query.theme_preview[0]
    : query.theme_preview;
  const previewTheme =
    requestedPreview === "eb4_basic"
      ? "kiel-mobile"
      : requestedPreview === "basic"
        ? "kiel"
        : null;
  const [storefrontProducts, banners, popups] = await Promise.all([
    getStorefrontProducts(),
    getEffectiveBanners(),
    getStorefrontPopupLayers(),
  ]);
  const products = storefrontProducts.filter((product) => product.active);
  const sections = sectionDefinitions.map((section) => ({
    id: section.id,
    lead: section.lead,
    suffix: section.suffix,
    href: `/shop/listtype.php?type=${section.type}`,
    variant: section.variant,
    products: products
      .filter((product) => product.flags[section.flag])
      .slice(0, 4)
      .map((product) => ({
        ...toProductSummary(product),
        ...homeProductThumbnails[product.id],
      })),
  }));

  return (
    <>
      {previewTheme ? <ThemePreviewBridge theme={previewTheme} /> : null}
      <SiteFrame>
        <StorefrontPopups popups={popups} />
        <main className={styles.homeMain} id="main-content">
          <HeroCarousel
            autoPlayMs={5000}
            slides={banners.map((banner) => ({
              id: banner.id,
              image: banner.image as LocalAssetPath,
              mobileImage: banner.mobileImage as LocalAssetPath,
              alt: "키엘골드 컬렉션",
              href: banner.href,
            }))}
          />
          <ProductSections sections={sections} />
        </main>
      </SiteFrame>
    </>
  );
}
