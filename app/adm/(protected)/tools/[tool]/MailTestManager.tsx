"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import type {
  AdminMailTestRun,
  AdminMailTestState,
} from "@/lib/admin-mail";
import styles from "./mail-test.module.css";

interface MailApiResult {
  ok?: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
  run?: AdminMailTestRun;
}

export function MailTestManager({
  initialState,
}: {
  initialState: AdminMailTestState;
}) {
  const [runs, setRuns] = useState(initialState.runs);
  const [recipient, setRecipient] = useState("");
  const [subject, setSubject] = useState("KIEL GOLD 테스트 메일");
  const [body, setBody] = useState(
    "관리자 메일 공급자 연결을 확인하기 위한 테스트 메일입니다.",
  );
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const unavailableHandled = useRef(false);

  useEffect(() => {
    if (initialState.providerConfigured || unavailableHandled.current) return;
    unavailableHandled.current = true;
    window.alert(initialState.configurationMessage);
    window.location.replace("/adm");
  }, [
    initialState.configurationMessage,
    initialState.providerConfigured,
  ]);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending || !initialState.providerConfigured) return;
    setSending(true);
    setMessage("");
    setFailed(false);
    setErrors({});
    try {
      const response = await fetch("/api/admin/mail-test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          recipient,
          subject,
          message: body,
        }),
      });
      const result = (await response.json()) as MailApiResult;
      if (response.status === 401) {
        window.location.assign("/adm/login");
        return;
      }
      if (!response.ok || !result.run) {
        setFailed(true);
        setErrors(result.fieldErrors ?? {});
        setMessage(result.message ?? "테스트 메일을 보내지 못했습니다.");
        return;
      }
      setRuns((current) => [result.run!, ...current].slice(0, 50));
      setMessage("메일 공급자가 테스트 메일 전송을 승인했습니다.");
    } catch {
      setFailed(true);
      setMessage("네트워크 상태를 확인한 뒤 다시 시도해 주세요.");
    } finally {
      setSending(false);
    }
  }

  if (!initialState.providerConfigured) {
    return (
      <p className="sound_only" role="status">
        {initialState.configurationMessage}
      </p>
    );
  }

  return (
    <>
      <div
        className="local_desc01 local_desc"
      >
        <p>
          {initialState.providerName} 공급자가 연결되어 있습니다. 발신 주소:{" "}
          {initialState.fromAddress}
        </p>
      </div>

      <form className={styles.form} onSubmit={send}>
        <div className="tbl_frm01 tbl_wrap">
          <table>
            <caption>테스트 메일 전송</caption>
            <tbody>
              <tr>
                <th scope="row">
                  <label htmlFor="mail-test-recipient">수신 주소</label>
                </th>
                <td>
                  <input
                    id="mail-test-recipient"
                    type="email"
                    className="frm_input"
                    value={recipient}
                    onChange={(event) =>
                      setRecipient(event.currentTarget.value)
                    }
                    maxLength={254}
                    required
                  />
                  {errors.recipient ? (
                    <span className={styles.error}>{errors.recipient}</span>
                  ) : null}
                </td>
              </tr>
              <tr>
                <th scope="row">
                  <label htmlFor="mail-test-subject">제목</label>
                </th>
                <td>
                  <input
                    id="mail-test-subject"
                    className="frm_input"
                    value={subject}
                    onChange={(event) =>
                      setSubject(event.currentTarget.value)
                    }
                    maxLength={200}
                    required
                  />
                  {errors.subject ? (
                    <span className={styles.error}>{errors.subject}</span>
                  ) : null}
                </td>
              </tr>
              <tr>
                <th scope="row">
                  <label htmlFor="mail-test-body">본문</label>
                </th>
                <td>
                  <textarea
                    id="mail-test-body"
                    value={body}
                    onChange={(event) => setBody(event.currentTarget.value)}
                    maxLength={5_000}
                    required
                  />
                  {errors.message ? (
                    <span className={styles.error}>{errors.message}</span>
                  ) : null}
                </td>
              </tr>
            </tbody>
          </table>
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
        <div className={styles.actions}>
          <button
            className="btn btn_03"
            type="submit"
            disabled={sending}
          >
            {sending
              ? "전송 확인 중..."
              : "테스트 메일 보내기"}
          </button>
        </div>
      </form>

      <div className="tbl_head01 tbl_wrap">
        <table>
          <caption>실제 메일 전송 시도 기록</caption>
          <thead>
            <tr>
              <th scope="col">전송 시각</th>
              <th scope="col">수신 주소</th>
              <th scope="col">제목</th>
              <th scope="col">공급자</th>
              <th scope="col">결과</th>
            </tr>
          </thead>
          <tbody>
            {runs.length > 0 ? (
              runs.map((run) => (
                <tr key={run.id}>
                  <td>{formatDate(run.createdAt)}</td>
                  <td>{run.recipient}</td>
                  <td>{run.subject}</td>
                  <td>{run.provider}</td>
                  <td>
                    {run.status === "sent" ? "공급자 승인" : "실패"}
                    {run.errorMessage ? (
                      <small className={styles.runError}>
                        {run.errorMessage}
                      </small>
                    ) : null}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td className={styles.empty} colSpan={5}>
                  실제 전송 시도 기록이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "-"
    : date.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}
