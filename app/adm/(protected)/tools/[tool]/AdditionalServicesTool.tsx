"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import type { LegacyAdminToolDefinition } from "@/lib/admin-tool-catalog";
import styles from "./additional-services.module.css";

interface SettingsResult {
  message?: string;
  fieldErrors?: Record<string, string>;
  settings?: Record<string, string | number | boolean>;
}

const serviceCards = [
  {
    id: "payment",
    title: "결제 서비스",
    description:
      "결제수단과 주문 결제 설정은 새 사이트 쇼핑몰 설정에서 관리합니다.",
    status: "새 사이트 결제 설정",
    href: "/adm/settings?view=shop",
    linkLabel: "결제 설정",
  },
  {
    id: "identity",
    title: "본인확인 서비스",
    description:
      "회원 본인확인은 별도 공급자 계정을 연결한 뒤 사용할 수 있습니다.",
    status: "공급자 연동 전",
    href: "/adm/settings",
    linkLabel: "본인확인 설정",
  },
] as const;

export function AdditionalServicesTool({
  definition,
  initialSettings,
}: {
  definition: LegacyAdminToolDefinition;
  initialSettings: Record<string, string | number | boolean>;
}) {
  const [enabled, setEnabled] = useState(initialSettings.enabled !== false);
  const [memo, setMemo] = useState(
    typeof initialSettings.memo === "string" ? initialSettings.memo : "",
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setMessage("");
    setFailed(false);
    try {
      const response = await fetch(`/api/admin/tools/${definition.slug}`, {
        method: "PATCH",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ enabled, memo }),
      });
      const result = (await response.json().catch(() => null)) as
        | SettingsResult
        | null;
      if (response.status === 401) {
        window.location.assign("/adm/login");
        return;
      }
      if (!response.ok || !result?.settings) {
        throw new Error(
          result?.message ??
            Object.values(result?.fieldErrors ?? {})[0] ??
            "부가서비스 설정을 저장하지 못했습니다.",
        );
      }
      setEnabled(result.settings.enabled !== false);
      setMemo(
        typeof result.settings.memo === "string" ? result.settings.memo : "",
      );
      setMessage("부가서비스 운영 설정을 저장했습니다.");
      setSettingsOpen(false);
    } catch (cause) {
      setFailed(true);
      setMessage(
        cause instanceof Error
          ? cause.message
          : "부가서비스 설정을 저장하지 못했습니다.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={`local_desc01 local_desc ${styles.notice}`}>
        <p>
          필요한 부가서비스를 선택하여 새 사이트의 해당 설정 화면에서
          연결하세요. 기존 키엘골드 서버나 도메인으로 연결되지 않습니다.
        </p>
      </div>

      <div className={styles.grid}>
        {serviceCards.map((service) => (
          <section
            className={`${styles.card} ${
              service.id === "payment"
                ? styles.paymentCard
                : styles.identityCard
            }`}
            key={service.title}
          >
            <h2>{service.title}</h2>
            <p>{service.description}</p>
            <strong>{service.status}</strong>
            <Link className="btn btn_03" href={service.href}>
              {service.linkLabel}
            </Link>
          </section>
        ))}
        <section className={`${styles.card} ${styles.smsCard}`}>
          <h2>SMS 서비스</h2>
          <p>
            문자 발신번호와 공급자 연결 상태, 발송 이력은 새 사이트 SMS
            설정에서 관리합니다.
          </p>
          <strong>로컬 설정 확인</strong>
          <Link className="btn btn_03" href="/adm/tools/sms-settings">
            SMS 설정
          </Link>
          <button
            className={styles.manageCtl}
            type="button"
            onClick={() => setSettingsOpen(true)}
          >
            운영설정
          </button>
        </section>
      </div>

      {message ? (
        <p
          className={failed ? styles.error : styles.success}
          role={failed ? "alert" : "status"}
        >
          {message}
        </p>
      ) : null}
      {settingsOpen ? (
        <div
          className={styles.dialogOverlay}
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setSettingsOpen(false);
          }}
        >
          <form
            className={styles.operation}
            role="dialog"
            aria-modal="true"
            aria-labelledby="additional-services-dialog-title"
            onSubmit={save}
            onKeyDown={(event) => {
              if (event.key === "Escape") setSettingsOpen(false);
            }}
          >
            <h2 id="additional-services-dialog-title">
              부가서비스 운영 설정
            </h2>
            <label className={styles.useChoice}>
              <input
                type="checkbox"
                checked={enabled}
                onChange={(event) => setEnabled(event.currentTarget.checked)}
              />
              연결된 부가서비스 기능 사용
            </label>
            <label className={styles.memoLabel}>
              <span>운영 메모</span>
              <textarea
                className="frm_input"
                value={memo}
                maxLength={5_000}
                onChange={(event) => setMemo(event.currentTarget.value)}
              />
            </label>
            <div className={styles.dialogActions}>
              <button
                className="btn btn_02"
                type="button"
                onClick={() => setSettingsOpen(false)}
              >
                취소
              </button>
              <button
                className="btn_submit btn"
                type="submit"
                disabled={saving}
              >
                {saving ? "저장 중" : "확인"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
