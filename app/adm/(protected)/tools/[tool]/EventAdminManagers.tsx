"use client";

import { useMemo, useState, type FormEvent } from "react";
import type { StoreEvent } from "@/lib/store-events";
import styles from "./legacy-tool.module.css";

type FieldErrors = Record<string, string | undefined>;

interface EventApiResult {
  message?: string;
  fieldErrors?: Record<string, string>;
  event?: StoreEvent;
}

interface EventForm {
  title: string;
  content: string;
  href: string;
  startsAt: string;
  endsAt: string;
  active: boolean;
  linkedProductCount: number;
}

const blankEvent: EventForm = {
  title: "",
  content: "",
  href: "",
  startsAt: "",
  endsAt: "",
  active: true,
  linkedProductCount: 0,
};

export function EventAdminManager({
  initialEvents,
}: {
  initialEvents: StoreEvent[];
}) {
  const [events, setEvents] = useState(initialEvents);
  const [form, setForm] = useState<EventForm>(blankEvent);
  const [editingId, setEditingId] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const count = useMemo(() => events.length, [events]);

  function change<Key extends keyof EventForm>(
    key: Key,
    value: EventForm[Key],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => ({ ...current, [key]: undefined }));
  }

  function reset() {
    setEditingId("");
    setForm(blankEvent);
    setFieldErrors({});
    setShowForm(false);
  }

  function edit(event: StoreEvent) {
    setEditingId(event.id);
    setForm({
      title: event.title,
      content: event.content,
      href: event.href,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      active: event.active,
      linkedProductCount: event.linkedProductCount,
    });
    setMessage("");
    setFailed(false);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  async function save(submitEvent: FormEvent<HTMLFormElement>) {
    submitEvent.preventDefault();
    if (saving) return;
    setSaving(true);
    setMessage("");
    setFailed(false);
    setFieldErrors({});
    try {
      const response = await fetch(
        editingId
          ? `/api/admin/events/${encodeURIComponent(editingId)}`
          : "/api/admin/events",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(form),
        },
      );
      const result = (await response.json()) as EventApiResult;
      if (response.status === 401) {
        window.location.assign("/adm/login");
        return;
      }
      if (!response.ok || !result.event) {
        setFieldErrors(result.fieldErrors ?? {});
        setFailed(true);
        setMessage(result.message ?? "이벤트를 저장하지 못했습니다.");
        return;
      }
      setEvents((current) =>
        editingId
          ? current.map((event) =>
              event.id === result.event!.id ? result.event! : event,
            )
          : [result.event!, ...current],
      );
      setMessage(editingId ? "이벤트를 수정했습니다." : "이벤트를 등록했습니다.");
      reset();
    } catch {
      setFailed(true);
      setMessage("네트워크 상태를 확인한 뒤 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(event: StoreEvent) {
    if (!window.confirm(`"${event.title}" 이벤트를 삭제하시겠습니까?`)) return;
    setMessage("");
    setFailed(false);
    try {
      const response = await fetch(
        `/api/admin/events/${encodeURIComponent(event.id)}`,
        { method: "DELETE" },
      );
      const result = (await response.json()) as EventApiResult;
      if (response.status === 401) {
        window.location.assign("/adm/login");
        return;
      }
      if (!response.ok) {
        setFailed(true);
        setMessage(result.message ?? "이벤트를 삭제하지 못했습니다.");
        return;
      }
      setEvents((current) => current.filter((item) => item.id !== event.id));
      if (editingId === event.id) reset();
      setMessage("이벤트를 삭제했습니다.");
    } catch {
      setFailed(true);
      setMessage("네트워크 상태를 확인한 뒤 다시 시도해 주세요.");
    }
  }

  return (
    <div className={styles.eventManager}>
      <div className="btn_fixed_top">
        <button
          className="btn btn_01"
          type="button"
          onClick={() => {
            setEditingId("");
            setForm(blankEvent);
            setFieldErrors({});
            setMessage("");
            setFailed(false);
            setShowForm(true);
          }}
        >
          이벤트 추가
        </button>
      </div>
      {showForm ? (
        <>
          <div className="local_desc01 local_desc">
        <p>
          쇼핑몰 이벤트의 게시 기간과 내용을 관리합니다. 사용 상태이고 게시
          기간 안에 있는 이벤트만 공개 목록과 상세 화면에 표시됩니다.
        </p>
          </div>
          <form onSubmit={save}>
        <input
          type="hidden"
          name="linkedProductCount"
          value={form.linkedProductCount}
        />
        <div className="tbl_frm01 tbl_wrap">
          <table>
            <caption>이벤트 등록 및 수정</caption>
            <colgroup>
              <col className={styles.labelColumn} />
              <col />
            </colgroup>
            <tbody>
              <tr>
                <th scope="row">
                  <label htmlFor="event-title">이벤트 제목</label>
                </th>
                <td>
                  <input
                    id="event-title"
                    className={`${styles.wideInput} frm_input`}
                    value={form.title}
                    maxLength={200}
                    required
                    onChange={(event) =>
                      change("title", event.currentTarget.value)
                    }
                  />
                  <FieldError value={fieldErrors.title} />
                </td>
              </tr>
              <tr>
                <th scope="row">
                  <label htmlFor="event-content">이벤트 내용</label>
                </th>
                <td>
                  <textarea
                    id="event-content"
                    className={`${styles.textarea} frm_input`}
                    value={form.content}
                    maxLength={4_000}
                    required
                    onChange={(event) =>
                      change("content", event.currentTarget.value)
                    }
                  />
                  <FieldError value={fieldErrors.content} />
                </td>
              </tr>
              <tr>
                <th scope="row">
                  <label htmlFor="event-href">연결 주소</label>
                </th>
                <td>
                  <input
                    id="event-href"
                    className={`${styles.wideInput} frm_input`}
                    value={form.href}
                    maxLength={300}
                    placeholder="/shop/list.php?ca_id=10"
                    onChange={(event) =>
                      change("href", event.currentTarget.value)
                    }
                  />
                  <span className="frm_info">
                    /로 시작하는 새 사이트 내부 주소만 입력합니다.
                  </span>
                  <FieldError value={fieldErrors.href} />
                </td>
              </tr>
              <tr>
                <th scope="row">
                  <label htmlFor="event-start">시작일</label>
                </th>
                <td>
                  <input
                    id="event-start"
                    className="frm_input"
                    type="date"
                    value={form.startsAt}
                    onChange={(event) =>
                      change("startsAt", event.currentTarget.value)
                    }
                  />
                  <FieldError value={fieldErrors.startsAt} />
                </td>
              </tr>
              <tr>
                <th scope="row">
                  <label htmlFor="event-end">종료일</label>
                </th>
                <td>
                  <input
                    id="event-end"
                    className="frm_input"
                    type="date"
                    value={form.endsAt}
                    onChange={(event) =>
                      change("endsAt", event.currentTarget.value)
                    }
                  />
                  <FieldError value={fieldErrors.endsAt} />
                </td>
              </tr>
              <tr>
                <th scope="row">사용 여부</th>
                <td>
                  <span className={styles.radioGroup}>
                    <label>
                      <input
                        type="radio"
                        name="event-active"
                        checked={form.active}
                        onChange={() => change("active", true)}
                      />{" "}
                      사용
                    </label>
                    <label>
                      <input
                        type="radio"
                        name="event-active"
                        checked={!form.active}
                        onChange={() => change("active", false)}
                      />{" "}
                      사용안함
                    </label>
                  </span>
                  <FieldError value={fieldErrors.active} />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className={styles.formActions}>
          {editingId ? (
            <button className="btn btn_02" type="button" onClick={reset}>
              취소
            </button>
          ) : null}
          <button className="btn_submit btn" type="submit" disabled={saving}>
            {saving ? "저장 중…" : editingId ? "수정" : "이벤트 추가"}
          </button>
        </div>
          </form>
        </>
      ) : null}
      <StatusMessage message={message} failed={failed} />

      <div className={`local_ov01 local_ov ${styles.eventSummary}`}>
        전체 이벤트 {count.toLocaleString("ko-KR")}건
      </div>
      <div className={`tbl_head01 tbl_wrap ${styles.eventTableWrap}`}>
        <table>
          <caption>이벤트 목록</caption>
          <thead>
            <tr>
              <th scope="col">이벤트번호</th>
              <th scope="col">제목</th>
              <th scope="col">연결상품</th>
              <th scope="col">사용</th>
              <th scope="col">관리</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr key={event.id}>
                <td className="td_num">{eventDisplayNumber(event)}</td>
                <td className="td_left">{event.title}</td>
                <td>
                  {event.linkedProductCount.toLocaleString("ko-KR")}
                </td>
                <td>{event.active ? "예" : "아니오"}</td>
                <td className="td_mng">
                  <div className={styles.eventActions}>
                    <button
                      className={`btn btn_03 ${styles.eventAction}`}
                      type="button"
                      onClick={() => edit(event)}
                    >
                      수정
                    </button>
                    <a
                      className={`btn btn_03 ${styles.eventAction}`}
                      href={`/shop/event.php?ev_id=${encodeURIComponent(event.id)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      보기
                    </a>
                    <button
                      className={`btn btn_02 ${styles.eventAction}`}
                      type="button"
                      onClick={() => void remove(event)}
                    >
                      삭제
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {events.length === 0 ? (
              <tr>
                <td className="empty_table" colSpan={5}>
                  등록된 이벤트가 없습니다.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function eventDisplayNumber(event: StoreEvent): string {
  if (event.id === "16881007-7700-4000-8000-000000000001") {
    return "1688100777";
  }
  const normalized = /(?:Z|[+-]\d{2}:\d{2})$/u.test(event.createdAt)
    ? event.createdAt
    : `${event.createdAt.replace(" ", "T")}Z`;
  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp)
    ? String(Math.floor(timestamp / 1_000))
    : event.id.slice(0, 10);
}

function FieldError({ value }: { value?: string }) {
  return value ? <span className={styles.fieldError}>{value}</span> : null;
}

function StatusMessage({
  message,
  failed,
}: {
  message: string;
  failed: boolean;
}) {
  return message ? (
    <p
      className={`${styles.statusMessage} ${
        failed ? styles.statusError : styles.statusSuccess
      }`}
      role={failed ? "alert" : "status"}
    >
      {message}
    </p>
  ) : null;
}
