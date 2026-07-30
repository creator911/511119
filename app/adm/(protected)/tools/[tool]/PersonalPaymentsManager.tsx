"use client";

import {
  useMemo,
  useState,
  type FormEvent,
} from "react";
import type {
  PersonalPayment,
  PersonalPaymentMethod,
} from "@/lib/personal-payments";
import styles from "./personal-payments.module.css";

interface PersonalPaymentApiResult {
  ok?: boolean;
  message?: string;
  payment?: PersonalPayment;
  deleted?: number;
}

interface PaymentDraft {
  title: string;
  orderId: string;
  orderAmount: string;
  receiptAmount: string;
  paymentMethod: PersonalPaymentMethod;
  receiptTime: string;
  content: string;
  shopMemo: string;
  enabled: boolean;
}

const emptyDraft: PaymentDraft = {
  title: "",
  orderId: "",
  orderAmount: "0",
  receiptAmount: "0",
  paymentMethod: "",
  receiptTime: "",
  content: "",
  shopMemo: "",
  enabled: true,
};

export function PersonalPaymentsManager({
  initialPayments,
}: {
  initialPayments: PersonalPayment[];
}) {
  const [payments, setPayments] = useState(initialPayments);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searchField, setSearchField] = useState("id");
  const [searchText, setSearchText] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [draft, setDraft] = useState<PaymentDraft>(emptyDraft);
  const [editing, setEditing] = useState<PersonalPayment | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);

  const filtered = useMemo(() => {
    const query = appliedSearch.trim().toLocaleLowerCase("ko-KR");
    if (!query) return payments;
    return payments.filter((payment) => {
      const candidate =
        searchField === "orderId"
          ? payment.orderId
          : searchField === "title"
            ? payment.title
            : payment.id;
      return candidate.toLocaleLowerCase("ko-KR").includes(query);
    });
  }, [appliedSearch, payments, searchField]);

  function openCreate() {
    setEditing(null);
    setDraft(emptyDraft);
    setShowForm(true);
    setMessage("");
    setFailed(false);
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function openEdit(payment: PersonalPayment) {
    setEditing(payment);
    setDraft({
      title: payment.title,
      orderId: payment.orderId,
      orderAmount: String(payment.orderAmount),
      receiptAmount: String(payment.receiptAmount),
      paymentMethod: payment.paymentMethod,
      receiptTime: payment.receiptTime ?? "",
      content: payment.content,
      shopMemo: payment.shopMemo,
      enabled: payment.enabled,
    });
    setShowForm(true);
    setMessage("");
    setFailed(false);
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function closeForm() {
    setShowForm(false);
    setEditing(null);
    setDraft(emptyDraft);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setMessage("");
    setFailed(false);
    try {
      const response = await fetch(
        editing
          ? `/api/admin/personal-payments/${encodeURIComponent(editing.id)}`
          : "/api/admin/personal-payments",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...draft,
            orderAmount: Number(draft.orderAmount),
            receiptAmount: Number(draft.receiptAmount),
            ...(editing ? { revision: editing.revision } : {}),
          }),
        },
      );
      const result = (await response.json()) as PersonalPaymentApiResult;
      if (response.status === 401) {
        window.location.assign("/adm/login");
        return;
      }
      if (!response.ok || !result.payment) {
        setFailed(true);
        setMessage(result.message ?? "개인결제를 저장하지 못했습니다.");
        return;
      }
      setPayments((current) =>
        editing
          ? current.map((payment) =>
              payment.id === result.payment!.id ? result.payment! : payment,
            )
          : [result.payment!, ...current],
      );
      setMessage(editing ? "개인결제를 수정했습니다." : "개인결제를 추가했습니다.");
      closeForm();
    } catch {
      setFailed(true);
      setMessage("네트워크 상태를 확인한 뒤 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  }

  async function removeSelected() {
    if (selected.size < 1) {
      window.alert("선택삭제 하실 항목을 하나 이상 선택하세요.");
      return;
    }
    if (!window.confirm("선택한 자료를 정말 삭제하시겠습니까?")) return;
    setMessage("");
    setFailed(false);
    try {
      const response = await fetch("/api/admin/personal-payments", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: [...selected] }),
      });
      const result = (await response.json()) as PersonalPaymentApiResult;
      if (response.status === 401) {
        window.location.assign("/adm/login");
        return;
      }
      if (!response.ok) {
        setFailed(true);
        setMessage(result.message ?? "선택한 개인결제를 삭제하지 못했습니다.");
        return;
      }
      setPayments((current) =>
        current.filter((payment) => !selected.has(payment.id)),
      );
      setSelected(new Set());
      setMessage(`개인결제 ${result.deleted ?? 0}건을 삭제했습니다.`);
    } catch {
      setFailed(true);
      setMessage("네트워크 상태를 확인한 뒤 다시 시도해 주세요.");
    }
  }

  async function copyLink(payment: PersonalPayment) {
    const link = new URL(payment.publicHref, window.location.origin).toString();
    try {
      await navigator.clipboard.writeText(link);
      setFailed(false);
      setMessage("공개 개인결제 링크를 복사했습니다.");
    } catch {
      window.prompt("아래 개인결제 링크를 복사해 주세요.", link);
    }
  }

  if (showForm) {
    return (
      <PaymentForm
        draft={draft}
        editing={editing}
        saving={saving}
        message={message}
        failed={failed}
        onChange={setDraft}
        onCancel={closeForm}
        onSubmit={save}
      />
    );
  }

  const everyVisibleSelected =
    filtered.length > 0 &&
    filtered.every((payment) => selected.has(payment.id));

  return (
    <div className={styles.root}>
      <div className="local_ov01 local_ov">
        <span className="btn_ov01">
          <span className="ov_txt">전체 </span>
          <span className="ov_num"> {payments.length}건 </span>
        </span>
      </div>

      <form
        className="local_sch01 local_sch"
        onSubmit={(event) => {
          event.preventDefault();
          setAppliedSearch(searchText);
        }}
      >
        <select
          aria-label="검색대상"
          value={searchField}
          onChange={(event) => setSearchField(event.currentTarget.value)}
        >
          <option value="id">개인결제번호</option>
          <option value="title">이름</option>
          <option value="orderId">주문번호</option>
        </select>{" "}
        <label className="sound_only" htmlFor="personal-payment-search">
          검색어
        </label>
        <input
          className="frm_input"
          id="personal-payment-search"
          value={searchText}
          onChange={(event) => setSearchText(event.currentTarget.value)}
        />{" "}
        <button className="btn_submit" type="submit" aria-label="검색">
          검색
        </button>
      </form>

      <div className="tbl_head01 tbl_wrap">
        <table className={styles.listTable}>
          <caption>개인결제 관리 목록</caption>
          <thead>
            <tr>
              <th scope="col">
                <label className="sound_only" htmlFor="personal-payments-all">
                  개인결제 전체
                </label>
                <input
                  id="personal-payments-all"
                  type="checkbox"
                  checked={everyVisibleSelected}
                  onChange={(event) => {
                    const next = new Set(selected);
                    for (const payment of filtered) {
                      if (event.currentTarget.checked) next.add(payment.id);
                      else next.delete(payment.id);
                    }
                    setSelected(next);
                  }}
                />
              </th>
              <th scope="col">제목</th>
              <th scope="col">주문번호</th>
              <th scope="col">주문금액</th>
              <th scope="col">입금금액</th>
              <th scope="col">미수금액</th>
              <th scope="col">입금방법</th>
              <th scope="col">입금일</th>
              <th scope="col">사용</th>
              <th scope="col">관리</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((payment) => (
              <tr key={payment.id}>
                <td>
                  <input
                    aria-label={`${payment.title} 선택`}
                    type="checkbox"
                    checked={selected.has(payment.id)}
                    onChange={(event) => {
                      const next = new Set(selected);
                      if (event.currentTarget.checked) next.add(payment.id);
                      else next.delete(payment.id);
                      setSelected(next);
                    }}
                  />
                </td>
                <td className="td_left">
                  <button
                    className={styles.titleButton}
                    type="button"
                    onClick={() => openEdit(payment)}
                  >
                    {payment.title}
                  </button>
                  {payment.noticeStatus === "pending_review" ? (
                    <span className={styles.pendingBadge}>입금확인 요청</span>
                  ) : null}
                </td>
                <td>{payment.orderId || "-"}</td>
                <td className="td_num">{formatWon(payment.orderAmount)}</td>
                <td className="td_num">{formatWon(payment.receiptAmount)}</td>
                <td className="td_num">
                  {formatWon(payment.outstandingAmount)}
                </td>
                <td>{payment.paymentMethod || "-"}</td>
                <td>{payment.receiptTime || "-"}</td>
                <td>{payment.enabled ? "사용" : "미사용"}</td>
                <td className="td_mng">
                  <button
                    className="btn btn_01"
                    type="button"
                    onClick={() => openEdit(payment)}
                  >
                    수정
                  </button>{" "}
                  <button
                    className="btn btn_02"
                    type="button"
                    onClick={() => void copyLink(payment)}
                  >
                    링크
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 ? (
              <tr>
                <td className={`empty_table ${styles.emptyCell}`} colSpan={10}>
                  자료가 없습니다.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="btn_fixed_top">
        <button
          className="btn btn_02"
          type="button"
          onClick={() => void removeSelected()}
        >
          선택삭제
        </button>{" "}
        <button className="btn btn_01" type="button" onClick={openCreate}>
          개인결제 추가
        </button>
      </div>
      <StatusMessage message={message} failed={failed} />
    </div>
  );
}

function PaymentForm({
  draft,
  editing,
  saving,
  message,
  failed,
  onChange,
  onCancel,
  onSubmit,
}: {
  draft: PaymentDraft;
  editing: PersonalPayment | null;
  saving: boolean;
  message: string;
  failed: boolean;
  onChange: (draft: PaymentDraft) => void;
  onCancel: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  function patch(value: Partial<PaymentDraft>) {
    onChange({ ...draft, ...value });
  }

  return (
    <form className={styles.root} onSubmit={onSubmit}>
      <section id="anc_spp_info">
        <h2 className="h2_frm">주문 정보</h2>
        <ul className="anchor">
          <li><a href="#anc_spp_info">주문 정보</a></li>
          <li><a href="#anc_spp_pay">결제 정보</a></li>
        </ul>
        <div className="local_desc">
          <p>주문 관련 기본 정보입니다.</p>
        </div>
        <div className="tbl_frm01 tbl_wrap">
          <table>
            <caption>주문 정보 목록</caption>
            <colgroup>
              <col className={styles.formLabelColumn} />
              <col />
            </colgroup>
            <tbody>
              <tr>
                <th scope="row"><label htmlFor="pp_name">이름</label></th>
                <td>
                  <input
                    className="required frm_input"
                    id="pp_name"
                    value={draft.title}
                    maxLength={120}
                    required
                    onChange={(event) => patch({ title: event.currentTarget.value })}
                  />
                </td>
              </tr>
              <tr>
                <th scope="row"><label htmlFor="pp_price">주문금액</label></th>
                <td>
                  <input
                    className="required frm_input"
                    id="pp_price"
                    type="number"
                    min={0}
                    max={2_000_000_000}
                    value={draft.orderAmount}
                    required
                    onChange={(event) =>
                      patch({ orderAmount: event.currentTarget.value })
                    }
                  />{" "}
                  원
                </td>
              </tr>
              <tr>
                <th scope="row"><label htmlFor="od_id">주문번호</label></th>
                <td>
                  <input
                    className="frm_input"
                    id="od_id"
                    value={draft.orderId}
                    maxLength={60}
                    onChange={(event) => patch({ orderId: event.currentTarget.value })}
                  />
                </td>
              </tr>
              <tr>
                <th scope="row"><label htmlFor="pp_content">내용</label></th>
                <td>
                  <textarea
                    className={styles.textarea}
                    id="pp_content"
                    rows={8}
                    value={draft.content}
                    maxLength={5_000}
                    onChange={(event) => patch({ content: event.currentTarget.value })}
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="cbox" id="anc_spp_pay">
        <h2 className="h2_frm">결제 정보</h2>
        <ul className="anchor">
          <li><a href="#anc_spp_info">주문 정보</a></li>
          <li><a href="#anc_spp_pay">결제 정보</a></li>
        </ul>
        <div className="local_desc02 local_desc">
          <p>
            실제 입금이 확인된 금액만 입력해 주세요. 외부 PG가 연결되지 않은
            결제수단은 자동 승인되지 않습니다.
          </p>
        </div>
        <div className="tbl_frm01 tbl_wrap">
          <table>
            <caption>결제 정보 목록</caption>
            <colgroup>
              <col className={styles.formLabelColumn} />
              <col />
            </colgroup>
            <tbody>
              <tr>
                <th scope="row">
                  <label htmlFor="pp_receipt_price">결제금액</label>
                </th>
                <td>
                  <input
                    className="frm_input"
                    id="pp_receipt_price"
                    type="number"
                    min={0}
                    max={2_000_000_000}
                    value={draft.receiptAmount}
                    onChange={(event) =>
                      patch({ receiptAmount: event.currentTarget.value })
                    }
                  />{" "}
                  원
                </td>
              </tr>
              <tr>
                <th scope="row">
                  <label htmlFor="pp_settle_case">결제방법</label>
                </th>
                <td>
                  <select
                    id="pp_settle_case"
                    value={draft.paymentMethod}
                    onChange={(event) =>
                      patch({
                        paymentMethod: event.currentTarget
                          .value as PersonalPaymentMethod,
                      })
                    }
                  >
                    <option value="">선택</option>
                    <option value="무통장">무통장</option>
                    <option value="계좌이체">계좌이체</option>
                    <option value="가상계좌">가상계좌</option>
                    <option value="신용카드">신용카드</option>
                    <option value="휴대폰">휴대폰</option>
                  </select>
                </td>
              </tr>
              <tr>
                <th scope="row">
                  <label htmlFor="pp_receipt_time">결제일시</label>
                </th>
                <td>
                  <label>
                    <input
                      type="checkbox"
                      checked={false}
                      onChange={(event) => {
                        if (!event.currentTarget.checked) return;
                        patch({ receiptTime: koreaDateTime(new Date()) });
                      }}
                    />{" "}
                    현재 시간으로 설정
                  </label>
                  <br />
                  <input
                    className="frm_input"
                    id="pp_receipt_time"
                    value={draft.receiptTime}
                    maxLength={19}
                    placeholder="YYYY-MM-DD HH:mm:ss"
                    onChange={(event) =>
                      patch({ receiptTime: event.currentTarget.value })
                    }
                  />
                </td>
              </tr>
              {editing?.noticeStatus === "pending_review" ? (
                <tr>
                  <th scope="row">입금확인 요청</th>
                  <td>
                    입금자 {editing.noticeDepositor || "-"} / 연락처{" "}
                    {editing.noticePhoneMasked || "-"}
                    {editing.noticeMessage ? (
                      <p className={styles.noticeMessage}>
                        {editing.noticeMessage}
                      </p>
                    ) : null}
                  </td>
                </tr>
              ) : null}
              <tr>
                <th scope="row">
                  <label htmlFor="pp_shop_memo">상점메모</label>
                </th>
                <td>
                  <textarea
                    className={styles.textarea}
                    id="pp_shop_memo"
                    rows={8}
                    value={draft.shopMemo}
                    maxLength={5_000}
                    onChange={(event) => patch({ shopMemo: event.currentTarget.value })}
                  />
                </td>
              </tr>
              <tr>
                <th scope="row"><label htmlFor="pp_use">사용</label></th>
                <td>
                  <select
                    id="pp_use"
                    value={draft.enabled ? "1" : "0"}
                    onChange={(event) =>
                      patch({ enabled: event.currentTarget.value === "1" })
                    }
                  >
                    <option value="1">사용함</option>
                    <option value="0">사용안함</option>
                  </select>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <div className="btn_fixed_top">
        <button className="btn_submit btn" type="submit" disabled={saving}>
          {saving ? "저장 중…" : "확인"}
        </button>{" "}
        <button className="btn btn_02" type="button" onClick={onCancel}>
          목록
        </button>
      </div>
      <StatusMessage message={message} failed={failed} />
    </form>
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

function formatWon(value: number): string {
  return `${new Intl.NumberFormat("ko-KR").format(value)}원`;
}

function koreaDateTime(date: Date): string {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
  return parts.replace("T", " ");
}
