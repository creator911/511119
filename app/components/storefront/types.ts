import type { ReactNode } from "react";

/**
 * Storefront media must be served by this application.  Keeping the leading
 * slash in the type makes accidental remote legacy URLs visible at compile
 * time.
 */
export type LocalAssetPath = `/${string}`;

export interface NavigationItem {
  id: string;
  label: string;
  href: string;
  newWindow?: boolean;
  usePc?: boolean;
  useMobile?: boolean;
  children?: NavigationItem[];
}

export interface HeaderUtilityLink {
  label: string;
  href: string;
  icon?: "user" | "lock" | "plus" | "cart" | "heart" | "order" | "wallet";
}

export interface HeroSlide {
  id: string;
  image: LocalAssetPath;
  mobileImage?: LocalAssetPath;
  alt: string;
  href?: string;
  eyebrow?: string;
  title?: ReactNode;
  description?: string;
  buttonLabel?: string;
  align?: "left" | "center" | "right";
  tone?: "light" | "dark";
}

export type ProductBadgeTone =
  | "discount"
  | "recommend"
  | "new"
  | "popular"
  | "hit"
  | "neutral";

export interface ProductSummary {
  id: string;
  name: string;
  href: string;
  image: LocalAssetPath;
  hoverImage?: LocalAssetPath;
  price: number;
  compareAtPrice?: number;
  description?: string;
  model?: string;
  badge?: string;
  badgeTone?: ProductBadgeTone;
  discountPercent?: number;
  rating?: number;
  reviewCount?: number;
  wishCount?: number;
  soldOut?: boolean;
  maximumQuantity?: number;
}

export interface ProductSectionData {
  id: string;
  lead: string;
  suffix?: string;
  href?: string;
  products: ProductSummary[];
  variant?:
    | "standard"
    | "compact"
    | "home-sale"
    | "home-bordered"
    | "home-plain"
    | "home-popular";
}

export interface ProductOptionValue {
  id: string;
  value: string;
  label: string;
  priceDelta?: number;
  stock?: number;
  disabled?: boolean;
}

export interface ProductOption {
  id: string;
  label: string;
  required?: boolean;
  values: ProductOptionValue[];
}

export interface ProductDetailData extends ProductSummary {
  images: LocalAssetPath[];
  categoryLabel: string;
  categoryHref?: string;
  maker?: string;
  origin?: string;
  brand?: string;
  rewardPoints?: number;
  shippingLabel?: string;
  options?: ProductOption[];
  shortDescription?: string;
  details?: ReactNode;
  noticeRows?: Array<{ label: string; value: ReactNode }>;
  shippingInfo?: ReactNode;
  exchangeInfo?: ReactNode;
  reviewCount?: number;
  questionCount?: number;
  restockNotification?: boolean;
}

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface CartLine {
  id: string;
  lineKey?: string;
  productId?: string;
  name: string;
  href?: string;
  image: LocalAssetPath;
  option?: string;
  optionIds?: string[];
  unitPrice: number;
  quantity: number;
  points?: number;
  shippingFee?: number;
  maximumQuantity?: number;
}

export interface OrderSummary {
  id: string;
  orderedAt: string;
  label: string;
  amount: number;
  status: string;
  href?: string;
}

export interface FooterCompanyInfo {
  companyName: string;
  representative: string;
  businessNumber: string;
  mailOrderNumber?: string;
  address: string;
  email: string;
  telephone?: string;
  fax?: string;
  copyright?: string;
}
