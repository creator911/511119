export const ADMIN_PERMISSION_OPTIONS = [
  {
    scope: "dashboard.view",
    label: "관리자 메인",
    description: "관리자 메인과 운영 현황을 확인합니다.",
  },
  {
    scope: "catalog.manage",
    label: "상품·분류·배너",
    description: "상품, 상품분류, 배너와 상품 이미지를 관리합니다.",
  },
  {
    scope: "orders.manage",
    label: "주문 관리",
    description: "주문 내역을 확인하고 처리 상태를 변경합니다.",
  },
  {
    scope: "members.manage",
    label: "회원 관리",
    description: "회원 정보와 이용 상태를 관리합니다.",
  },
  {
    scope: "wallet.manage",
    label: "충전·출금 관리",
    description: "충전과 출금 신청을 확인하고 처리합니다.",
  },
  {
    scope: "reports.view",
    label: "운영 리포트",
    description: "매출, 판매순위와 포인트 리포트를 확인합니다.",
  },
  {
    scope: "content.manage",
    label: "게시판·콘텐츠",
    description: "게시판, 게시물, 문의와 안내 콘텐츠를 관리합니다.",
  },
  {
    scope: "settings.manage",
    label: "환경설정",
    description: "기본환경과 쇼핑몰 운영 설정을 변경합니다.",
  },
  {
    scope: "admins.manage",
    label: "관리자 계정",
    description: "보조 관리자 계정과 권한을 관리합니다.",
  },
] as const;

export type AdminPermissionScope =
  (typeof ADMIN_PERMISSION_OPTIONS)[number]["scope"];
export type AdminPermissionMode = "r" | "w" | "d";
export type AdminScopedModePermission =
  `scope:${AdminPermissionScope}:${AdminPermissionMode}`;
export type AdminGrantedPermission =
  | AdminPermissionScope
  | AdminScopedModePermission
  | "*";
export type AdminPermissionRequirement = AdminPermissionScope | "primary";

export interface AdminPermissionIdentity {
  accountType: "primary" | "secondary";
  permissions: readonly AdminGrantedPermission[];
}

const knownPermissionScopes = new Set<string>(
  ADMIN_PERMISSION_OPTIONS.map((option) => option.scope),
);

export function normalizeAdminPermissions(
  value: unknown,
): AdminPermissionScope[] {
  if (!Array.isArray(value)) return [];

  const normalized = new Set<AdminPermissionScope>();
  for (const item of value) {
    if (
      typeof item === "string" &&
      knownPermissionScopes.has(item)
    ) {
      normalized.add(item as AdminPermissionScope);
    }
  }
  return [...normalized];
}

export function parseStoredAdminPermissions(
  value: string,
): AdminPermissionScope[] {
  if (!value || value.length > 4_096) return [];
  try {
    return normalizeAdminPermissions(JSON.parse(value));
  } catch {
    return [];
  }
}

export function hasAdminPermission(
  permissions: readonly AdminGrantedPermission[],
  required: AdminPermissionScope,
): boolean {
  return (
    permissions.includes("*") ||
    permissions.includes(required) ||
    permissions.some((permission) => {
      const parsed = parseScopedModePermission(permission);
      return parsed?.scope === required;
    })
  );
}

export function hasAdminPermissionMode(
  permissions: readonly AdminGrantedPermission[],
  required: AdminPermissionScope,
  mode: AdminPermissionMode,
): boolean {
  return (
    permissions.includes("*") ||
    permissions.includes(required) ||
    permissions.some((permission) => {
      const parsed = parseScopedModePermission(permission);
      return (
        parsed?.mode === mode &&
        parsed.scope === required
      );
    })
  );
}

export function canAccessAdminRequirement(
  identity: AdminPermissionIdentity,
  required: AdminPermissionRequirement,
  mode?: AdminPermissionMode,
): boolean {
  return required === "primary"
    ? identity.accountType === "primary"
    : mode
      ? hasAdminPermissionMode(identity.permissions, required, mode)
      : hasAdminPermission(identity.permissions, required);
}

export function adminPermissionModeForMethod(
  method: string,
): AdminPermissionMode {
  const normalized = method.toUpperCase();
  if (normalized === "DELETE") return "d";
  if (normalized === "GET" || normalized === "HEAD" || normalized === "OPTIONS") {
    return "r";
  }
  return "w";
}

function parseScopedModePermission(
  permission: string,
): {
  scope: AdminPermissionScope;
  mode: AdminPermissionMode;
} | null {
  const match = /^scope:([a-z.]+):([rwd])$/u.exec(permission);
  if (!match || !knownPermissionScopes.has(match[1])) return null;
  return {
    scope: match[1] as AdminPermissionScope,
    mode: match[2] as AdminPermissionMode,
  };
}

export const LEGACY_ADMIN_TOOL_PERMISSION_BY_SLUG = {
  "admin-permissions": "admins.manage",
  "theme-settings": "settings.manage",
  "menu-settings": "settings.manage",
  "mail-test": "settings.manage",
  "popup-layers": "content.manage",
  "session-files-delete": "primary",
  "cache-files-delete": "primary",
  "captcha-files-delete": "primary",
  "thumbnail-files-delete": "primary",
  phpinfo: "primary",
  "browscap-update": "primary",
  "access-log-convert": "primary",
  "db-upgrade": "primary",
  "additional-services": "settings.manage",
  "visitor-search": "members.manage",
  "meta-tags": "settings.manage",
  "club-settings": "content.manage",
  "approved-clubs": "content.manage",
  "club-applications": "content.manage",
  "personal-payments": "orders.manage",
  "product-stock": "catalog.manage",
  "product-types": "catalog.manage",
  "product-option-stock": "catalog.manage",
  coupons: "catalog.manage",
  "coupon-zone": "catalog.manage",
  "additional-shipping": "catalog.manage",
  "order-print": "orders.manage",
  "restock-sms": "catalog.manage",
  events: "content.manage",
  "event-bulk": "content.manage",
  "saved-items": "reports.view",
  "price-comparison": "catalog.manage",
  "m3cron-settings": "settings.manage",
  "m3cron-logs": "reports.view",
  "sms-settings": "settings.manage",
  "sms-member-sync": "members.manage",
  "sms-send": "members.manage",
  "sms-history-message": "members.manage",
  "sms-history-number": "members.manage",
  "sms-emoticon-groups": "members.manage",
  "sms-emoticons": "members.manage",
  "sms-phone-groups": "members.manage",
  "sms-phones": "members.manage",
  "sms-phone-file": "members.manage",
  "eyoom-admin-link": "primary",
} as const satisfies Readonly<
  Record<string, AdminPermissionRequirement>
>;

export function requiredLegacyAdminToolPermission(
  slug: string,
): AdminPermissionRequirement {
  return (
    LEGACY_ADMIN_TOOL_PERMISSION_BY_SLUG[
      slug as keyof typeof LEGACY_ADMIN_TOOL_PERMISSION_BY_SLUG
    ] ?? "primary"
  );
}

export function requiredAdminApiPermission(
  pathname: string,
): AdminPermissionRequirement {
  const segments = pathname.split("/").filter(Boolean);
  const resource = segments[2] ?? "";

  switch (resource) {
    case "accounts":
      return "admins.manage";
    case "settings":
    case "shop-settings":
    case "mail-test":
      return "settings.manage";
    case "products":
    case "categories":
    case "banners":
    case "media":
    case "coupons":
    case "shipping-rules":
      return "catalog.manage";
    case "orders":
    case "personal-payments":
      return "orders.manage";
    case "users":
    case "points":
      return "members.manage";
    case "wallet":
      return "wallet.manage";
    case "reports":
    case "saved-items":
      return "reports.view";
    case "visitors":
      return "members.manage";
    case "sms":
      return segments[3] === "sms-settings"
        ? "settings.manage"
        : "members.manage";
    case "content":
    case "community":
    case "interactions":
    case "events":
      return "content.manage";
    case "clubs":
      return "content.manage";
    case "m3cron":
      return segments[3] === "logs" ? "reports.view" : "settings.manage";
    case "tools":
      return requiredLegacyAdminToolPermission(segments[3] ?? "");
    default:
      // New or unclassified admin endpoints are primary-only until a scope is
      // assigned explicitly. This keeps secondary accounts default-deny.
      return "primary";
  }
}
