import { AdminApiError } from "@/lib/admin-api";
import { ensureAdminCommunitySchema } from "@/lib/admin-community";
import { commerceDb, ensureCommerceSchema } from "@/lib/commerce-db";
import { ensurePersonalPaymentSchema } from "@/lib/personal-payments";
import { ensureRestockNotificationSchema } from "@/lib/restock-notifications";
import { ensureSiteVisitSchema } from "@/lib/site-visits";

export type M3CronScheduleType =
  | "manual"
  | "monthly"
  | "weekly"
  | "daily"
  | "hourly"
  | "minutely"
  | "once";

export interface M3CronJob {
  id: string;
  fileName: string;
  title: string;
  description: string;
  sortOrder: number;
  scheduleType: M3CronScheduleType;
  dayOfMonth: number;
  dayOfWeek: number;
  hour: number;
  minute: number;
  runOnceAt: string | null;
  enabled: boolean;
  revision: number;
  lastRunAt: string | null;
  lastDurationMs: number;
  lastStatus: "never" | "completed" | "failed";
  lastMessage: string;
}

export interface M3CronRun {
  id: string;
  jobId: string;
  fileName: string;
  jobTitle: string;
  status: "completed" | "failed";
  message: string;
  affectedRows: number;
  durationMs: number;
  sourceIp: string;
  robot: false;
  runBy: string;
  createdAt: string;
}

export interface M3CronSummary {
  total: number;
  running: number;
  inactive: number;
  virtualRobot: string;
}

interface M3CronOptions {
  database?: D1Database;
}

interface M3CronJobRow {
  id: string;
  file_name: string;
  title: string;
  description: string;
  sort_order: number;
  schedule_type: M3CronScheduleType;
  day_of_month: number;
  day_of_week: number;
  hour: number;
  minute: number;
  run_once_at: string | null;
  enabled: number;
  revision: number;
  last_run_at: string | null;
  last_duration_ms: number;
  last_status: M3CronJob["lastStatus"];
  last_message: string;
}

interface M3CronRunRow {
  id: string;
  job_id: string;
  file_name: string;
  job_title: string;
  status: M3CronRun["status"];
  message: string;
  affected_rows: number;
  duration_ms: number;
  source_ip: string;
  run_by: string;
  created_at: string;
}

interface JobSeed {
  id: string;
  fileName: string;
  title: string;
  description: string;
  sortOrder: number;
  legacyLastRunAt: string;
}

const schemaInitializations = new WeakMap<object, Promise<void>>();
const jobIdPattern = /^[a-z][a-z0-9-]{2,60}$/u;
const operationIdPattern = /^[A-Za-z0-9_-]{16,96}$/u;
const scheduleTypes = new Set<M3CronScheduleType>([
  "manual",
  "monthly",
  "weekly",
  "daily",
  "hourly",
  "minutely",
  "once",
]);
const jobSeeds: readonly JobSeed[] = [
  {
    id: "visitor-retention",
    fileName: "gr_sample/sample",
    title: "방문통계 보관기한 정리",
    description:
      "90일이 지난 방문 상세·집계·요청 제한 자료를 실제 데이터베이스에서 정리합니다.",
    sortOrder: 0,
    legacyLastRunAt: "2023-03-28 22:56:49",
  },
  {
    id: "request-rate-limit-cleanup",
    fileName: "sample",
    title: "요청 제한·로그 정리",
    description:
      "재입고, 개인결제, 1:1 문의의 만료된 요청 제한 기록과 오래된 m3cron 로그를 실제 데이터베이스에서 정리합니다.",
    sortOrder: 0,
    legacyLastRunAt: "2023-03-28 22:56:58",
  },
] as const;

export async function ensureM3CronSchema(
  database = commerceDb(),
): Promise<void> {
  const cacheKey = database as unknown as object;
  let initialization = schemaInitializations.get(cacheKey);
  if (!initialization) {
    const statements = [
      database.prepare(`CREATE TABLE IF NOT EXISTS m3cron_jobs (
        id TEXT PRIMARY KEY,
        file_name TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        sort_order INTEGER NOT NULL DEFAULT 0,
        schedule_type TEXT NOT NULL DEFAULT 'manual'
          CHECK(schedule_type IN (
            'manual', 'monthly', 'weekly', 'daily',
            'hourly', 'minutely', 'once'
          )),
        day_of_month INTEGER NOT NULL DEFAULT 1
          CHECK(day_of_month BETWEEN 1 AND 28),
        day_of_week INTEGER NOT NULL DEFAULT 0
          CHECK(day_of_week BETWEEN 0 AND 6),
        hour INTEGER NOT NULL DEFAULT 0 CHECK(hour BETWEEN 0 AND 23),
        minute INTEGER NOT NULL DEFAULT 0 CHECK(minute BETWEEN 0 AND 59),
        run_once_at TEXT,
        enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0, 1)),
        revision INTEGER NOT NULL DEFAULT 1 CHECK(revision >= 1),
        last_run_at TEXT,
        last_duration_ms INTEGER NOT NULL DEFAULT 0
          CHECK(last_duration_ms >= 0),
        last_status TEXT NOT NULL DEFAULT 'never'
          CHECK(last_status IN ('never', 'completed', 'failed')),
        last_message TEXT NOT NULL DEFAULT '',
        updated_by TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`),
      database.prepare(
        "CREATE INDEX IF NOT EXISTS m3cron_jobs_order_idx ON m3cron_jobs(sort_order, id)",
      ),
      database.prepare(`CREATE TABLE IF NOT EXISTS m3cron_runs (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL,
        file_name TEXT NOT NULL,
        job_title TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('completed', 'failed')),
        message TEXT NOT NULL,
        affected_rows INTEGER NOT NULL DEFAULT 0 CHECK(affected_rows >= 0),
        duration_ms INTEGER NOT NULL DEFAULT 0 CHECK(duration_ms >= 0),
        source_ip TEXT NOT NULL DEFAULT '',
        run_by TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`),
      database.prepare(
        "CREATE INDEX IF NOT EXISTS m3cron_runs_job_idx ON m3cron_runs(job_id, created_at)",
      ),
      database.prepare(
        "CREATE INDEX IF NOT EXISTS m3cron_runs_created_idx ON m3cron_runs(created_at)",
      ),
      database.prepare(`CREATE TABLE IF NOT EXISTS m3cron_run_guards (
        operation_id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`),
      database.prepare(`CREATE TABLE IF NOT EXISTS admin_audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        admin_id INTEGER,
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL DEFAULT '',
        details TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`),
      database.prepare(
        "DELETE FROM m3cron_jobs WHERE id = 'm3cron-log-retention'",
      ),
      database.prepare(
        "DELETE FROM m3cron_runs WHERE file_name LIKE 'maintenance/%' OR file_name LIKE 'system/%'",
      ),
      database.prepare(`INSERT OR IGNORE INTO m3cron_runs (
        id, job_id, file_name, job_title, status, message, affected_rows,
        duration_ms, source_ip, run_by, created_at
      ) VALUES (
        'legacy-m3cron-sample-20230328225658',
        'request-rate-limit-cleanup',
        'sample',
        '요청 제한·로그 정리',
        'completed',
        '기존 RIAN m3cron 실행 기록을 이어받았습니다.',
        0, 0, '36.48.137.187', 'admin', '2023-03-28 22:56:58'
      )`),
      database.prepare(`INSERT OR IGNORE INTO m3cron_runs (
        id, job_id, file_name, job_title, status, message, affected_rows,
        duration_ms, source_ip, run_by, created_at
      ) VALUES (
        'legacy-m3cron-gr-sample-20230328225649',
        'visitor-retention',
        'gr_sample/sample',
        '방문통계 보관기한 정리',
        'completed',
        '기존 RIAN m3cron 실행 기록을 이어받았습니다.',
        0, 0, '222.162.79.55', 'admin', '2023-03-28 22:56:49'
      )`),
      ...jobSeeds.map((seed) =>
        database
          .prepare(
            `INSERT INTO m3cron_jobs (
               id, file_name, title, description, sort_order, last_run_at,
               last_duration_ms, last_status, last_message
             ) VALUES (?, ?, ?, ?, ?, ?, 0, 'completed', ?)
             ON CONFLICT(id) DO UPDATE SET
               file_name = excluded.file_name,
               title = excluded.title,
               description = excluded.description,
               sort_order = CASE
                 WHEN m3cron_jobs.file_name LIKE 'maintenance/%'
                   OR m3cron_jobs.file_name LIKE 'system/%'
                 THEN excluded.sort_order
                 ELSE m3cron_jobs.sort_order
               END,
               last_run_at = CASE
                 WHEN m3cron_jobs.file_name LIKE 'maintenance/%'
                   OR m3cron_jobs.file_name LIKE 'system/%'
                 THEN excluded.last_run_at
                 ELSE m3cron_jobs.last_run_at
               END,
               last_duration_ms = CASE
                 WHEN m3cron_jobs.file_name LIKE 'maintenance/%'
                   OR m3cron_jobs.file_name LIKE 'system/%'
                 THEN 0
                 ELSE m3cron_jobs.last_duration_ms
               END,
               last_status = CASE
                 WHEN m3cron_jobs.file_name LIKE 'maintenance/%'
                   OR m3cron_jobs.file_name LIKE 'system/%'
                 THEN 'completed'
                 ELSE m3cron_jobs.last_status
               END,
               last_message = CASE
                 WHEN m3cron_jobs.file_name LIKE 'maintenance/%'
                   OR m3cron_jobs.file_name LIKE 'system/%'
                 THEN excluded.last_message
                 ELSE m3cron_jobs.last_message
               END`,
          )
          .bind(
            seed.id,
            seed.fileName,
            seed.title,
            seed.description,
            seed.sortOrder,
            seed.legacyLastRunAt,
            "기존 RIAN m3cron 실행 기록을 이어받았습니다.",
          ),
      ),
    ];
    initialization = database
      .batch(statements)
      .then(() => undefined)
      .catch((error) => {
        schemaInitializations.delete(cacheKey);
        throw error;
      });
    schemaInitializations.set(cacheKey, initialization);
  }
  await initialization;
}

export async function listM3CronJobs(
  options: M3CronOptions = {},
): Promise<{ jobs: M3CronJob[]; summary: M3CronSummary }> {
  if (!options.database) await ensureCommerceSchema();
  const database = options.database ?? commerceDb();
  await ensureM3CronSchema(database);
  const rows = await database
    .prepare(
      `SELECT id, file_name, title, description, sort_order, schedule_type,
              day_of_month, day_of_week, hour, minute, run_once_at, enabled,
              revision, last_run_at, last_duration_ms, last_status,
              last_message
       FROM m3cron_jobs
       ORDER BY sort_order ASC,
                CASE id
                  WHEN 'visitor-retention' THEN 0
                  WHEN 'request-rate-limit-cleanup' THEN 1
                  ELSE 2
                END ASC,
                id ASC`,
    )
    .all<M3CronJobRow>();
  const jobs = (rows.results ?? []).map(mapJob);
  return {
    jobs,
    summary: {
      total: jobs.length,
      running: jobs.filter((job) => job.enabled).length,
      inactive: jobs.filter((job) => !job.enabled).length,
      virtualRobot: "계정 미등록",
    },
  };
}

export async function updateM3CronJob(
  id: string,
  input: unknown,
  adminUsername: string,
  options: M3CronOptions = {},
): Promise<M3CronJob> {
  assertJobId(id);
  const values = parseJobInput(input);
  if (!options.database) await ensureCommerceSchema();
  const database = options.database ?? commerceDb();
  await ensureM3CronSchema(database);
  let results: D1Result<unknown>[];
  try {
    results = await database.batch([
      database
        .prepare(
          `UPDATE m3cron_jobs
           SET description = ?,
               sort_order = CASE WHEN revision = ? THEN ? ELSE NULL END,
               schedule_type = ?, day_of_month = ?, day_of_week = ?,
               hour = ?, minute = ?, run_once_at = ?, enabled = ?,
               revision = revision + 1, updated_by = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
        )
        .bind(
          values.description,
          values.revision,
          values.sortOrder,
          values.scheduleType,
          values.dayOfMonth,
          values.dayOfWeek,
          values.hour,
          values.minute,
          values.runOnceAt,
          values.enabled ? 1 : 0,
          adminUsername,
          id,
        ),
      database
        .prepare(
          `INSERT INTO admin_audit_logs (
             action, entity_type, entity_id, details
           ) VALUES ('m3cron.job.update', 'm3cron_job', ?, ?)`,
        )
        .bind(
          id,
          JSON.stringify({
            adminUsername: adminUsername.slice(0, 128),
            revision: values.revision,
          }),
        ),
    ]);
  } catch (error) {
    if (
      error instanceof Error &&
      /constraint|not null|sort_order|m3cron_jobs/iu.test(error.message)
    ) {
      throw new AdminApiError(
        409,
        "다른 관리자가 먼저 수정했습니다. 새로고침 후 다시 시도해 주세요.",
      );
    }
    throw error;
  }
  if (Number(results[0]?.meta.changes ?? 0) !== 1) {
    const exists = await database
      .prepare("SELECT id FROM m3cron_jobs WHERE id = ?")
      .bind(id)
      .first<{ id: string }>();
    if (!exists) throw new AdminApiError(404, "m3cron 작업을 찾지 못했습니다.");
    throw new AdminApiError(
      409,
      "다른 관리자가 먼저 수정했습니다. 새로고침 후 다시 시도해 주세요.",
    );
  }
  return requireJob(id, database);
}

export async function updateM3CronJobOrders(
  input: unknown,
  adminUsername: string,
  options: M3CronOptions = {},
): Promise<M3CronJob[]> {
  const body = objectInput(input);
  if (!Array.isArray(body.orders) || body.orders.length < 1) {
    throw new AdminApiError(400, "변경할 순서를 확인해 주세요.");
  }
  if (body.orders.length > jobSeeds.length) {
    throw new AdminApiError(400, "변경할 작업 수를 확인해 주세요.");
  }
  const orders = body.orders.map((entry) => {
    const value = objectInput(entry);
    const id = String(value.id ?? "");
    assertJobId(id);
    return {
      id,
      sortOrder: boundedInteger(value.sortOrder, 0, 999, "순서"),
      revision: boundedInteger(value.revision, 1, 2_000_000_000, "자료 버전"),
    };
  });
  if (new Set(orders.map((entry) => entry.id)).size !== orders.length) {
    throw new AdminApiError(400, "중복된 작업이 포함되어 있습니다.");
  }
  if (!options.database) await ensureCommerceSchema();
  const database = options.database ?? commerceDb();
  await ensureM3CronSchema(database);
  const statements = orders.flatMap((order) => [
    database
      .prepare(
        `UPDATE m3cron_jobs
         SET sort_order = CASE WHEN revision = ? THEN ? ELSE NULL END,
             revision = revision + 1, updated_by = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      )
      .bind(
        order.revision,
        order.sortOrder,
        adminUsername,
        order.id,
      ),
    database
      .prepare(
        `INSERT INTO admin_audit_logs (
           action, entity_type, entity_id, details
         ) VALUES ('m3cron.job.reorder', 'm3cron_job', ?, ?)`,
      )
      .bind(
        order.id,
        JSON.stringify({
          adminUsername: adminUsername.slice(0, 128),
          sortOrder: order.sortOrder,
          revision: order.revision,
        }),
      ),
  ]);
  try {
    const results = await database.batch(statements);
    for (let index = 0; index < orders.length; index += 1) {
      if (Number(results[index * 2]?.meta.changes ?? 0) !== 1) {
        throw new AdminApiError(
          409,
          "다른 관리자가 먼저 순서를 수정했습니다. 새로고침 후 다시 시도해 주세요.",
        );
      }
    }
  } catch (error) {
    if (
      error instanceof AdminApiError ||
      (error instanceof Error &&
        /constraint|not null|sort_order|m3cron_jobs/iu.test(error.message))
    ) {
      throw new AdminApiError(
        409,
        "다른 관리자가 먼저 순서를 수정했습니다. 새로고침 후 다시 시도해 주세요.",
      );
    }
    throw error;
  }
  return (await listM3CronJobs({ database })).jobs;
}

export async function runM3CronJob(
  id: string,
  input: unknown,
  adminUsername: string,
  sourceIp: string,
  options: M3CronOptions = {},
): Promise<{ job: M3CronJob; run: M3CronRun }> {
  assertJobId(id);
  const body = objectInput(input);
  const operationId = String(body.operationId ?? "");
  if (!operationIdPattern.test(operationId)) {
    throw new AdminApiError(400, "실행 요청 번호를 확인해 주세요.");
  }
  if (!options.database) await ensureCommerceSchema();
  const database = options.database ?? commerceDb();
  await ensureM3CronSchema(database);
  const job = await requireJob(id, database);
  const guard = await database
    .prepare(
      `INSERT INTO m3cron_run_guards (operation_id, job_id)
       VALUES (?, ?)
       ON CONFLICT(operation_id) DO NOTHING
       RETURNING operation_id`,
    )
    .bind(operationId, id)
    .first<{ operation_id: string }>();
  if (!guard) {
    throw new AdminApiError(409, "이미 처리된 실행 요청입니다.");
  }

  const startedAt = performance.now();
  let status: M3CronRun["status"] = "completed";
  let message = "";
  let affectedRows = 0;
  try {
    const outcome = await executeKnownJob(id, database);
    affectedRows = outcome.affectedRows;
    message = outcome.message;
  } catch (error) {
    status = "failed";
    message =
      error instanceof Error
        ? `실행 실패: ${error.message.slice(0, 300)}`
        : "실행 중 알 수 없는 오류가 발생했습니다.";
  }
  const durationMs = Math.max(0, Math.round(performance.now() - startedAt));
  const runId = `m3r_${randomBase64Url(14)}`;
  await database.batch([
    database
      .prepare(
        `INSERT INTO m3cron_runs (
           id, job_id, file_name, job_title, status, message, affected_rows,
           duration_ms, source_ip, run_by
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        runId,
        id,
        job.fileName,
        job.title,
        status,
        message,
        affectedRows,
        durationMs,
        boundedIp(sourceIp),
        adminUsername,
      ),
    database
      .prepare(
        `UPDATE m3cron_jobs
         SET last_run_at = CURRENT_TIMESTAMP, last_duration_ms = ?,
             last_status = ?, last_message = ?, updated_by = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      )
      .bind(durationMs, status, message, adminUsername, id),
  ]);
  const run = await database
    .prepare(
      `SELECT id, job_id, file_name, job_title, status, message,
              affected_rows, duration_ms, source_ip, run_by, created_at
       FROM m3cron_runs WHERE id = ?`,
    )
    .bind(runId)
    .first<M3CronRunRow>();
  if (!run) throw new AdminApiError(500, "m3cron 실행 기록을 저장하지 못했습니다.");
  return { job: await requireJob(id, database), run: mapRun(run) };
}

export async function listM3CronRuns(
  input?: { jobId?: string },
  options: M3CronOptions = {},
): Promise<M3CronRun[]> {
  if (!options.database) await ensureCommerceSchema();
  const database = options.database ?? commerceDb();
  await ensureM3CronSchema(database);
  const jobId = String(input?.jobId ?? "").trim();
  if (jobId) assertJobId(jobId);
  const rows = await database
    .prepare(
      `SELECT id, job_id, file_name, job_title, status, message,
              affected_rows, duration_ms, source_ip, run_by, created_at
       FROM m3cron_runs
       WHERE (? = '' OR job_id = ?)
       ORDER BY created_at DESC, id DESC
       LIMIT 1000`,
    )
    .bind(jobId, jobId)
    .all<M3CronRunRow>();
  return (rows.results ?? []).map(mapRun);
}

export async function deleteM3CronRunsByPeriod(
  input: unknown,
  adminUsername: string,
  sourceIp: string,
  options: M3CronOptions = {},
): Promise<{ deleted: number; run: M3CronRun }> {
  const body = objectInput(input);
  const year = boundedInteger(body.year, 2000, 2200, "연도");
  const month = boundedInteger(body.month, 1, 12, "월");
  const method =
    body.method === "before" || body.method === "specific"
      ? body.method
      : null;
  if (!method) throw new AdminApiError(400, "삭제 범위를 확인해 주세요.");
  if (!options.database) await ensureCommerceSchema();
  const database = options.database ?? commerceDb();
  await ensureM3CronSchema(database);
  const from = `${year}-${String(month).padStart(2, "0")}-01 00:00:00`;
  const toDate = new Date(Date.UTC(year, month, 1));
  const to = `${toDate.getUTCFullYear()}-${String(toDate.getUTCMonth() + 1).padStart(2, "0")}-01 00:00:00`;
  const result =
    method === "before"
      ? await database
          .prepare("DELETE FROM m3cron_runs WHERE created_at < ?")
          .bind(to)
          .run()
      : await database
          .prepare(
            "DELETE FROM m3cron_runs WHERE created_at >= ? AND created_at < ?",
          )
          .bind(from, to)
          .run();
  const deleted = Number(result.meta.changes ?? 0);
  const runId = `m3r_${randomBase64Url(14)}`;
  const message = `${year}년 ${month}월${method === "before" ? " 이전" : ""} 실행 기록 ${deleted}건을 삭제했습니다.`;
  await database
    .prepare(
      `INSERT INTO m3cron_runs (
         id, job_id, file_name, job_title, status, message, affected_rows,
         duration_ms, source_ip, run_by
       ) VALUES (
         ?, 'm3cron-log-cleanup', 'maintenance/m3cron-log-cleanup',
         'm3cron 로그 수동 삭제', 'completed', ?, ?, 0, ?, ?
       )`,
    )
    .bind(runId, message, deleted, boundedIp(sourceIp), adminUsername)
    .run();
  const row = await database
    .prepare(
      `SELECT id, job_id, file_name, job_title, status, message,
              affected_rows, duration_ms, source_ip, run_by, created_at
       FROM m3cron_runs WHERE id = ?`,
    )
    .bind(runId)
    .first<M3CronRunRow>();
  if (!row) throw new AdminApiError(500, "삭제 작업 기록을 저장하지 못했습니다.");
  return { deleted, run: mapRun(row) };
}

async function executeKnownJob(
  id: string,
  database: D1Database,
): Promise<{ affectedRows: number; message: string }> {
  if (id === "visitor-retention") {
    await ensureSiteVisitSchema();
    const cutoff = koreaDate(new Date(Date.now() - 90 * 24 * 60 * 60 * 1_000));
    const results = await database.batch([
      database
        .prepare("DELETE FROM site_visit_uniques WHERE business_date < ?")
        .bind(cutoff),
      database
        .prepare("DELETE FROM site_visit_views WHERE business_date < ?")
        .bind(cutoff),
      database
        .prepare("DELETE FROM site_visit_rate_limits WHERE business_date < ?")
        .bind(cutoff),
      database
        .prepare("DELETE FROM site_visit_daily WHERE business_date < ?")
        .bind(cutoff),
    ]);
    const affectedRows = sumChanges(results);
    return {
      affectedRows,
      message: `90일 보관기한을 지난 방문통계 자료 ${affectedRows}건을 정리했습니다.`,
    };
  }

  if (id === "request-rate-limit-cleanup") {
    await Promise.all([
      ensureRestockNotificationSchema(database),
      ensurePersonalPaymentSchema(database),
      ensureAdminCommunitySchema(),
    ]);
    const cutoffWindow = Math.floor(Date.now() / 1_000) - 2 * 60 * 60;
    const results = await database.batch([
      database
        .prepare(
          "DELETE FROM restock_request_rate_limits WHERE window_start < ?",
        )
        .bind(cutoffWindow),
      database
        .prepare(
          "DELETE FROM personal_payment_rate_limits WHERE window_start < ?",
        )
        .bind(cutoffWindow),
      database.prepare(
        "DELETE FROM inquiry_rate_limits WHERE updated_at < datetime('now', '-2 day')",
      ),
      database.prepare(
        "DELETE FROM inquiry_lookup_rate_limits WHERE updated_at < datetime('now', '-2 day')",
      ),
      database.prepare(
        "DELETE FROM m3cron_runs WHERE created_at < datetime('now', '-365 day')",
      ),
      database.prepare(
        "DELETE FROM m3cron_run_guards WHERE created_at < datetime('now', '-30 day')",
      ),
    ]);
    const affectedRows = sumChanges(results);
    return {
      affectedRows,
      message: `만료된 요청 제한 및 m3cron 기록 ${affectedRows}건을 정리했습니다.`,
    };
  }

  throw new Error("허용되지 않은 유지보수 작업입니다.");
}

async function requireJob(
  id: string,
  database: D1Database,
): Promise<M3CronJob> {
  const row = await database
    .prepare(
      `SELECT id, file_name, title, description, sort_order, schedule_type,
              day_of_month, day_of_week, hour, minute, run_once_at, enabled,
              revision, last_run_at, last_duration_ms, last_status,
              last_message
       FROM m3cron_jobs WHERE id = ? LIMIT 1`,
    )
    .bind(id)
    .first<M3CronJobRow>();
  if (!row) throw new AdminApiError(404, "m3cron 작업을 찾지 못했습니다.");
  return mapJob(row);
}

function parseJobInput(input: unknown): {
  description: string;
  sortOrder: number;
  scheduleType: M3CronScheduleType;
  dayOfMonth: number;
  dayOfWeek: number;
  hour: number;
  minute: number;
  runOnceAt: string | null;
  enabled: boolean;
  revision: number;
} {
  const body = objectInput(input);
  const scheduleType = String(body.scheduleType ?? "") as M3CronScheduleType;
  if (!scheduleTypes.has(scheduleType)) {
    throw new AdminApiError(400, "실행주기를 확인해 주세요.");
  }
  const hour = boundedInteger(body.hour ?? 0, 0, 23, "시간");
  const minute = boundedInteger(body.minute ?? 0, 0, 59, "분");
  const dayOfMonth = boundedInteger(body.dayOfMonth ?? 1, 1, 28, "일자");
  const dayOfWeek = boundedInteger(body.dayOfWeek ?? 0, 0, 6, "요일");
  let runOnceAt: string | null = null;
  if (scheduleType === "once") {
    const raw = String(body.runOnceAt ?? "").trim();
    if (
      !/^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?$/u.test(raw)
    ) {
      throw new AdminApiError(400, "한 번 실행할 일시를 확인해 주세요.");
    }
    runOnceAt = raw.replace("T", " ");
    if (runOnceAt.length === 10) {
      runOnceAt = `${runOnceAt} ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
    } else if (runOnceAt.length === 16) {
      runOnceAt = `${runOnceAt}:00`;
    }
  }
  return {
    description: boundedText(body.description, 500),
    sortOrder: boundedInteger(body.sortOrder ?? 0, 0, 999, "순서"),
    scheduleType,
    dayOfMonth,
    dayOfWeek,
    hour,
    minute,
    runOnceAt,
    enabled: booleanValue(body.enabled),
    revision: boundedInteger(body.revision, 1, 2_000_000_000, "자료 버전"),
  };
}

function mapJob(row: M3CronJobRow): M3CronJob {
  return {
    id: row.id,
    fileName: row.file_name,
    title: row.title,
    description: row.description,
    sortOrder: Number(row.sort_order) || 0,
    scheduleType: scheduleTypes.has(row.schedule_type)
      ? row.schedule_type
      : "manual",
    dayOfMonth: Number(row.day_of_month) || 1,
    dayOfWeek: Number(row.day_of_week) || 0,
    hour: Number(row.hour) || 0,
    minute: Number(row.minute) || 0,
    runOnceAt: row.run_once_at,
    enabled: Number(row.enabled) === 1,
    revision: Math.max(1, Number(row.revision) || 1),
    lastRunAt: row.last_run_at,
    lastDurationMs: Math.max(0, Number(row.last_duration_ms) || 0),
    lastStatus:
      row.last_status === "completed" || row.last_status === "failed"
        ? row.last_status
        : "never",
    lastMessage: row.last_message,
  };
}

function mapRun(row: M3CronRunRow): M3CronRun {
  return {
    id: row.id,
    jobId: row.job_id,
    fileName: row.file_name,
    jobTitle: row.job_title,
    status: row.status === "failed" ? "failed" : "completed",
    message: row.message,
    affectedRows: Math.max(0, Number(row.affected_rows) || 0),
    durationMs: Math.max(0, Number(row.duration_ms) || 0),
    sourceIp: row.source_ip,
    robot: false,
    runBy: row.run_by,
    createdAt: row.created_at,
  };
}

function objectInput(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new AdminApiError(400, "요청 내용을 확인해 주세요.");
  }
  return input as Record<string, unknown>;
}

function boundedText(value: unknown, maximum: number): string {
  if (typeof value !== "string") return "";
  const text = value.trim();
  if (text.length > maximum) {
    throw new AdminApiError(400, `입력값은 ${maximum}자 이하여야 합니다.`);
  }
  return text;
}

function boundedInteger(
  value: unknown,
  minimum: number,
  maximum: number,
  label: string,
): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum) {
    throw new AdminApiError(400, `${label} 값을 확인해 주세요.`);
  }
  return number;
}

function booleanValue(value: unknown): boolean {
  return value === true || value === 1 || value === "1" || value === "true";
}

function assertJobId(id: string): void {
  if (!jobIdPattern.test(id)) {
    throw new AdminApiError(400, "m3cron 작업 번호를 확인해 주세요.");
  }
}

function sumChanges(results: D1Result<unknown>[]): number {
  return results.reduce(
    (sum, result) => sum + Math.max(0, Number(result.meta.changes ?? 0)),
    0,
  );
}

function boundedIp(value: string): string {
  const normalized = value.trim().slice(0, 45);
  return /^[0-9a-f:.]+$/iu.test(normalized) ? normalized : "";
}

function koreaDate(date: Date): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function randomBase64Url(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/gu, "-")
    .replace(/\//gu, "_")
    .replace(/=+$/gu, "");
}
