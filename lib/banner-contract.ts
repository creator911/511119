export interface ManagedBanner {
  id: string;
  image: string;
  mobileImage: string;
  href: string;
  sortOrder: number;
  active: boolean;
}

export type BannerChangeType = "override" | "created" | "deleted";
export type BannerRecordSource = "static" | BannerChangeType;

export interface BannerChangeRow {
  banner_id: string;
  change_type: string;
  payload_json: string;
  revision: number;
  updated_by: string;
  created_at: string;
  updated_at: string;
}

export interface AdminBannerRecord {
  banner: ManagedBanner;
  source: BannerRecordSource;
  deleted: boolean;
  revision: number;
  updatedBy: string;
  createdAt: string | null;
  updatedAt: string | null;
}

export class BannerValidationError extends Error {
  readonly fieldErrors: Record<string, string>;

  constructor(fieldErrors: Record<string, string>) {
    super("배너 정보를 확인해 주세요.");
    this.name = "BannerValidationError";
    this.fieldErrors = fieldErrors;
  }
}

const bannerIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u;
const uploadedMediaPattern =
  /^\/api\/media\/[a-f0-9]{32}\.(?:jpg|jpeg|png|webp|gif|avif)$/u;
const localMediaPattern =
  /^\/(?!\/)(?!api(?:\/|$))[A-Za-z0-9._~!$&'()*+,;=:@%/-]+\.(?:jpg|jpeg|png|webp|gif|avif)$/iu;
const legacyDomainPattern = /(?:^|[./@])(?:www\.)?kiel-gold\.com(?:$|[/:?#])/iu;
const externalSchemePattern =
  /(?:https?|ftp|file|data|javascript|vbscript|mailto|tel):/iu;
const controlOrWhitespacePattern = /[\u0000-\u0020\u007f]/u;

export function isValidBannerId(value: string): boolean {
  return bannerIdPattern.test(value);
}

export function isSafeBannerImagePath(value: string): boolean {
  if (
    !value ||
    value.length > 2_048 ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    value.includes("?") ||
    value.includes("#") ||
    /%25/iu.test(value) ||
    controlOrWhitespacePattern.test(value) ||
    legacyDomainPattern.test(value)
  ) {
    return false;
  }

  const decoded = safelyDecode(value);
  if (
    decoded === null ||
    decoded.includes("\\") ||
    controlOrWhitespacePattern.test(decoded) ||
    legacyDomainPattern.test(decoded) ||
    hasTraversalSegment(decoded)
  ) {
    return false;
  }

  return uploadedMediaPattern.test(value) || localMediaPattern.test(value);
}

export function isSafeBannerHref(value: string): boolean {
  if (value === "") return true;
  if (
    value.length > 2_048 ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    /%25/iu.test(value) ||
    controlOrWhitespacePattern.test(value) ||
    legacyDomainPattern.test(value)
  ) {
    return false;
  }

  const decoded = safelyDecode(value);
  if (
    decoded === null ||
    decoded.includes("\\") ||
    controlOrWhitespacePattern.test(decoded) ||
    legacyDomainPattern.test(decoded) ||
    externalSchemePattern.test(decoded) ||
    hasTraversalSegment(decoded.split(/[?#]/u, 1)[0] ?? "")
  ) {
    return false;
  }

  try {
    const parsed = new URL(value, "https://local.invalid");
    return parsed.origin === "https://local.invalid";
  } catch {
    return false;
  }
}

export function validateBannerInput(
  input: unknown,
  base?: ManagedBanner,
  fixedId?: string,
): ManagedBanner {
  const body = asObject(input);
  const fieldErrors: Record<string, string> = {};
  const suppliedId = readString(
    body,
    "id",
    base?.id ?? "",
    80,
    fieldErrors,
  );
  const id = (fixedId ?? suppliedId) || generateBannerId();

  if (!isValidBannerId(id)) {
    fieldErrors.id =
      "식별값은 영문·숫자로 시작하고 영문·숫자·점·밑줄·하이픈만 사용할 수 있습니다.";
  }
  if (fixedId && suppliedId && suppliedId !== fixedId) {
    fieldErrors.id = "배너 식별값은 수정할 수 없습니다.";
  }

  const image = readString(
    body,
    "image",
    base?.image ?? "",
    2_048,
    fieldErrors,
    true,
  );
  if (image && !isSafeBannerImagePath(image)) {
    fieldErrors.image =
      "새 사이트의 로컬 이미지 또는 업로드한 이미지만 사용할 수 있습니다.";
  }

  const mobileImageInput = readString(
    body,
    "mobileImage",
    base?.mobileImage ?? "",
    2_048,
    fieldErrors,
  );
  const mobileImage = mobileImageInput || image;
  if (mobileImage && !isSafeBannerImagePath(mobileImage)) {
    fieldErrors.mobileImage =
      "새 사이트의 로컬 이미지 또는 업로드한 이미지만 사용할 수 있습니다.";
  }

  const href = readString(
    body,
    "href",
    base?.href ?? "/shop",
    2_048,
    fieldErrors,
  );
  if (!isSafeBannerHref(href)) {
    fieldErrors.href =
      "새 사이트 내부의 / 로 시작하는 주소만 입력할 수 있습니다.";
  }

  const sortOrder = readInteger(
    body.sortOrder,
    base?.sortOrder ?? 0,
    "sortOrder",
    fieldErrors,
  );
  const active = readBoolean(
    body.active,
    base?.active ?? true,
    "active",
    fieldErrors,
  );

  if (Object.keys(fieldErrors).length > 0) {
    throw new BannerValidationError(fieldErrors);
  }

  return {
    id,
    image,
    mobileImage,
    href,
    sortOrder,
    active,
  };
}

export function mergeBannerChanges(
  baseline: readonly ManagedBanner[],
  changes: readonly BannerChangeRow[],
  includeDeleted = false,
): AdminBannerRecord[] {
  const records = new Map<string, AdminBannerRecord>();
  const deletedRecords: AdminBannerRecord[] = [];

  for (const banner of baseline) {
    records.set(banner.id, {
      banner: cloneBanner(banner),
      source: "static",
      deleted: false,
      revision: 0,
      updatedBy: "",
      createdAt: null,
      updatedAt: null,
    });
  }

  for (const change of changes) {
    if (!isBannerChangeType(change.change_type)) continue;
    const storedBanner = parseStoredBanner(change.payload_json);

    if (change.change_type === "deleted") {
      const previous = records.get(change.banner_id);
      records.delete(change.banner_id);
      if (includeDeleted) {
        const banner = storedBanner ?? previous?.banner;
        if (banner) {
          deletedRecords.push(
            rowToRecord(change, banner, "deleted", true),
          );
        }
      }
      continue;
    }

    if (!storedBanner || storedBanner.id !== change.banner_id) continue;
    records.set(
      change.banner_id,
      rowToRecord(change, storedBanner, change.change_type, false),
    );
  }

  return [...records.values(), ...deletedRecords].sort(compareBannerRecords);
}

export function cloneBanner(banner: ManagedBanner): ManagedBanner {
  return { ...banner };
}

function parseStoredBanner(payload: string): ManagedBanner | null {
  try {
    const value = JSON.parse(payload) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }
    const banner = value as Partial<ManagedBanner>;
    if (
      typeof banner.id !== "string" ||
      !isValidBannerId(banner.id) ||
      typeof banner.image !== "string" ||
      !isSafeBannerImagePath(banner.image) ||
      typeof banner.mobileImage !== "string" ||
      !isSafeBannerImagePath(banner.mobileImage) ||
      typeof banner.href !== "string" ||
      !isSafeBannerHref(banner.href) ||
      !Number.isSafeInteger(banner.sortOrder) ||
      (banner.sortOrder ?? -1) < 0 ||
      (banner.sortOrder ?? 100_001) > 100_000 ||
      typeof banner.active !== "boolean"
    ) {
      return null;
    }
    return cloneBanner(banner as ManagedBanner);
  } catch {
    return null;
  }
}

function rowToRecord(
  row: BannerChangeRow,
  banner: ManagedBanner,
  source: BannerRecordSource,
  deleted: boolean,
): AdminBannerRecord {
  return {
    banner: cloneBanner(banner),
    source,
    deleted,
    revision: Number(row.revision),
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function compareBannerRecords(
  left: AdminBannerRecord,
  right: AdminBannerRecord,
): number {
  return (
    left.banner.sortOrder - right.banner.sortOrder ||
    left.banner.id.localeCompare(right.banner.id)
  );
}

function isBannerChangeType(value: string): value is BannerChangeType {
  return value === "override" || value === "created" || value === "deleted";
}

function safelyDecode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function hasTraversalSegment(value: string): boolean {
  return value
    .split("/")
    .some((segment) => segment === "." || segment === "..");
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new BannerValidationError({
      request: "요청 형식이 올바르지 않습니다.",
    });
  }
  return value as Record<string, unknown>;
}

function readString(
  body: Record<string, unknown>,
  field: string,
  fallback: string,
  maximumLength: number,
  errors: Record<string, string>,
  required = false,
): string {
  const raw = body[field] ?? fallback;
  if (typeof raw !== "string") {
    errors[field] = "문자열로 입력해 주세요.";
    return "";
  }
  const value = raw.trim().replace(/\0/gu, "");
  if (required && !value) errors[field] = "필수 입력 항목입니다.";
  if (value.length > maximumLength) {
    errors[field] = `${maximumLength}자 이하로 입력해 주세요.`;
  }
  return value;
}

function readInteger(
  value: unknown,
  fallback: number,
  field: string,
  errors: Record<string, string>,
): number {
  const candidate = value ?? fallback;
  const number = typeof candidate === "number" ? candidate : Number(candidate);
  if (
    !Number.isSafeInteger(number) ||
    number < 0 ||
    number > 100_000
  ) {
    errors[field] = "0 이상 100000 이하의 정수로 입력해 주세요.";
    return fallback;
  }
  return number;
}

function readBoolean(
  value: unknown,
  fallback: boolean,
  field: string,
  errors: Record<string, string>,
): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") {
    errors[field] = "선택 값을 확인해 주세요.";
    return fallback;
  }
  return value;
}

function generateBannerId(): string {
  return `banner-${crypto.randomUUID()}`;
}
