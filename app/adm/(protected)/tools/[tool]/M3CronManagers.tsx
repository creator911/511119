"use client";

import {
  useMemo,
  useState,
  type FormEvent,
} from "react";
import Link from "next/link";
import type {
  M3CronJob,
  M3CronRun,
  M3CronScheduleType,
  M3CronSummary,
} from "@/lib/admin-m3cron";
import styles from "./m3cron-tools.module.css";

interface JobsApiResult {
  ok?: boolean;
  message?: string;
  job?: M3CronJob;
  jobs?: M3CronJob[];
  run?: M3CronRun;
}

interface LogsApiResult {
  ok?: boolean;
  message?: string;
  deleted?: number;
  run?: M3CronRun;
}

interface JobDraft {
  description: string;
  sortOrder: string;
  scheduleType: M3CronScheduleType;
  dayOfMonth: string;
  dayOfWeek: string;
  hour: string;
  minute: string;
  runOnceAt: string;
  enabled: boolean;
}

export function M3CronSettingsManager({
  initialJobs,
  initialSummary,
}: {
  initialJobs: M3CronJob[];
  initialSummary: M3CronSummary;
}) {
  const [jobs, setJobs] = useState(initialJobs);
  const [editing, setEditing] = useState<M3CronJob | null>(null);
  const [draft, setDraft] = useState<JobDraft | null>(null);
  const [runningId, setRunningId] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const summary = useMemo(
    () => ({
      ...initialSummary,
      total: jobs.length,
      running: jobs.filter((job) => job.enabled).length,
      inactive: jobs.filter((job) => !job.enabled).length,
    }),
    [initialSummary, jobs],
  );

  function beginEdit(job: M3CronJob) {
    setEditing(job);
    setDraft({
      description: job.description,
      sortOrder: String(job.sortOrder),
      scheduleType: job.scheduleType,
      dayOfMonth: String(job.dayOfMonth),
      dayOfWeek: String(job.dayOfWeek),
      hour: String(job.hour),
      minute: String(job.minute),
      runOnceAt: job.runOnceAt?.slice(0, 16).replace(" ", "T") ?? "",
      enabled: job.enabled,
    });
    setMessage("");
    setFailed(false);
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  async function saveJob(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing || !draft || saving) return;
    setSaving(true);
    setMessage("");
    setFailed(false);
    try {
      const response = await fetch(
        `/api/admin/m3cron/jobs/${encodeURIComponent(editing.id)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...draft,
            sortOrder: Number(draft.sortOrder),
            dayOfMonth: Number(draft.dayOfMonth),
            dayOfWeek: Number(draft.dayOfWeek),
            hour: Number(draft.hour),
            minute: Number(draft.minute),
            revision: editing.revision,
          }),
        },
      );
      const result = (await response.json()) as JobsApiResult;
      if (response.status === 401) {
        window.location.assign("/adm/login");
        return;
      }
      if (!response.ok || !result.job) {
        setFailed(true);
        setMessage(result.message ?? "m3cron 설정을 저장하지 못했습니다.");
        return;
      }
      setJobs((current) =>
        current
          .map((job) => (job.id === result.job!.id ? result.job! : job))
          .sort((left, right) => left.sortOrder - right.sortOrder),
      );
      setEditing(null);
      setDraft(null);
      setMessage("m3cron 설정을 저장했습니다.");
    } catch {
      setFailed(true);
      setMessage("네트워크 상태를 확인한 뒤 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  }

  async function runJob(job: M3CronJob) {
    if (
      !window.confirm(
        `다음의 내부 유지보수 작업을 지금 실행합니다.\n[ ${job.fileName} ]`,
      )
    ) {
      return;
    }
    setRunningId(job.id);
    setMessage("");
    setFailed(false);
    try {
      const response = await fetch(
        `/api/admin/m3cron/jobs/${encodeURIComponent(job.id)}/run`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ operationId: randomOperationId() }),
        },
      );
      const result = (await response.json()) as JobsApiResult;
      if (response.status === 401) {
        window.location.assign("/adm/login");
        return;
      }
      if (!response.ok || !result.job || !result.run) {
        setFailed(true);
        setMessage(result.message ?? "m3cron 작업을 실행하지 못했습니다.");
        return;
      }
      setJobs((current) =>
        current.map((currentJob) =>
          currentJob.id === result.job!.id ? result.job! : currentJob,
        ),
      );
      setFailed(result.run.status === "failed");
      setMessage(result.run.message);
    } catch {
      setFailed(true);
      setMessage("네트워크 상태를 확인한 뒤 다시 시도해 주세요.");
    } finally {
      setRunningId("");
    }
  }

  async function saveOrders() {
    setSaving(true);
    setMessage("");
    setFailed(false);
    try {
      const response = await fetch("/api/admin/m3cron/jobs", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          orders: jobs.map((job) => ({
            id: job.id,
            sortOrder: job.sortOrder,
            revision: job.revision,
          })),
        }),
      });
      const result = (await response.json()) as JobsApiResult;
      if (!response.ok || !result.jobs) {
        setFailed(true);
        setMessage(result.message ?? "순서를 변경하지 못했습니다.");
        return;
      }
      setJobs(result.jobs);
      setMessage("m3cron 작업 순서를 변경했습니다.");
    } catch {
      setFailed(true);
      setMessage("네트워크 상태를 확인한 뒤 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.settingsRoot}>
      <div className="local_ov01 local_ov">
        <SummaryChip label="전체" value={String(summary.total)} />
        {" "}
        <SummaryChip label="실행중" value={String(summary.running)} />
        {" "}
        <SummaryChip label="비활성" value={String(summary.inactive)} />
        {" "}
        <SummaryChip label="가상로봇" value={summary.virtualRobot} />
      </div>

      {editing && draft ? (
        <JobEditForm
          job={editing}
          draft={draft}
          saving={saving}
          onChange={setDraft}
          onCancel={() => {
            setEditing(null);
            setDraft(null);
          }}
          onSubmit={saveJob}
        />
      ) : null}

      <p className="sound_only">
        예약 주기는 저장되며 현재는 ‘지금 실행’ 버튼으로 실행한 경우에만 실제
        작업과 로그가 생성됩니다.
      </p>
      <div className="tbl_head01 tbl_wrap">
        <table className={`${styles.settingsTable} table-striped`}>
          <caption>m3cron 관리자 목록</caption>
          <thead>
            <tr>
              <th scope="col">No</th>
              <th scope="col">파일명</th>
              <th scope="col">순서</th>
              <th scope="col">설명</th>
              <th scope="col">지금 실행</th>
              <th scope="col">주기</th>
              <th scope="col">일자</th>
              <th scope="col">요일</th>
              <th scope="col">시간</th>
              <th scope="col">분</th>
              <th scope="col">마지막 실행</th>
              <th scope="col">처리시간 (msec)</th>
              <th scope="col">상태</th>
              <th scope="col">로봇</th>
              <th scope="col">관리</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job, index) => (
              <tr key={job.id}>
                <td>{index + 1}</td>
                <td className="td_left">
                  {job.fileName.includes("/") ? (
                    <span aria-hidden="true">▰ </span>
                  ) : null}
                  {job.fileName}
                </td>
                <td>
                  <input
                    className="frm_input"
                    aria-label={`${job.title} 순서`}
                    type="number"
                    min={0}
                    max={999}
                    value={job.sortOrder}
                    onChange={(event) => {
                      const value = Number(event.currentTarget.value);
                      setJobs((current) =>
                        current.map((currentJob) =>
                          currentJob.id === job.id
                            ? {
                                ...currentJob,
                                sortOrder: Number.isFinite(value) ? value : 0,
                              }
                            : currentJob,
                        ),
                      );
                    }}
                  />
                </td>
                <td className="td_left" title={`${job.title}: ${job.description}`} />
                <td>
                  <button
                    className="btn btn_02"
                    type="button"
                    disabled={runningId === job.id}
                    onClick={() => void runJob(job)}
                  >
                    {runningId === job.id ? "실행중" : "실행"}
                  </button>
                </td>
                <td>{scheduleLabel(job.scheduleType)}</td>
                <td>{scheduleDay(job)}</td>
                <td>{scheduleWeekday(job)}</td>
                <td>{scheduleHour(job)}</td>
                <td>{scheduleMinute(job)}</td>
                <td>{job.lastRunAt ?? "-"}</td>
                <td>{formatDuration(job.lastDurationMs)}</td>
                <td>
                  <span
                    className={
                      job.enabled ? styles.enabledMark : styles.disabledMark
                    }
                    aria-label={job.enabled ? "활성" : "비활성"}
                  >
                    {job.enabled ? "●" : "×"}
                  </span>
                </td>
                <td><span className={styles.disabledMark}>×</span></td>
                <td className="td_mng">
                  <button
                    className="btn btn_01"
                    type="button"
                    onClick={() => beginEdit(job)}
                  >
                    수정
                  </button>{" "}
                  <Link
                    className="btn btn_02"
                    href={`/adm/tools/m3cron-logs?job=${encodeURIComponent(job.id)}`}
                  >
                    로그
                  </Link>
                </td>
              </tr>
            ))}
            {jobs.length === 0 ? (
              <tr>
                <td className="empty_table" colSpan={15}>
                  실행 가능한 내부 유지보수 작업이 없습니다.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <div className={styles.orderButton}>
        <button
          className="btn_submit btn"
          type="button"
          disabled={saving}
          onClick={() => void saveOrders()}
        >
          순서변경
        </button>
      </div>
      <StatusMessage message={message} failed={failed} />
    </div>
  );
}

export function M3CronLogsManager({
  initialRuns,
  initialJobFilter,
}: {
  initialRuns: M3CronRun[];
  initialJobFilter: string;
}) {
  const [runs, setRuns] = useState(initialRuns);
  const [year, setYear] = useState("");
  const [month, setMonth] = useState("");
  const [method, setMethod] = useState<"specific" | "before">("specific");
  const [password, setPassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const currentYear = new Date().getFullYear();
  const years = Array.from(
    { length: Math.max(1, currentYear - 2023 + 1) },
    (_, index) => 2023 + index,
  );

  async function removeLogs(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!year) {
      window.alert("연도를 선택해 주십시오.");
      return;
    }
    if (!month) {
      window.alert("월을 선택해 주십시오.");
      return;
    }
    if (!password) {
      window.alert("관리자 비밀번호를 입력해 주십시오.");
      return;
    }
    const range = `${year}년 ${month}월${method === "before" ? " 이전" : "의"}`;
    if (!window.confirm(`${range} 자료를 삭제하시겠습니까?`)) return;
    setDeleting(true);
    setMessage("");
    setFailed(false);
    try {
      const response = await fetch("/api/admin/m3cron/logs", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          year: Number(year),
          month: Number(month),
          method,
          password,
        }),
      });
      const result = (await response.json()) as LogsApiResult;
      if (response.status === 401) {
        window.location.assign("/adm/login");
        return;
      }
      if (!response.ok || !result.run) {
        setFailed(true);
        setMessage(result.message ?? "m3cron 로그를 삭제하지 못했습니다.");
        return;
      }
      const from = `${year}-${month.padStart(2, "0")}-01 00:00:00`;
      const toDate = new Date(Date.UTC(Number(year), Number(month), 1));
      const to = `${toDate.getUTCFullYear()}-${String(toDate.getUTCMonth() + 1).padStart(2, "0")}-01 00:00:00`;
      setRuns((current) => [
        result.run!,
        ...current.filter((run) =>
          method === "before"
            ? run.createdAt >= to
            : run.createdAt < from || run.createdAt >= to,
        ),
      ]);
      setPassword("");
      setMessage(result.run.message);
    } catch {
      setFailed(true);
      setMessage("네트워크 상태를 확인한 뒤 다시 시도해 주세요.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className={styles.logsRoot}>
      <div className="local_ov01 local_ov">
        <h4>* m3cron 로그 삭제</h4>
      </div>
      <div className={`tbl_head01 tbl_wrap ${styles.logDeleteWrap}`}>
        <form className={styles.logDelete} onSubmit={removeLogs}>
          <select
            aria-label="연도 선택"
            value={year}
            onChange={(event) => setYear(event.currentTarget.value)}
          >
            <option value=""> 연도 선택 </option>
            {years.map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
          <select
            aria-label="월 선택"
            value={month}
            onChange={(event) => setMonth(event.currentTarget.value)}
          >
            <option value=""> 월 선택 </option>
            {Array.from({ length: 12 }, (_, index) => index + 1).map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
          <select
            aria-label="삭제 방법"
            value={method}
            onChange={(event) =>
              setMethod(event.currentTarget.value as "specific" | "before")
            }
          >
            <option value="specific">선택연월 자료삭제</option>
            <option value="before">선택연월 이전 자료삭제</option>
          </select>
          <label htmlFor="m3cron-password">관리자 비밀번호</label>
          <input
            className="frm_input required"
            id="m3cron-password"
            type="password"
            value={password}
            autoComplete="current-password"
            onChange={(event) => setPassword(event.currentTarget.value)}
          />
          <button className="btn_submit btn" type="submit" disabled={deleting}>
            {deleting ? "처리중" : "확인"}
          </button>
        </form>
      </div>

      {initialJobFilter ? (
        <div className="local_desc01 local_desc">
          <p>
            선택 작업({initialJobFilter})의 로그만 표시합니다.{" "}
            <Link href="/adm/tools/m3cron-logs">전체 로그 보기</Link>
          </p>
        </div>
      ) : null}
      <div className="local_ov01 local_ov">
        <SummaryChip label="전체" value={`${runs.length} 건`} />
      </div>
      <div className="tbl_head01 tbl_wrap">
        <table className={styles.logsTable}>
          <caption>m3cron 실행 기록 목록</caption>
          <thead>
            <tr>
              <th scope="col">파일명</th>
              <th scope="col">실행시각</th>
              <th scope="col">처리시간</th>
              <th scope="col">IP</th>
              <th scope="col">로봇</th>
              <th scope="col">mb_id 실행</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.id}>
                <td className="td_left" title={run.message}>
                  {run.fileName}
                  {run.status === "failed" ? (
                    <span className={styles.failedBadge}>실패</span>
                  ) : null}
                </td>
                <td>{run.createdAt}</td>
                <td>{formatDuration(run.durationMs)} msec</td>
                <td>{run.sourceIp || "-"}</td>
                <td>0</td>
                <td>{run.runBy || "-"}</td>
              </tr>
            ))}
            {runs.length === 0 ? (
              <tr>
                <td className="empty_table" colSpan={6}>
                  실행 기록이 없습니다.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <StatusMessage message={message} failed={failed} />
    </div>
  );
}

function JobEditForm({
  job,
  draft,
  saving,
  onChange,
  onCancel,
  onSubmit,
}: {
  job: M3CronJob;
  draft: JobDraft;
  saving: boolean;
  onChange: (value: JobDraft) => void;
  onCancel: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  function patch(value: Partial<JobDraft>) {
    onChange({ ...draft, ...value });
  }

  return (
    <form className={styles.editForm} onSubmit={onSubmit}>
      <div className="tbl_frm01 tbl_wrap">
        <table>
          <caption>m3cron 관리자 설정</caption>
          <colgroup>
            <col className={styles.editLabelColumn} />
            <col />
          </colgroup>
          <tbody>
            <tr>
              <th scope="row">파일명</th>
              <td>{job.fileName}</td>
            </tr>
            <tr>
              <th scope="row">
                <label htmlFor="m3cron-description">파일 설명</label>
              </th>
              <td>
                <input
                  className={`frm_input ${styles.descriptionInput}`}
                  id="m3cron-description"
                  value={draft.description}
                  maxLength={500}
                  onChange={(event) =>
                    patch({ description: event.currentTarget.value })
                  }
                />
              </td>
            </tr>
            <tr>
              <th scope="row">
                <label htmlFor="m3cron-schedule">실행주기</label>
              </th>
              <td>
                <select
                  id="m3cron-schedule"
                  value={draft.scheduleType}
                  onChange={(event) =>
                    patch({
                      scheduleType: event.currentTarget
                        .value as M3CronScheduleType,
                    })
                  }
                >
                  <option value="manual">- 수동 실행 -</option>
                  <option value="monthly">* 월/1회 (monthly)</option>
                  <option value="weekly">* 주/1회 (weekly)</option>
                  <option value="daily">* 일/1회 (daily)</option>
                  <option value="hourly">* n시간/1회 (hourly)</option>
                  <option value="minutely">* n분/1회 (minutely)</option>
                  <option value="once">* 한 번 (once)</option>
                </select>{" "}
                {draft.scheduleType === "monthly" ? (
                  <NumberSelect
                    label="일"
                    minimum={1}
                    maximum={28}
                    value={draft.dayOfMonth}
                    onChange={(value) => patch({ dayOfMonth: value })}
                  />
                ) : null}
                {draft.scheduleType === "weekly" ? (
                  <select
                    aria-label="요일"
                    value={draft.dayOfWeek}
                    onChange={(event) =>
                      patch({ dayOfWeek: event.currentTarget.value })
                    }
                  >
                    {weekdayLabels.map((label, index) => (
                      <option key={label} value={index}>{label}</option>
                    ))}
                  </select>
                ) : null}
                {draft.scheduleType === "once" ? (
                  <input
                    className="frm_input"
                    aria-label="한 번 실행 일시"
                    type="datetime-local"
                    value={draft.runOnceAt}
                    onChange={(event) =>
                      patch({ runOnceAt: event.currentTarget.value })
                    }
                  />
                ) : null}
                {draft.scheduleType !== "manual" &&
                draft.scheduleType !== "minutely" ? (
                  <NumberSelect
                    label={
                      draft.scheduleType === "hourly" ? "시간 간격" : "시"
                    }
                    minimum={draft.scheduleType === "hourly" ? 1 : 0}
                    maximum={23}
                    value={draft.hour}
                    onChange={(value) => patch({ hour: value })}
                  />
                ) : null}
                {draft.scheduleType !== "manual" &&
                draft.scheduleType !== "hourly" ? (
                  <NumberSelect
                    label={
                      draft.scheduleType === "minutely" ? "분 간격" : "분"
                    }
                    minimum={draft.scheduleType === "minutely" ? 1 : 0}
                    maximum={59}
                    value={draft.minute}
                    onChange={(value) => patch({ minute: value })}
                  />
                ) : null}
              </td>
            </tr>
            <tr>
              <th scope="row">가상로봇 계정</th>
              <td>사용하지 않음 (새 사이트 내부 작업)</td>
            </tr>
            <tr>
              <th scope="row">검색로봇 실행</th>
              <td>사용하지 않음</td>
            </tr>
            <tr>
              <th scope="row">실행 여부</th>
              <td>
                <label>
                  <input
                    type="checkbox"
                    checked={draft.enabled}
                    onChange={(event) =>
                      patch({ enabled: event.currentTarget.checked })
                    }
                  />{" "}
                  실행시 체크
                </label>
              </td>
            </tr>
            <tr>
              <th scope="row">
                <label htmlFor="m3cron-order">순서</label>
              </th>
              <td>
                <input
                  className="frm_input"
                  id="m3cron-order"
                  type="number"
                  min={0}
                  max={999}
                  value={draft.sortOrder}
                  onChange={(event) =>
                    patch({ sortOrder: event.currentTarget.value })
                  }
                />
              </td>
            </tr>
            <tr>
              <td colSpan={2}>
                <button className="btn btn_01" type="submit" disabled={saving}>
                  {saving ? "저장중" : "저장하기"}
                </button>{" "}
                <button className="btn btn_03" type="button" onClick={onCancel}>
                  목록
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </form>
  );
}

function NumberSelect({
  label,
  minimum,
  maximum,
  value,
  onChange,
}: {
  label: string;
  minimum: number;
  maximum: number;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.currentTarget.value)}
    >
      {Array.from(
        { length: maximum - minimum + 1 },
        (_, index) => minimum + index,
      ).map((option) => (
        <option key={option} value={option}>
          {String(option).padStart(2, "0")} {label.includes("분") ? "분" : label.includes("일") ? "일" : "시"}
        </option>
      ))}
    </select>
  );
}

function SummaryChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="btn_ov01">
      <span className="ov_txt">{label}</span>
      <span className="ov_num">{value}</span>
    </span>
  );
}

function StatusMessage({
  message,
  failed,
}: {
  message: string;
  failed: boolean;
}) {
  if (!message) return null;
  return (
    <p
      className={`${styles.statusMessage} ${
        failed ? styles.statusError : styles.statusSuccess
      }`}
      role={failed ? "alert" : "status"}
    >
      {message}
    </p>
  );
}

const weekdayLabels = [
  "일요일",
  "월요일",
  "화요일",
  "수요일",
  "목요일",
  "금요일",
  "토요일",
] as const;

function scheduleLabel(type: M3CronScheduleType): string {
  return {
    manual: "",
    monthly: "월/1회",
    weekly: "주/1회",
    daily: "일/1회",
    hourly: "시간",
    minutely: "분",
    once: "한 번",
  }[type];
}

function scheduleDay(job: M3CronJob): string {
  return job.scheduleType === "monthly"
    ? String(job.dayOfMonth)
    : job.scheduleType === "once"
      ? (job.runOnceAt?.slice(0, 10) ?? "")
      : "";
}

function scheduleWeekday(job: M3CronJob): string {
  return job.scheduleType === "weekly"
    ? weekdayLabels[job.dayOfWeek]?.slice(0, 1) ?? ""
    : "";
}

function scheduleHour(job: M3CronJob): string {
  return job.scheduleType === "manual" || job.scheduleType === "minutely"
    ? ""
    : String(job.hour).padStart(2, "0");
}

function scheduleMinute(job: M3CronJob): string {
  return job.scheduleType === "manual" || job.scheduleType === "hourly"
    ? ""
    : String(job.minute).padStart(2, "0");
}

function formatDuration(value: number): string {
  return Math.max(0, value).toFixed(3);
}

function randomOperationId(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/gu, "-")
    .replace(/\//gu, "_")
    .replace(/=+$/gu, "");
}
