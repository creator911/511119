import { env } from "cloudflare:workers";
import catalogSource from "@/data/catalog.json";
import { AdminApiError } from "@/lib/admin-api";
import {
  BannerValidationError,
  cloneBanner,
  isValidBannerId,
  mergeBannerChanges,
  validateBannerInput,
  type AdminBannerRecord,
  type BannerChangeRow,
  type BannerChangeType,
  type ManagedBanner,
} from "@/lib/banner-contract";

export type {
  AdminBannerRecord,
  BannerChangeRow,
  BannerChangeType,
  ManagedBanner,
} from "@/lib/banner-contract";

export interface BannerReadOptions {
  database?: D1Database;
  strict?: boolean;
  includeDeleted?: boolean;
}

export interface BannerWriteOptions {
  database?: D1Database;
  adminUsername: string;
  expectedRevision?: number;
}

interface BannerWriteGuards {
  createOnly?: boolean;
  expectedRevision: number;
}

interface CatalogFile {
  banners: ManagedBanner[];
}

const catalog = catalogSource as unknown as CatalogFile;
const staticBanners = catalog.banners.map(cloneBanner);
const staticBannerById = new Map(
  staticBanners.map((banner) => [banner.id, banner]),
);
const schemaInitializations = new WeakMap<object, Promise<void>>();

export function bannerDatabase(): D1Database {
  const database = (env as unknown as { DB?: D1Database }).DB;
  if (!database) {
    throw new AdminApiError(503, "배너 데이터베이스가 준비되지 않았습니다.");
  }
  return database;
}

export async function ensureAdminBannerSchema(
  database = bannerDatabase(),
): Promise<void> {
  const cacheKey = database as unknown as object;
  let initialization = schemaInitializations.get(cacheKey);
  if (!initialization) {
    initialization = database
      .batch([
        database.prepare(`CREATE TABLE IF NOT EXISTS banner_changes (
          banner_id TEXT PRIMARY KEY,
          change_type TEXT NOT NULL,
          payload_json TEXT NOT NULL DEFAULT '{}',
          revision INTEGER NOT NULL DEFAULT 1,
          updated_by TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        database.prepare(
          "CREATE INDEX IF NOT EXISTS banner_changes_type_idx ON banner_changes(change_type)",
        ),
        database.prepare(
          "CREATE INDEX IF NOT EXISTS banner_changes_updated_idx ON banner_changes(updated_at)",
        ),
      ])
      .then(() => undefined)
      .catch((error) => {
        schemaInitializations.delete(cacheKey);
        throw error;
      });
    schemaInitializations.set(cacheKey, initialization);
  }
  await initialization;
}

export async function getEffectiveBanners(
  options: BannerReadOptions = {},
): Promise<ManagedBanner[]> {
  const records = await getAdminBannerRecords({
    ...options,
    includeDeleted: false,
  });
  return records
    .filter((record) => record.banner.active)
    .map((record) => cloneBanner(record.banner));
}

export async function getEffectiveBanner(
  id: string | null | undefined,
  options: BannerReadOptions = {},
): Promise<ManagedBanner | undefined> {
  if (!id) return undefined;
  const banners = await getEffectiveBanners(options);
  return banners.find((banner) => banner.id === id);
}

export async function getAdminBannerRecords(
  options: BannerReadOptions = {},
): Promise<AdminBannerRecord[]> {
  let changes: BannerChangeRow[];
  try {
    const database = options.database ?? bannerDatabase();
    await ensureAdminBannerSchema(database);
    const result = await database
      .prepare(
        `SELECT banner_id, change_type, payload_json, revision, updated_by,
                created_at, updated_at
         FROM banner_changes
         ORDER BY created_at ASC, banner_id ASC`,
      )
      .all<BannerChangeRow>();
    changes = result.results ?? [];
  } catch (error) {
    if (options.strict) throw error;
    changes = [];
  }

  return mergeBannerChanges(
    staticBanners,
    changes,
    options.includeDeleted ?? false,
  );
}

export async function createManagedBanner(
  input: unknown,
  options: BannerWriteOptions,
): Promise<AdminBannerRecord> {
  const banner = validateInput(input);
  const database = options.database ?? bannerDatabase();
  await ensureAdminBannerSchema(database);

  if (staticBannerById.has(banner.id)) {
    throw new AdminApiError(409, "이미 사용 중인 배너 식별값입니다.");
  }
  const existing = await readBannerChange(banner.id, database);
  if (existing) {
    throw new AdminApiError(409, "이미 사용 중인 배너 식별값입니다.");
  }

  return writeBannerChange(
    banner,
    "created",
    options.adminUsername,
    database,
    { createOnly: true, expectedRevision: 0 },
  );
}

export async function updateManagedBanner(
  id: string,
  input: unknown,
  options: BannerWriteOptions,
): Promise<AdminBannerRecord> {
  assertBannerId(id);
  const database = options.database ?? bannerDatabase();
  const current = await getAdminBannerById(id, {
    database,
    strict: true,
  });
  if (!current || current.deleted) {
    throw new AdminApiError(404, "배너를 찾을 수 없습니다.");
  }
  const expectedRevision = readExpectedRevision(input);
  if (expectedRevision !== current.revision) {
    throw new AdminApiError(
      409,
      "다른 작업에서 배너가 변경되었습니다. 최신 정보를 다시 불러와 주세요.",
    );
  }

  const banner = validateInput(input, current.banner, id);
  const changeType: BannerChangeType = staticBannerById.has(id)
    ? "override"
    : "created";
  return writeBannerChange(
    banner,
    changeType,
    options.adminUsername,
    database,
    { expectedRevision },
  );
}

export async function deleteManagedBanner(
  id: string,
  options: BannerWriteOptions,
): Promise<AdminBannerRecord> {
  assertBannerId(id);
  const database = options.database ?? bannerDatabase();
  const current = await getAdminBannerById(id, {
    database,
    strict: true,
  });
  if (!current || current.deleted) {
    throw new AdminApiError(404, "배너를 찾을 수 없습니다.");
  }
  if (
    options.expectedRevision !== undefined &&
    options.expectedRevision !== current.revision
  ) {
    throw new AdminApiError(
      409,
      "다른 작업에서 배너가 변경되었습니다. 최신 정보를 다시 불러와 주세요.",
    );
  }

  return writeBannerChange(
    current.banner,
    "deleted",
    options.adminUsername,
    database,
    { expectedRevision: current.revision },
  );
}

export async function getAdminBannerById(
  id: string,
  options: BannerReadOptions = {},
): Promise<AdminBannerRecord | undefined> {
  assertBannerId(id);
  const records = await getAdminBannerRecords({
    ...options,
    includeDeleted: options.includeDeleted ?? true,
  });
  return records.find((record) => record.banner.id === id);
}

async function readBannerChange(
  id: string,
  database: D1Database,
): Promise<BannerChangeRow | null> {
  return database
    .prepare(
      `SELECT banner_id, change_type, payload_json, revision, updated_by,
              created_at, updated_at
       FROM banner_changes WHERE banner_id = ?`,
    )
    .bind(id)
    .first<BannerChangeRow>();
}

async function writeBannerChange(
  banner: ManagedBanner,
  changeType: BannerChangeType,
  adminUsername: string,
  database: D1Database,
  guards: BannerWriteGuards,
): Promise<AdminBannerRecord> {
  const updatedBy = adminUsername.slice(0, 128);
  const payload = JSON.stringify(banner);
  const statement =
    guards.createOnly || guards.expectedRevision === 0
      ? database
          .prepare(
            `INSERT INTO banner_changes (
               banner_id, change_type, payload_json, revision, updated_by
             ) VALUES (?, ?, ?, 1, ?)
             ON CONFLICT(banner_id) DO UPDATE SET
               change_type = NULL,
               payload_json = excluded.payload_json,
               revision = banner_changes.revision + 1,
               updated_by = excluded.updated_by,
               updated_at = CURRENT_TIMESTAMP
             RETURNING banner_id, change_type, payload_json, revision,
                       updated_by, created_at, updated_at`,
          )
          .bind(banner.id, changeType, payload, updatedBy)
      : database
          .prepare(
            `UPDATE banner_changes
             SET change_type = ?,
                 payload_json = ?,
                 revision = revision + 1,
                 updated_by = ?,
                 updated_at = CURRENT_TIMESTAMP
             WHERE banner_id = ?
               AND revision = ?
               AND change_type <> 'deleted'
             RETURNING banner_id, change_type, payload_json, revision,
                       updated_by, created_at, updated_at`,
          )
          .bind(
            changeType,
            payload,
            updatedBy,
            banner.id,
            guards.expectedRevision,
          );
  let row: BannerChangeRow | undefined;
  try {
    const result = await statement.run();
    if (!result.meta.changes) {
      throw new AdminApiError(
        409,
        "다른 작업에서 배너가 변경 또는 삭제되었습니다. 최신 정보를 다시 불러와 주세요.",
      );
    }
    row = result.results?.[0] as unknown as
      | BannerChangeRow
      | undefined;
  } catch (error) {
    if (error instanceof AdminApiError) throw error;
    if (
      error instanceof Error &&
      /banner_changes|not null|constraint/iu.test(error.message)
    ) {
      throw new AdminApiError(
        409,
        guards.createOnly
          ? "이미 사용한 배너 식별값입니다."
          : "다른 작업에서 배너가 변경 또는 삭제되었습니다. 최신 정보를 다시 불러와 주세요.",
      );
    }
    throw error;
  }

  if (!row || row.banner_id !== banner.id) {
    throw new AdminApiError(500, "배너 변경사항을 저장하지 못했습니다.");
  }
  let storedBanner: ManagedBanner;
  try {
    storedBanner = validateInput(JSON.parse(row.payload_json), undefined, row.banner_id);
  } catch {
    throw new AdminApiError(500, "저장된 배너 변경사항을 확인하지 못했습니다.");
  }

  return {
    banner: cloneBanner(storedBanner),
    source:
      row.change_type === "override" ||
      row.change_type === "created" ||
      row.change_type === "deleted"
        ? row.change_type
        : changeType,
    deleted: row.change_type === "deleted",
    revision: Number(row.revision),
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function readExpectedRevision(input: unknown): number {
  const value =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>).expectedRevision
      : undefined;
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > 2_147_483_647
  ) {
    throw new AdminApiError(400, "배너 변경 기준값을 확인해 주세요.");
  }
  return value;
}

function validateInput(
  input: unknown,
  base?: ManagedBanner,
  fixedId?: string,
): ManagedBanner {
  try {
    return validateBannerInput(input, base, fixedId);
  } catch (error) {
    if (error instanceof BannerValidationError) {
      throw new AdminApiError(
        400,
        "배너 정보를 확인해 주세요.",
        error.fieldErrors,
      );
    }
    throw error;
  }
}

function assertBannerId(id: string): void {
  if (!isValidBannerId(id)) {
    throw new AdminApiError(400, "배너 식별값이 올바르지 않습니다.");
  }
}
