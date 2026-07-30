import type { NavigationItem } from "@/app/components/storefront/types";
import {
  getLegacyAdminToolStoredSettings,
  listLegacyAdminToolRecords,
} from "@/lib/admin-tools";
import { parseManagedMenuEntries } from "@/lib/admin-menu-settings";

const DEFAULT_TITLE = "골드리안 | GOLDRIAN";
const DEFAULT_DESCRIPTION = "순금 주얼리, 골드바, 웨딩 주얼리 전문 쇼핑몰";
const DEFAULT_PRIMARY_COLOR = "#3949ab";

export interface StorefrontThemeSettings {
  enabled: boolean;
  theme: "kiel" | "kiel-mobile";
  primaryColor: string;
  primaryColorDark: string;
}

export interface StorefrontMenuSettings {
  enabled: boolean;
  menuOrder: string;
}

export interface StorefrontMetaSettings {
  title: string;
  description: string;
  keywords: string[];
  robots: {
    index: boolean;
    follow: boolean;
  };
}

export interface StorefrontPopupLayer {
  id: string;
  title: string;
  content: string;
  href?: string;
  startsAt?: string;
  endsAt?: string;
  device: "both" | "pc" | "mobile";
  disableHours: number;
  left: number;
  top: number;
  width: number;
  height: number;
  dismissKey: string;
}

interface PopupDetails {
  content: string;
  href?: string;
  startsAt?: string;
  endsAt?: string;
  device: "both" | "pc" | "mobile";
  disableHours: number;
  left: number;
  top: number;
  width: number;
  height: number;
}

export async function getStorefrontThemeSettings(): Promise<StorefrontThemeSettings> {
  try {
    const settings = await getLegacyAdminToolStoredSettings("theme-settings");
    if (!settings || isLegacyThemePlaceholder(settings)) {
      return defaultThemeSettings();
    }
    const primaryColor = normalizeHexColor(
      settings.primaryColor,
      DEFAULT_PRIMARY_COLOR,
    );
    return {
      enabled: settings.enabled !== false,
      theme:
        settings.theme === "eb4_basic" ||
        settings.theme === "kiel-mobile"
          ? "kiel-mobile"
          : "kiel",
      primaryColor,
      primaryColorDark: darkenHexColor(primaryColor),
    };
  } catch {
    return defaultThemeSettings();
  }
}

export async function getStorefrontMenuSettings(): Promise<StorefrontMenuSettings> {
  try {
    const settings = await getLegacyAdminToolStoredSettings("menu-settings");
    if (!settings || isLegacyMenuPlaceholder(settings)) {
      return { enabled: true, menuOrder: "" };
    }
    return {
      enabled: settings.enabled !== false,
      menuOrder:
        typeof settings.menuOrder === "string"
          ? settings.menuOrder.slice(0, 5_000)
          : "",
    };
  } catch {
    return { enabled: true, menuOrder: "" };
  }
}

export async function getStorefrontMetaSettings(): Promise<StorefrontMetaSettings> {
  try {
    const settings = await getLegacyAdminToolStoredSettings("meta-tags");
    if (!settings || isLegacyMetaPlaceholder(settings)) {
      return defaultMetaSettings();
    }
    const title = normalizedText(settings.title, 120) || DEFAULT_TITLE;
    const description =
      normalizedText(settings.description, 300) || DEFAULT_DESCRIPTION;
    const keywords =
      typeof settings.keywords === "string"
        ? settings.keywords
            .split(",")
            .map((keyword) => normalizedText(keyword, 60))
            .filter(Boolean)
            .slice(0, 30)
        : [];
    const robots =
      settings.robots === "noindex,nofollow"
        ? { index: false, follow: false }
        : { index: true, follow: true };
    return { title, description, keywords, robots };
  } catch {
    return defaultMetaSettings();
  }
}

export async function getStorefrontPopupLayers(
  now = new Date(),
): Promise<StorefrontPopupLayer[]> {
  try {
    const records = await listLegacyAdminToolRecords("popup-layers");
    const nowTime = now.getTime();
    return records.flatMap((record) => {
      if (record.status !== "active") return [];
      const title = normalizedText(record.title, 200);
      const details = parsePopupDetails(record.details);
      if (!title || !details?.content) return [];
      const startTime = details.startsAt
        ? parseKoreaDateTime(details.startsAt)
        : null;
      const endTime = details.endsAt
        ? parseKoreaDateTime(details.endsAt)
        : null;
      if (details.startsAt && startTime === null) return [];
      if (details.endsAt && endTime === null) return [];
      if (startTime !== null && nowTime < startTime) return [];
      if (endTime !== null && nowTime > endTime) return [];
      return [
        {
          id: record.id,
          title,
          content: details.content,
          ...(details.href ? { href: details.href } : {}),
          ...(details.startsAt ? { startsAt: details.startsAt } : {}),
          ...(details.endsAt ? { endsAt: details.endsAt } : {}),
          device: details.device,
          disableHours: details.disableHours,
          left: details.left,
          top: details.top,
          width: details.width,
          height: details.height,
          dismissKey: `${record.id}:${record.updatedAt}`,
        },
      ];
    });
  } catch {
    return [];
  }
}

export function resolveManagedNavigation(
  settings: StorefrontMenuSettings,
  fallback: readonly NavigationItem[],
): NavigationItem[] {
  if (!settings.enabled) {
    return [];
  }
  if (!settings.menuOrder.trim()) {
    return [...fallback];
  }

  const managedEntries = parseManagedMenuEntries(settings.menuOrder);
  if (settings.menuOrder.trim().startsWith("[")) {
    return managedEntries.map((entry) => ({
      id: entry.id,
      label: entry.label,
      href: entry.href,
      newWindow: entry.newWindow,
      usePc: entry.usePc,
      useMobile: entry.useMobile,
    }));
  }
  if (managedEntries.length > 0) {
    return managedEntries.map((entry) => ({
      id: entry.id,
      label: entry.label,
      href: entry.href,
      newWindow: entry.newWindow,
      usePc: entry.usePc,
      useMobile: entry.useMobile,
    }));
  }

  const fallbackLookup = new Map<string, NavigationItem>();
  for (const item of fallback) {
    fallbackLookup.set(item.id.trim().toLocaleLowerCase("ko-KR"), item);
    fallbackLookup.set(item.label.trim().toLocaleLowerCase("ko-KR"), item);
  }

  const aliases: Record<string, NavigationItem> = {
    shop: { id: "managed-shop", label: "SHOP", href: "/shop" },
    gold: {
      id: "managed-gold",
      label: "GOLD",
      href: "/shop/list.php?ca_id=20",
    },
    community: {
      id: "managed-community",
      label: "COMMUNITY",
      href: "/bbs/board.php",
    },
    customer: {
      id: "managed-customer",
      label: "CUSTOMER",
      href: "/bbs/faq.php",
    },
  };

  const seen = new Set<string>();
  const navigation: NavigationItem[] = [];
  for (const [index, rawLine] of settings.menuOrder.split(/\r?\n/u).entries()) {
    if (navigation.length >= 30) break;
    const line = rawLine.trim();
    if (!line) continue;
    const separator = line.indexOf("|");
    if (separator < 0) {
      const key = line.toLocaleLowerCase("ko-KR");
      const item = fallbackLookup.get(key) ?? aliases[key];
      if (!item || seen.has(item.id)) continue;
      seen.add(item.id);
      navigation.push(item);
      continue;
    }

    const label = normalizedText(line.slice(0, separator), 60);
    const href = normalizeInternalHref(line.slice(separator + 1));
    if (!label || !href) continue;
    const id = `managed-${index}-${slugify(label)}`;
    if (seen.has(id)) continue;
    seen.add(id);
    navigation.push({ id, label, href });
  }

  return navigation.length > 0 ? navigation : [...fallback];
}

function defaultThemeSettings(): StorefrontThemeSettings {
  return {
    enabled: true,
    theme: "kiel",
    primaryColor: DEFAULT_PRIMARY_COLOR,
    primaryColorDark: darkenHexColor(DEFAULT_PRIMARY_COLOR),
  };
}

function defaultMetaSettings(): StorefrontMetaSettings {
  return {
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    keywords: [],
    robots: { index: true, follow: true },
  };
}

function isLegacyThemePlaceholder(
  settings: Record<string, string | number | boolean>,
): boolean {
  return (
    settings.theme === "kiel" &&
    settings.primaryColor === "#3f51b5" &&
    settings.enabled !== false
  );
}

function isLegacyMenuPlaceholder(
  settings: Record<string, string | number | boolean>,
): boolean {
  return (
    settings.enabled !== false &&
    typeof settings.menuOrder === "string" &&
    settings.menuOrder.replace(/\r/gu, "").trim() ===
      "SHOP\nGOLD\nCOMMUNITY\nCUSTOMER"
  );
}

function isLegacyMetaPlaceholder(
  settings: Record<string, string | number | boolean>,
): boolean {
  return (
    settings.title === "한국 금다이아몬드거래소" &&
    (typeof settings.description !== "string" ||
      !settings.description.trim()) &&
    (typeof settings.keywords !== "string" || !settings.keywords.trim()) &&
    settings.robots !== "noindex,nofollow"
  );
}

function normalizedText(value: unknown, maximumLength: number): string {
  return typeof value === "string"
    ? value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu, "").trim().slice(0, maximumLength)
    : "";
}

function normalizeHexColor(value: unknown, fallback: string): string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/iu.test(value.trim())
    ? value.trim().toLowerCase()
    : fallback;
}

function darkenHexColor(color: string): string {
  const channels = [1, 3, 5].map((offset) =>
    Math.max(0, Math.round(Number.parseInt(color.slice(offset, offset + 2), 16) * 0.8)),
  );
  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function normalizeInternalHref(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const href = value.trim().slice(0, 300);
  if (!href || /[\u0000-\u001F\u007F\\]/u.test(href)) return null;
  if (href.startsWith("#")) return href;
  if (!href.startsWith("/") || href.startsWith("//")) return null;
  return href;
}

function parsePopupDetails(raw: string): PopupDetails | null {
  const plainContent = normalizedText(raw, 4_000);
  if (!plainContent) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return defaultPopupDetails(plainContent);
    }
    const values = parsed as Record<string, unknown>;
    const content = normalizedText(values.content, 4_000);
    if (!content) return null;
    const href = normalizeInternalHref(values.href);
    const startsAt = normalizeDateTimeValue(values.startsAt);
    const endsAt = normalizeDateTimeValue(values.endsAt);
    return {
      content,
      ...(href ? { href } : {}),
      ...(startsAt ? { startsAt } : {}),
      ...(endsAt ? { endsAt } : {}),
      device:
        values.device === "pc" || values.device === "mobile"
          ? values.device
          : "both",
      disableHours: safePopupNumber(values.disableHours, 24, 1, 8_760),
      left: safePopupNumber(values.left, 10, 0, 9_999),
      top: safePopupNumber(values.top, 10, 0, 9_999),
      width: safePopupNumber(values.width, 450, 100, 2_000),
      height: safePopupNumber(values.height, 500, 100, 2_000),
    };
  } catch {
    return defaultPopupDetails(plainContent);
  }
}

function defaultPopupDetails(content: string): PopupDetails {
  return {
    content,
    device: "both",
    disableHours: 24,
    left: 10,
    top: 10,
    width: 450,
    height: 500,
  };
}

function safePopupNumber(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= minimum && number <= maximum
    ? number
    : fallback;
}

function normalizeDateTimeValue(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().slice(0, 35);
  return normalized || undefined;
}

function parseKoreaDateTime(value: string): number | null {
  const normalized = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/u.test(value)
    ? `${value}:00+09:00`
    : /^\d{4}-\d{2}-\d{2}$/u.test(value)
      ? `${value}T00:00:00+09:00`
      : value;
  const time = Date.parse(normalized);
  return Number.isFinite(time) ? time : null;
}

function slugify(value: string): string {
  const slug = value
    .toLocaleLowerCase("ko-KR")
    .replace(/[^a-z0-9가-힣]+/gu, "-")
    .replace(/^-|-$/gu, "")
    .slice(0, 60);
  return slug || "menu";
}
