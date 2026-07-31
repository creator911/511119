"use client";

import {
  type FormEvent,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
import { MAX_POINTS } from "@/lib/commerce-limits";
import type {
  WalletDecision,
  WalletRequest,
  WalletRequestKind,
  WalletRequestStatus,
} from "@/lib/wallet-contract";

interface WalletListResponse {
  message?: string;
  requests?: WalletRequest[];
}

interface WalletDecisionResponse {
  message?: string;
  request?: WalletRequest;
}

interface PointAdjustmentResponse {
  message?: string;
  fieldErrors?: Record<string, string>;
}

type SearchField =
  | "member"
  | "nickname"
  | "content"
  | "accountHolder"
  | "accountNumber"
  | "bankName";

interface WalletRequestsManagerProps {
  initialRequests: WalletRequest[];
  initialKind: WalletRequestKind;
}

const PAGE_SIZE = 15;

export function WalletRequestsManager({
  initialRequests,
  initialKind,
}: WalletRequestsManagerProps) {
  const [requests, setRequests] =
    useState<WalletRequest[]>(initialRequests);
  const [searchField, setSearchField] =
    useState<SearchField>(
      initialKind === "charge" ? "member" : "nickname",
    );
  const [searchText, setSearchText] = useState("");
  const [appliedSearch, setAppliedSearch] = useState({
    field: (initialKind === "charge"
      ? "member"
      : "nickname") as SearchField,
    text: "",
  });
  const [page, setPage] = useState(1);
  const [checked, setChecked] = useState<Set<string>>(
    () => new Set(),
  );
  const [loading, setLoading] = useState(false);
  const [processingKeys, setProcessingKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const [liveMessage, setLiveMessage] = useState("");

  const loadRequests = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/wallet/requests", {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      const payload = (await response.json().catch(() => null)) as
        | WalletListResponse
        | null;
      if (response.status === 401) {
        redirectToAdminLogin();
        return;
      }
      if (!response.ok || !Array.isArray(payload?.requests)) {
        throw new Error(
          payload?.message ?? "신청 목록을 불러오지 못했습니다.",
        );
      }
      setRequests(payload.requests);
      setChecked(new Set());
      setLiveMessage("최신 목록을 불러왔습니다.");
    } catch (cause) {
      window.alert(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  const kindRequests = useMemo(
    () => requests.filter((request) => request.kind === initialKind),
    [initialKind, requests],
  );
  const filteredRequests = useMemo(() => {
    const keyword = appliedSearch.text
      .trim()
      .toLocaleLowerCase("ko-KR");
    if (!keyword) return kindRequests;
    return kindRequests.filter((request) =>
      searchableValue(request, appliedSearch.field)
        .toLocaleLowerCase("ko-KR")
        .includes(keyword),
    );
  }, [appliedSearch, kindRequests]);
  const totalPages = Math.max(
    1,
    Math.ceil(filteredRequests.length / PAGE_SIZE),
  );
  const currentPage = Math.min(page, totalPages);
  const pageRows = filteredRequests.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );
  const totalAmount = filteredRequests.reduce(
    (sum, request) => sum + request.amount,
    0,
  );
  const checkableRows = pageRows.filter(
    (request) => request.status === "requested",
  );
  const allChecked =
    checkableRows.length > 0 &&
    checkableRows.every((request) =>
      checked.has(requestKey(request)),
    );

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAppliedSearch({ field: searchField, text: searchText.trim() });
    setPage(1);
    setChecked(new Set());
  }

  async function decide(
    request: WalletRequest,
    decision: WalletDecision,
    skipConfirmation = false,
  ): Promise<boolean> {
    const key = requestKey(request);
    if (
      request.status !== "requested" ||
      processingKeys.has(key)
    ) {
      return false;
    }
    const actionLabel =
      decision === "approve"
        ? initialKind === "charge"
          ? "확인"
          : "출금완료"
        : initialKind === "charge"
          ? "삭제"
          : "출금취소";
    if (
      !skipConfirmation &&
      !window.confirm(
        `${request.loginId || request.userId} 회원의 ${request.amount.toLocaleString("ko-KR")}원 신청을 ${actionLabel} 처리하시겠습니까?`,
      )
    ) {
      return false;
    }

    setProcessingKeys((current) => new Set(current).add(key));
    try {
      const response = await fetch(
        `/api/admin/wallet/requests/${encodeURIComponent(request.id)}`,
        {
          method: decision === "approve" ? "PATCH" : "DELETE",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            kind: request.kind,
            decision,
            adminMemo: request.adminMemo,
          }),
        },
      );
      const payload = (await response.json().catch(() => null)) as
        | WalletDecisionResponse
        | null;
      if (response.status === 401) {
        redirectToAdminLogin();
        return false;
      }
      if (!response.ok || !payload?.request) {
        throw new Error(
          payload?.message ?? "신청을 처리하지 못했습니다.",
        );
      }
      const processed = payload.request;
      setRequests((current) =>
        current.map((item) =>
          requestKey(item) === requestKey(processed)
            ? processed
            : item,
        ),
      );
      setChecked((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
      setLiveMessage(
        `${processed.loginId || processed.userId} 회원의 신청을 ${actionLabel} 처리했습니다.`,
      );
      return true;
    } catch (cause) {
      await loadRequests();
      window.alert(errorMessage(cause));
      return false;
    } finally {
      setProcessingKeys((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    }
  }

  async function cancelChecked() {
    const targets = kindRequests.filter(
      (request) =>
        request.status === "requested" &&
        checked.has(requestKey(request)),
    );
    if (targets.length === 0) {
      window.alert("삭제할 충전신청을 선택해 주세요.");
      return;
    }
    if (
      !window.confirm(
        `선택한 충전신청 ${targets.length.toLocaleString("ko-KR")}건을 삭제 처리하시겠습니까?`,
      )
    ) {
      return;
    }
    for (const target of targets) {
      const completed = await decide(target, "reject", true);
      if (!completed) break;
    }
  }

  return (
    <div
      className={`legacy-wallet-manager legacy-wallet-${initialKind}`}
      aria-busy={loading}
    >
      <p className="sound_only" aria-live="polite">
        {liveMessage}
      </p>

      <div className="local_ov01 local_ov legacy-wallet-summary">
        <a
          className="ov_listall"
          href={`/adm/wallet?kind=${initialKind}`}
        >
          전체목록
        </a>
        <span className="btn_ov01">
          <span className="ov_txt">
            {initialKind === "charge" ? "전체" : "총"}
          </span>
          <span className="ov_num">
            {filteredRequests.length.toLocaleString("ko-KR")} 건
          </span>
        </span>
        {initialKind === "charge" ? (
          <span className="btn_ov01 legacy-wallet-total">
            <span className="ov_txt">전체 합계</span>
            <span className="ov_num">
              {totalAmount.toLocaleString("ko-KR")}원
            </span>
          </span>
        ) : null}
      </div>

      <form
        className="local_sch01 local_sch legacy-wallet-search"
        onSubmit={search}
      >
        <label className="sound_only" htmlFor="legacy-wallet-search-field">
          검색대상
        </label>
        <select
          id="legacy-wallet-search-field"
          name="sfl"
          value={searchField}
          onChange={(event) =>
            setSearchField(event.currentTarget.value as SearchField)
          }
        >
          {initialKind === "charge" ? (
            <>
              <option value="member">회원아이디</option>
              <option value="content">내용</option>
            </>
          ) : (
            <option value="nickname">닉네임</option>
          )}
        </select>
        <label className="sound_only" htmlFor="legacy-wallet-search-text">
          검색어<strong className="sound_only"> 필수</strong>
        </label>
        <input
          id="legacy-wallet-search-text"
          className="required frm_input"
          name="stx"
          type="text"
          required
          value={searchText}
          onChange={(event) => setSearchText(event.currentTarget.value)}
        />
        <button className="btn_submit" type="submit">
          검색
        </button>
      </form>

      {initialKind === "charge" ? (
        <ChargeRequestTable
          rows={pageRows}
          checked={checked}
          allChecked={allChecked}
          loading={loading}
          processingKeys={processingKeys}
          onCheckAll={(enabled) =>
            setChecked((current) => {
              const next = new Set(current);
              for (const row of checkableRows) {
                const key = requestKey(row);
                if (enabled) next.add(key);
                else next.delete(key);
              }
              return next;
            })
          }
          onCheck={(request, enabled) =>
            setChecked((current) => {
              const next = new Set(current);
              const key = requestKey(request);
              if (enabled) next.add(key);
              else next.delete(key);
              return next;
            })
          }
          onDecide={(request, decision) =>
            void decide(request, decision)
          }
        />
      ) : (
        <WithdrawalRequestTable
          rows={pageRows}
          loading={loading}
          processingKeys={processingKeys}
          onDecide={(request, decision) =>
            void decide(request, decision)
          }
        />
      )}

      {initialKind === "charge" ? (
        <div className="btn_fixed_top legacy-wallet-bulk-action">
          <button
            className="btn btn_02"
            type="button"
            disabled={loading || processingKeys.size > 0}
            onClick={() => void cancelChecked()}
          >
            선택삭제
          </button>
        </div>
      ) : null}

      <WalletPagination
        page={currentPage}
        totalPages={totalPages}
        onPageChange={(nextPage) => {
          setPage(nextPage);
          setChecked(new Set());
        }}
      />
      {initialKind === "charge" ? (
        <ChargePointAdjustment />
      ) : null}
    </div>
  );
}

function ChargePointAdjustment() {
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const formData = new FormData(event.currentTarget);
    const loginId = String(formData.get("mb_id") ?? "").trim();
    const reason = String(formData.get("po_content") ?? "").trim();
    const pointText = String(formData.get("po_point") ?? "").trim();
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

    setSaving(true);
    setFailed(false);
    setMessage("");
    try {
      const response = await fetch("/api/admin/points", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ loginId, reason, delta }),
      });
      const result = (await response.json().catch(() => null)) as
        | PointAdjustmentResponse
        | null;
      if (response.status === 401) {
        redirectToAdminLogin();
        return;
      }
      if (!response.ok) {
        throw new Error(
          result?.message ??
            Object.values(result?.fieldErrors ?? {})[0] ??
            "포인트를 등록하지 못했습니다.",
        );
      }
      formRef.current?.reset();
      setMessage(result?.message ?? "회원 포인트 내역을 등록했습니다.");
    } catch (cause) {
      setFailed(true);
      setMessage(
        cause instanceof Error
          ? cause.message
          : "포인트를 등록하지 못했습니다.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      className="legacy-wallet-point-manager"
      data-open={open ? "true" : "false"}
    >
      <h2>개별회원 포인트 증감 설정</h2>
      <form
        className="legacy-wallet-point-launcher"
        onSubmit={(event) => {
          event.preventDefault();
          setOpen(true);
        }}
      >
        <button
          className="btn_submit btn"
          type="submit"
          aria-expanded={open}
          aria-controls="legacy-wallet-point-form"
        >
          확인
        </button>
      </form>
      <form
        className="legacy-wallet-point-adjustment-form"
        id="legacy-wallet-point-form"
        ref={formRef}
        hidden={!open}
        onSubmit={submit}
      >
        <div className="tbl_frm01 tbl_wrap">
          <table>
            <caption>개별회원 포인트 증감 설정</caption>
            <tbody>
              <tr>
                <th scope="row">
                  <label htmlFor="legacy-wallet-point-member">회원아이디</label>
                </th>
                <td>
                  <input
                    className="frm_input"
                    id="legacy-wallet-point-member"
                    name="mb_id"
                    maxLength={30}
                    autoComplete="off"
                    required
                  />
                </td>
                <th scope="row">
                  <label htmlFor="legacy-wallet-point-content">포인트 내용</label>
                </th>
                <td>
                  <input
                    className="frm_input legacy-wallet-point-content"
                    id="legacy-wallet-point-content"
                    name="po_content"
                    maxLength={255}
                    required
                  />
                </td>
              </tr>
              <tr>
                <th scope="row">
                  <label htmlFor="legacy-wallet-point-amount">포인트</label>
                </th>
                <td>
                  <input
                    className="frm_input"
                    id="legacy-wallet-point-amount"
                    name="po_point"
                    inputMode="numeric"
                    placeholder="차감은 -1000처럼 입력"
                    required
                  />
                </td>
                <td colSpan={2} />
              </tr>
            </tbody>
          </table>
        </div>
        <div className="legacy-wallet-point-actions">
          <button
            className="btn btn_02"
            type="button"
            onClick={() => setOpen(false)}
          >
            닫기
          </button>
          <button className="btn_submit btn" type="submit" disabled={saving}>
            {saving ? "등록 중" : "확인"}
          </button>
        </div>
      </form>
      {message ? (
        <p
          className={
            failed
              ? "legacy-wallet-point-message is-error"
              : "legacy-wallet-point-message"
          }
          role={failed ? "alert" : "status"}
        >
          {message}
        </p>
      ) : null}
    </section>
  );
}

function ChargeRequestTable({
  rows,
  checked,
  allChecked,
  loading,
  processingKeys,
  onCheckAll,
  onCheck,
  onDecide,
}: {
  rows: WalletRequest[];
  checked: Set<string>;
  allChecked: boolean;
  loading: boolean;
  processingKeys: Set<string>;
  onCheckAll: (enabled: boolean) => void;
  onCheck: (request: WalletRequest, enabled: boolean) => void;
  onDecide: (request: WalletRequest, decision: WalletDecision) => void;
}) {
  return (
    <div className="tbl_head01 tbl_wrap legacy-wallet-table-wrap">
      <table className="legacy-wallet-table legacy-wallet-charge-table">
        <caption>충전신청 목록 회원ID</caption>
        <colgroup>
          {[
            "check",
            "member",
            "nickname",
            "content",
            "point",
            "date",
            "requested",
            "status",
            "manage",
            "balance",
          ].map((name) => (
            <col className={`legacy-wallet-col-${name}`} key={name} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th scope="col">
              <label className="sound_only" htmlFor="wallet-charge-check-all">
                포인트 내역 전체
              </label>
              <input
                id="wallet-charge-check-all"
                type="checkbox"
                checked={allChecked}
                onChange={(event) =>
                  onCheckAll(event.currentTarget.checked)
                }
              />
            </th>
            <th scope="col">회원아이디</th>
            <th scope="col">닉네임</th>
            <th scope="col">포인트 내용</th>
            <th scope="col">포인트</th>
            <th scope="col">일시</th>
            <th scope="col">신청시간</th>
            <th scope="col">상태</th>
            <th scope="col">관리</th>
            <th scope="col">포인트합</th>
          </tr>
        </thead>
        <tbody>
          {!loading && rows.length > 0 ? (
            rows.map((request, index) => {
              const key = requestKey(request);
              const pending = request.status === "requested";
              return (
                <tr className={`bg${index % 2}`} key={key}>
                  <td className="td_chk">
                    <label className="sound_only" htmlFor={`charge-${index}`}>
                      {request.loginId || request.userId} 충전신청
                    </label>
                    <input
                      id={`charge-${index}`}
                      type="checkbox"
                      disabled={!pending}
                      checked={checked.has(key)}
                      onChange={(event) =>
                        onCheck(request, event.currentTarget.checked)
                      }
                    />
                  </td>
                  <td className="td_mbid">
                    <MemberLink request={request} />
                  </td>
                  <td className="td_mbname">
                    {request.memberNickname || request.memberName || "-"}
                  </td>
                  <td className="td_left">
                    충전신청
                    {request.depositorName
                      ? ` (${request.depositorName})`
                      : ""}
                  </td>
                  <td className="td_num">
                    {request.amount.toLocaleString("ko-KR")}
                  </td>
                  <td className="td_datetime">
                    {request.status === "requested"
                      ? "-"
                      : compactDate(request.updatedAt)}
                  </td>
                  <td className="td_datetime">
                    {compactDate(request.createdAt)}
                  </td>
                  <td>{statusLabel(request.status, "charge")}</td>
                  <td className="legacy-wallet-manage">
                    {pending ? (
                      <>
                        <WalletActionButton
                          className="btn_03"
                          disabled={processingKeys.has(key)}
                          onClick={() => onDecide(request, "approve")}
                        >
                          확인
                        </WalletActionButton>
                        <WalletActionButton
                          className="btn_01"
                          disabled={processingKeys.has(key)}
                          onClick={() => onDecide(request, "reject")}
                        >
                          삭제
                        </WalletActionButton>
                      </>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="td_num">
                    {request.memberPoints.toLocaleString("ko-KR")}
                  </td>
                </tr>
              );
            })
          ) : (
            <tr>
              <td className="empty_table" colSpan={10}>
                {loading ? "자료를 불러오는 중입니다." : "자료가 없습니다."}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function WithdrawalRequestTable({
  rows,
  loading,
  processingKeys,
  onDecide,
}: {
  rows: WalletRequest[];
  loading: boolean;
  processingKeys: Set<string>;
  onDecide: (request: WalletRequest, decision: WalletDecision) => void;
}) {
  return (
    <div className="tbl_head01 tbl_wrap legacy-wallet-table-wrap">
      <table className="legacy-wallet-table legacy-wallet-withdrawal-table">
        <caption>환전신청 목록</caption>
        <colgroup>
          {[
            "withdraw-member",
            "withdraw-nickname",
            "account-holder",
            "account-number",
            "bank",
            "amount",
            "withdraw-requested",
            "confirmed",
            "withdraw-status",
            "withdraw-manage",
          ].map((name) => (
            <col className={`legacy-wallet-col-${name}`} key={name} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th scope="col">회원 전체</th>
            <th scope="col">닉네임</th>
            <th scope="col">예금주</th>
            <th scope="col">계좌번호</th>
            <th scope="col">은행</th>
            <th scope="col">금액</th>
            <th scope="col">신청시간</th>
            <th scope="col">확인시간</th>
            <th scope="col">상태</th>
            <th scope="col">관리</th>
          </tr>
        </thead>
        <tbody>
          {!loading && rows.length > 0 ? (
            rows.map((request, index) => {
              const key = requestKey(request);
              const pending = request.status === "requested";
              return (
                <tr className={`bg${index % 2}`} key={key}>
                  <td className="td_mbid">
                    <MemberLink request={request} />
                  </td>
                  <td>
                    {request.memberNickname || request.memberName || "-"}
                  </td>
                  <td>{request.accountHolder || "-"}</td>
                  <td className="legacy-wallet-account-number">
                    {request.accountNumber || "-"}
                  </td>
                  <td>{request.bankName || "-"}</td>
                  <td className="td_num">
                    {request.amount.toLocaleString("ko-KR")}
                  </td>
                  <td className="td_datetime">
                    {compactDate(request.createdAt)}
                  </td>
                  <td className="td_datetime">
                    {pending ? "-" : compactDate(request.updatedAt)}
                  </td>
                  <td>{statusLabel(request.status, "withdrawal")}</td>
                  <td className="legacy-wallet-manage">
                    {pending ? (
                      <>
                        <WalletActionButton
                          className="btn_03"
                          disabled={processingKeys.has(key)}
                          onClick={() => onDecide(request, "approve")}
                        >
                          출금완료
                        </WalletActionButton>
                        <WalletActionButton
                          className="btn_01"
                          disabled={processingKeys.has(key)}
                          onClick={() => onDecide(request, "reject")}
                        >
                          출금취소
                        </WalletActionButton>
                      </>
                    ) : (
                      "-"
                    )}
                  </td>
                </tr>
              );
            })
          ) : (
            <tr>
              <td className="empty_table" colSpan={10}>
                {loading ? "자료를 불러오는 중입니다." : "자료가 없습니다."}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function MemberLink({ request }: { request: WalletRequest }) {
  const label = request.loginId || request.userId || "-";
  return (
    <a href={`/adm/users?q=${encodeURIComponent(label)}`}>
      {label}
    </a>
  );
}

function WalletActionButton({
  className,
  disabled,
  onClick,
  children,
}: {
  className: string;
  disabled: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      className={`btn ${className} legacy-wallet-action`}
      type="button"
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function WalletPagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  const first = Math.floor((page - 1) / 10) * 10 + 1;
  const last = Math.min(totalPages, first + 9);
  return (
    <nav className="pg_wrap legacy-wallet-pagination">
      <span className="pg">
        {Array.from(
          { length: last - first + 1 },
          (_, index) => first + index,
        ).map((pageNumber) =>
          pageNumber === page ? (
            <span
              className="pg_current"
              aria-current="page"
              key={pageNumber}
            >
              {pageNumber}
            </span>
          ) : (
            <button
              className="pg_page"
              type="button"
              key={pageNumber}
              onClick={() => onPageChange(pageNumber)}
            >
              {pageNumber}
            </button>
          ),
        )}
      </span>
    </nav>
  );
}

function searchableValue(
  request: WalletRequest,
  field: SearchField,
): string {
  switch (field) {
    case "member":
      return `${request.loginId} ${request.userId} ${request.memberName}`;
    case "nickname":
      return request.memberNickname;
    case "content":
      return `충전신청 ${request.depositorName} ${request.adminMemo}`;
    case "accountHolder":
      return request.accountHolder;
    case "accountNumber":
      return request.accountNumber;
    case "bankName":
      return request.bankName;
  }
}

function statusLabel(
  status: WalletRequestStatus,
  kind: WalletRequestKind,
): string {
  if (status === "requested") return "신청";
  if (status === "approved") {
    return kind === "charge" ? "확인" : "출금완료";
  }
  return kind === "charge" ? "삭제" : "출금취소";
}

function requestKey(request: Pick<WalletRequest, "kind" | "id">) {
  return `${request.kind}:${request.id}`;
}

function compactDate(value: string): string {
  if (!value) return "-";
  const match =
    /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/u.exec(value);
  if (match) return `${match[1]} ${match[2]}`;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "신청을 처리하지 못했습니다.";
}

function redirectToAdminLogin() {
  const next = `${window.location.pathname}${window.location.search}`;
  window.location.assign(`/adm/login?next=${encodeURIComponent(next)}`);
}
