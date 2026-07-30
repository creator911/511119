"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  MAX_WALLET_REQUEST_AMOUNT,
  MIN_WALLET_REQUEST_AMOUNT,
  type MemberWalletRequest,
  type WalletRequestKind,
} from "@/lib/wallet-contract";
import styles from "./wallet.module.css";

interface WalletOverviewResponse {
  ok?: boolean;
  error?: string;
  points?: number;
  member?: {
    loginId?: string;
    name?: string;
    phone?: string;
  };
  requests?: MemberWalletRequest[];
}

export function WalletRequestClient({ kind }: { kind: WalletRequestKind }) {
  const [points, setPoints] = useState(0);
  const [member, setMember] = useState({
    loginId: "",
    name: "",
    phone: "",
  });
  const [loaded, setLoaded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/customer/wallet", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (response.status === 401) {
          redirectToLogin();
          return null;
        }
        const result = (await response.json()) as WalletOverviewResponse;
        if (!response.ok) {
          throw new Error(result.error || "회원 포인트를 확인하지 못했습니다.");
        }
        return result;
      })
      .then((result) => {
        if (!result) return;
        setPoints(Math.max(0, Math.trunc(Number(result.points) || 0)));
        setMember({
          loginId: result.member?.loginId ?? "",
          name: result.member?.name ?? "",
          phone: result.member?.phone ?? "",
        });
        setLoaded(true);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setMessage(
          error instanceof Error
            ? error.message
            : "회원 포인트를 확인하지 못했습니다.",
        );
        setLoaded(true);
      });
    return () => controller.abort();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const body =
      kind === "charge"
        ? {
            kind,
            amount: Number(form.get("amount")),
            depositorName: String(form.get("depositorName") ?? ""),
          }
        : {
            kind,
            amount: Number(form.get("amount")),
            bankName: String(form.get("bankName") ?? ""),
            accountNumber: String(form.get("accountNumber") ?? ""),
            accountHolder: String(form.get("accountHolder") ?? ""),
          };
    try {
      const response = await fetch("/api/customer/wallet", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (response.status === 401) {
        redirectToLogin();
        return;
      }
      const result = (await response.json()) as WalletOverviewResponse;
      if (!response.ok) {
        throw new Error(result.error || "신청을 접수하지 못했습니다.");
      }
      window.location.assign(
        `/bbs/withdrawal_list.php?created=${encodeURIComponent(kind)}`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "신청을 접수하지 못했습니다.",
      );
      setSubmitting(false);
    }
  }

  const isCharge = kind === "charge";
  const withdrawalUnavailable =
    !isCharge && loaded && points < MIN_WALLET_REQUEST_AMOUNT;
  return (
    <main id="main-content" className="simple-form-page">
      <div className={styles.walletLayout}>
        <header className={styles.header}>
          <span>MEMBER WALLET</span>
          <h1>{isCharge ? "충전신청" : "출금신청"}</h1>
          <p>
            {isCharge
              ? "입금 확인 후 신청 금액만큼 회원 포인트가 충전됩니다."
              : "관리자 승인 시 신청 금액만큼 회원 포인트가 차감됩니다."}
          </p>
        </header>

        <section className={styles.balanceCard} aria-label="보유 포인트">
          <span>현재 보유 포인트</span>
          <strong>
            {loaded ? `${points.toLocaleString("ko-KR")}P` : "확인 중…"}
          </strong>
        </section>

        <form className={styles.requestForm} onSubmit={submit}>
          <label>
            <span>회원 아이디</span>
            <input value={member.loginId} readOnly aria-readonly="true" />
          </label>
          <label>
            <span>회원 이름</span>
            <input value={member.name} readOnly aria-readonly="true" />
          </label>
          {isCharge ? (
            <label>
              <span>연락처</span>
              <input value={member.phone} readOnly aria-readonly="true" />
            </label>
          ) : null}
          <label>
            <span>신청 금액</span>
            <input
              name="amount"
              type="number"
              min={MIN_WALLET_REQUEST_AMOUNT}
              max={
                isCharge
                  ? MAX_WALLET_REQUEST_AMOUNT
                  : Math.max(
                      MIN_WALLET_REQUEST_AMOUNT,
                      Math.min(points, MAX_WALLET_REQUEST_AMOUNT),
                    )
              }
              step={1_000}
              inputMode="numeric"
              required
              disabled={submitting || !loaded || withdrawalUnavailable}
            />
            <small>
              {MIN_WALLET_REQUEST_AMOUNT.toLocaleString("ko-KR")}원 이상{" "}
              {(
                isCharge
                  ? MAX_WALLET_REQUEST_AMOUNT
                  : Math.min(points, MAX_WALLET_REQUEST_AMOUNT)
              ).toLocaleString("ko-KR")}
              원 이하
            </small>
          </label>
          {isCharge ? (
            <label>
              <span>입금자명</span>
              <input
                name="depositorName"
                type="text"
                maxLength={80}
                autoComplete="name"
                required
                disabled={submitting}
              />
            </label>
          ) : (
            <>
              <label>
                <span>은행명</span>
                <input
                  name="bankName"
                  type="text"
                  maxLength={80}
                  required
                  disabled={submitting}
                />
              </label>
              <label>
                <span>계좌번호</span>
                <input
                  name="accountNumber"
                  type="text"
                  maxLength={80}
                  inputMode="numeric"
                  autoComplete="off"
                  required
                  disabled={submitting}
                />
              </label>
              <label>
                <span>예금주</span>
                <input
                  name="accountHolder"
                  type="text"
                  maxLength={80}
                  autoComplete="name"
                  required
                  disabled={submitting}
                />
              </label>
            </>
          )}
          {message ? (
            <p className={styles.error} role="alert">
              {message}
            </p>
          ) : null}
          {withdrawalUnavailable ? (
            <p className={styles.error} role="status">
              출금 가능한 최소 포인트가 부족합니다.
            </p>
          ) : null}
          <div className={styles.actions}>
            <a href="/bbs/withdrawal_list.php">신청내역</a>
            <button
              type="submit"
              disabled={submitting || !loaded || withdrawalUnavailable}
            >
              {submitting ? "접수 중…" : `${isCharge ? "충전" : "출금"} 신청`}
            </button>
          </div>
        </form>

        <aside className={styles.guide}>
          <strong>처리 안내</strong>
          <ul>
            <li>신청 내용은 관리자 확인 전까지 대기 상태로 표시됩니다.</li>
            <li>승인 또는 반려된 신청은 다시 처리되지 않습니다.</li>
            <li>
              {isCharge
                ? "입금자명과 실제 입금자명이 다르면 확인이 지연될 수 있습니다."
                : "계좌정보를 정확히 입력해 주세요. 승인 시 보유 포인트가 차감됩니다."}
            </li>
          </ul>
        </aside>
      </div>
    </main>
  );
}

export function WalletRequestListClient() {
  const [points, setPoints] = useState(0);
  const [requests, setRequests] = useState<MemberWalletRequest[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/customer/wallet", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (response.status === 401) {
          redirectToLogin();
          return null;
        }
        const result = (await response.json()) as WalletOverviewResponse;
        if (!response.ok) {
          throw new Error(result.error || "신청내역을 불러오지 못했습니다.");
        }
        return result;
      })
      .then((result) => {
        if (!result) return;
        setPoints(Math.max(0, Math.trunc(Number(result.points) || 0)));
        setRequests(Array.isArray(result.requests) ? result.requests : []);
        setLoaded(true);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setMessage(
          error instanceof Error
            ? error.message
            : "신청내역을 불러오지 못했습니다.",
        );
        setLoaded(true);
      });
    return () => controller.abort();
  }, []);

  return (
    <main id="main-content" className="simple-form-page">
      <div className={styles.walletLayout}>
        <header className={styles.header}>
          <span>MEMBER WALLET</span>
          <h1>충전·출금 신청내역</h1>
          <p>회원님의 최근 신청과 처리 결과를 확인할 수 있습니다.</p>
        </header>
        <section className={styles.balanceCard} aria-label="보유 포인트">
          <span>현재 보유 포인트</span>
          <strong>
            {loaded ? `${points.toLocaleString("ko-KR")}P` : "확인 중…"}
          </strong>
        </section>
        <nav className={styles.requestLinks} aria-label="충전·출금 신청">
          <a href="/bbs/writecz.php">충전신청</a>
          <a href="/bbs/cashtx.php">출금신청</a>
        </nav>
        {message ? (
          <p className={styles.error} role="alert">
            {message}
          </p>
        ) : null}
        {!loaded ? (
          <div className={styles.empty}>신청내역을 불러오는 중입니다.</div>
        ) : requests.length === 0 ? (
          <div className={styles.empty}>아직 충전·출금 신청내역이 없습니다.</div>
        ) : (
          <div className={styles.requestList}>
            {requests.map((request) => (
              <article key={`${request.kind}-${request.id}`}>
                <div>
                  <span className={styles.kind}>
                    {request.kind === "charge" ? "충전" : "출금"}
                  </span>
                  <strong>{request.amount.toLocaleString("ko-KR")}원</strong>
                </div>
                <dl>
                  <div>
                    <dt>신청번호</dt>
                    <dd>{request.id}</dd>
                  </div>
                  <div>
                    <dt>신청정보</dt>
                    <dd>{request.summary}</dd>
                  </div>
                  <div>
                    <dt>신청일</dt>
                    <dd>{formatDate(request.createdAt)}</dd>
                  </div>
                  {request.adminMemo ? (
                    <div>
                      <dt>관리자 메모</dt>
                      <dd>{request.adminMemo}</dd>
                    </div>
                  ) : null}
                </dl>
                <span
                  className={`${styles.status} ${styles[`status_${request.status}`]}`}
                >
                  {statusLabel(request.status)}
                </span>
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function redirectToLogin() {
  const next = `${window.location.pathname}${window.location.search}`;
  window.location.assign(
    `/bbs/login.php?return_url=${encodeURIComponent(next)}`,
  );
}

function statusLabel(status: MemberWalletRequest["status"]) {
  return status === "requested"
    ? "처리대기"
    : status === "approved"
      ? "승인"
      : "반려";
}

function formatDate(value: string) {
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/u.test(value)
    ? `${value.replace(" ", "T")}Z`
    : value;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}
