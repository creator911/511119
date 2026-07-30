"use client";

import {
  useState,
  type FormEvent,
} from "react";
import type { PublicPersonalPayment } from "@/lib/personal-payments";
import styles from "./personal-payment.module.css";

interface NoticeApiResult {
  ok?: boolean;
  status?: "pending_review";
  message?: string;
}

export function PersonalPaymentNoticeForm({
  payment,
}: {
  payment: PublicPersonalPayment;
}) {
  const [depositor, setDepositor] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [submitted, setSubmitted] = useState(
    payment.noticeStatus === "pending_review",
  );
  const [message, setMessage] = useState(
    payment.noticeStatus === "pending_review"
      ? "입금예정 정보가 접수되어 관리자 확인을 기다리고 있습니다."
      : "",
  );
  const [failed, setFailed] = useState(false);
  const supportsNotice =
    payment.paymentMethod === "" ||
    payment.paymentMethod === "무통장" ||
    payment.paymentMethod === "계좌이체" ||
    payment.paymentMethod === "가상계좌";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setFailed(false);
    setMessage("");
    try {
      const response = await fetch(
        `/api/personal-payments/${encodeURIComponent(payment.publicToken)}/notice`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ depositor, phone, message: note }),
        },
      );
      const result = (await response.json()) as NoticeApiResult;
      if (!response.ok || result.status !== "pending_review") {
        setFailed(true);
        setMessage(result.message ?? "입금예정 정보를 접수하지 못했습니다.");
        return;
      }
      setSubmitted(true);
      setMessage(
        result.message ??
          "입금예정 정보가 접수되어 관리자 확인을 기다리고 있습니다.",
      );
    } catch {
      setFailed(true);
      setMessage("네트워크 상태를 확인한 뒤 다시 시도해 주세요.");
    } finally {
      setPending(false);
    }
  }

  if (!supportsNotice) {
    return (
      <div className={styles.providerNotice}>
        <strong>온라인 자동 결제가 연결되지 않았습니다.</strong>
        <p>
          이 화면에서는 카드·휴대폰 승인을 완료 처리하지 않습니다. 관리자에게
          결제수단을 확인해 주세요.
        </p>
      </div>
    );
  }

  return (
    <form className={styles.noticeForm} onSubmit={submit}>
      <h3>입금예정 정보 접수</h3>
      <p>
        이 접수는 결제 완료가 아닙니다. 실제 입금 확인 후 관리자가 입금금액을
        반영합니다.
      </p>
      <label>
        입금자명
        <input
          value={depositor}
          maxLength={60}
          required
          disabled={pending}
          onChange={(event) => setDepositor(event.currentTarget.value)}
        />
      </label>
      <label>
        연락처
        <input
          value={phone}
          inputMode="tel"
          maxLength={20}
          placeholder="010-0000-0000"
          required
          disabled={pending}
          onChange={(event) => setPhone(event.currentTarget.value)}
        />
      </label>
      <label>
        메모
        <textarea
          value={note}
          maxLength={500}
          rows={4}
          disabled={pending}
          onChange={(event) => setNote(event.currentTarget.value)}
        />
      </label>
      <button type="submit" disabled={pending}>
        {pending ? "접수 중…" : submitted ? "입금예정 정보 다시 보내기" : "입금예정 정보 보내기"}
      </button>
      {message ? (
        <p
          className={failed ? styles.errorMessage : styles.successMessage}
          role={failed ? "alert" : "status"}
        >
          {message}
        </p>
      ) : null}
    </form>
  );
}
