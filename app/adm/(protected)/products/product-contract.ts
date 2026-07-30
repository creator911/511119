export interface ProductFlags {
  hit: boolean;
  recommend: boolean;
  new: boolean;
  popular: boolean;
  sale: boolean;
}

export interface AdminProduct {
  id: string;
  categoryId: string;
  primaryCategoryId: string;
  secondaryCategoryId: string;
  tertiaryCategoryId: string;
  name: string;
  basic: string;
  detailHtml: string;
  price: number;
  originalPrice: number;
  stock: number;
  maker: string;
  origin: string;
  brand: string;
  model: string;
  images: string[];
  flags: ProductFlags;
  active: boolean;
  sortOrder: number;
  viewCount: number;
  rewardPoints: number;
  desktopSkin: string;
  mobileSkin: string;
  revision: number;
  stockControlRevision: number;
  soldOut?: boolean;
  stockNotificationQuantity?: number;
  restockNotification?: boolean;
}

export interface AdminProductCategory {
  id: string;
  label: string;
}

export interface ProductErrorPayload {
  ok?: false;
  message?: string;
  code?: string;
  fieldErrors?: Record<string, string>;
}

export interface ProductSuccessPayload {
  ok: true;
  product: AdminProduct;
  revision: number;
  stockControlRevision?: number;
}

export interface ProductListSuccessPayload {
  ok: true;
  products: AdminProduct[];
}

export const EMPTY_FLAGS: ProductFlags = {
  hit: false,
  recommend: false,
  new: false,
  popular: false,
  sale: false,
};

export function createEmptyProduct(): AdminProduct {
  return {
    id: `PRD-${Date.now().toString(36).toUpperCase()}`,
    categoryId: "",
    primaryCategoryId: "",
    secondaryCategoryId: "",
    tertiaryCategoryId: "",
    name: "",
    basic: "",
    detailHtml: "",
    price: 0,
    originalPrice: 0,
    stock: 0,
    maker: "",
    origin: "",
    brand: "",
    model: "",
    images: [],
    flags: { ...EMPTY_FLAGS },
    active: true,
    sortOrder: 0,
    viewCount: 0,
    rewardPoints: 0,
    desktopSkin: "basic",
    mobileSkin: "basic",
    revision: 0,
    stockControlRevision: 0,
  };
}

export function isAdminProduct(value: unknown): value is AdminProduct {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<AdminProduct>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.categoryId === "string" &&
    typeof candidate.primaryCategoryId === "string" &&
    typeof candidate.secondaryCategoryId === "string" &&
    typeof candidate.tertiaryCategoryId === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.basic === "string" &&
    typeof candidate.detailHtml === "string" &&
    typeof candidate.price === "number" &&
    typeof candidate.originalPrice === "number" &&
    typeof candidate.stock === "number" &&
    typeof candidate.maker === "string" &&
    typeof candidate.origin === "string" &&
    typeof candidate.brand === "string" &&
    typeof candidate.model === "string" &&
    Array.isArray(candidate.images) &&
    candidate.images.every((image) => typeof image === "string") &&
    Boolean(candidate.flags) &&
    typeof candidate.flags?.hit === "boolean" &&
    typeof candidate.flags?.recommend === "boolean" &&
    typeof candidate.flags?.new === "boolean" &&
    typeof candidate.flags?.popular === "boolean" &&
    typeof candidate.flags?.sale === "boolean" &&
    typeof candidate.active === "boolean" &&
    typeof candidate.sortOrder === "number" &&
    typeof candidate.viewCount === "number" &&
    typeof candidate.rewardPoints === "number" &&
    typeof candidate.desktopSkin === "string" &&
    typeof candidate.mobileSkin === "string" &&
    typeof candidate.revision === "number" &&
    typeof candidate.stockControlRevision === "number" &&
    (candidate.soldOut === undefined ||
      typeof candidate.soldOut === "boolean") &&
    (candidate.stockNotificationQuantity === undefined ||
      typeof candidate.stockNotificationQuantity === "number") &&
    (candidate.restockNotification === undefined ||
      typeof candidate.restockNotification === "boolean")
  );
}

export async function readProductApiError(
  response: Response,
  fallback: string,
): Promise<{ message: string; fieldErrors: Record<string, string> }> {
  const payload = (await response.json().catch(() => null)) as
    | ProductErrorPayload
    | null;
  const fieldAliases: Record<string, string> = {
    sku: "id",
    marketPrice: "originalPrice",
    shortDescription: "basic",
    description: "detailHtml",
    thumbnailUrl: "images",
    visible: "active",
  };
  const fieldErrors = Object.fromEntries(
    Object.entries(payload?.fieldErrors ?? {}).map(([field, message]) => [
      fieldAliases[field] ?? field,
      message,
    ]),
  );
  return {
    message: payload?.message?.trim() || fallback,
    fieldErrors,
  };
}
