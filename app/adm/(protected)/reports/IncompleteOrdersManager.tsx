"use client";

import { useState, type FormEvent } from "react";
import {
  AdminButton,
  ConfirmDialog,
  Notice,
} from "@/app/components/admin";
import { publicOrderStatusLabel } from "@/lib/order-status";
import type {
  IncompleteOrderFilters,
  IncompleteOrderRow,
  ReportPage,
} from "@/lib/admin-reports";
import styles from "./reports.module.css";

type IncompleteReport = ReportPage<
  IncompleteOrderRow,
  IncompleteOrderFilters
>;

export function IncompleteOrdersManager({
  report,
}: {
  report: IncompleteReport;
}) {
  const [rows, setRows] = useState(report.rows);
  const [total, setTotal] = useState(report.total);
  const [target, setTarget] = useState<IncompleteOrderRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [feedback, setFeedback] = useState<{
    tone: "info" | "danger";
    message: string;
  } | null>(null);

  async function deleteOrder() {
    if (!target || busy) return;
    setBusy(true);
    setFeedback(null);
    try {
      const response = await fetch(
        `/api/admin/orders/${encodeURIComponent(target.id)}`,
        {
          method: "DELETE",
          cache: "no-store",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            confirmation: target.id,
            expectedUpdatedAt: target.updatedAt,
          }),
        },
      );
      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        message?: string;
        restoredUnits?: number;
      } | null;
      if (response.status === 401) {
        window.location.assign("/adm/login");
        return;
      }
      if (!response.ok || !payload?.ok) {
        throw new Error(
          payload?.message || "미완료 주문을 삭제하지 못했습니다.",
        );
      }
      setRows((current) => current.filter((row) => row.id !== target.id));
      setTotal((current) => Math.max(0, current - 1));
      setFeedback({
        tone: "info",
        message: `${target.id} 주문을 삭제하고 상품 ${Number(
          payload.restoredUnits ?? 0,
        ).toLocaleString("ko-KR")}개의 재고를 복원했습니다.`,
      });
      setTarget(null);
    } catch (cause) {
      setFeedback({
        tone: "danger",
        message:
          cause instanceof Error
            ? cause.message
            : "미완료 주문을 삭제하지 못했습니다.",
      });
      setTarget(null);
    } finally {
      setBusy(false);
    }
  }

  async function deleteSelected(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const targets = rows.filter(
      (row) =>
        selectedIds.has(row.id) &&
        row.paymentStatus === "pending" &&
        row.status === "ordered",
    );
    if (targets.length === 0) {
      window.alert("선택삭제 하실 항목을 하나 이상 선택하세요.");
      return;
    }
    if (!window.confirm("선택한 자료를 정말 삭제하시겠습니까?")) return;
    setBusy(true);
    setFeedback(null);
    try {
      for (const row of targets) {
        const response = await fetch(
          `/api/admin/orders/${encodeURIComponent(row.id)}`,
          {
            method: "DELETE",
            cache: "no-store",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              confirmation: row.id,
              expectedUpdatedAt: row.updatedAt,
            }),
          },
        );
        const payload = (await response.json().catch(() => null)) as {
          ok?: boolean;
          message?: string;
        } | null;
        if (response.status === 401) {
          window.location.assign("/adm/login");
          return;
        }
        if (!response.ok || !payload?.ok) {
          throw new Error(
            payload?.message || `${row.id} 주문을 삭제하지 못했습니다.`,
          );
        }
      }
      const removedIds = new Set(targets.map((row) => row.id));
      setRows((current) =>
        current.filter((row) => !removedIds.has(row.id)),
      );
      setTotal((current) => Math.max(0, current - targets.length));
      setSelectedIds(new Set());
      setFeedback({
        tone: "info",
        message: `선택한 미완료주문 ${targets.length.toLocaleString("ko-KR")}건을 안전하게 삭제했습니다.`,
      });
    } catch (cause) {
      setFeedback({
        tone: "danger",
        message:
          cause instanceof Error
            ? cause.message
            : "선택한 미완료주문을 삭제하지 못했습니다.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {feedback ? (
        <Notice tone={feedback.tone}>{feedback.message}</Notice>
      ) : null}
      <form id="legacy-incomplete-list" onSubmit={deleteSelected}>
      <div className="btn_fixed_top">
        <input
          className="btn btn_02 legacy-wide-fixed-action"
          type="submit"
          value="선택삭제"
          disabled={busy}
        />
      </div>
      <div
        className={`tbl_head01 tbl_wrap ${styles.legacyIncompleteTable}`}
        data-total={total}
      >
          <table className={styles.table}>
            <colgroup>
              {[
                52.6875, 121.140625, 54.890625, 96.875, 145.359375,
                96.875, 121.140625, 121.140625, 121.140625, 72.75,
              ].map((width, index) => (
                <col key={index} style={{ width }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th>
                  <label className="sound_only" htmlFor="incomplete-check-all">
                    미완료주문 전체
                  </label>
                  <input
                    id="incomplete-check-all"
                    type="checkbox"
                    checked={
                      rows.some(
                        (row) =>
                          row.paymentStatus === "pending" &&
                          row.status === "ordered",
                      ) &&
                      rows
                        .filter(
                          (row) =>
                            row.paymentStatus === "pending" &&
                            row.status === "ordered",
                        )
                        .every((row) => selectedIds.has(row.id))
                    }
                    onChange={(event) =>
                      setSelectedIds(
                        event.currentTarget.checked
                          ? new Set(
                              rows
                                .filter(
                                  (row) =>
                                    row.paymentStatus === "pending" &&
                                    row.status === "ordered",
                                )
                                .map((row) => row.id),
                            )
                          : new Set(),
                      )
                    }
                  />
                </th>
                <th>주문번호</th>
                <th>PG</th>
                <th>주문자</th>
                <th>주문자전화</th>
                <th>받는분</th>
                <th>주문금액</th>
                <th>결제방법</th>
                <th>주문일시</th>
                <th>관리</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const deletable =
                  row.paymentStatus === "pending" &&
                  row.status === "ordered";
                return (
                  <tr key={row.id}>
                    <td className={styles.center}>
                      <input
                        type="checkbox"
                        aria-label={`${row.id} 선택`}
                        disabled={!deletable}
                        checked={selectedIds.has(row.id)}
                        onChange={(event) =>
                          setSelectedIds((current) => {
                            const next = new Set(current);
                            if (event.currentTarget.checked) {
                              next.add(row.id);
                            } else {
                              next.delete(row.id);
                            }
                            return next;
                          })
                        }
                      />
                    </td>
                    <td>
                      <a
                        className={styles.primaryLink}
                        href={`/adm/orders?q=${encodeURIComponent(row.id)}`}
                      >
                        {row.id}
                      </a>
                    </td>
                    <td className={styles.center}>
                      {paymentStatusLabel(row.paymentStatus)}
                    </td>
                    <td>
                      {row.buyer}
                      <small>{row.email}</small>
                    </td>
                    <td className={styles.center}>미등록</td>
                    <td>{row.buyer}</td>
                    <td className={styles.number}>
                      {row.total.toLocaleString("ko-KR")}원
                    </td>
                    <td className={styles.center}>
                      <ReportBadge tone={paymentTone(row.paymentStatus)}>
                        {paymentStatusLabel(row.paymentStatus)}
                      </ReportBadge>
                    </td>
                    <td>{formatKoreaDateTime(row.createdAt)}</td>
                    <td className={styles.center}>
                      {deletable ? (
                        <AdminButton
                          variant="danger"
                          disabled={busy}
                          onClick={() => setTarget(row)}
                        >
                          안전 삭제
                        </AdminButton>
                      ) : (
                        <span className={styles.unavailableAction}>
                          삭제 불가
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 ? (
                <tr>
                  <td
                    className={`empty_table ${styles.legacyIncompleteEmpty}`}
                    colSpan={10}
                  >
                    조건에 맞는 미완료 주문이 없습니다.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
      </div>
      </form>
      <div
        className={styles.legacyIncompleteFooterSpacer}
        aria-hidden="true"
      />

      <ConfirmDialog
        open={Boolean(target)}
        title="미입금 주문 안전 삭제"
        message={`${target?.id ?? ""} 주문을 삭제하시겠습니까?`}
        warning="서버가 결제·주문상태·처리 이력을 다시 확인한 후 재고 복원과 주문 삭제를 한 번에 처리합니다. 삭제한 주문은 복구할 수 없습니다."
        confirmLabel="재고 복원 후 삭제"
        destructive
        busy={busy}
        onConfirm={() => void deleteOrder()}
        onClose={() => {
          if (!busy) setTarget(null);
        }}
      />
    </>
  );
}

function ReportBadge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "neutral" | "positive" | "warning" | "negative";
}) {
  return (
    <span
      className={`${styles.badge} ${
        tone === "positive"
          ? styles.badgePositive
          : tone === "warning"
            ? styles.badgeWarning
            : tone === "negative"
              ? styles.badgeNegative
              : ""
      }`}
    >
      {children}
    </span>
  );
}

function paymentStatusLabel(status: string): string {
  return (
    {
      pending: "입금확인중",
      paid: "결제완료",
      failed: "결제실패",
      cancelled: "결제취소",
    }[status] ?? status
  );
}

function paymentTone(
  status: string,
): "neutral" | "positive" | "warning" | "negative" {
  if (status === "paid") return "positive";
  if (status === "pending") return "warning";
  if (status === "failed" || status === "cancelled") return "negative";
  return "neutral";
}

function orderTone(
  status: string,
): "neutral" | "positive" | "warning" | "negative" {
  if (status === "delivered") return "positive";
  if (status === "ordered" || status === "payment_confirmed") {
    return "warning";
  }
  if (status === "cancelled" || status === "refunded") return "negative";
  return "neutral";
}

function formatKoreaDateTime(value: string): string {
  const normalized = /(?:Z|[+-]\d{2}:\d{2})$/u.test(value)
    ? value
    : `${value.replace(" ", "T")}Z`;
  const date = new Date(normalized);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}
