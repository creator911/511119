"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MAX_POINTS } from "@/lib/commerce-limits";
import styles from "./reports.module.css";

export interface ManagedPointLedgerRow {
  eventType: string;
  orderId: string;
  entryId: string | null;
  userId: string;
  loginId: string;
  name: string;
  points: number;
  reason: string;
  balanceAfter: number;
  revision: number | null;
  editable: boolean;
  occurredAt: string;
}

interface EditDraft {
  id: string;
  revision: number;
  reason: string;
  pointText: string;
  occurredAt: string;
}

interface PointApiResult {
  ok?: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
}

export function PointLedgerManager({
  rows,
}: {
  rows: ManagedPointLedgerRow[];
}) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [busy, setBusy] = useState<"save" | "delete" | null>(null);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);

  const selectedRows = rows.filter(
    (row) => row.entryId && selectedIds.has(row.entryId),
  );

  function beginEdit(row: ManagedPointLedgerRow) {
    if (!row.editable || !row.entryId || row.revision === null) return;
    if (draft?.id === row.entryId) {
      setDraft(null);
      setMessage("");
      setFailed(false);
      return;
    }
    if (
      draft &&
      !window.confirm(
        "현재 수정 중인 내용을 취소하고 다른 내역을 수정하시겠습니까?",
      )
    ) {
      return;
    }
    setDraft({
      id: row.entryId,
      revision: row.revision,
      reason: row.reason,
      pointText: String(row.points),
      occurredAt: koreaDateTimeInput(row.occurredAt),
    });
    setMessage("");
    setFailed(false);
  }

  async function saveDraft() {
    if (!draft || busy) return;
    const reason = draft.reason.trim();
    if (reason.length < 2 || reason.length > 255) {
      showError("포인트 내용은 2자 이상 255자 이하로 입력해 주세요.");
      return;
    }
    if (!/^-?\d+$/u.test(draft.pointText.trim())) {
      showError("포인트는 0이 아닌 정수로 입력해 주세요.");
      return;
    }
    const delta = Number(draft.pointText);
    if (
      !Number.isSafeInteger(delta) ||
      delta === 0 ||
      Math.abs(delta) > MAX_POINTS
    ) {
      showError("포인트는 0이 아닌 안전한 정수로 입력해 주세요.");
      return;
    }
    if (!isKoreaDateTimeInput(draft.occurredAt)) {
      showError("포인트 일시를 초 단위까지 확인해 주세요.");
      return;
    }

    setBusy("save");
    setMessage("");
    setFailed(false);
    try {
      const response = await fetch("/api/admin/points", {
        method: "PATCH",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: draft.id,
          revision: draft.revision,
          reason,
          delta,
          occurredAt: draft.occurredAt,
        }),
      });
      const result = await readPointResult(response);
      if (response.status === 401) {
        window.location.assign("/adm/login");
        return;
      }
      if (!response.ok) {
        throw new Error(
          firstPointError(result) ??
            "포인트 내역을 저장하지 못했습니다.",
        );
      }
      setDraft(null);
      setMessage(
        result.message ?? "포인트 내역과 회원 잔액을 저장했습니다.",
      );
      router.refresh();
    } catch (error) {
      showError(
        error instanceof Error
          ? error.message
          : "포인트 내역을 저장하지 못했습니다.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function removeSelected() {
    if (busy || selectedRows.length < 1) return;
    const reason = window.prompt(
      "선택한 관리자 포인트 내역을 삭제하는 사유를 입력해 주세요.",
    );
    if (reason === null) return;
    if (reason.trim().length < 2) {
      showError("삭제 사유를 2자 이상 입력해 주세요.");
      return;
    }
    if (
      !window.confirm(
        `선택한 ${selectedRows.length.toLocaleString("ko-KR")}건을 삭제하고 회원 잔액을 되돌리시겠습니까?`,
      )
    ) {
      return;
    }
    const entries = selectedRows.flatMap((row) =>
      row.entryId && row.revision !== null
        ? [{ id: row.entryId, revision: row.revision }]
        : [],
    );
    if (entries.length !== selectedRows.length) {
      showError("선택 내역을 새로고침한 뒤 다시 시도해 주세요.");
      return;
    }

    setBusy("delete");
    setMessage("");
    setFailed(false);
    try {
      const response = await fetch("/api/admin/points", {
        method: "DELETE",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ entries, reason: reason.trim() }),
      });
      const result = await readPointResult(response);
      if (response.status === 401) {
        window.location.assign("/adm/login");
        return;
      }
      if (!response.ok) {
        throw new Error(
          firstPointError(result) ??
            "포인트 내역을 삭제하지 못했습니다.",
        );
      }
      setSelectedIds(new Set());
      setDraft(null);
      setMessage(
        result.message ??
          `${entries.length.toLocaleString("ko-KR")}건을 삭제했습니다.`,
      );
      router.refresh();
    } catch (error) {
      showError(
        error instanceof Error
          ? error.message
          : "포인트 내역을 삭제하지 못했습니다.",
      );
    } finally {
      setBusy(null);
    }
  }

  function showError(value: string) {
    setFailed(true);
    setMessage(value);
  }

  return (
    <>
      <div className={`btn_fixed_top ${styles.pointToolbar}`}>
        <button
          type="button"
          className="btn_submit btn"
          disabled={!draft || busy !== null}
          onClick={() => void saveDraft()}
        >
          {busy === "save" ? "저장 중" : "저장"}
        </button>
        <button
          type="button"
          className="btn"
          disabled={selectedRows.length < 1 || busy !== null}
          onClick={() => void removeSelected()}
        >
          {busy === "delete"
            ? "삭제 중"
            : selectedRows.length > 0
              ? `선택삭제 (${selectedRows.length})`
              : "선택삭제"}
        </button>
      </div>
      {message ? (
        <p
          className={failed ? styles.pointError : styles.pointSuccess}
          role="status"
        >
          {message}
        </p>
      ) : null}
      <div className={styles.tableScroll}>
        <table className={`${styles.table} ${styles.pointEditTable}`}>
          <thead>
            <tr>
              <th aria-label="선택" />
              <th>회원아이디</th>
              <th>이름</th>
              <th>닉네임</th>
              <th>포인트 내용</th>
              <th>포인트</th>
              <th>일시</th>
              <th>포인트합</th>
              <th>관리</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const editing = draft?.id === row.entryId;
              return (
                <tr key={`${row.eventType}-${row.orderId}-${row.occurredAt}`}>
                  <td>
                    <input
                      type="checkbox"
                      disabled={!row.editable || !row.entryId}
                      checked={
                        Boolean(row.entryId) &&
                        selectedIds.has(row.entryId!)
                      }
                      onChange={(event) => {
                        if (!row.entryId) return;
                        setSelectedIds((current) => {
                          const next = new Set(current);
                          if (event.target.checked) next.add(row.entryId!);
                          else next.delete(row.entryId!);
                          return next;
                        });
                      }}
                      aria-label={`${row.loginId} 포인트 내역 선택`}
                    />
                  </td>
                  <td>
                    <a
                      className={styles.primaryLink}
                      href={`/adm/users?q=${encodeURIComponent(row.loginId)}`}
                    >
                      {row.loginId}
                    </a>
                  </td>
                  <td>{row.name}</td>
                  <td>{row.loginId}</td>
                  <td>
                    {editing ? (
                      <input
                        className={`${styles.pointEditInput} ${styles.pointReasonInput}`}
                        value={draft.reason}
                        maxLength={255}
                        onChange={(event) =>
                          setDraft({ ...draft, reason: event.target.value })
                        }
                        aria-label={`${row.loginId} 포인트 내용`}
                      />
                    ) : (
                      row.reason || pointEventLabel(row.eventType, row.orderId)
                    )}
                  </td>
                  <td>
                    {editing ? (
                      <input
                        className={`${styles.pointEditInput} ${styles.pointAmountInput}`}
                        value={draft.pointText}
                        inputMode="numeric"
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            pointText: event.target.value,
                          })
                        }
                        aria-label={`${row.loginId} 지급 포인트`}
                      />
                    ) : (
                      <strong
                        className={
                          row.points >= 0
                            ? styles.positive
                            : styles.negative
                        }
                      >
                        {row.points > 0 ? "+" : ""}
                        {row.points.toLocaleString("ko-KR")}
                      </strong>
                    )}
                  </td>
                  <td>
                    {editing ? (
                      <input
                        className={`${styles.pointEditInput} ${styles.pointDateInput}`}
                        type="datetime-local"
                        step={1}
                        value={draft.occurredAt}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            occurredAt: event.target.value,
                          })
                        }
                        aria-label={`${row.loginId} 포인트 일시`}
                      />
                    ) : (
                      formatKoreaDateTime(row.occurredAt)
                    )}
                  </td>
                  <td>{row.balanceAfter.toLocaleString("ko-KR")}</td>
                  <td>
                    {row.editable ? (
                      <button
                        type="button"
                        className="btn btn_02"
                        disabled={busy !== null}
                        onClick={() => beginEdit(row)}
                      >
                        {editing ? "취소" : "수정"}
                      </button>
                    ) : (
                      <span className={styles.unavailableAction}>수정불가</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 ? (
          <p className={styles.empty}>자료가 없습니다.</p>
        ) : null}
      </div>
    </>
  );
}

async function readPointResult(response: Response): Promise<PointApiResult> {
  try {
    return (await response.json()) as PointApiResult;
  } catch {
    return {};
  }
}

function firstPointError(result: PointApiResult): string | undefined {
  return result.message ?? Object.values(result.fieldErrors ?? {})[0];
}

function isKoreaDateTimeInput(value: string): boolean {
  const match =
    /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::(\d{2}))?$/u.exec(value);
  if (!match) return false;
  return Number.isFinite(
    Date.parse(`${match[1]}T${match[2]}:${match[3] ?? "00"}+09:00`),
  );
}

function koreaDateTimeInput(value: string): string {
  const date = parseStoredDate(value);
  if (!date) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}:${part("second")}`;
}

function formatKoreaDateTime(value: string): string {
  const date = parseStoredDate(value);
  if (!date) return value;
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

function parseStoredDate(value: string): Date | null {
  const date = new Date(
    value.includes("T") ? value : `${value.replace(" ", "T")}Z`,
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

function pointEventLabel(eventType: string, orderId: string): string {
  const labels: Record<string, string> = {
    used: "주문 사용",
    restored: "주문 취소 복원",
    restore_pending: "복원 대기",
    earned: "주문 적립",
    reversed: "주문 적립 회수",
    charged: "충전 승인",
    withdrawn: "출금 승인",
    adjusted: "관리자 조정",
  };
  return orderId
    ? `주문번호 ${orderId} ${labels[eventType] ?? eventType}`
    : labels[eventType] ?? eventType;
}
