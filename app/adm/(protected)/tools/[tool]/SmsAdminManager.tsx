"use client";

import {
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import type {
  SmsAdminState,
  SmsMessage,
  SmsPhone,
  SmsPhoneGroup,
  SmsQueueStatus,
  SmsTemplate,
  SmsTemplateGroup,
} from "@/lib/admin-sms";
import styles from "./sms-admin.module.css";

interface SmsApiResult {
  message?: string;
  state?: SmsAdminState;
}

interface Feedback {
  message: string;
  failed: boolean;
}

export function SmsAdminManager({
  initialState,
}: {
  initialState: SmsAdminState;
}) {
  const [state, setState] = useState(initialState);
  const [feedback, setFeedback] = useState<Feedback>({
    message: "",
    failed: false,
  });
  const [busy, setBusy] = useState(false);

  async function request(
    method: "POST" | "PATCH" | "DELETE",
    body?: unknown,
    formData?: FormData,
  ): Promise<boolean> {
    if (busy) return false;
    setBusy(true);
    setFeedback({ message: "", failed: false });
    try {
      const response = await fetch(
        `/api/admin/sms/${encodeURIComponent(state.tool)}`,
        {
          method,
          ...(formData
            ? { body: formData }
            : {
                headers: { "content-type": "application/json" },
                body: JSON.stringify(body ?? {}),
              }),
        },
      );
      if (response.status === 401) {
        window.location.assign("/adm/login");
        return false;
      }
      const result = (await response.json()) as SmsApiResult;
      if (!response.ok || !result.state) {
        setFeedback({
          message: result.message ?? "요청을 처리하지 못했습니다.",
          failed: true,
        });
        return false;
      }
      setState(result.state);
      setFeedback({
        message: result.message ?? "처리했습니다.",
        failed: false,
      });
      return true;
    } catch {
      setFeedback({
        message: "네트워크 상태를 확인한 후 다시 시도해 주세요.",
        failed: true,
      });
      return false;
    } finally {
      setBusy(false);
    }
  }

  let content: ReactNode;
  switch (state.tool) {
    case "sms-settings":
      content = (
        <SmsSettingsScreen
          state={state}
          busy={busy}
          request={request}
        />
      );
      break;
    case "sms-member-sync":
      content = (
        <SmsMemberSyncScreen
          state={state}
          busy={busy}
          request={request}
        />
      );
      break;
    case "sms-send":
      content = (
        <SmsSendScreen state={state} busy={busy} request={request} />
      );
      break;
    case "sms-history-message":
      content = (
        <SmsMessageHistoryScreen
          messages={state.messages}
          busy={busy}
          request={request}
        />
      );
      break;
    case "sms-history-number":
      content = (
        <SmsNumberHistoryScreen recipients={state.recipients} />
      );
      break;
    case "sms-emoticon-groups":
      content = (
        <SmsTemplateGroupsScreen
          state={state}
          busy={busy}
          request={request}
        />
      );
      break;
    case "sms-emoticons":
      content = (
        <SmsTemplatesScreen
          state={state}
          busy={busy}
          request={request}
        />
      );
      break;
    case "sms-phone-groups":
      content = (
        <SmsPhoneGroupsScreen
          state={state}
          busy={busy}
          request={request}
        />
      );
      break;
    case "sms-phones":
      content = (
        <SmsPhonesScreen state={state} busy={busy} request={request} />
      );
      break;
    case "sms-phone-file":
      content = (
        <SmsPhoneFileScreen
          state={state}
          busy={busy}
          request={request}
        />
      );
      break;
  }

  const toolScreenClass =
    state.tool === "sms-member-sync"
      ? styles.memberScreen
        : state.tool === "sms-send"
          ? styles.sendScreen
        : state.tool === "sms-emoticon-groups"
          ? styles.templateGroupsScreen
        : state.tool === "sms-emoticons"
          ? styles.templatesScreen
          : state.tool === "sms-phone-groups"
            ? styles.phoneGroupsScreen
          : state.tool === "sms-phone-file"
            ? styles.phoneFileScreen
            : "";

  return (
    <div
      className={`${styles.screen}${toolScreenClass ? ` ${toolScreenClass}` : ""}${
        state.tool === "sms-settings" &&
        !state.settings.providerConfigured
          ? ` ${styles.settingsUnavailable}`
          : ""
      }`}
    >
      {content}
      <FeedbackMessage feedback={feedback} />
    </div>
  );
}

function SmsUnavailable({ reason }: { reason: string }) {
  return (
    <>
      <h2 className={styles.unavailableTitle}>
        SMS 문자전송 서비스를 사용할 수 없습니다.
      </h2>
      <div className={styles.unavailableBox}>
        <p>
          {reason ||
            "SMS 를 사용하지 않고 있기 때문에, 문자 전송을 할 수 없습니다."}
          <br />
          SMS 사용 설정은{" "}
          <Link className={styles.settingsLink} href="/adm/settings">
            환경설정 &gt; 기본환경설정 &gt; SMS설정
          </Link>
          에서 SMS 사용을 아이코드로 변경해 주셔야 사용하실수 있습니다.
        </p>
      </div>
    </>
  );
}

function SmsSettingsScreen({
  state,
  busy,
  request,
}: ScreenProps) {
  const [enabled, setEnabled] = useState(state.settings.enabled);
  const [sender, setSender] = useState(state.settings.sender);
  const [providerName, setProviderName] = useState(
    state.settings.providerName,
  );
  const [memo, setMemo] = useState(state.settings.memo);

  if (!state.settings.providerConfigured) {
    return <SmsUnavailable reason={state.settings.unavailableReason} />;
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void request("PATCH", {
          enabled,
          sender,
          providerName,
          memo,
          expectedRevision: state.settings.revision,
        });
      }}
    >
      <div className={`btn_fixed_top ${styles.fixedActions}`}>
        <button
          className={styles.pinkButton}
          type="submit"
          disabled={busy}
        >
          저장
        </button>
      </div>
      <div className="tbl_frm01 tbl_wrap">
        <table>
          <caption>SMS 기본설정</caption>
          <colgroup>
            <col style={{ width: 200 }} />
            <col />
          </colgroup>
          <tbody>
            <tr>
              <th scope="row">SMS 사용</th>
              <td>
                <label>
                  <input
                    type="radio"
                    checked={enabled}
                    onChange={() => setEnabled(true)}
                  />{" "}
                  사용
                </label>{" "}
                <label>
                  <input
                    type="radio"
                    checked={!enabled}
                    onChange={() => setEnabled(false)}
                  />{" "}
                  사용안함
                </label>
              </td>
            </tr>
            <tr>
              <th scope="row">
                <label htmlFor="sms-provider-name">SMS 공급사</label>
              </th>
              <td>
                <input
                  id="sms-provider-name"
                  className="frm_input"
                  value={providerName}
                  maxLength={80}
                  onChange={(event) =>
                    setProviderName(event.currentTarget.value)
                  }
                />
                <span className="frm_info">
                  서버에 연결된 SMS 공급사 표시명을 입력합니다.
                </span>
              </td>
            </tr>
            <tr>
              <th scope="row">
                <label htmlFor="sms-sender">회신번호</label>
              </th>
              <td>
                <input
                  id="sms-sender"
                  className="frm_input"
                  value={sender}
                  maxLength={30}
                  required
                  placeholder="010-1234-5678"
                  onChange={(event) => setSender(event.currentTarget.value)}
                />
                <span className="frm_info">필수 예) 010-1234-5678</span>
              </td>
            </tr>
            <tr>
              <th scope="row">
                <label htmlFor="sms-memo">운영 메모</label>
              </th>
              <td>
                <textarea
                  id="sms-memo"
                  value={memo}
                  maxLength={2_000}
                  onChange={(event) => setMemo(event.currentTarget.value)}
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </form>
  );
}

function SmsMemberSyncScreen({ state, busy, request }: ScreenProps) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void request("POST", {});
      }}
    >
      <div className={`btn_fixed_top ${styles.fixedActions}`}>
        <input
          className={styles.pinkButton}
          type="submit"
          disabled={busy}
          value="실행"
        />
      </div>
      <div className={styles.descriptionStrong}>
        <p>새로운 회원정보로 업데이트 합니다.</p>
        <p>
          실행 후 &apos;완료&apos; 메세지가 나오기 전에 프로그램의 실행을
          중지하지 마십시오.
        </p>
      </div>
      <div className={styles.descriptionLight}>
        <p>
          마지막 업데이트 일시 :{" "}
          <span>{displayDateTime(state.syncState.lastSyncedAt)}</span>
        </p>
      </div>
      <div className={styles.resultBox}>
        {busy ? (
          <p>업데이트 중입니다. 잠시만 기다려 주십시오...</p>
        ) : state.syncState.lastSyncedAt ? (
          <p>
            완료: {state.syncState.syncedCount.toLocaleString("ko-KR")}명
            업데이트, {state.syncState.skippedCount.toLocaleString("ko-KR")}
            명 건너뜀
          </p>
        ) : null}
      </div>
    </form>
  );
}

function SmsSendScreen({ state, busy, request }: ScreenProps) {
  const [content, setContent] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [manualName, setManualName] = useState("");
  const [manualPhone, setManualPhone] = useState("");
  const [manualRecipients, setManualRecipients] = useState<
    { name: string; phone: string }[]
  >([]);
  const [scheduledAt, setScheduledAt] = useState("");
  const byteCount = new TextEncoder().encode(content).byteLength;

  if (!state.settings.available) {
    return (
      <>
        <div className={styles.lastSync}>
          회원정보 최근 업데이트 :{" "}
          {displayDateTime(state.syncState.lastSyncedAt)}
        </div>
        <section className={styles.unavailableAfterSync}>
          <SmsUnavailable reason={state.settings.unavailableReason} />
        </section>
      </>
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const succeeded = await request("POST", {
      content,
      phoneIds: selectedIds,
      recipients: manualRecipients,
      scheduledAt: scheduledAt || null,
    });
    if (succeeded) {
      setContent("");
      setSelectedIds([]);
      setManualRecipients([]);
      setScheduledAt("");
    }
  }

  return (
    <form onSubmit={submit}>
      <p className={styles.lastSync}>
        회원정보 최근 업데이트 :{" "}
        {displayDateTime(state.syncState.lastSyncedAt)}
      </p>
      <div className={styles.sendLayout}>
        <section className={styles.sendBox}>
          <h2>보낼내용</h2>
          <div className={styles.sendBody}>
            <label>
              이모티콘 목록{" "}
              <select
                defaultValue=""
                onChange={(event) => {
                  const template = state.templates.find(
                    (item) => item.id === event.currentTarget.value,
                  );
                  if (template) setContent(template.content);
                  event.currentTarget.value = "";
                }}
              >
                <option value="">선택</option>
                {state.templates.map((template) => (
                  <option value={template.id} key={template.id}>
                    [{template.groupName}] {template.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="sound_only" htmlFor="sms-content">
              내용
            </label>
            <textarea
              id="sms-content"
              required
              maxLength={2_000}
              value={content}
              onChange={(event) => setContent(event.currentTarget.value)}
            />
            <span className={styles.byteCount}>
              {byteCount.toLocaleString("ko-KR")} / 2,000 byte
            </span>
            <label>
              회신{" "}
              <input
                className="frm_input"
                value={state.settings.sender}
                readOnly
                required
              />
            </label>
            <h3>예약전송</h3>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(event) => setScheduledAt(event.currentTarget.value)}
            />
          </div>
        </section>
        <section className={styles.sendBox}>
          <h2>받는사람</h2>
          <div className={styles.sendBody}>
            <div className={styles.recipientList}>
              {state.phones.map((phone) => (
                <label key={phone.id}>
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(phone.id)}
                    disabled={!phone.receipt}
                    onChange={() =>
                      setSelectedIds((current) =>
                        current.includes(phone.id)
                          ? current.filter((id) => id !== phone.id)
                          : [...current, phone.id],
                      )
                    }
                  />
                  <span>
                    {phone.name} ({formatPhone(phone.phone)}){" "}
                    {!phone.receipt ? "- 수신거부" : ""}
                  </span>
                </label>
              ))}
              {state.phones.length === 0 ? (
                <p className="empty_table">등록된 휴대폰번호가 없습니다.</p>
              ) : null}
            </div>
            {manualRecipients.map((recipient, index) => (
              <div className={styles.manualRow} key={`${recipient.phone}-${index}`}>
                <span>{recipient.name}</span>
                <span>{formatPhone(recipient.phone)}</span>
                <button
                  className="btn btn_02"
                  type="button"
                  onClick={() =>
                    setManualRecipients((current) =>
                      current.filter((_, rowIndex) => rowIndex !== index),
                    )
                  }
                >
                  삭제
                </button>
              </div>
            ))}
            <div className={styles.manualRow}>
              <input
                aria-label="받는사람 이름"
                className="frm_input"
                placeholder="이름"
                value={manualName}
                maxLength={80}
                onChange={(event) => setManualName(event.currentTarget.value)}
              />
              <input
                aria-label="받는사람 번호"
                className="frm_input"
                placeholder="휴대폰번호"
                value={manualPhone}
                maxLength={30}
                onChange={(event) => setManualPhone(event.currentTarget.value)}
              />
              <button
                className="btn btn_02"
                type="button"
                onClick={() => {
                  if (!manualPhone.trim()) return;
                  setManualRecipients((current) => [
                    ...current,
                    {
                      name: manualName.trim() || "비회원",
                      phone: manualPhone,
                    },
                  ]);
                  setManualName("");
                  setManualPhone("");
                }}
              >
                추가
              </button>
            </div>
          </div>
        </section>
      </div>
      <div className={styles.editorActions}>
        <button
          className={styles.pinkButton}
          type="submit"
          disabled={busy || byteCount === 0 || byteCount > 2_000}
        >
          전송 요청
        </button>
      </div>
    </form>
  );
}

function SmsMessageHistoryScreen({
  messages,
  busy,
  request,
}: {
  messages: SmsMessage[];
  busy: boolean;
  request: ScreenProps["request"];
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(
    () =>
      messages.filter((message) =>
        message.content.toLocaleLowerCase("ko-KR").includes(
          query.trim().toLocaleLowerCase("ko-KR"),
        ),
      ),
    [messages, query],
  );
  return (
    <>
      <form
        className={`${styles.search} ${styles.messageHistorySearch}`}
        onSubmit={(event) => event.preventDefault()}
      >
        <input name="st" type="hidden" value="wr_message" />
        <input
          id="sms-history-message-query"
          name="sv"
          aria-label="검색어"
          className="frm_input"
          type="text"
          required
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
        <input
          className={styles.searchButton}
          type="submit"
          value="검색"
        />
      </form>
      <div className="tbl_head01 tbl_wrap">
        <table className={`${styles.table} ${styles.historyMessage}`}>
          <caption>문자전송 내역 목록</caption>
          <colgroup>{Array.from({ length: 11 }, (_, index) => <col key={index} />)}</colgroup>
          <thead>
            <tr>
              <th scope="col">번호</th>
              <th scope="col">메세지</th>
              <th scope="col">회신번호</th>
              <th scope="col">전송일시</th>
              <th scope="col">예약</th>
              <th scope="col">총건수</th>
              <th scope="col">성공</th>
              <th scope="col">실패</th>
              <th scope="col">중복</th>
              <th scope="col">재전송</th>
              <th scope="col">관리</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((message, index) => (
              <tr key={message.id}>
                <td>{filtered.length - index}</td>
                <td className={styles.left} title={message.content}>
                  {message.content}
                </td>
                <td>{formatPhone(message.sender)}</td>
                <td>{displayDateTime(message.createdAt)}</td>
                <td>{message.scheduledAt ? "예약" : ""}</td>
                <td>{message.recipientCount.toLocaleString("ko-KR")}</td>
                <td>{message.successCount.toLocaleString("ko-KR")}</td>
                <td>{message.failureCount.toLocaleString("ko-KR")}</td>
                <td>{message.duplicateCount.toLocaleString("ko-KR")}</td>
                <td>0</td>
                <td>
                  {message.status === "waiting_provider" ||
                  message.status === "queued" ? (
                    <button
                      className="btn btn_03"
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void request("PATCH", {
                          id: message.id,
                          action: "cancel",
                        })
                      }
                    >
                      취소
                    </button>
                  ) : (
                    <StatusBadge status={message.status} />
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 ? (
              <tr style={{ height: 223 }}>
                <td
                  className={`${styles.tableEmpty} empty_table`}
                  colSpan={11}
                  style={{ height: 223 }}
                >
                  데이터가 없습니다.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}

function SmsNumberHistoryScreen({
  recipients,
}: {
  recipients: SmsAdminState["recipients"];
}) {
  const [field, setField] = useState<"name" | "phone" | "memberId">("name");
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ko-KR");
    return recipients.filter((recipient) =>
      recipient[field].toLocaleLowerCase("ko-KR").includes(normalized),
    );
  }, [field, query, recipients]);
  return (
    <>
      <form
        className={`${styles.search} ${styles.numberHistorySearch}`}
        onSubmit={(event) => event.preventDefault()}
      >
        <select
          id="sms-history-number-field"
          name="st"
          aria-label="검색대상"
          value={field}
          onChange={(event) =>
            setField(
              event.currentTarget.value as "name" | "phone" | "memberId",
            )
          }
        >
          <option value="name">이름</option>
          <option value="phone">휴대폰번호</option>
          <option value="memberId">고유번호</option>
        </select>
        <input
          id="sms-history-number-query"
          name="sv"
          aria-label="검색어"
          className="frm_input"
          type="text"
          required
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
        <input
          className={styles.searchButton}
          type="submit"
          value="검색"
        />
      </form>
      <div className="tbl_head01 tbl_wrap">
        <table className={`${styles.table} ${styles.historyNumber}`}>
          <caption>문자전송 내역 번호별 목록</caption>
          <colgroup>{Array.from({ length: 10 }, (_, index) => <col key={index} />)}</colgroup>
          <thead>
            <tr>
              <th scope="col">번호</th>
              <th scope="col">그룹</th>
              <th scope="col">이름</th>
              <th scope="col">회원ID</th>
              <th scope="col">전화번호</th>
              <th scope="col">전송일시</th>
              <th scope="col">예약</th>
              <th scope="col">전송</th>
              <th scope="col">메세지</th>
              <th scope="col">관리</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((recipient, index) => (
              <tr key={recipient.id}>
                <td>{filtered.length - index}</td>
                <td>{recipient.groupName}</td>
                <td>{recipient.name}</td>
                <td>{recipient.memberId || "비회원"}</td>
                <td>{formatPhone(recipient.phone)}</td>
                <td>{displayDateTime(recipient.createdAt)}</td>
                <td>{recipient.scheduledAt ? "예약" : ""}</td>
                <td>
                  <StatusBadge status={recipient.status} />
                </td>
                <td className={styles.left}>{recipient.messageContent}</td>
                <td>보기</td>
              </tr>
            ))}
            {filtered.length === 0 ? (
              <tr style={{ height: 223 }}>
                <td
                  className={`${styles.tableEmpty} empty_table`}
                  colSpan={10}
                  style={{ height: 223 }}
                >
                  데이터가 없습니다.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}

function SmsTemplateGroupsScreen({ state, busy, request }: ScreenProps) {
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(state.templateGroups.map((group) => [group.id, group.name])),
  );

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await request("POST", { name })) setName("");
  }

  async function updateSelected() {
    for (const id of selected) {
      const group = state.templateGroups.find((item) => item.id === id);
      if (!group) continue;
      await request("PATCH", { id, name: drafts[id] ?? group.name });
    }
    setSelected([]);
  }

  async function deleteSelected() {
    if (!selected.length || !window.confirm("선택한 그룹을 삭제하시겠습니까?")) return;
    for (const id of selected) await request("DELETE", { id });
    setSelected([]);
  }

  async function clearSelected() {
    if (!selected.length || !window.confirm("선택한 그룹의 이모티콘을 비우시겠습니까?")) return;
    for (const id of selected) await request("PATCH", { id, action: "clear" });
    setSelected([]);
  }

  return (
    <>
      <div className={`btn_fixed_top ${styles.fixedActions}`}>
        <button className={styles.grayButton} type="button" disabled={busy} onClick={() => void updateSelected()}>
          선택수정
        </button>
        <button className={styles.grayButton} type="button" disabled={busy} onClick={() => void deleteSelected()}>
          선택삭제
        </button>
        <button className={styles.grayButton} type="button" disabled={busy} onClick={() => void clearSelected()}>
          선택비우기
        </button>
      </div>
      <form className={styles.groupSearch} onSubmit={add}>
        <div className={styles.groupForm}>
          <label htmlFor="template-group-name">그룹명</label>
          <input
            id="template-group-name"
            type="text"
            className="frm_input"
            required
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
          />
          <button className={styles.pinkButton} type="submit" disabled={busy}>
            추가
          </button>
        </div>
        <div className={styles.groupCountRow}>
          <span className={styles.count}>
            건수 : {state.templateGroups.length}
          </span>
        </div>
      </form>
      <div className={styles.descriptionRow}>그룹명순으로 정렬됩니다.</div>
      <form
        onSubmit={(event) => event.preventDefault()}
      >
        <div
          className={`tbl_head01 tbl_wrap ${styles.templateGroupTableWrap}`}
        >
          <table className={`${styles.table} ${styles.compactGroupTable}`}>
          <caption>이모티콘 그룹 목록</caption>
          <colgroup>
            <col style={{ width: 145 }} />
            <col />
            <col style={{ width: "40%" }} />
            <col style={{ width: 100 }} />
            <col style={{ width: 60 }} />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">
                <span className="sound_only">그룹 전체</span>
                <input
                  aria-label="그룹 전체"
                  type="checkbox"
                  checked={
                    state.templateGroups.length > 0 &&
                    selected.length === state.templateGroups.length
                  }
                  onChange={(event) =>
                    setSelected(
                      event.currentTarget.checked
                        ? state.templateGroups.map((group) => group.id)
                        : [],
                    )
                  }
                />
              </th>
              <th scope="col">그룹명</th>
              <th scope="col">이모티콘수</th>
              <th scope="col">이동</th>
              <th scope="col">보기</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td />
              <td>미분류</td>
              <td>
                {state.templates.filter((template) => !template.groupId).length}
              </td>
              <td>
                <select
                  className={styles.moveSelect}
                  aria-label="미분류 이모티콘 이동"
                  defaultValue=""
                  onChange={(event) => {
                    const targetGroupId = event.currentTarget.value;
                    if (
                      targetGroupId &&
                      window.confirm(
                        "미분류 이모티콘을 선택한 그룹으로 이동하시겠습니까?",
                      )
                    ) {
                      for (const template of state.templates.filter(
                        (item) => !item.groupId,
                      )) {
                        void request("PATCH", {
                          id: template.id,
                          name: template.name,
                          content: template.content,
                          groupId: targetGroupId,
                        });
                      }
                    }
                    event.currentTarget.value = "";
                  }}
                >
                  <option value="" />
                  {state.templateGroups.map((group) => (
                    <option value={group.id} key={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <Link className="btn btn_03" href="/adm/tools/sms-emoticons">
                  보기
                </Link>
              </td>
            </tr>
            {state.templateGroups.map((group) => (
              <tr key={group.id}>
                <td>
                  <input
                    aria-label={`${group.name} 선택`}
                    type="checkbox"
                    checked={selected.includes(group.id)}
                    onChange={() => toggleId(group.id, selected, setSelected)}
                  />
                </td>
                <td>
                  <input
                    aria-label={`${group.name} 그룹명`}
                    className={styles.inlineInput}
                    value={drafts[group.id] ?? group.name}
                    onChange={(event) =>
                      setDrafts((current) => ({
                        ...current,
                        [group.id]: event.currentTarget.value,
                      }))
                    }
                  />
                </td>
                <td>{group.templateCount.toLocaleString("ko-KR")}</td>
                <td>
                  <MoveSelect
                    currentId={group.id}
                    groups={state.templateGroups}
                    onMove={(targetGroupId) =>
                      void request("PATCH", {
                        id: group.id,
                        action: "move",
                        targetGroupId,
                      })
                    }
                  />
                </td>
                <td>
                  <Link className="btn btn_03" href="/adm/tools/sms-emoticons">
                    보기
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
          </table>
        </div>
      </form>
    </>
  );
}

function SmsTemplatesScreen({ state, busy, request }: ScreenProps) {
  const [query, setQuery] = useState("");
  const [groupId, setGroupId] = useState("");
  const [searchField, setSearchField] = useState<
    "all" | "name" | "content"
  >("all");
  const [showEditor, setShowEditor] = useState(false);
  const [editing, setEditing] = useState<SmsTemplate | null>(null);
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [editorGroupId, setEditorGroupId] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ko-KR");
    return state.templates.filter(
      (template) =>
        (!groupId || (groupId === "none" ? !template.groupId : template.groupId === groupId)) &&
        (!normalized ||
          (searchField === "name"
            ? template.name
            : searchField === "content"
              ? template.content
              : `${template.name} ${template.content}`
          )
            .toLocaleLowerCase("ko-KR")
            .includes(normalized)),
    );
  }, [groupId, query, searchField, state.templates]);

  function openEditor(template?: SmsTemplate) {
    setEditing(template ?? null);
    setName(template?.name ?? "");
    setContent(template?.content ?? "");
    setEditorGroupId(template?.groupId ?? "");
    setShowEditor(true);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const succeeded = await request(editing ? "PATCH" : "POST", {
      ...(editing ? { id: editing.id } : {}),
      name,
      content,
      groupId: editorGroupId || null,
    });
    if (succeeded) setShowEditor(false);
  }

  async function deleteSelected() {
    if (!selected.length || !window.confirm("선택한 이모티콘을 삭제하시겠습니까?")) return;
    for (const id of selected) await request("DELETE", { id });
    setSelected([]);
  }

  async function moveSelected() {
    if (!selected.length) return;
    const choices = [
      "미분류",
      ...state.templateGroups.map((group) => group.name),
    ].join(", ");
    const selectedName = window.prompt(
      `이동할 그룹명을 입력해 주세요.\n${choices}`,
      "미분류",
    );
    if (selectedName === null) return;
    const targetId =
      selectedName.trim() === "미분류"
        ? null
        : state.templateGroups.find(
            (group) => group.name === selectedName.trim(),
          )?.id;
    if (selectedName.trim() !== "미분류" && !targetId) {
      window.alert("입력한 그룹을 찾을 수 없습니다.");
      return;
    }
    for (const id of selected) {
      const template = state.templates.find((item) => item.id === id);
      if (!template) continue;
      await request("PATCH", {
        id,
        name: template.name,
        content: template.content,
        groupId: targetId,
      });
    }
    setSelected([]);
  }

  return (
    <>
      <div className={`btn_fixed_top ${styles.fixedActions}`}>
        <button className={styles.grayButton} type="button" disabled={busy} onClick={() => void moveSelected()}>
          선택이동
        </button>
        <button className={styles.grayButton} type="button" disabled={busy} onClick={() => void deleteSelected()}>
          선택삭제
        </button>
        <button className={styles.pinkButton} type="button" disabled={busy} onClick={() => openEditor()}>
          이모티콘 추가
        </button>
      </div>
      <div className={styles.summary}>
        <span className={styles.summaryPair}>
          <span>건수</span>
          <strong>{filtered.length}건</strong>
        </span>
      </div>
      <div className={styles.templateControls}>
        <form
          className={styles.templateGroupFilter}
          onSubmit={(event) => event.preventDefault()}
        >
          <select
            name="fg_no"
            aria-label="그룹명"
            value={groupId}
            onChange={(event) => setGroupId(event.currentTarget.value)}
          >
            <option value="">전체 </option>
            <option value="none">
              미분류 (
              {state.templates.filter((template) => !template.groupId).length})
            </option>
            {state.templateGroups.map((group) => (
              <option value={group.id} key={group.id}>
                {group.name} ({group.templateCount})
              </option>
            ))}
          </select>
        </form>
        <form
          className={styles.templateSearchForm}
          onSubmit={(event) => event.preventDefault()}
        >
          <input name="fg_no" type="hidden" value={groupId} />
          <select
            name="st"
            aria-label="검색대상"
            value={searchField}
            onChange={(event) =>
              setSearchField(
                event.currentTarget.value as "all" | "name" | "content",
              )
            }
          >
            <option value="all">제목 + 이모티콘</option>
            <option value="name">제목</option>
            <option value="content">이모티콘</option>
          </select>
          <input
            name="sv"
            type="text"
            required
            className="frm_input"
            aria-label="검색어"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
          <input
            className={styles.searchButton}
            type="submit"
            value="검색"
          />
        </form>
      </div>
      <div className={styles.templateBulkSelect}>
        <input
          id="template-select-all"
          type="checkbox"
          checked={
            filtered.length > 0 &&
            filtered.every((template) => selected.includes(template.id))
          }
          onChange={(event) =>
            setSelected(
              event.currentTarget.checked
                ? filtered.map((template) => template.id)
                : [],
            )
          }
        />{" "}
        <label htmlFor="template-select-all">전체선택</label>
      </div>
      <form
        className={`${styles.templateListForm}${
          filtered.length === 0 ? ` ${styles.templateListFormEmpty}` : ""
        }`}
        onSubmit={(event) => event.preventDefault()}
      >
        <div className={styles.templateGrid}>
          {filtered.map((template) => (
            <article className={styles.templateCard} key={template.id}>
            <input
              aria-label={`${template.name} 선택`}
              type="checkbox"
              checked={selected.includes(template.id)}
              onChange={() => toggleId(template.id, selected, setSelected)}
            />
            <textarea value={template.content} readOnly />
            <div className={styles.templateMeta}>
              <b>{template.groupName}</b>
              <br />
              {template.name}
              <br />
              {displayDate(template.createdAt)}
            </div>
            <div className={styles.templateActions}>
              <button className="btn btn_03" type="button" onClick={() => openEditor(template)}>
                수정
              </button>
              <button
                className="btn btn_02"
                type="button"
                onClick={() => {
                  if (window.confirm("이 이모티콘을 삭제하시겠습니까?")) {
                    void request("DELETE", { id: template.id });
                  }
                }}
              >
                삭제
              </button>
            </div>
            </article>
          ))}
        </div>
      </form>
      {showEditor ? (
        <form className={styles.editor} onSubmit={save}>
          <h2 className={styles.editorTitle}>
            {editing ? "이모티콘 수정" : "이모티콘 추가"}
          </h2>
          <div className={styles.editorGrid}>
            <label htmlFor="template-editor-group">그룹</label>
            <div>
              <select
                id="template-editor-group"
                value={editorGroupId}
                onChange={(event) => setEditorGroupId(event.currentTarget.value)}
              >
                <option value="">미분류</option>
                {state.templateGroups.map((group) => (
                  <option value={group.id} key={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </div>
            <label htmlFor="template-editor-name">제목</label>
            <div>
              <input
                id="template-editor-name"
                required
                value={name}
                onChange={(event) => setName(event.currentTarget.value)}
              />
            </div>
            <label htmlFor="template-editor-content">이모티콘</label>
            <div>
              <textarea
                id="template-editor-content"
                required
                value={content}
                onChange={(event) => setContent(event.currentTarget.value)}
              />
            </div>
          </div>
          <div className={styles.editorActions}>
            <button className={styles.grayButton} type="button" onClick={() => setShowEditor(false)}>
              취소
            </button>
            <button className={styles.pinkButton} type="submit" disabled={busy}>
              저장
            </button>
          </div>
        </form>
      ) : null}
    </>
  );
}

function SmsPhoneGroupsScreen({ state, busy, request }: ScreenProps) {
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(state.phoneGroups.map((group) => [group.id, group.name])),
  );
  const unclassified = phoneGroupSummary(
    state.phones.filter((phone) => !phone.groupId),
  );

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await request("POST", { name })) setName("");
  }

  async function updateSelected() {
    for (const id of selected) {
      const group = state.phoneGroups.find((item) => item.id === id);
      if (!group) continue;
      await request("PATCH", { id, name: drafts[id] ?? group.name });
    }
    setSelected([]);
  }

  async function deleteSelected() {
    if (!selected.length || !window.confirm("선택한 그룹을 삭제하시겠습니까?")) return;
    for (const id of selected) await request("DELETE", { id });
    setSelected([]);
  }

  async function clearSelected() {
    if (!selected.length || !window.confirm("선택한 그룹의 휴대폰번호를 비우시겠습니까?")) return;
    for (const id of selected) await request("PATCH", { id, action: "clear" });
    setSelected([]);
  }

  return (
    <>
      <div className={`btn_fixed_top ${styles.fixedActions}`}>
        <button className={styles.grayButton} type="button" disabled={busy} onClick={() => void updateSelected()}>
          선택수정
        </button>
        <button className={styles.grayButton} type="button" disabled={busy} onClick={() => void deleteSelected()}>
          선택삭제
        </button>
        <button className={styles.grayButton} type="button" disabled={busy} onClick={() => void clearSelected()}>
          선택비우기
        </button>
      </div>
      <div className={styles.summary}>
        <span className={styles.summaryPair}>
          <span>건수</span>
          <strong>{state.phoneGroups.length + 1}건</strong>
        </span>
      </div>
      <form className={styles.groupForm} onSubmit={add}>
        <label className="sound_only" htmlFor="phone-group-name">
          그룹추가
        </label>
        <input
          id="phone-group-name"
          type="text"
          className="frm_input"
          required
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
        />
        <button className={styles.pinkButton} type="submit" disabled={busy}>
          그룹추가
        </button>
      </form>
      <div className={styles.descriptionRow}>그룹명순으로 정렬됩니다.</div>
      <form onSubmit={(event) => event.preventDefault()}>
        <div className={`tbl_head01 tbl_wrap ${styles.phoneGroupTableWrap}`}>
          <table className={`${styles.table} ${styles.compactGroupTable}`}>
          <caption>휴대폰번호 그룹 목록</caption>
          <colgroup>
            <col style={{ width: 170.359375 }} />
            <col style={{ width: 333.640625 }} />
            <col style={{ width: 60 }} />
            <col style={{ width: 60 }} />
            <col style={{ width: 60 }} />
            <col style={{ width: 60 }} />
            <col style={{ width: 60 }} />
            <col style={{ width: 100 }} />
            <col style={{ width: 100 }} />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">
                <span className="sound_only">그룹 전체</span>
                <input
                  aria-label="그룹 전체"
                  type="checkbox"
                  checked={
                    state.phoneGroups.length > 0 &&
                    selected.length === state.phoneGroups.length
                  }
                  onChange={(event) =>
                    setSelected(
                      event.currentTarget.checked
                        ? state.phoneGroups.map((group) => group.id)
                        : [],
                    )
                  }
                />
              </th>
              <th scope="col">그룹명</th>
              <th scope="col">총</th>
              <th scope="col">회원</th>
              <th scope="col">비회원</th>
              <th scope="col">수신</th>
              <th scope="col">거부</th>
              <th scope="col">이동</th>
              <th scope="col">보기</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td />
              <td>미분류</td>
              <td>{unclassified.total}</td>
              <td>{unclassified.members}</td>
              <td>{unclassified.nonMembers}</td>
              <td>{unclassified.receipt}</td>
              <td>{unclassified.reject}</td>
              <td>
                <select
                  className={styles.moveSelect}
                  aria-label="미분류 번호 이동"
                  defaultValue=""
                  onChange={(event) => {
                    const targetGroupId = event.currentTarget.value;
                    const ids = state.phones
                      .filter((phone) => !phone.groupId)
                      .map((phone) => phone.id);
                    if (
                      targetGroupId &&
                      ids.length > 0 &&
                      window.confirm(
                        "미분류 휴대폰번호를 선택한 그룹으로 이동하시겠습니까?",
                      )
                    ) {
                      void request("PATCH", {
                        action: "bulk",
                        bulkAction: "move",
                        ids,
                        groupId: targetGroupId,
                      });
                    }
                    event.currentTarget.value = "";
                  }}
                >
                  <option value="" />
                  {state.phoneGroups.map((group) => (
                    <option value={group.id} key={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <Link className="btn btn_03" href="/adm/tools/sms-phones">
                  보기
                </Link>
              </td>
            </tr>
            {state.phoneGroups.map((group) => (
              <tr key={group.id}>
                <td>
                  <input
                    aria-label={`${group.name} 선택`}
                    type="checkbox"
                    checked={selected.includes(group.id)}
                    onChange={() => toggleId(group.id, selected, setSelected)}
                  />
                </td>
                <td>
                  <input
                    aria-label={`${group.name} 그룹명`}
                    className={styles.inlineInput}
                    value={drafts[group.id] ?? group.name}
                    onChange={(event) =>
                      setDrafts((current) => ({
                        ...current,
                        [group.id]: event.currentTarget.value,
                      }))
                    }
                  />
                </td>
                <td>{group.totalCount}</td>
                <td>{group.memberCount}</td>
                <td>{group.nonMemberCount}</td>
                <td>{group.receiptCount}</td>
                <td>{group.rejectCount}</td>
                <td>
                  <MoveSelect
                    currentId={group.id}
                    groups={state.phoneGroups}
                    onMove={(targetGroupId) =>
                      void request("PATCH", {
                        id: group.id,
                        action: "move",
                        targetGroupId,
                      })
                    }
                  />
                </td>
                <td>
                  <Link className="btn btn_03" href="/adm/tools/sms-phones">
                    보기
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
          </table>
        </div>
      </form>
    </>
  );
}

function SmsPhonesScreen({ state, busy, request }: ScreenProps) {
  const [query, setQuery] = useState("");
  const [searchField, setSearchField] = useState<
    "all" | "name" | "phone"
  >("all");
  const [groupId, setGroupId] = useState("");
  const [onlyWithPhone, setOnlyWithPhone] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [showEditor, setShowEditor] = useState(false);
  const [editing, setEditing] = useState<SmsPhone | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [editorGroupId, setEditorGroupId] = useState("");
  const [receipt, setReceipt] = useState(true);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ko-KR");
    return state.phones.filter(
      (row) =>
        (!groupId || (groupId === "none" ? !row.groupId : row.groupId === groupId)) &&
        (!onlyWithPhone || Boolean(row.phone)) &&
        (!normalized ||
          (searchField === "name"
            ? row.name
            : searchField === "phone"
              ? row.phone
              : `${row.name} ${row.phone}`
          )
            .toLocaleLowerCase("ko-KR")
            .includes(normalized)),
    );
  }, [groupId, onlyWithPhone, query, searchField, state.phones]);
  const totals = phoneGroupSummary(filtered);

  function openEditor(row?: SmsPhone) {
    setEditing(row ?? null);
    setName(row?.name ?? "");
    setPhone(row?.phone ?? "");
    setEditorGroupId(row?.groupId ?? "");
    setReceipt(row?.receipt ?? true);
    setShowEditor(true);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const succeeded = await request(editing ? "PATCH" : "POST", {
      ...(editing ? { id: editing.id } : {}),
      name,
      phone,
      groupId: editorGroupId || null,
      receipt,
      memo: editing?.memo ?? "",
    });
    if (succeeded) setShowEditor(false);
  }

  async function bulk(action: "move" | "copy") {
    if (!selected.length) return;
    const choices = [
      "미분류",
      ...state.phoneGroups.map((group) => group.name),
    ].join(", ");
    const selectedName = window.prompt(
      `${action === "move" ? "이동" : "복사"}할 그룹명을 입력해 주세요.\n${choices}`,
      "미분류",
    );
    if (selectedName === null) return;
    const target =
      selectedName.trim() === "미분류"
        ? null
        : state.phoneGroups.find(
            (group) => group.name === selectedName.trim(),
          )?.id;
    if (selectedName.trim() !== "미분류" && !target) {
      window.alert("입력한 그룹을 찾을 수 없습니다.");
      return;
    }
    if (
      await request("PATCH", {
        action: "bulk",
        bulkAction: action,
        ids: selected,
        groupId: target,
      })
    ) {
      setSelected([]);
    }
  }

  async function runBulk(action: "delete" | "receipt" | "reject") {
    if (!selected.length) return;
    if (action === "delete" && !window.confirm("선택한 자료를 정말 삭제하시겠습니까?")) return;
    if (
      await request("PATCH", {
        action: "bulk",
        bulkAction: action,
        ids: selected,
      })
    ) {
      setSelected([]);
    }
  }

  return (
    <>
      <div className={`btn_fixed_top ${styles.fixedActions}`}>
        <button className={styles.grayButton} type="button" disabled={busy} onClick={() => void runBulk("delete")}>
          선택삭제
        </button>
        <button className={styles.grayButton} type="button" disabled={busy} onClick={() => void runBulk("receipt")}>
          수신허용
        </button>
        <button className={styles.grayButton} type="button" disabled={busy} onClick={() => void runBulk("reject")}>
          수신거부
        </button>
        <button className={styles.grayButton} type="button" disabled={busy || !selected.length} onClick={() => void bulk("move")}>
          선택이동
        </button>
        <button className={styles.grayButton} type="button" disabled={busy || !selected.length} onClick={() => void bulk("copy")}>
          선택복사
        </button>
        <button className={styles.pinkButton} type="button" disabled={busy} onClick={() => openEditor()}>
          번호추가
        </button>
      </div>
      <div className={styles.summary}>
        <span className={styles.summaryPair}>
          <span>업데이트</span>
          <strong>{displayDateTime(state.syncState.lastSyncedAt)}</strong>
        </span>
        <span className={styles.summaryPair}>
          <span>건수</span>
          <strong>{totals.total}명</strong>
        </span>
        <span className={styles.summaryPair}>
          <span>회원</span>
          <strong>{totals.members}명</strong>
        </span>
        <span className={styles.summaryPair}>
          <span>비회원</span>
          <strong>{totals.nonMembers}명</strong>
        </span>
        <span className={styles.summaryPair}>
          <span>수신</span>
          <strong>{totals.receipt}명</strong>
        </span>
        <span className={styles.summaryPair}>
          <span>거부</span>
          <strong>{totals.reject}명</strong>
        </span>
      </div>
      <form
        className={styles.search}
        onSubmit={(event) => event.preventDefault()}
      >
        <select
          name="st"
          aria-label="검색대상"
          value={searchField}
          onChange={(event) =>
            setSearchField(
              event.currentTarget.value as "all" | "name" | "phone",
            )
          }
        >
          <option value="all">이름 + 휴대폰번호</option>
          <option value="name">이름</option>
          <option value="phone">휴대폰번호</option>
        </select>
        <input
          name="sv"
          type="text"
          required
          aria-label="검색어"
          className="frm_input"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
        <input
          className={styles.searchButton}
          type="submit"
          value="검색"
        />
      </form>
      <form
        className={styles.search}
        onSubmit={(event) => event.preventDefault()}
      >
        <select
          name="bg_no"
          aria-label="그룹명"
          value={groupId}
          onChange={(event) => setGroupId(event.currentTarget.value)}
        >
          <option value="">전체</option>
          <option value="none">
            미분류 (
            {state.phones.filter((phone) => !phone.groupId).length}명)
          </option>
          {state.phoneGroups.map((group) => (
            <option value={group.id} key={group.id}>
              {group.name} ({group.totalCount}명)
            </option>
          ))}
        </select>
        <label>
          <input
            type="checkbox"
            checked={onlyWithPhone}
            onChange={(event) =>
              setOnlyWithPhone(event.currentTarget.checked)
            }
          />{" "}
          휴대폰 소유자만 보기
        </label>
      </form>
      <form onSubmit={(event) => event.preventDefault()}>
        <div className="tbl_head01 tbl_wrap">
          <table className={`${styles.table} ${styles.phoneTable}`}>
          <caption>휴대폰번호 관리 목록</caption>
          <colgroup>
            <col style={{ width: 70 }} />
            <col style={{ width: 100 }} />
            <col style={{ width: 100 }} />
            <col style={{ width: 100 }} />
            <col style={{ width: 130 }} />
            <col style={{ width: 100 }} />
            <col style={{ width: 130 }} />
            <col style={{ width: 190 }} />
            <col />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">
                <span className="sound_only">현재 페이지 전체</span>
                <input
                  aria-label="현재 페이지 전체"
                  type="checkbox"
                  checked={filtered.length > 0 && selected.length === filtered.length}
                  onChange={(event) =>
                    setSelected(
                      event.currentTarget.checked
                        ? filtered.map((row) => row.id)
                        : [],
                    )
                  }
                />
              </th>
              <th scope="col">번호</th>
              <th scope="col">그룹</th>
              <th scope="col">이름</th>
              <th scope="col">휴대폰</th>
              <th scope="col">수신</th>
              <th scope="col">아이디</th>
              <th scope="col">업데이트</th>
              <th scope="col">관리</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row, index) => (
              <tr key={row.id}>
                <td>
                  <input
                    aria-label={`${row.name} 선택`}
                    type="checkbox"
                    checked={selected.includes(row.id)}
                    onChange={() => toggleId(row.id, selected, setSelected)}
                  />
                </td>
                <td>{filtered.length - index}</td>
                <td>{row.groupName}</td>
                <td>{row.name}</td>
                <td>{formatPhone(row.phone)}</td>
                <td style={{ color: row.receipt ? "blue" : "red" }}>
                  {row.receipt ? "수신" : "거부"}
                </td>
                <td>{row.memberId || "비회원"}</td>
                <td>{displayDateTime(row.updatedAt)}</td>
                <td>
                  <button className="btn btn_03" type="button" onClick={() => openEditor(row)}>
                    수정
                  </button>{" "}
                  <Link className="btn btn_02" href="/adm/tools/sms-send">
                    보내기
                  </Link>{" "}
                  <Link className="btn btn_02" href="/adm/tools/sms-history-number">
                    내역
                  </Link>
                </td>
              </tr>
            ))}
            {filtered.length === 0 ? (
              <tr style={{ height: 221.65625 }}>
                <td
                  className={`${styles.tableEmpty} ${styles.phoneTableEmpty} empty_table`}
                  colSpan={9}
                  style={{ height: 221.65625 }}
                >
                  데이터가 없습니다.
                </td>
              </tr>
            ) : null}
          </tbody>
          </table>
        </div>
      </form>
      {showEditor ? (
        <form className={styles.editor} onSubmit={save}>
          <h2 className={styles.editorTitle}>
            {editing ? "휴대폰번호 수정" : "휴대폰번호 추가"}
          </h2>
          <div className={styles.editorGrid}>
            <label htmlFor="phone-editor-group">그룹</label>
            <div>
              <select
                id="phone-editor-group"
                value={editorGroupId}
                onChange={(event) => setEditorGroupId(event.currentTarget.value)}
              >
                <option value="">미분류</option>
                {state.phoneGroups.map((group) => (
                  <option value={group.id} key={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </div>
            <label htmlFor="phone-editor-name">이름</label>
            <div>
              <input
                id="phone-editor-name"
                required
                value={name}
                onChange={(event) => setName(event.currentTarget.value)}
              />
            </div>
            <label htmlFor="phone-editor-phone">휴대폰</label>
            <div>
              <input
                id="phone-editor-phone"
                type="tel"
                required
                value={phone}
                onChange={(event) => setPhone(event.currentTarget.value)}
              />
            </div>
            <label htmlFor="phone-editor-receipt">수신</label>
            <div>
              <input
                id="phone-editor-receipt"
                type="checkbox"
                checked={receipt}
                onChange={(event) => setReceipt(event.currentTarget.checked)}
              />{" "}
              수신허용
            </div>
          </div>
          <div className={styles.editorActions}>
            {editing ? (
              <button
                className={styles.grayButton}
                type="button"
                onClick={() => {
                  if (window.confirm("이 번호를 삭제하시겠습니까?")) {
                    void request("DELETE", { id: editing.id }).then((ok) => {
                      if (ok) setShowEditor(false);
                    });
                  }
                }}
              >
                삭제
              </button>
            ) : null}
            <button className={styles.grayButton} type="button" onClick={() => setShowEditor(false)}>
              취소
            </button>
            <button className={styles.pinkButton} type="submit" disabled={busy}>
              저장
            </button>
          </div>
        </form>
      ) : null}
    </>
  );
}

function SmsPhoneFileScreen({ state, busy, request }: ScreenProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploadGroupId, setUploadGroupId] = useState("");
  const [downloadGroupId, setDownloadGroupId] = useState("");
  const [includeMissing, setIncludeMissing] = useState(false);
  const [hyphen, setHyphen] = useState(false);

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;
    const formData = new FormData();
    formData.set("csv", file);
    formData.set("upload_bg_no", uploadGroupId);
    await request("POST", undefined, formData);
  }

  function download(format: "xls" | "csv") {
    if (!downloadGroupId) {
      window.alert("다운로드 할 휴대폰번호 그룹을 선택해주세요.");
      return;
    }
    const parameters = new URLSearchParams({
      download: "1",
      group: downloadGroupId,
      format,
      no_hp: includeMissing ? "1" : "0",
      hyphen: hyphen ? "1" : "0",
    });
    window.location.assign(
      `/api/admin/sms/sms-phone-file?${parameters.toString()}`,
    );
  }

  return (
    <>
      <h2 className={styles.sectionTitle}>파일 업로드</h2>
      <div
        className={`local_desc01 local_desc ${styles.fileDescription}`}
      >
        <p>엑셀에 저장된 휴대폰번호 목록을 데이터베이스에 저장할 수 있습니다.</p>
        <p>
          엑셀에는 이름과 휴대폰번호 두개만 저장해주세요. 첫번째 라인부터
          저장됩니다.
          <br />※ 휴대폰번호에 하이픈(-)은 포함되어도 되고 포함되지 않아도
          됩니다.
        </p>
        <p>
          엑셀파일은 XLS( Excel 97 - 2003 통합 문서 ) 또는 CSV형식만 업로드
          할수 있습니다. (xlsx 불가)
          <br />
          <strong>
            CSV 저장방법 : 파일 &gt; 다른 이름으로 저장 &gt; 파일형식 : CSV
            (쉼표로 분리) (*.CSV)
          </strong>
        </p>
        <p>
          이 작업을 실행하기 전에{" "}
          <Link href="/adm/tools/sms-member-sync">회원정보업데이트</Link>를 먼저
          실행해주세요.
        </p>
      </div>
      <form
        className={styles.phoneFileUpload}
        id="sms5_fileup_frm"
        onSubmit={upload}
      >
        <div>
          <label htmlFor="upload-bg-no">그룹선택</label>{" "}
          <select
            id="upload-bg-no"
            name="upload_bg_no"
            value={uploadGroupId}
            onChange={(event) => setUploadGroupId(event.currentTarget.value)}
          >
            <option value="">
              미분류 (
              {state.phones.filter((phone) => !phone.groupId).length})
            </option>
            {state.phoneGroups.map((group) => (
              <option value={group.id} key={group.id}>
                {group.name} ({group.totalCount})
              </option>
            ))}
          </select>
        </div>
        <div className={styles.phoneFileUploadRow}>
          <label htmlFor="csv">파일선택</label>{" "}
          <input
            id="csv"
            name="csv"
            type="file"
            required
            accept=".xls,.csv,.tsv"
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              setFile(event.currentTarget.files?.[0] ?? null)
            }
          />{" "}
          <button className={styles.pinkButton} type="submit" disabled={busy || !file}>
            {busy ? "업로드 중" : "파일전송"}
          </button>
        </div>
      </form>
      <h2 className={styles.sectionTitle}>파일 다운로드</h2>
      <div
        className={`local_desc01 local_desc ${styles.fileDescription}`}
      >
        <p>
          저장된 휴대폰번호 목록을 엑셀(xls) 파일로 다운로드 할 수 있습니다.
          <br />
          다운로드 할 휴대폰번호 그룹을 선택해주세요.
        </p>
      </div>
      <div className="local_sch01 local_sch">
        <p className={styles.bookFileOptions}>
          <input
            type="checkbox"
            id="no-hp"
            checked={includeMissing}
            onChange={(event) =>
              setIncludeMissing(event.currentTarget.checked)
            }
          />{" "}
          <label htmlFor="no-hp">휴대폰 번호 없는 회원 포함</label>
          <br />
          <input
            type="checkbox"
            id="hyphen"
            checked={hyphen}
            onChange={(event) => setHyphen(event.currentTarget.checked)}
          />{" "}
          <label htmlFor="hyphen">하이픈 &apos;-&apos; 포함</label>
        </p>
        <label htmlFor="download-bg-no">그룹선택</label>
        <select
          id="download-bg-no"
          value={downloadGroupId}
          onChange={(event) => setDownloadGroupId(event.currentTarget.value)}
        >
          <option value="" />
          <option value="all">전체</option>
          <option value="none">
            미분류 (
            {state.phones.filter((phone) => !phone.groupId).length})
          </option>
          {state.phoneGroups.map((group) => (
            <option value={group.id} key={group.id}>
              {group.name} ({group.totalCount})
            </option>
          ))}
        </select>
        <button className={styles.pinkButton} type="button" onClick={() => download("xls")}>
          다운로드
        </button>
      </div>
      <iframe className={styles.hiddenFileFrame} title="파일 다운로드" />
    </>
  );
}

interface ScreenProps {
  state: SmsAdminState;
  busy: boolean;
  request(
    method: "POST" | "PATCH" | "DELETE",
    body?: unknown,
    formData?: FormData,
  ): Promise<boolean>;
}

function FeedbackMessage({ feedback }: { feedback: Feedback }) {
  if (!feedback.message) return null;
  return (
    <div
      className={`${styles.status}${feedback.failed ? ` ${styles.statusError}` : ""}`}
      role={feedback.failed ? "alert" : "status"}
    >
      {feedback.message}
    </div>
  );
}

function StatusBadge({ status }: { status: SmsQueueStatus }) {
  const label: Record<SmsQueueStatus, string> = {
    waiting_provider: "공급사 대기",
    queued: "전송 대기",
    sent: "성공",
    failed: "실패",
    cancelled: "취소",
  };
  const statusClass: Record<SmsQueueStatus, string> = {
    waiting_provider: styles.badgeWaiting,
    queued: styles.badgeQueued,
    sent: styles.badgeSent,
    failed: styles.badgeFailed,
    cancelled: styles.badgeCancelled,
  };
  return (
    <span className={`${styles.badge} ${statusClass[status]}`}>
      {label[status]}
    </span>
  );
}

function MoveSelect({
  currentId,
  groups,
  onMove,
}: {
  currentId: string;
  groups: (SmsPhoneGroup | SmsTemplateGroup)[];
  onMove(targetGroupId: string | null): void;
}) {
  return (
    <select
      className={styles.moveSelect}
      aria-label="이동할 그룹"
      defaultValue=""
      onChange={(event) => {
        const value = event.currentTarget.value;
        if (!value) return;
        if (window.confirm("그룹에 속한 모든 데이터를 이동하시겠습니까?")) {
          onMove(value === "none" ? null : value);
        }
        event.currentTarget.value = "";
      }}
    >
      <option value="" />
      <option value="none">미분류</option>
      {groups
        .filter((group) => group.id !== currentId)
        .map((group) => (
          <option value={group.id} key={group.id}>
            {group.name}
          </option>
        ))}
    </select>
  );
}

function toggleId(
  id: string,
  selected: string[],
  setSelected: (value: string[]) => void,
) {
  setSelected(
    selected.includes(id)
      ? selected.filter((value) => value !== id)
      : [...selected, id],
  );
}

function phoneGroupSummary(phones: SmsPhone[]) {
  return {
    total: phones.length,
    members: phones.filter((phone) => phone.memberId).length,
    nonMembers: phones.filter((phone) => !phone.memberId).length,
    receipt: phones.filter((phone) => phone.receipt).length,
    reject: phones.filter((phone) => !phone.receipt).length,
  };
}

function formatPhone(phone: string): string {
  const normalized = phone.replace(/\D/gu, "");
  if (normalized.length === 11) {
    return `${normalized.slice(0, 3)}-${normalized.slice(3, 7)}-${normalized.slice(7)}`;
  }
  if (normalized.length === 10) {
    return `${normalized.slice(0, 3)}-${normalized.slice(3, 6)}-${normalized.slice(6)}`;
  }
  return phone;
}

function displayDateTime(value: string | null): string {
  if (!value) return "";
  const date = new Date(value.endsWith("Z") ? value : `${value.replace(" ", "T")}Z`);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(date)
    .replace(/\.\s?/gu, "-")
    .replace(/-\s/gu, " ")
    .replace(/-$/u, "");
}

function displayDate(value: string): string {
  return displayDateTime(value).slice(0, 10);
}
