"use client";

import { useMemo, useState, type FormEvent } from "react";
import type { LegacyAdminToolDefinition } from "@/lib/admin-tool-catalog";
import type { LegacyAdminToolRecord } from "@/lib/admin-tools";
import styles from "./popup-layers.module.css";

type PopupDevice = "both" | "pc" | "mobile";

interface ApiResult {
  message?: string;
  fieldErrors?: Record<string, string>;
  record?: LegacyAdminToolRecord;
}

interface PopupForm {
  title: string;
  content: string;
  href: string;
  startsAt: string;
  endsAt: string;
  device: PopupDevice;
  disableHours: number;
  left: number;
  top: number;
  width: number;
  height: number;
  status: LegacyAdminToolRecord["status"];
}

const EMPTY_FORM: PopupForm = {
  title: "",
  content: "",
  href: "",
  startsAt: "",
  endsAt: "",
  device: "both",
  disableHours: 24,
  left: 10,
  top: 10,
  width: 450,
  height: 500,
  status: "active",
};

export function PopupLayersTool({
  definition,
  initialRecords,
}: {
  definition: LegacyAdminToolDefinition;
  initialRecords: LegacyAdminToolRecord[];
}) {
  const [records, setRecords] = useState(initialRecords);
  const [form, setForm] = useState<PopupForm>({ ...EMPTY_FORM });
  const [editingId, setEditingId] = useState("");
  const [formVisible, setFormVisible] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const count = useMemo(() => records.length, [records]);

  function update<Key extends keyof PopupForm>(
    key: Key,
    value: PopupForm[Key],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function resetForm(close = true) {
    setForm({ ...EMPTY_FORM });
    setEditingId("");
    if (close) setFormVisible(false);
  }

  function beginAdd() {
    resetForm(false);
    setFormVisible(true);
    setMessage("");
    setFailed(false);
    window.setTimeout(() => {
      document.getElementById("popup-layer-form")?.scrollIntoView({
        block: "start",
        behavior: "smooth",
      });
    }, 0);
  }

  function edit(record: LegacyAdminToolRecord) {
    setEditingId(record.id);
    setForm({
      title: record.title,
      ...parseDetails(record.details),
      status: record.status,
    });
    setFormVisible(true);
    setMessage("");
    setFailed(false);
    window.setTimeout(() => {
      document.getElementById("popup-layer-form")?.scrollIntoView({
        block: "start",
        behavior: "smooth",
      });
    }, 0);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const validationMessage = validate(form);
    if (validationMessage) {
      setFailed(true);
      setMessage(validationMessage);
      return;
    }

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
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: form.title.trim(),
            details: JSON.stringify({
              content: form.content.trim(),
              href: form.href.trim(),
              startsAt: form.startsAt,
              endsAt: form.endsAt,
              device: form.device,
              disableHours: form.disableHours,
              left: form.left,
              top: form.top,
              width: form.width,
              height: form.height,
            }),
            status: form.status,
          }),
        },
      );
      const result = (await response.json().catch(() => null)) as
        | ApiResult
        | null;
      if (response.status === 401) {
        window.location.assign("/adm/login");
        return;
      }
      if (!response.ok || !result?.record) {
        throw new Error(
          result?.message ??
            Object.values(result?.fieldErrors ?? {})[0] ??
            "팝업을 저장하지 못했습니다.",
        );
      }
      setRecords((current) =>
        editingId
          ? current.map((record) =>
              record.id === result.record!.id ? result.record! : record,
            )
          : [result.record!, ...current],
      );
      setMessage(editingId ? "팝업을 수정했습니다." : "팝업을 등록했습니다.");
      resetForm();
    } catch (cause) {
      setFailed(true);
      setMessage(
        cause instanceof Error ? cause.message : "팝업을 저장하지 못했습니다.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function remove(record: LegacyAdminToolRecord) {
    if (!window.confirm(`"${record.title}" 팝업을 삭제하시겠습니까?`)) return;
    setMessage("");
    setFailed(false);
    try {
      const response = await fetch(
        `/api/admin/tools/${definition.slug}/${record.id}`,
        { method: "DELETE", headers: { Accept: "application/json" } },
      );
      const result = (await response.json().catch(() => null)) as
        | ApiResult
        | null;
      if (response.status === 401) {
        window.location.assign("/adm/login");
        return;
      }
      if (!response.ok) {
        throw new Error(result?.message ?? "팝업을 삭제하지 못했습니다.");
      }
      setRecords((current) =>
        current.filter((item) => item.id !== record.id),
      );
      if (editingId === record.id) resetForm();
      setMessage("팝업을 삭제했습니다.");
    } catch (cause) {
      setFailed(true);
      setMessage(
        cause instanceof Error ? cause.message : "팝업을 삭제하지 못했습니다.",
      );
    }
  }

  return (
    <div className={styles.page}>
      <div className={`btn_fixed_top ${styles.fixedAction}`}>
        <button
          className={`btn btn_01 ${styles.addCtl}`}
          type="button"
          onClick={beginAdd}
        >
          새창관리추가
        </button>
      </div>

      <div className={`local_ov01 local_ov ${styles.summary}`}>
        전체 {count.toLocaleString("ko-KR")}건
      </div>

      <div className={`tbl_head01 tbl_wrap ${styles.tableWrap}`}>
        <table className={styles.table}>
          <caption>팝업레이어 목록</caption>
          <colgroup>
            <col className={styles.colNumber} />
            <col className={styles.colTitle} />
            <col className={styles.colDevice} />
            <col className={styles.colStart} />
            <col className={styles.colEnd} />
            <col className={styles.colHours} />
            <col className={styles.colLeft} />
            <col className={styles.colTop} />
            <col className={styles.colWidth} />
            <col className={styles.colHeight} />
            <col className={styles.colManage} />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">번호</th>
              <th scope="col">제목</th>
              <th scope="col">접속기기</th>
              <th scope="col">시작일시</th>
              <th scope="col">종료일시</th>
              <th scope="col">시간</th>
              <th scope="col">Left</th>
              <th scope="col">Top</th>
              <th scope="col">Width</th>
              <th scope="col">Height</th>
              <th scope="col">관리</th>
            </tr>
          </thead>
          <tbody>
            {records.length > 0 ? (
              records.map((record, index) => {
                const details = parseDetails(record.details);
                return (
                  <tr key={record.id}>
                    <td>{count - index}</td>
                    <td className={styles.titleCell}>{record.title}</td>
                    <td>{deviceLabel(details.device)}</td>
                    <td>{formatLocalDateTime(details.startsAt)}</td>
                    <td>{formatLocalDateTime(details.endsAt)}</td>
                    <td>{details.disableHours}</td>
                    <td>{details.left}</td>
                    <td>{details.top}</td>
                    <td>{details.width}</td>
                    <td>{details.height}</td>
                    <td className={styles.manageCell}>
                      <button type="button" onClick={() => edit(record)}>
                        수정
                      </button>
                      <button
                        type="button"
                        onClick={() => void remove(record)}
                      >
                        삭제
                      </button>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td className={styles.emptyCell} colSpan={11}>
                  자료가 한건도 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {formVisible ? (
        <form
          className={styles.form}
          id="popup-layer-form"
          onSubmit={save}
        >
          <h2>{editingId ? "새창관리 수정" : "새창관리 추가"}</h2>
          <div className={`tbl_frm01 tbl_wrap ${styles.formTableWrap}`}>
            <table>
              <caption>팝업레이어 등록 및 수정</caption>
              <tbody>
                <tr>
                  <th scope="row">
                    <label htmlFor="popup-title">제목</label>
                  </th>
                  <td colSpan={3}>
                    <input
                      className={`frm_input ${styles.wideInput}`}
                      id="popup-title"
                      value={form.title}
                      maxLength={200}
                      required
                      onChange={(event) =>
                        update("title", event.currentTarget.value)
                      }
                    />
                  </td>
                </tr>
                <tr>
                  <th scope="row">
                    <label htmlFor="popup-device">접속기기</label>
                  </th>
                  <td>
                    <select
                      id="popup-device"
                      value={form.device}
                      onChange={(event) =>
                        update(
                          "device",
                          event.currentTarget.value as PopupDevice,
                        )
                      }
                    >
                      <option value="both">PC와 모바일</option>
                      <option value="pc">PC</option>
                      <option value="mobile">모바일</option>
                    </select>
                  </td>
                  <th scope="row">
                    <label htmlFor="popup-hours">시간</label>
                  </th>
                  <td>
                    <input
                      className="frm_input"
                      id="popup-hours"
                      type="number"
                      min={1}
                      max={8760}
                      value={form.disableHours}
                      onChange={(event) =>
                        update("disableHours", Number(event.currentTarget.value))
                      }
                    />
                    <span className="frm_info">다시 보지 않기 시간</span>
                  </td>
                </tr>
                <tr>
                  <th scope="row">
                    <label htmlFor="popup-start">시작일시</label>
                  </th>
                  <td>
                    <input
                      className="frm_input"
                      id="popup-start"
                      type="datetime-local"
                      value={form.startsAt}
                      onChange={(event) =>
                        update("startsAt", event.currentTarget.value)
                      }
                    />
                  </td>
                  <th scope="row">
                    <label htmlFor="popup-end">종료일시</label>
                  </th>
                  <td>
                    <input
                      className="frm_input"
                      id="popup-end"
                      type="datetime-local"
                      value={form.endsAt}
                      onChange={(event) =>
                        update("endsAt", event.currentTarget.value)
                      }
                    />
                  </td>
                </tr>
                <tr>
                  <th scope="row">위치</th>
                  <td>
                    <label>
                      Left{" "}
                      <input
                        className={`frm_input ${styles.numberInput}`}
                        type="number"
                        min={0}
                        max={9999}
                        value={form.left}
                        onChange={(event) =>
                          update("left", Number(event.currentTarget.value))
                        }
                      />
                    </label>
                    <label>
                      Top{" "}
                      <input
                        className={`frm_input ${styles.numberInput}`}
                        type="number"
                        min={0}
                        max={9999}
                        value={form.top}
                        onChange={(event) =>
                          update("top", Number(event.currentTarget.value))
                        }
                      />
                    </label>
                  </td>
                  <th scope="row">크기</th>
                  <td>
                    <label>
                      Width{" "}
                      <input
                        className={`frm_input ${styles.numberInput}`}
                        type="number"
                        min={100}
                        max={2000}
                        value={form.width}
                        onChange={(event) =>
                          update("width", Number(event.currentTarget.value))
                        }
                      />
                    </label>
                    <label>
                      Height{" "}
                      <input
                        className={`frm_input ${styles.numberInput}`}
                        type="number"
                        min={100}
                        max={2000}
                        value={form.height}
                        onChange={(event) =>
                          update("height", Number(event.currentTarget.value))
                        }
                      />
                    </label>
                  </td>
                </tr>
                <tr>
                  <th scope="row">
                    <label htmlFor="popup-content">내용</label>
                  </th>
                  <td colSpan={3}>
                    <textarea
                      className={`frm_input ${styles.contentInput}`}
                      id="popup-content"
                      value={form.content}
                      maxLength={4_000}
                      required
                      onChange={(event) =>
                        update("content", event.currentTarget.value)
                      }
                    />
                  </td>
                </tr>
                <tr>
                  <th scope="row">
                    <label htmlFor="popup-href">연결 주소</label>
                  </th>
                  <td>
                    <input
                      className={`frm_input ${styles.wideInput}`}
                      id="popup-href"
                      value={form.href}
                      maxLength={300}
                      placeholder="/shop/event.php"
                      onChange={(event) =>
                        update("href", event.currentTarget.value)
                      }
                    />
                  </td>
                  <th scope="row">
                    <label htmlFor="popup-status">사용 여부</label>
                  </th>
                  <td>
                    <select
                      id="popup-status"
                      value={form.status}
                      onChange={(event) =>
                        update(
                          "status",
                          event.currentTarget
                            .value as LegacyAdminToolRecord["status"],
                        )
                      }
                    >
                      <option value="active">사용</option>
                      <option value="inactive">사용안함</option>
                      <option value="pending">대기</option>
                    </select>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className={styles.formActions}>
            <button
              className="btn btn_02"
              type="button"
              onClick={() => resetForm()}
            >
              취소
            </button>
            <button
              className="btn_submit btn"
              type="submit"
              disabled={saving}
            >
              {saving ? "저장 중" : editingId ? "수정" : "확인"}
            </button>
          </div>
        </form>
      ) : null}

      <p
        className="sound_only"
        aria-live="polite"
        data-failed={failed ? "true" : "false"}
      >
        {message}
      </p>
    </div>
  );
}

function parseDetails(
  details: string,
): Omit<PopupForm, "title" | "status"> {
  try {
    const parsed: unknown = JSON.parse(details);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("invalid");
    }
    const values = parsed as Record<string, unknown>;
    return {
      content: typeof values.content === "string" ? values.content : "",
      href: typeof values.href === "string" ? values.href : "",
      startsAt: typeof values.startsAt === "string" ? values.startsAt : "",
      endsAt: typeof values.endsAt === "string" ? values.endsAt : "",
      device:
        values.device === "pc" || values.device === "mobile"
          ? values.device
          : "both",
      disableHours: safeNumber(values.disableHours, 24),
      left: safeNumber(values.left, 10),
      top: safeNumber(values.top, 10),
      width: safeNumber(values.width, 450),
      height: safeNumber(values.height, 500),
    };
  } catch {
    return { ...EMPTY_FORM, content: details };
  }
}

function safeNumber(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : fallback;
}

function validate(form: PopupForm): string {
  if (!form.title.trim()) return "제목을 입력해 주세요.";
  if (!form.content.trim()) return "내용을 입력해 주세요.";
  const href = form.href.trim();
  if (
    href &&
    ((!href.startsWith("/") && !href.startsWith("#")) ||
      href.startsWith("//") ||
      /[\u0000-\u001F\u007F\\]/u.test(href))
  ) {
    return "연결 주소는 /로 시작하는 새 사이트 내부 주소로 입력해 주세요.";
  }
  if (form.startsAt && form.endsAt && form.startsAt > form.endsAt) {
    return "노출 종료는 노출 시작 이후로 설정해 주세요.";
  }
  const validNumbers =
    Number.isSafeInteger(form.disableHours) &&
    form.disableHours >= 1 &&
    form.disableHours <= 8_760 &&
    Number.isSafeInteger(form.left) &&
    form.left >= 0 &&
    form.left <= 9_999 &&
    Number.isSafeInteger(form.top) &&
    form.top >= 0 &&
    form.top <= 9_999 &&
    Number.isSafeInteger(form.width) &&
    form.width >= 100 &&
    form.width <= 2_000 &&
    Number.isSafeInteger(form.height) &&
    form.height >= 100 &&
    form.height <= 2_000;
  return validNumbers ? "" : "팝업 시간과 위치, 크기를 다시 확인해 주세요.";
}

function deviceLabel(device: PopupDevice): string {
  return device === "pc"
    ? "PC"
    : device === "mobile"
      ? "모바일"
      : "PC와 모바일";
}

function formatLocalDateTime(value: string): string {
  return value ? value.replace("T", " ").slice(0, 16) : "-";
}
