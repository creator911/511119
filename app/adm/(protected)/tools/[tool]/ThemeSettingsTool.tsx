"use client";

import { useState } from "react";
import type { LegacyAdminToolDefinition } from "@/lib/admin-tool-catalog";
import styles from "./theme-settings.module.css";

interface ThemeCard {
  id: "basic" | "eb4_basic";
  name: string;
  image: string;
  naturalSize: string;
}

interface SettingsResult {
  message?: string;
  fieldErrors?: Record<string, string>;
  settings?: Record<string, string | number | boolean>;
}

const themes: readonly ThemeCard[] = [
  {
    id: "basic",
    name: "베이직",
    image: "/adm-assets/themes/basic.png",
    naturalSize: "600 × 460",
  },
  {
    id: "eb4_basic",
    name: "Everyday - Responsive",
    image: "/adm-assets/themes/eb4_basic.png",
    naturalSize: "600 × 435",
  },
];

export function ThemeSettingsTool({
  definition,
  initialSettings,
}: {
  definition: LegacyAdminToolDefinition;
  initialSettings: Record<string, string | number | boolean>;
}) {
  const [activeTheme, setActiveTheme] = useState<ThemeCard["id"]>(() =>
    initialSettings.theme === "eb4_basic" ||
    initialSettings.theme === "kiel-mobile"
      ? "eb4_basic"
      : "basic",
  );
  const [savingTheme, setSavingTheme] = useState<ThemeCard["id"] | null>(null);
  const [detailTheme, setDetailTheme] = useState<ThemeCard | null>(null);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);

  async function applyTheme(theme: ThemeCard) {
    if (savingTheme) return;
    if (
      !window.confirm(`"${theme.name}" 테마를 적용하시겠습니까?`)
    ) {
      return;
    }
    setSavingTheme(theme.id);
    setMessage("");
    setFailed(false);
    try {
      const response = await fetch(`/api/admin/tools/${definition.slug}`, {
        method: "PATCH",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...initialSettings,
          theme: theme.id,
          primaryColor:
            typeof initialSettings.primaryColor === "string"
              ? initialSettings.primaryColor
              : "#3949ab",
          enabled: true,
        }),
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
            "테마를 적용하지 못했습니다.",
        );
      }
      setActiveTheme(theme.id);
      setMessage(`${theme.name} 테마를 적용했습니다.`);
    } catch (cause) {
      setFailed(true);
      setMessage(
        cause instanceof Error
          ? cause.message
          : "테마를 적용하지 못했습니다.",
      );
    } finally {
      setSavingTheme(null);
    }
  }

  function showDetails(theme: ThemeCard) {
    setDetailTheme(theme);
  }

  function preview(theme: ThemeCard) {
    const previewWindow = window.open(
      `/?theme_preview=${encodeURIComponent(theme.id)}`,
      `kiel_theme_preview_${theme.id}`,
    );
    if (!previewWindow) {
      setFailed(true);
      setMessage("미리보기 창을 열 수 없습니다. 팝업 허용 여부를 확인해 주세요.");
    } else {
      previewWindow.opener = null;
    }
  }

  return (
    <>
      <section id="theme_list" className={styles.themeList}>
        <h2 className="sound_only">테마 목록</h2>
        <div className={styles.grid}>
          {themes.map((theme) => (
            <article
              className={styles.card}
              data-active={activeTheme === theme.id ? "true" : "false"}
              key={theme.id}
            >
              <div className={styles.info}>
                {/* Original theme screenshots are copied locally; no old-domain request occurs. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={theme.image} alt={`${theme.name} 테마 미리보기`} />
                <strong>{theme.name}</strong>
              </div>
              <div className={styles.actions}>
                <button
                  className={styles.applyCtl}
                  type="button"
                  disabled={savingTheme !== null}
                  onClick={() => void applyTheme(theme)}
                >
                  테마적용
                </button>
                <button
                  className={styles.previewCtl}
                  type="button"
                  onClick={() => preview(theme)}
                >
                  미리보기
                </button>
                <button
                  className={styles.detailCtl}
                  type="button"
                  onClick={() => showDetails(theme)}
                >
                  상세보기
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
      <p
        className="sound_only"
        aria-live="polite"
        data-failed={failed ? "true" : "false"}
      >
        {message}
      </p>
      {detailTheme ? (
        <div
          className={styles.detailOverlay}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setDetailTheme(null);
          }}
        >
          <section
            className={styles.detailDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="legacy-theme-detail-title"
            onKeyDown={(event) => {
              if (event.key === "Escape") setDetailTheme(null);
            }}
          >
            <header>
              <h2 id="legacy-theme-detail-title">{detailTheme.name}</h2>
              <button
                className={styles.closeCtl}
                type="button"
                aria-label="테마 상세보기 닫기"
                autoFocus
                onClick={() => setDetailTheme(null)}
              >
                ×
              </button>
            </header>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={detailTheme.image}
              alt={`${detailTheme.name} 테마 전체 화면`}
            />
            <dl>
              <div>
                <dt>테마명</dt>
                <dd>{detailTheme.name}</dd>
              </div>
              <div>
                <dt>스크린샷</dt>
                <dd>{detailTheme.naturalSize}</dd>
              </div>
              <div>
                <dt>지원 화면</dt>
                <dd>PC · 모바일</dd>
              </div>
            </dl>
          </section>
        </div>
      ) : null}
    </>
  );
}
