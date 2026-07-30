"use client";

import {
  useMemo,
  useState,
  type FormEvent,
} from "react";
import type {
  Club,
  ClubStatus,
} from "@/lib/clubs";
import styles from "./club-admin.module.css";

interface ClubApiResult {
  ok?: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
  club?: Club;
}

interface ClubDraft {
  name: string;
  description: string;
  contact: string;
  ownerName: string;
  status: ClubStatus;
  adminMemo: string;
}

const emptyDraft: ClubDraft = {
  name: "",
  description: "",
  contact: "",
  ownerName: "",
  status: "approved",
  adminMemo: "",
};

export function ClubAdminManager({
  initialClubs,
  mode,
}: {
  initialClubs: Club[];
  mode: "approved" | "applications";
}) {
  const [clubs, setClubs] = useState(initialClubs);
  const [editing, setEditing] = useState<Club | null>(null);
  const [draft, setDraft] = useState<ClubDraft>(
    mode === "approved"
      ? emptyDraft
      : { ...emptyDraft, status: "pending" },
  );
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const visibleClubs = useMemo(
    () =>
      clubs.filter((club) =>
        mode === "approved"
          ? club.status === "approved" || club.source === "admin"
          : club.source === "application" && club.status !== "approved",
      ),
    [clubs, mode],
  );

  function beginEdit(club: Club) {
    setEditing(club);
    setDraft({
      name: club.name,
      description: club.description,
      contact: club.contact,
      ownerName: club.ownerName,
      status: club.status,
      adminMemo: club.adminMemo,
    });
    setMessage("");
    setFailed(false);
  }

  function resetForm() {
    setEditing(null);
    setDraft(
      mode === "approved"
        ? emptyDraft
        : { ...emptyDraft, status: "pending" },
    );
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("");
    setFailed(false);
    try {
      const response = await fetch(
        editing
          ? `/api/admin/clubs/${encodeURIComponent(editing.id)}`
          : "/api/admin/clubs",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...draft,
            ...(editing ? { revision: editing.revision } : {}),
          }),
        },
      );
      const result = (await response.json()) as ClubApiResult;
      if (response.status === 401) {
        window.location.assign("/adm/login");
        return;
      }
      if (!response.ok || !result.club) {
        setFailed(true);
        setMessage(
          result.message ??
            (editing
              ? "동호회를 수정하지 못했습니다."
              : "동호회를 등록하지 못했습니다."),
        );
        return;
      }
      const saved = result.club;
      setClubs((current) =>
        editing
          ? current.map((club) => (club.id === saved.id ? saved : club))
          : [saved, ...current],
      );
      resetForm();
      setMessage(editing ? "동호회를 수정했습니다." : "동호회를 등록했습니다.");
    } catch {
      setFailed(true);
      setMessage("네트워크 상태를 확인한 뒤 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  async function transition(club: Club, status: ClubStatus) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    setFailed(false);
    try {
      const response = await fetch(
        `/api/admin/clubs/${encodeURIComponent(club.id)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: club.name,
            description: club.description,
            contact: club.contact,
            ownerName: club.ownerName,
            status,
            adminMemo: club.adminMemo,
            revision: club.revision,
          }),
        },
      );
      const result = (await response.json()) as ClubApiResult;
      if (response.status === 401) {
        window.location.assign("/adm/login");
        return;
      }
      if (!response.ok || !result.club) {
        setFailed(true);
        setMessage(result.message ?? "동호회 상태를 변경하지 못했습니다.");
        return;
      }
      setClubs((current) =>
        current.map((entry) =>
          entry.id === result.club!.id ? result.club! : entry,
        ),
      );
      if (editing?.id === club.id) resetForm();
      setMessage(
        status === "approved"
          ? "동호회 개설을 승인했습니다."
          : status === "rejected"
            ? "동호회 개설 신청을 반려했습니다."
            : "동호회를 심사 대기 상태로 변경했습니다.",
      );
    } catch {
      setFailed(true);
      setMessage("네트워크 상태를 확인한 뒤 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(club: Club) {
    if (
      busy ||
      !window.confirm(`"${club.name}" 동호회를 삭제하시겠습니까?`)
    ) {
      return;
    }
    setBusy(true);
    setMessage("");
    setFailed(false);
    try {
      const response = await fetch(
        `/api/admin/clubs/${encodeURIComponent(club.id)}`,
        { method: "DELETE" },
      );
      const result = (await response.json()) as ClubApiResult;
      if (response.status === 401) {
        window.location.assign("/adm/login");
        return;
      }
      if (!response.ok) {
        setFailed(true);
        setMessage(result.message ?? "동호회를 삭제하지 못했습니다.");
        return;
      }
      setClubs((current) => current.filter((entry) => entry.id !== club.id));
      if (editing?.id === club.id) resetForm();
      setMessage("동호회를 삭제했습니다.");
    } catch {
      setFailed(true);
      setMessage("네트워크 상태를 확인한 뒤 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="local_desc01 local_desc">
        <p>
          {mode === "approved"
            ? "공개 /clubs 화면에 표시되는 승인 동호회를 관리합니다."
            : "회원이 /clubs 화면에서 제출한 개설 신청을 심사합니다. 승인하면 공개 목록에 즉시 반영됩니다."}
        </p>
      </div>
      {message ? (
        <div
          className={`${styles.message} ${
            failed ? styles.failed : styles.success
          }`}
          role="status"
        >
          {message}
        </div>
      ) : null}

      <div className="tbl_head01 tbl_wrap">
        <table>
          <caption>
            {mode === "approved" ? "승인 동호회" : "동호회 개설 신청"}
          </caption>
          <thead>
            <tr>
              <th scope="col">동호회</th>
              <th scope="col">운영자</th>
              <th scope="col">상태</th>
              <th scope="col">신청일</th>
              <th scope="col">관리</th>
            </tr>
          </thead>
          <tbody>
            {visibleClubs.length > 0 ? (
              visibleClubs.map((club) => (
                <tr key={club.id}>
                  <td className={styles.clubCell}>
                    <strong>{club.name}</strong>
                    <span>{club.description}</span>
                  </td>
                  <td className={styles.ownerCell}>
                    {club.ownerName}
                    {club.contact ? <small>{club.contact}</small> : null}
                  </td>
                  <td>{statusLabel(club.status)}</td>
                  <td>{formatDate(club.createdAt)}</td>
                  <td className={styles.actions}>
                    {club.status !== "approved" ? (
                      <button
                        type="button"
                        className="btn btn_03"
                        disabled={busy}
                        onClick={() => void transition(club, "approved")}
                      >
                        승인
                      </button>
                    ) : null}
                    {club.status !== "rejected" ? (
                      <button
                        type="button"
                        className="btn btn_02"
                        disabled={busy}
                        onClick={() => void transition(club, "rejected")}
                      >
                        반려
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="btn btn_02"
                      disabled={busy}
                      onClick={() => beginEdit(club)}
                    >
                      수정
                    </button>
                    <button
                      type="button"
                      className="btn btn_01"
                      disabled={busy}
                      onClick={() => void remove(club)}
                    >
                      삭제
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className={styles.empty}>
                  {mode === "approved"
                    ? "승인된 동호회가 없습니다."
                    : "심사할 동호회 신청이 없습니다."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {mode === "approved" || editing ? (
        <form className={styles.form} onSubmit={save}>
          <h2>{editing ? "동호회 수정" : "승인 동호회 등록"}</h2>
          <div className="tbl_frm01 tbl_wrap">
            <table>
              <tbody>
                <tr>
                  <th scope="row">
                    <label htmlFor="club-name">동호회 이름</label>
                  </th>
                  <td>
                    <input
                      id="club-name"
                      className="frm_input"
                      value={draft.name}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          name: event.currentTarget.value,
                        })
                      }
                      maxLength={100}
                      required
                    />
                  </td>
                </tr>
                <tr>
                  <th scope="row">
                    <label htmlFor="club-owner">운영자</label>
                  </th>
                  <td>
                    <input
                      id="club-owner"
                      className="frm_input"
                      value={draft.ownerName}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          ownerName: event.currentTarget.value,
                        })
                      }
                      maxLength={100}
                      required
                    />
                  </td>
                </tr>
                <tr>
                  <th scope="row">
                    <label htmlFor="club-description">소개</label>
                  </th>
                  <td>
                    <textarea
                      id="club-description"
                      value={draft.description}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          description: event.currentTarget.value,
                        })
                      }
                      maxLength={2_000}
                      required
                    />
                  </td>
                </tr>
                <tr>
                  <th scope="row">
                    <label htmlFor="club-contact">연락 방법</label>
                  </th>
                  <td>
                    <input
                      id="club-contact"
                      className="frm_input"
                      value={draft.contact}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          contact: event.currentTarget.value,
                        })
                      }
                      maxLength={200}
                    />
                  </td>
                </tr>
                <tr>
                  <th scope="row">
                    <label htmlFor="club-status">상태</label>
                  </th>
                  <td>
                    <select
                      id="club-status"
                      value={draft.status}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          status: event.currentTarget.value as ClubStatus,
                        })
                      }
                    >
                      <option value="pending">심사 중</option>
                      <option value="approved">승인</option>
                      <option value="rejected">반려</option>
                    </select>
                  </td>
                </tr>
                <tr>
                  <th scope="row">
                    <label htmlFor="club-admin-memo">관리자 메모</label>
                  </th>
                  <td>
                    <textarea
                      id="club-admin-memo"
                      value={draft.adminMemo}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          adminMemo: event.currentTarget.value,
                        })
                      }
                      maxLength={2_000}
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className={styles.formActions}>
            {editing ? (
              <button
                type="button"
                className="btn btn_02"
                onClick={resetForm}
                disabled={busy}
              >
                취소
              </button>
            ) : null}
            <button type="submit" className="btn btn_03" disabled={busy}>
              {busy ? "저장 중..." : "저장"}
            </button>
          </div>
        </form>
      ) : null}
    </>
  );
}

function statusLabel(status: ClubStatus): string {
  if (status === "approved") return "승인";
  if (status === "rejected") return "반려";
  return "심사 중";
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "-"
    : date.toLocaleString("ko-KR", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
}
