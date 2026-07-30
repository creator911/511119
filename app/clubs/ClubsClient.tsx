"use client";

import {
  useEffect,
  useState,
  type FormEvent,
} from "react";
import type {
  Club,
  ClubSettings,
} from "@/lib/clubs";
import styles from "./clubs.module.css";

interface ClubApiState {
  ok?: boolean;
  message?: string;
  settings?: ClubSettings;
  clubs?: Club[];
  applications?: Club[];
  viewer?: {
    authenticated: boolean;
    name?: string;
  };
  club?: Club;
}

export function ClubsClient({
  initialClubs,
  initialSettings,
}: {
  initialClubs: Club[];
  initialSettings: ClubSettings;
}) {
  const [clubs, setClubs] = useState(initialClubs);
  const [settings, setSettings] = useState(initialSettings);
  const [applications, setApplications] = useState<Club[]>([]);
  const [viewer, setViewer] = useState<ClubApiState["viewer"]>();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [contact, setContact] = useState("");
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch("/api/clubs", { cache: "no-store" })
      .then(async (response) => {
        const result = (await response.json()) as ClubApiState;
        if (!active || !response.ok) return;
        setClubs(result.clubs ?? []);
        setSettings(result.settings ?? initialSettings);
        setApplications(result.applications ?? []);
        setViewer(result.viewer);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [initialSettings]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setMessage("");
    setFailed(false);
    try {
      const response = await fetch("/api/clubs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, description, contact }),
      });
      const result = (await response.json()) as ClubApiState;
      if (!response.ok || !result.club) {
        setFailed(true);
        setMessage(result.message ?? "동호회 신청을 접수하지 못했습니다.");
        return;
      }
      setApplications((current) => [result.club!, ...current]);
      if (result.club.status === "approved") {
        setClubs((current) => [result.club!, ...current]);
      }
      setName("");
      setDescription("");
      setContact("");
      setMessage(
        result.club.status === "approved"
          ? "동호회가 개설되었습니다."
          : "동호회 개설 신청이 접수되었습니다.",
      );
    } catch {
      setFailed(true);
      setMessage("네트워크 상태를 확인한 뒤 다시 시도해 주세요.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <section aria-labelledby="approved-clubs-heading">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>COMMUNITY CLUBS</p>
            <h2 id="approved-clubs-heading">승인된 동호회</h2>
          </div>
          <span className={styles.count}>{clubs.length}개</span>
        </div>
        {clubs.length > 0 ? (
          <div className={styles.grid}>
            {clubs.map((club) => (
              <article className={styles.card} key={club.id}>
                <h3>{club.name}</h3>
                <p>{club.description}</p>
                <dl>
                  <div>
                    <dt>운영자</dt>
                    <dd>{club.ownerName}</dd>
                  </div>
                  {club.contact ? (
                    <div>
                      <dt>연락처</dt>
                      <dd>{club.contact}</dd>
                    </div>
                  ) : null}
                </dl>
              </article>
            ))}
          </div>
        ) : (
          <div className={styles.empty}>현재 승인된 동호회가 없습니다.</div>
        )}
      </section>

      <section className={styles.application} aria-labelledby="club-apply-heading">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>OPEN A CLUB</p>
            <h2 id="club-apply-heading">동호회 개설 신청</h2>
          </div>
        </div>
        {!settings.enabled ? (
          <div className={styles.notice}>
            현재 관리자가 동호회 개설 신청을 받지 않고 있습니다.
          </div>
        ) : viewer === undefined ? (
          <div className={styles.notice}>회원 상태를 확인하고 있습니다.</div>
        ) : viewer?.authenticated === false ? (
          <div className={styles.notice}>
            회원 로그인 후 신청할 수 있습니다.{" "}
            <a href="/bbs/login.php?url=%2Fclubs">로그인</a>
          </div>
        ) : (
          <form className={styles.form} onSubmit={submit}>
            <p className={styles.formHelp}>
              회원 레벨 {settings.minimumLevel} 이상부터 신청할 수 있으며,
              {settings.approvalRequired
                ? " 관리자 승인 후 공개됩니다."
                : " 신청 즉시 공개됩니다."}
            </p>
            <label>
              동호회 이름
              <input
                value={name}
                onChange={(event) => setName(event.currentTarget.value)}
                maxLength={100}
                required
              />
            </label>
            <label>
              동호회 소개
              <textarea
                value={description}
                onChange={(event) => setDescription(event.currentTarget.value)}
                maxLength={2_000}
                rows={5}
                required
              />
            </label>
            <label>
              연락 방법
              <input
                value={contact}
                onChange={(event) => setContact(event.currentTarget.value)}
                maxLength={200}
                placeholder="공개 가능한 연락처 또는 안내"
              />
            </label>
            {message ? (
              <p
                className={failed ? styles.error : styles.success}
                role="status"
              >
                {message}
              </p>
            ) : null}
            <button type="submit" disabled={submitting}>
              {submitting ? "접수 중..." : "개설 신청"}
            </button>
          </form>
        )}
        {applications.length > 0 ? (
          <div className={styles.myApplications}>
            <h3>내 신청 내역</h3>
            <ul>
              {applications.map((club) => (
                <li key={club.id}>
                  <span>{club.name}</span>
                  <strong>{statusLabel(club.status)}</strong>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>
    </>
  );
}

function statusLabel(status: Club["status"]): string {
  if (status === "approved") return "승인";
  if (status === "rejected") return "반려";
  return "심사 중";
}
