"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import styles from "./Storefront.module.css";
import type { OrderSummary, ProductSummary } from "./types";
import { formatKRW } from "./utils";

interface PointHistoryEntry {
  id: string;
  delta: number;
  balanceAfter: number;
  reason: string;
  createdAt: string;
}

interface WishlistEntry extends ProductSummary {
  wishedAt: string;
}

interface MemoEntry {
  id: string;
  counterpartId: string;
  counterpartName: string;
  body: string;
  readAt: string;
  createdAt: string;
}

export interface MyPagePanelProps {
  memberName: string;
  memberEmail?: string;
  memberPhone?: string;
  memberPostcode?: string;
  memberAddress1?: string;
  memberAddress2?: string;
  lastLoginAt?: string;
  joinedAt?: string;
  points: number;
  coupons?: number;
  orders?: OrderSummary[];
  pointHistory?: PointHistoryEntry[];
  wishlist?: WishlistEntry[];
  ordersHref?: string;
}

type DetailDialog = "memo" | "points" | "coupons" | null;

export function MyPagePanel({
  memberName,
  memberEmail = "",
  memberPhone = "",
  memberPostcode = "",
  memberAddress1 = "",
  memberAddress2 = "",
  lastLoginAt = "",
  joinedAt = "",
  points,
  coupons = 0,
  orders = [],
  pointHistory = [],
  wishlist = [],
  ordersHref = "/shop/orderinquiry.php",
}: MyPagePanelProps) {
  const [profileOpen, setProfileOpen] = useState(true);
  const [dialog, setDialog] = useState<DetailDialog>(null);
  const [memoTab, setMemoTab] = useState<"inbox" | "sent" | "write">("inbox");
  const [memoInbox, setMemoInbox] = useState<MemoEntry[]>([]);
  const [memoSent, setMemoSent] = useState<MemoEntry[]>([]);
  const [memoLoading, setMemoLoading] = useState(false);
  const [memoMessage, setMemoMessage] = useState("");
  const [memoRecipient, setMemoRecipient] = useState("");
  const [memoBody, setMemoBody] = useState("");
  const profileId = useId();

  useEffect(() => {
    if (!dialog) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDialog(null);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [dialog]);

  useEffect(() => {
    if (dialog !== "memo") return;
    void refreshMemos();
  }, [dialog]);

  const address = [
    memberPostcode ? `(${memberPostcode})` : "",
    memberAddress1,
    memberAddress2,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <main id="main-content" className={styles.myPage}>
      <div className={styles.container}>
        <nav className={styles.myPageActions} aria-label="회원 메뉴">
          <button type="button" onClick={() => setDialog("memo")}>
            쪽지함
          </button>
          <a href="/bbs/member_confirm.php?url=register_form.php">
            회원정보수정
          </a>
          <a
            className={styles.myPageLeaveButton}
            href="/bbs/member_confirm.php?url=member_leave.php"
          >
            회원탈퇴
          </a>
        </nav>

        <section className={styles.myPageMemberPanel}>
          <header>
            <h2>
              <i className="fas fa-user-circle" aria-hidden="true" />
              <strong>{memberName}</strong>
            </h2>
            <div className={styles.myPageBalances}>
              <span>보유포인트</span>
              <button
                type="button"
                className={styles.myPageBalanceValue}
                onClick={() => setDialog("points")}
              >
                <strong>{points.toLocaleString("ko-KR")}</strong>
              </button>
              <span>점</span>
              <button
                type="button"
                className={styles.myPageSmallButton}
                onClick={() => setDialog("points")}
              >
                상세보기
              </button>
              <span className={styles.myPageBalanceDivider}>/</span>
              <span>보유쿠폰</span>
              <button
                type="button"
                className={styles.myPageBalanceValue}
                onClick={() => setDialog("coupons")}
              >
                <strong>{coupons.toLocaleString("ko-KR")}</strong>
              </button>
              <span>개</span>
              <button
                type="button"
                className={styles.myPageSmallButton}
                onClick={() => setDialog("coupons")}
              >
                상세보기
              </button>
            </div>
          </header>

          <div
            id={profileId}
            className={`${styles.myPageProfileCollapse} ${
              profileOpen ? styles.myPageProfileOpen : ""
            }`}
          >
            <div>
              <dl>
                <dt>연락처</dt>
                <dd>{memberPhone || "미등록"}</dd>
                <dt>E-Mail</dt>
                <dd>{memberEmail || "미등록"}</dd>
                <dt>최종접속일시</dt>
                <dd>{displayDate(lastLoginAt)}</dd>
                <dt>회원가입일시</dt>
                <dd>{displayDate(joinedAt)}</dd>
                <dt>주소</dt>
                <dd>{address || "미등록"}</dd>
              </dl>
            </div>
          </div>

          <button
            type="button"
            className={styles.myPageProfileToggle}
            aria-controls={profileId}
            aria-expanded={profileOpen}
            aria-label={profileOpen ? "회원 상세정보 접기" : "회원 상세정보 보기"}
            onClick={() => setProfileOpen((current) => !current)}
          >
            <i
              className={`fas ${
                profileOpen ? "fa-caret-up" : "fa-caret-down"
              }`}
              aria-hidden="true"
            />
          </button>
        </section>

        <section className={styles.myPageSection}>
          <MyPageHeadline title="최근 주문내역" href={ordersHref} />
          {orders.length ? (
            <div className={styles.myPageOrderTable}>
              <div className={styles.myPageOrderHeader}>
                <span>주문일자</span>
                <span>주문번호</span>
                <span>상품정보</span>
                <span>결제금액</span>
                <span>상태</span>
              </div>
              {orders.slice(0, 5).map((order) => (
                <a
                  href={
                    order.href ??
                    `${ordersHref}?order_id=${encodeURIComponent(order.id)}`
                  }
                  className={styles.myPageOrderRow}
                  key={order.id}
                >
                  <span data-label="주문일자">{displayDate(order.orderedAt)}</span>
                  <strong data-label="주문번호">{order.id}</strong>
                  <span data-label="상품정보">{order.label}</span>
                  <span data-label="결제금액">{formatKRW(order.amount)}</span>
                  <em data-label="상태">{order.status}</em>
                </a>
              ))}
            </div>
          ) : (
            <p className={styles.myPageEmpty}>
              <i className="fas fa-exclamation-circle" aria-hidden="true" />
              주문 내역이 없습니다.
            </p>
          )}
        </section>

        <section className={styles.myPageWishlistSection}>
          <MyPageHeadline title="최근 위시리스트" href="/shop/wishlist.php" />
          {wishlist.length ? (
            <div className={styles.myPageWishlistGrid}>
              {wishlist.slice(0, 8).map((product) => (
                <article key={product.id}>
                  <div>
                    <a href={product.href}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={product.image} alt={product.name} />
                    </a>
                    <h3>
                      <a href={product.href}>{product.name}</a>
                    </h3>
                    <p>
                      <i className="far fa-clock" aria-hidden="true" />
                      {displayDate(product.wishedAt)}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className={styles.myPageEmpty}>
              <i className="fas fa-exclamation-circle" aria-hidden="true" />
              보관 내역이 없습니다.
            </p>
          )}
        </section>
      </div>

      {dialog ? (
        <MyPageDialog
          title={
            dialog === "memo"
              ? "쪽지함"
              : dialog === "points"
                ? "포인트 내역"
                : "보유쿠폰"
          }
          onClose={() => setDialog(null)}
        >
          {dialog === "memo" ? (
            <div className={styles.myPageMemo}>
              <nav aria-label="쪽지함 분류">
                <button
                  type="button"
                  aria-pressed={memoTab === "inbox"}
                  onClick={() => {
                    setMemoTab("inbox");
                    setMemoMessage("");
                  }}
                >
                  받은쪽지 {memoInbox.length}
                </button>
                <button
                  type="button"
                  aria-pressed={memoTab === "sent"}
                  onClick={() => {
                    setMemoTab("sent");
                    setMemoMessage("");
                  }}
                >
                  보낸쪽지 {memoSent.length}
                </button>
                <button
                  type="button"
                  aria-pressed={memoTab === "write"}
                  onClick={() => {
                    setMemoTab("write");
                    setMemoMessage("");
                  }}
                >
                  쪽지쓰기
                </button>
              </nav>
              {memoMessage ? (
                <p className={styles.myPageMemoMessage} role="status">
                  {memoMessage}
                </p>
              ) : null}
              {memoTab === "write" ? (
                <form
                  className={styles.myPageMemoForm}
                  onSubmit={(event) => {
                    event.preventDefault();
                    void sendMemo();
                  }}
                >
                  <label>
                    <span>받는 회원아이디</span>
                    <input
                      value={memoRecipient}
                      onChange={(event) => setMemoRecipient(event.target.value)}
                      required
                      minLength={4}
                      maxLength={30}
                    />
                  </label>
                  <label>
                    <span>내용</span>
                    <textarea
                      value={memoBody}
                      onChange={(event) => setMemoBody(event.target.value)}
                      required
                      maxLength={2000}
                    />
                  </label>
                  <div>
                    <span>{memoBody.length.toLocaleString("ko-KR")} / 2,000</span>
                    <button type="submit" disabled={memoLoading}>
                      보내기
                    </button>
                  </div>
                </form>
              ) : (
                <MemoList
                  box={memoTab}
                  memos={memoTab === "inbox" ? memoInbox : memoSent}
                  loading={memoLoading}
                  onRead={(id) => void readMemo(id)}
                  onDelete={(id) => void deleteMemo(id, memoTab)}
                />
              )}
            </div>
          ) : null}
          {dialog === "points" ? (
            pointHistory.length ? (
              <div className={styles.myPagePointTable}>
                <div>
                  <span>일시</span>
                  <span>내용</span>
                  <span>포인트</span>
                  <span>잔액</span>
                </div>
                {pointHistory.map((entry) => (
                  <div key={entry.id}>
                    <span>{displayDate(entry.createdAt)}</span>
                    <strong>{entry.reason}</strong>
                    <em
                      className={
                        entry.delta < 0 ? styles.myPagePointMinus : undefined
                      }
                    >
                      {entry.delta > 0 ? "+" : ""}
                      {entry.delta.toLocaleString("ko-KR")}
                    </em>
                    <span>{entry.balanceAfter.toLocaleString("ko-KR")}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.myPageDialogEmpty}>
                <i className="fas fa-exclamation-circle" aria-hidden="true" />
                포인트 내역이 없습니다.
              </div>
            )
          ) : null}
          {dialog === "coupons" ? (
            <div className={styles.myPageDialogEmpty}>
              <strong>사용가능 쿠폰 {coupons.toLocaleString("ko-KR")}개</strong>
              <a href="/shop/couponzone.php">쿠폰존 바로가기</a>
            </div>
          ) : null}
        </MyPageDialog>
      ) : null}
    </main>
  );

  async function refreshMemos() {
    setMemoLoading(true);
    setMemoMessage("");
    try {
      const response = await fetch("/api/customer/memos", {
        cache: "no-store",
      });
      const result = (await response.json()) as {
        inbox?: MemoEntry[];
        sent?: MemoEntry[];
        error?: string;
      };
      if (!response.ok) {
        throw new Error(result.error || "쪽지함을 불러오지 못했습니다.");
      }
      setMemoInbox(Array.isArray(result.inbox) ? result.inbox : []);
      setMemoSent(Array.isArray(result.sent) ? result.sent : []);
    } catch (cause) {
      setMemoMessage(
        cause instanceof Error ? cause.message : "쪽지함을 불러오지 못했습니다.",
      );
    } finally {
      setMemoLoading(false);
    }
  }

  async function sendMemo() {
    if (memoLoading) return;
    setMemoLoading(true);
    setMemoMessage("");
    try {
      const response = await fetch("/api/customer/memos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          recipientId: memoRecipient,
          body: memoBody,
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(result.error || "쪽지를 보내지 못했습니다.");
      }
      setMemoRecipient("");
      setMemoBody("");
      setMemoTab("sent");
      await refreshMemos();
      setMemoMessage("쪽지를 보냈습니다.");
    } catch (cause) {
      setMemoMessage(
        cause instanceof Error ? cause.message : "쪽지를 보내지 못했습니다.",
      );
      setMemoLoading(false);
    }
  }

  async function readMemo(id: string) {
    const memo = memoInbox.find((entry) => entry.id === id);
    if (!memo || memo.readAt) return;
    const response = await fetch("/api/customer/memos", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (response.ok) {
      setMemoInbox((current) =>
        current.map((entry) =>
          entry.id === id
            ? { ...entry, readAt: new Date().toISOString() }
            : entry,
        ),
      );
    }
  }

  async function deleteMemo(id: string, box: "inbox" | "sent") {
    const response = await fetch("/api/customer/memos", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, box }),
    });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) {
      setMemoMessage(result.error || "쪽지를 삭제하지 못했습니다.");
      return;
    }
    if (box === "inbox") {
      setMemoInbox((current) => current.filter((memo) => memo.id !== id));
    } else {
      setMemoSent((current) => current.filter((memo) => memo.id !== id));
    }
    setMemoMessage("");
  }
}

function MyPageHeadline({ title, href }: { title: string; href: string }) {
  return (
    <header className={styles.myPageHeadline}>
      <h2>{title}</h2>
      <a href={href}>
        <i className="fas fa-plus" aria-hidden="true" /> 더보기
      </a>
    </header>
  );
}

function MyPageDialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className={styles.myPageDialogBackdrop}
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <section
        className={styles.myPageDialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mypage-dialog-title"
      >
        <header>
          <h2 id="mypage-dialog-title">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={`${title} 닫기`}
            autoFocus
          >
            ×
          </button>
        </header>
        <div>{children}</div>
      </section>
    </div>
  );
}

function MemoList({
  box,
  memos,
  loading,
  onRead,
  onDelete,
}: {
  box: "inbox" | "sent";
  memos: MemoEntry[];
  loading: boolean;
  onRead: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  if (loading && !memos.length) {
    return <div className={styles.myPageDialogEmpty}>쪽지를 불러오는 중입니다.</div>;
  }
  if (!memos.length) {
    return (
      <div className={styles.myPageDialogEmpty}>
        <i className="fas fa-exclamation-circle" aria-hidden="true" />
        {box === "inbox" ? "받은 쪽지가 없습니다." : "보낸 쪽지가 없습니다."}
      </div>
    );
  }
  return (
    <div className={styles.myPageMemoList}>
      {memos.map((memo) => (
        <article
          key={memo.id}
          className={box === "inbox" && !memo.readAt ? styles.myPageMemoUnread : undefined}
          onMouseEnter={() => {
            if (box === "inbox") onRead(memo.id);
          }}
          onFocus={() => {
            if (box === "inbox") onRead(memo.id);
          }}
        >
          <header>
            <strong>
              {box === "inbox" ? "보낸사람" : "받는사람"}{" "}
              {memo.counterpartName} ({memo.counterpartId})
            </strong>
            <time>{displayDate(memo.createdAt)}</time>
          </header>
          <p>{memo.body}</p>
          <button type="button" onClick={() => onDelete(memo.id)}>
            삭제
          </button>
        </article>
      ))}
    </div>
  );
}

function displayDate(value: string) {
  if (!value) return "-";
  const date = new Date(
    value.includes("T") ? value : `${value.replace(" ", "T")}Z`,
  );
  if (Number.isNaN(date.getTime())) return value;
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
