"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import { MAX_POINTS } from "@/lib/commerce-limits";
import styles from "./reports.module.css";

interface PointApiResult {
  ok?: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
}

const pointCheckboxSelector =
  "input[data-admin-point-entry][type='checkbox']";

export function PointLedgerDeleteButton() {
  const router = useRouter();
  const [selectedCount, setSelectedCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const updateCount = () => {
      setSelectedCount(
        document.querySelectorAll(`${pointCheckboxSelector}:checked`).length,
      );
    };
    updateCount();
    document.addEventListener("change", updateCount);
    return () => document.removeEventListener("change", updateCount);
  }, []);

  async function removeSelected() {
    if (busy || selectedCount < 1) return;
    const reason = window.prompt(
      "선택한 관리자 포인트 내역을 삭제하는 사유를 입력해 주세요.",
    );
    if (reason === null) return;
    if (reason.trim().length < 2) {
      setFailed(true);
      setMessage("삭제 사유를 2자 이상 입력해 주세요.");
      return;
    }
    if (
      !window.confirm(
        `선택한 ${selectedCount.toLocaleString("ko-KR")}건을 삭제하고 회원 잔액을 되돌리시겠습니까?`,
      )
    ) {
      return;
    }

    const entries = [
      ...document.querySelectorAll<HTMLInputElement>(
        `${pointCheckboxSelector}:checked`,
      ),
    ].flatMap((checkbox) => {
      const id = checkbox.dataset.entryId ?? "";
      const revision = Number(checkbox.dataset.revision);
      return id && Number.isSafeInteger(revision)
        ? [{ id, revision }]
        : [];
    });
    if (entries.length !== selectedCount) {
      setFailed(true);
      setMessage("선택 내역을 새로고침한 뒤 다시 시도해 주세요.");
      return;
    }

    setBusy(true);
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
        throw new Error(firstPointError(result) ?? "포인트 내역을 삭제하지 못했습니다.");
      }
      setMessage(
        result.message ??
          `${entries.length.toLocaleString("ko-KR")}건을 삭제했습니다.`,
      );
      setSelectedCount(0);
      router.refresh();
    } catch (error) {
      setFailed(true);
      setMessage(
        error instanceof Error
          ? error.message
          : "포인트 내역을 삭제하지 못했습니다.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="btn_fixed_top">
        <button
          type="button"
          className="btn"
          disabled={busy || selectedCount < 1}
          onClick={() => void removeSelected()}
        >
          {busy
            ? "삭제 중"
            : selectedCount > 0
              ? `선택삭제 (${selectedCount})`
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
    </>
  );
}

export function PointLedgerCreateForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const formData = new FormData(event.currentTarget);
    const loginId = String(formData.get("mb_id") ?? "").trim();
    const reason = String(formData.get("po_content") ?? "").trim();
    const pointText = String(formData.get("po_point") ?? "").trim();
    const expiresAt = String(formData.get("po_expire_date") ?? "").trim();
    if (!/^-?\d+$/u.test(pointText)) {
      setFailed(true);
      setMessage("포인트는 0이 아닌 정수로 입력해 주세요.");
      return;
    }
    const delta = Number(pointText);
    if (
      !Number.isSafeInteger(delta) ||
      delta === 0 ||
      Math.abs(delta) > MAX_POINTS
    ) {
      setFailed(true);
      setMessage("포인트는 0이 아닌 안전한 정수로 입력해 주세요.");
      return;
    }

    setBusy(true);
    setMessage("");
    setFailed(false);
    try {
      const response = await fetch("/api/admin/points", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          loginId,
          reason,
          delta,
          expiresAt,
        }),
      });
      const result = await readPointResult(response);
      if (response.status === 401) {
        window.location.assign("/adm/login");
        return;
      }
      if (!response.ok) {
        throw new Error(firstPointError(result) ?? "포인트를 등록하지 못했습니다.");
      }
      formRef.current?.reset();
      setMessage(result.message ?? "회원 포인트 내역을 등록했습니다.");
      router.refresh();
    } catch (error) {
      setFailed(true);
      setMessage(
        error instanceof Error
          ? error.message
          : "포인트를 등록하지 못했습니다.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.pointCreateSection}>
      <h2>개별회원 포인트 증감 설정</h2>
      <form
        className={styles.pointCreateForm}
        ref={formRef}
        onSubmit={submit}
      >
        <label>
          <span>회원아이디</span>
          <input
            className="frm_input"
            name="mb_id"
            maxLength={30}
            autoComplete="off"
            required
          />
        </label>
        <label>
          <span>포인트 내용</span>
          <input
            className="frm_input"
            name="po_content"
            maxLength={255}
            required
          />
        </label>
        <label>
          <span>포인트</span>
          <input
            className="frm_input"
            name="po_point"
            inputMode="numeric"
            placeholder="차감은 -1000처럼 입력"
            required
          />
        </label>
        <label>
          <span>만료일</span>
          <input
            className="frm_input"
            name="po_expire_date"
            type="date"
          />
        </label>
        <button className="btn_submit btn" type="submit" disabled={busy}>
          {busy ? "등록 중" : "확인"}
        </button>
      </form>
      {message ? (
        <p
          className={failed ? styles.pointError : styles.pointSuccess}
          role="status"
        >
          {message}
        </p>
      ) : null}
      <p className={styles.pointHelp}>
        양수는 적립, 음수는 차감입니다. 주문·충전 원장은 삭제할 수 없고
        여기에서 등록한 관리자 조정분만 선택삭제할 수 있습니다.
      </p>
    </section>
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
