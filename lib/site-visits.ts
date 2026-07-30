import { commerceDb, ensureCommerceSchema } from "@/lib/commerce-db";

const KOREA_TIME_ZONE = "Asia/Seoul";
const DAY_MS = 24 * 60 * 60 * 1_000;
const MAX_VISITS_PER_CLIENT_DAY = 120;
const VISIT_RETENTION_DAYS = 90;
const visitorIdPattern = /^[A-Za-z0-9_-]{16,80}$/u;
const clientKeyPattern = /^[a-f0-9]{64}$/u;
let visitSchemaInitialization: Promise<void> | null = null;

export interface SiteVisitDay {
  date: string;
  label: string;
  pageViews: number;
  uniqueVisitors: number;
}

export async function recordSiteVisit(
  visitorId: string,
  pathname: string,
  clientKey: string,
  now = new Date(),
): Promise<void> {
  if (
    !visitorIdPattern.test(visitorId) ||
    !clientKeyPattern.test(clientKey)
  ) {
    return;
  }
  if (
    !pathname.startsWith("/") ||
    pathname.startsWith("//") ||
    pathname.startsWith("/adm") ||
    pathname.startsWith("/api") ||
    pathname.length > 200 ||
    /[\u0000-\u001f\u007f\\]/u.test(pathname)
  ) {
    return;
  }
  await ensureSiteVisitSchema();
  const database = commerceDb();
  const businessDate = koreaDate(now);
  const rate = await database
    .prepare(
      `INSERT INTO site_visit_rate_limits (
         business_date, client_key, attempts
       ) VALUES (?, ?, 1)
       ON CONFLICT(business_date, client_key) DO UPDATE SET
         attempts = site_visit_rate_limits.attempts + 1,
         updated_at = CURRENT_TIMESTAMP
       RETURNING attempts`,
    )
    .bind(businessDate, clientKey)
    .first<{ attempts: number }>();
  if (Number(rate?.attempts ?? 1) > MAX_VISITS_PER_CLIENT_DAY) return;

  const [visitorHash, viewHash] = await Promise.all([
    sha256(`${businessDate}\0${visitorId}`),
    sha256(`${businessDate}\0${visitorId}\0${pathname}`),
  ]);
  await database.batch([
    database
      .prepare(
        `INSERT OR IGNORE INTO site_visit_daily (
           business_date, page_views, unique_visitors
         ) VALUES (?, 0, 0)`,
      )
      .bind(businessDate),
    database
      .prepare(
        `INSERT OR IGNORE INTO site_visit_uniques (
           business_date, visitor_hash
         ) VALUES (?, ?)`,
      )
      .bind(businessDate, visitorHash),
    database
      .prepare(
        `UPDATE site_visit_daily
         SET unique_visitors = unique_visitors + changes()
         WHERE business_date = ?`,
      )
      .bind(businessDate),
    database
      .prepare(
        `INSERT OR IGNORE INTO site_visit_views (
           business_date, view_hash
         ) VALUES (?, ?)`,
      )
      .bind(businessDate, viewHash),
    database
      .prepare(
        `UPDATE site_visit_daily
         SET page_views = page_views + changes()
         WHERE business_date = ?`,
      )
      .bind(businessDate),
  ]);

  if (Number(rate?.attempts ?? 1) % 100 === 1) {
    const oldestDate = koreaDate(
      new Date(now.getTime() - VISIT_RETENTION_DAYS * DAY_MS),
    );
    await database
      .batch([
        database
          .prepare(
            "DELETE FROM site_visit_uniques WHERE business_date < ?",
          )
          .bind(oldestDate),
        database
          .prepare("DELETE FROM site_visit_views WHERE business_date < ?")
          .bind(oldestDate),
        database
          .prepare(
            "DELETE FROM site_visit_rate_limits WHERE business_date < ?",
          )
          .bind(oldestDate),
        database
          .prepare("DELETE FROM site_visit_daily WHERE business_date < ?")
          .bind(oldestDate),
      ])
      .catch(() => undefined);
  }
}

export async function getSiteVisitWeek(
  now = new Date(),
): Promise<SiteVisitDay[]> {
  await ensureSiteVisitSchema();
  const today = koreaDate(now);
  const todayStart = Date.parse(`${today}T00:00:00+09:00`);
  const dates = Array.from({ length: 7 }, (_, index) =>
    koreaDate(new Date(todayStart - (6 - index) * DAY_MS)),
  );
  const database = commerceDb();
  const result = await database
    .prepare(
      `SELECT business_date, page_views, unique_visitors
       FROM site_visit_daily
       WHERE business_date >= ? AND business_date <= ?
       ORDER BY business_date ASC`,
    )
    .bind(dates[0], dates[dates.length - 1])
    .all<{
      business_date: string;
      page_views: number;
      unique_visitors: number;
    }>();
  const byDate = new Map(
    (result.results ?? []).map((row) => [row.business_date, row]),
  );
  return dates.map((date) => {
    const row = byDate.get(date);
    return {
      date,
      label: `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`,
      pageViews: Number(row?.page_views ?? 0),
      uniqueVisitors: Number(row?.unique_visitors ?? 0),
    };
  });
}

export async function ensureSiteVisitSchema(): Promise<void> {
  await ensureCommerceSchema();
  if (!visitSchemaInitialization) {
    const database = commerceDb();
    visitSchemaInitialization = database
      .batch([
        database.prepare(`CREATE TABLE IF NOT EXISTS site_visit_daily (
          business_date TEXT PRIMARY KEY,
          page_views INTEGER NOT NULL DEFAULT 0 CHECK(page_views >= 0),
          unique_visitors INTEGER NOT NULL DEFAULT 0 CHECK(unique_visitors >= 0),
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        database.prepare(`CREATE TABLE IF NOT EXISTS site_visit_uniques (
          business_date TEXT NOT NULL,
          visitor_hash TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (business_date, visitor_hash)
        )`),
        database.prepare(`CREATE TABLE IF NOT EXISTS site_visit_views (
          business_date TEXT NOT NULL,
          view_hash TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (business_date, view_hash)
        )`),
        database.prepare(`CREATE TABLE IF NOT EXISTS site_visit_rate_limits (
          business_date TEXT NOT NULL,
          client_key TEXT NOT NULL,
          attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts >= 0),
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (business_date, client_key)
        )`),
        database.prepare(
          "CREATE INDEX IF NOT EXISTS site_visit_uniques_date_idx ON site_visit_uniques(business_date)",
        ),
        database.prepare(
          "CREATE INDEX IF NOT EXISTS site_visit_views_date_idx ON site_visit_views(business_date)",
        ),
        database.prepare(
          "CREATE INDEX IF NOT EXISTS site_visit_rate_limits_date_idx ON site_visit_rate_limits(business_date)",
        ),
      ])
      .then(() => undefined)
      .catch((error) => {
        visitSchemaInitialization = null;
        throw error;
      });
  }
  await visitSchemaInitialization;
}

function koreaDate(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: KOREA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
