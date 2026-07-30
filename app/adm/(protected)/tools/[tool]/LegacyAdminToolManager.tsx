"use client";

import {
  useMemo,
  useState,
  type FormEvent,
} from "react";
import type {
  LegacyAdminField,
  LegacyAdminToolDefinition,
} from "@/lib/admin-tool-catalog";
import type {
  LegacyAdminToolRecord,
  LegacyAdminToolRun,
  LegacyAdminToolState,
} from "@/lib/admin-tools";
import { SystemMaintenanceTool } from "./SystemMaintenanceTool";
import { AdditionalServicesTool } from "./AdditionalServicesTool";
import { MenuSettingsTool } from "./MenuSettingsTool";
import { PopupLayersTool } from "./PopupLayersTool";
import { ThemeSettingsTool } from "./ThemeSettingsTool";
import styles from "./legacy-tool.module.css";

type SettingValue = string | number | boolean;
type FieldErrors = Record<string, string | undefined>;

interface ApiResult {
  message?: string;
  fieldErrors?: Record<string, string>;
  settings?: Record<string, SettingValue>;
  record?: LegacyAdminToolRecord;
  run?: LegacyAdminToolRun;
}

export function LegacyAdminToolManager({
  initialState,
}: {
  initialState: LegacyAdminToolState;
}) {
  const { definition } = initialState;
  if (definition.slug === "theme-settings") {
    return (
      <ThemeSettingsTool
        definition={definition}
        initialSettings={initialState.settings}
      />
    );
  }
  if (definition.slug === "menu-settings") {
    return (
      <MenuSettingsTool
        definition={definition}
        initialSettings={initialState.settings}
      />
    );
  }
  if (definition.slug === "additional-services") {
    return (
      <AdditionalServicesTool
        definition={definition}
        initialSettings={initialState.settings}
      />
    );
  }
  if (definition.slug === "popup-layers") {
    return (
      <PopupLayersTool
        definition={definition}
        initialRecords={initialState.records}
      />
    );
  }
  if (
    [
      "session-files-delete",
      "cache-files-delete",
      "captcha-files-delete",
      "thumbnail-files-delete",
      "phpinfo",
      "browscap-update",
      "access-log-convert",
      "db-upgrade",
    ].includes(definition.slug)
  ) {
    return (
      <SystemMaintenanceTool
        definition={definition}
        initialRuns={initialState.runs}
      />
    );
  }
  if (definition.kind === "settings") {
    return (
      <SettingsTool
        definition={definition}
        initialSettings={initialState.settings}
      />
    );
  }
  if (definition.kind === "records") {
    return (
      <RecordsTool
        definition={definition}
        initialRecords={initialState.records}
      />
    );
  }
  if (definition.kind === "action") {
    return (
      <ActionTool
        definition={definition}
        initialRuns={initialState.runs}
      />
    );
  }
  return <InformationTool definition={definition} />;
}

function SettingsTool({
  definition,
  initialSettings,
}: {
  definition: LegacyAdminToolDefinition;
  initialSettings: Record<string, SettingValue>;
}) {
  const [settings, setSettings] = useState(initialSettings);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setMessage("");
    setFailed(false);
    setErrors({});
    try {
      const response = await fetch(`/api/admin/tools/${definition.slug}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(settings),
      });
      const result = (await response.json()) as ApiResult;
      if (response.status === 401) {
        window.location.assign("/adm/login");
        return;
      }
      if (!response.ok || !result.settings) {
        setErrors(result.fieldErrors ?? {});
        setFailed(true);
        setMessage(result.message ?? "설정을 저장하지 못했습니다.");
        return;
      }
      setSettings(result.settings);
      setMessage("설정을 저장했습니다.");
    } catch {
      setFailed(true);
      setMessage("네트워크 상태를 확인한 뒤 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save}>
      <LegacyDescription definition={definition} />
      <div className="tbl_frm01 tbl_wrap">
        <table>
          <caption>{definition.title}</caption>
          <colgroup>
            <col className={styles.labelColumn} />
            <col />
          </colgroup>
          <tbody>
            {(definition.fields ?? []).map((field) => (
              <tr key={field.key}>
                <th scope="row">
                  <label htmlFor={`tool-${field.key}`}>{field.label}</label>
                </th>
                <td>
                  <LegacyField
                    field={field}
                    value={settings[field.key] ?? field.defaultValue}
                    onChange={(value) => {
                      setSettings((current) => ({
                        ...current,
                        [field.key]: value,
                      }));
                      setErrors((current) => ({
                        ...current,
                        [field.key]: undefined,
                      }));
                    }}
                  />
                  {field.help ? (
                    <span className="frm_info">{field.help}</span>
                  ) : null}
                  {errors[field.key] ? (
                    <span className={styles.fieldError}>
                      {errors[field.key]}
                    </span>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="btn_fixed_top">
        <button className="btn_submit btn" type="submit" disabled={saving}>
          {saving ? "저장 중…" : "확인"}
        </button>
      </div>
      <StatusMessage message={message} failed={failed} />
    </form>
  );
}

function LegacyField({
  field,
  value,
  onChange,
}: {
  field: LegacyAdminField;
  value: SettingValue;
  onChange: (value: SettingValue) => void;
}) {
  const id = `tool-${field.key}`;
  if (field.type === "boolean") {
    return (
      <span className={styles.radioGroup}>
        <label>
          <input
            id={id}
            type="radio"
            checked={value === true}
            onChange={() => onChange(true)}
          />{" "}
          사용
        </label>
        <label>
          <input
            type="radio"
            checked={value === false}
            onChange={() => onChange(false)}
          />{" "}
          사용안함
        </label>
      </span>
    );
  }
  if (field.type === "textarea") {
    return (
      <textarea
        className={`${styles.textarea} frm_input`}
        id={id}
        value={String(value)}
        maxLength={5_000}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    );
  }
  if (field.type === "select") {
    return (
      <select
        id={id}
        value={String(value)}
        onChange={(event) => onChange(event.currentTarget.value)}
      >
        {field.options?.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }
  return (
    <input
      className="frm_input"
      id={id}
      type={field.type === "number" ? "number" : "text"}
      value={String(value)}
      maxLength={field.type === "number" ? undefined : 5_000}
      onChange={(event) =>
        onChange(
          field.type === "number"
            ? Number(event.currentTarget.value)
            : event.currentTarget.value,
        )
      }
    />
  );
}

function RecordsTool({
  definition,
  initialRecords,
}: {
  definition: LegacyAdminToolDefinition;
  initialRecords: LegacyAdminToolRecord[];
}) {
  const [records, setRecords] = useState(initialRecords);
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [status, setStatus] =
    useState<LegacyAdminToolRecord["status"]>("active");
  const [editingId, setEditingId] = useState("");
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const count = useMemo(() => records.length, [records]);

  function resetForm() {
    setTitle("");
    setDetails("");
    setStatus("active");
    setEditingId("");
  }

  function edit(record: LegacyAdminToolRecord) {
    setEditingId(record.id);
    setTitle(record.title);
    setDetails(record.details);
    setStatus(record.status);
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setMessage("");
    setFailed(false);
    try {
      const response = await fetch(
        editingId
          ? `/api/admin/tools/${definition.slug}/${editingId}`
          : `/api/admin/tools/${definition.slug}`,
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ title, details, status }),
        },
      );
      const result = (await response.json()) as ApiResult;
      if (response.status === 401) {
        window.location.assign("/adm/login");
        return;
      }
      if (!response.ok || !result.record) {
        setFailed(true);
        setMessage(result.message ?? "자료를 저장하지 못했습니다.");
        return;
      }
      setRecords((current) =>
        editingId
          ? current.map((item) =>
              item.id === result.record!.id ? result.record! : item,
            )
          : [result.record!, ...current],
      );
      setMessage(editingId ? "자료를 수정했습니다." : "자료를 등록했습니다.");
      resetForm();
    } catch {
      setFailed(true);
      setMessage("네트워크 상태를 확인한 뒤 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(record: LegacyAdminToolRecord) {
    if (!window.confirm("선택한 자료를 삭제하시겠습니까?")) return;
    setMessage("");
    setFailed(false);
    try {
      const response = await fetch(
        `/api/admin/tools/${definition.slug}/${record.id}`,
        { method: "DELETE" },
      );
      const result = (await response.json()) as ApiResult;
      if (response.status === 401) {
        window.location.assign("/adm/login");
        return;
      }
      if (!response.ok) {
        setFailed(true);
        setMessage(result.message ?? "자료를 삭제하지 못했습니다.");
        return;
      }
      setRecords((current) =>
        current.filter((item) => item.id !== record.id),
      );
      if (editingId === record.id) resetForm();
      setMessage("자료를 삭제했습니다.");
    } catch {
      setFailed(true);
      setMessage("네트워크 상태를 확인한 뒤 다시 시도해 주세요.");
    }
  }

  return (
    <>
      <LegacyDescription definition={definition} />
      <form onSubmit={save}>
        <div className="tbl_frm01 tbl_wrap">
          <table>
            <caption>
              {definition.recordLabel ?? definition.title} 등록 및 수정
            </caption>
            <colgroup>
              <col className={styles.labelColumn} />
              <col />
            </colgroup>
            <tbody>
              <tr>
                <th scope="row">
                  <label htmlFor="tool-record-title">제목</label>
                </th>
                <td>
                  <input
                    className={`${styles.wideInput} frm_input`}
                    id="tool-record-title"
                    value={title}
                    maxLength={200}
                    required
                    onChange={(event) => setTitle(event.currentTarget.value)}
                  />
                </td>
              </tr>
              <tr>
                <th scope="row">
                  <label htmlFor="tool-record-details">내용</label>
                </th>
                <td>
                  <textarea
                    className={`${styles.textarea} frm_input`}
                    id="tool-record-details"
                    value={details}
                    maxLength={5_000}
                    onChange={(event) => setDetails(event.currentTarget.value)}
                  />
                </td>
              </tr>
              <tr>
                <th scope="row">
                  <label htmlFor="tool-record-status">상태</label>
                </th>
                <td>
                  <select
                    id="tool-record-status"
                    value={status}
                    onChange={(event) =>
                      setStatus(
                        event.currentTarget
                          .value as LegacyAdminToolRecord["status"],
                      )
                    }
                  >
                    <option value="active">사용</option>
                    <option value="inactive">중지</option>
                    <option value="pending">대기</option>
                  </select>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className={styles.formActions}>
          {editingId ? (
            <button className="btn btn_02" type="button" onClick={resetForm}>
              취소
            </button>
          ) : null}
          <button className="btn_submit btn" type="submit" disabled={saving}>
            {saving ? "저장 중…" : editingId ? "수정" : "등록"}
          </button>
        </div>
      </form>
      <StatusMessage message={message} failed={failed} />

      <div className="local_ov01 local_ov">
        전체 <span className="btn_ov01"><span className="ov_txt">건수</span>
        <span className="ov_num">{count}건</span></span>
      </div>
      <div className="tbl_head01 tbl_wrap">
        <table>
          <caption>{definition.title} 목록</caption>
          <thead>
            <tr>
              <th scope="col">번호</th>
              <th scope="col">제목</th>
              <th scope="col">상태</th>
              <th scope="col">등록일</th>
              <th scope="col">관리</th>
            </tr>
          </thead>
          <tbody>
            {records.map((record, index) => (
              <tr key={record.id}>
                <td className="td_num">{count - index}</td>
                <td className="td_left">{record.title}</td>
                <td>{statusLabel(record.status)}</td>
                <td>{formatDate(record.updatedAt)}</td>
                <td className="td_mng">
                  <button
                    className="btn btn_03"
                    type="button"
                    onClick={() => edit(record)}
                  >
                    수정
                  </button>{" "}
                  <button
                    className="btn btn_02"
                    type="button"
                    onClick={() => void remove(record)}
                  >
                    삭제
                  </button>
                </td>
              </tr>
            ))}
            {records.length === 0 ? (
              <tr>
                <td className="empty_table" colSpan={5}>
                  자료가 없습니다.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}

function ActionTool({
  definition,
  initialRuns,
}: {
  definition: LegacyAdminToolDefinition;
  initialRuns: LegacyAdminToolRun[];
}) {
  const [runs, setRuns] = useState(initialRuns);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);

  async function execute() {
    if (
      !window.confirm(
        `${definition.actionLabel ?? definition.title} 작업을 실행하시겠습니까?`,
      )
    ) {
      return;
    }
    setRunning(true);
    setMessage("");
    setFailed(false);
    try {
      const response = await fetch(`/api/admin/tools/${definition.slug}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      const result = (await response.json()) as ApiResult;
      if (response.status === 401) {
        window.location.assign("/adm/login");
        return;
      }
      if (!response.ok || !result.run) {
        setFailed(true);
        setMessage(result.message ?? "작업을 처리하지 못했습니다.");
        return;
      }
      setRuns((current) => [result.run!, ...current].slice(0, 50));
      setMessage(result.run.message);
    } catch {
      setFailed(true);
      setMessage("네트워크 상태를 확인한 뒤 다시 시도해 주세요.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <>
      <LegacyDescription definition={definition} />
      <div className="local_desc02 local_desc">
        <p>
          이 작업은 새로 구축한 사이트와 새 데이터베이스에만 적용되며 기존
          RIAN 서버에는 연결하지 않습니다.
        </p>
      </div>
      <div className={styles.actionBox}>
        <button
          className="btn_submit btn"
          type="button"
          disabled={running}
          onClick={() => void execute()}
        >
          {running ? "처리 중…" : definition.actionLabel ?? definition.title}
        </button>
      </div>
      <StatusMessage message={message} failed={failed} />
      <div className="tbl_head01 tbl_wrap">
        <table>
          <caption>작업 내역</caption>
          <thead>
            <tr>
              <th scope="col">작업</th>
              <th scope="col">상태</th>
              <th scope="col">처리 내용</th>
              <th scope="col">처리일시</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.id}>
                <td>{run.action}</td>
                <td>{run.status === "completed" ? "완료" : "전송 대기"}</td>
                <td className="td_left">{run.message}</td>
                <td>{formatDateTime(run.createdAt)}</td>
              </tr>
            ))}
            {runs.length === 0 ? (
              <tr>
                <td className="empty_table" colSpan={4}>
                  작업 내역이 없습니다.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}

function InformationTool({
  definition,
}: {
  definition: LegacyAdminToolDefinition;
}) {
  const links: Record<string, { href: string; label: string }> = {
    phpinfo: { href: "/adm/tools/phpinfo", label: "현재 런타임 확인" },
    "saved-items": { href: "/adm/reports", label: "쇼핑몰 현황 보기" },
    "eyoom-admin-link": { href: "/adm", label: "통합 관리자 메인" },
  };
  const link = links[definition.slug];
  const details =
    definition.slug === "phpinfo"
      ? [
          ["실행 환경", "Cloudflare Workers / vinext"],
          ["애플리케이션", "RIAN 독립 쇼핑몰"],
          ["문자 인코딩", "UTF-8"],
          ["데이터베이스", "Cloudflare D1"],
        ]
      : definition.slug === "saved-items"
        ? [
            ["집계 범위", "새 사이트 회원 보관함"],
            ["기존 서버 연결", "없음"],
          ]
        : [
            ["관리자 모드", "RIAN 통합 관리자"],
            ["기존 서버 연결", "없음"],
          ];

  return (
    <>
      <LegacyDescription definition={definition} />
      <div className="tbl_frm01 tbl_wrap">
        <table>
          <caption>{definition.title}</caption>
          <colgroup>
            <col className={styles.labelColumn} />
            <col />
          </colgroup>
          <tbody>
            {details.map(([label, value]) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                <td>{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {link ? (
        <div className={styles.formActions}>
          <a className="btn_submit btn" href={link.href}>
            {link.label}
          </a>
        </div>
      ) : null}
    </>
  );
}

function LegacyDescription({
  definition,
}: {
  definition: LegacyAdminToolDefinition;
}) {
  return (
    <div className="local_desc01 local_desc">
      <p>{definition.description}</p>
      {definition.externalService ? (
        <p>
          외부 서비스 계정이 연결되기 전에는 요청을 안전하게 전송 대기로
          저장합니다.
        </p>
      ) : null}
    </div>
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

function statusLabel(status: LegacyAdminToolRecord["status"]): string {
  return status === "active" ? "사용" : status === "inactive" ? "중지" : "대기";
}

function formatDate(value: string): string {
  const date = parseDatabaseDate(value);
  if (!date) return value.slice(0, 10);
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatDateTime(value: string): string {
  const date = parseDatabaseDate(value);
  if (!date) return value.replace("T", " ").replace("Z", "").slice(0, 19);
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function parseDatabaseDate(value: string): Date | null {
  const normalized = /(?:Z|[+-]\d{2}:\d{2})$/u.test(value)
    ? value
    : `${value.replace(" ", "T")}Z`;
  const date = new Date(normalized);
  return Number.isFinite(date.getTime()) ? date : null;
}
