export interface ManagedMenuEntry {
  id: string;
  label: string;
  href: string;
  newWindow: boolean;
  order: number;
  usePc: boolean;
  useMobile: boolean;
}

const MAX_MENU_ENTRIES = 30;
const legacyAliases: Readonly<Record<string, { label: string; href: string }>> = {
  shop: { label: "SHOP", href: "/shop" },
  gold: { label: "GOLD", href: "/shop/list.php?ca_id=20" },
  community: { label: "COMMUNITY", href: "/bbs/board.php" },
  customer: { label: "CUSTOMER", href: "/bbs/faq.php" },
};

export function parseManagedMenuEntries(raw: unknown): ManagedMenuEntry[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  const parsedJson = parseJsonEntries(raw);
  if (parsedJson) return normalizeEntries(parsedJson);

  const legacyEntries = raw
    .split(/\r?\n/u)
    .map((line, index) => {
      const value = line.trim();
      if (!value) return null;
      const separator = value.indexOf("|");
      if (separator < 0) {
        const alias = legacyAliases[value.toLocaleLowerCase("en-US")];
        return alias
          ? {
              id: `legacy-${index}-${slug(alias.label)}`,
              ...alias,
              newWindow: false,
              order: index,
              usePc: true,
              useMobile: true,
            }
          : null;
      }
      return {
        id: `legacy-${index}-${slug(value.slice(0, separator))}`,
        label: value.slice(0, separator),
        href: value.slice(separator + 1),
        newWindow: false,
        order: index,
        usePc: true,
        useMobile: true,
      };
    })
    .filter((entry): entry is ManagedMenuEntry => entry !== null);
  return normalizeEntries(legacyEntries);
}

export function serializeManagedMenuEntries(
  entries: readonly ManagedMenuEntry[],
): string {
  return JSON.stringify(
    normalizeEntries(entries).map((entry) => ({
      id: entry.id,
      label: entry.label,
      href: entry.href,
      newWindow: entry.newWindow,
      order: entry.order,
      usePc: entry.usePc,
      useMobile: entry.useMobile,
    })),
  );
}

export function isValidManagedMenuSource(raw: unknown): boolean {
  if (typeof raw !== "string") return false;
  const source = raw.trim();
  if (!source) return true;
  if (!source.startsWith("[")) {
    const lines = source
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length > MAX_MENU_ENTRIES) return false;
    return lines.every((line) => {
      const separator = line.indexOf("|");
      if (separator < 0) return line.length <= 60;
      const label = cleanText(line.slice(0, separator), 61);
      const href = line.slice(separator + 1).trim();
      return (
        label.length > 0 &&
        label.length <= 60 &&
        isSafeManagedMenuHref(href)
      );
    });
  }
  try {
    const parsed: unknown = JSON.parse(source);
    return (
      Array.isArray(parsed) &&
      parsed.length <= MAX_MENU_ENTRIES &&
      normalizeEntries(parsed).length === parsed.length
    );
  } catch {
    return false;
  }
}

export function isSafeManagedMenuHref(value: string): boolean {
  const href = value.trim();
  return (
    href.length > 0 &&
    href.length <= 300 &&
    !/[\u0000-\u001F\u007F\\]/u.test(href) &&
    (href.startsWith("#") ||
      (href.startsWith("/") && !href.startsWith("//")))
  );
}

function parseJsonEntries(raw: string): unknown[] | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeEntries(values: readonly unknown[]): ManagedMenuEntry[] {
  const entries: ManagedMenuEntry[] = [];
  const ids = new Set<string>();
  for (const [index, value] of values.entries()) {
    if (
      entries.length >= MAX_MENU_ENTRIES ||
      !value ||
      typeof value !== "object" ||
      Array.isArray(value)
    ) {
      continue;
    }
    const row = value as Record<string, unknown>;
    const label =
      typeof row.label === "string"
        ? cleanText(row.label, 60)
        : "";
    const href =
      typeof row.href === "string" ? row.href.trim().slice(0, 300) : "";
    if (!label || !isSafeManagedMenuHref(href)) continue;
    const requestedId =
      typeof row.id === "string" ? cleanId(row.id) : "";
    let id = requestedId || `menu-${index}-${slug(label)}`;
    if (ids.has(id)) id = `${id}-${index}`;
    ids.add(id);
    entries.push({
      id,
      label,
      href,
      newWindow: row.newWindow === true,
      order: safeOrder(row.order, index),
      usePc: row.usePc !== false,
      useMobile: row.useMobile !== false,
    });
  }
  return entries.sort(
    (left, right) => left.order - right.order || left.id.localeCompare(right.id),
  );
}

function cleanText(value: string, maximum: number): string {
  return value
    .replace(/[\u0000-\u001F\u007F]/gu, "")
    .trim()
    .slice(0, maximum);
}

function cleanId(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9_-]/gu, "-")
    .slice(0, 80);
}

function safeOrder(value: unknown, fallback: number): number {
  const order = Number(value);
  return Number.isSafeInteger(order) && order >= 0 && order <= 9_999
    ? order
    : fallback;
}

function slug(value: string): string {
  return (
    cleanText(value, 60)
      .toLocaleLowerCase("ko-KR")
      .replace(/[^a-z0-9가-힣]+/gu, "-")
      .replace(/^-+|-+$/gu, "")
      .slice(0, 40) || "item"
  );
}
