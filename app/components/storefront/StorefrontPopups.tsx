"use client";

import { useEffect, useState, type CSSProperties } from "react";
import type { StorefrontPopupLayer } from "@/lib/storefront-admin-tools";
import styles from "./StorefrontPopups.module.css";

const STORAGE_PREFIX = "kiel-storefront-popup:";

export function StorefrontPopups({
  popups,
}: {
  popups: readonly StorefrontPopupLayer[];
}) {
  const [visibleIds, setVisibleIds] = useState<Set<string> | null>(null);
  const [mobileViewport, setMobileViewport] = useState<boolean | null>(null);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const refresh = () => setMobileViewport(media.matches);
    refresh();
    media.addEventListener("change", refresh);
    return () => media.removeEventListener("change", refresh);
  }, []);

  useEffect(() => {
    if (mobileViewport === null) return;
    const timer = window.setTimeout(() => {
      setVisibleIds(
        new Set(
          popups
            .filter(
              (popup) =>
                deviceMatches(popup.device, mobileViewport) &&
                !isPopupDismissed(popup),
            )
            .map((popup) => popup.id),
        ),
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [mobileViewport, popups]);

  if (!visibleIds || visibleIds.size === 0) return null;

  function close(id: string) {
    setVisibleIds((current) => {
      const next = new Set(current ?? []);
      next.delete(id);
      return next;
    });
  }

  function hideForConfiguredTime(popup: StorefrontPopupLayer) {
    try {
      window.localStorage.setItem(
        storageKey(popup),
        String(Date.now() + popup.disableHours * 60 * 60 * 1_000),
      );
    } catch {
      // Privacy modes can disable storage. The popup is still hidden this session.
    }
    close(popup.id);
  }

  return (
    <aside className={styles.stack} aria-label="알림 팝업">
      {popups
        .filter((popup) => visibleIds.has(popup.id))
        .map((popup) => {
          const titleId = `storefront-popup-title-${popup.id}`;
          return (
            <section
              className={styles.popup}
              key={popup.id}
              role="dialog"
              aria-modal="false"
              aria-labelledby={titleId}
              style={
                {
                  "--popup-left": `${popup.left}px`,
                  "--popup-top": `${popup.top}px`,
                  "--popup-width": `${popup.width}px`,
                  "--popup-height": `${popup.height}px`,
                } as CSSProperties
              }
            >
              <header className={styles.header}>
                <h2 id={titleId}>{popup.title}</h2>
                <button
                  className={styles.closeButton}
                  type="button"
                  aria-label={`${popup.title} 닫기`}
                  onClick={() => close(popup.id)}
                >
                  ×
                </button>
              </header>
              <div className={styles.content}>
                <p>{popup.content}</p>
                {popup.href ? (
                  <a className={styles.link} href={popup.href}>
                    자세히 보기
                  </a>
                ) : null}
              </div>
              <footer className={styles.footer}>
                <button
                  type="button"
                  onClick={() => hideForConfiguredTime(popup)}
                >
                  {popup.disableHours === 24
                    ? "오늘 하루 보지 않기"
                    : `${popup.disableHours.toLocaleString("ko-KR")}시간 동안 보지 않기`}
                </button>
                <button type="button" onClick={() => close(popup.id)}>
                  닫기
                </button>
              </footer>
            </section>
          );
        })}
    </aside>
  );
}

function storageKey(popup: StorefrontPopupLayer): string {
  return `${STORAGE_PREFIX}${popup.dismissKey}`;
}

function isPopupDismissed(popup: StorefrontPopupLayer): boolean {
  try {
    const stored = window.localStorage.getItem(storageKey(popup));
    if (!stored) return false;
    const expiration = Number(stored);
    if (Number.isFinite(expiration)) return expiration > Date.now();
    return stored === koreaDateKey();
  } catch {
    return false;
  }
}

function deviceMatches(
  device: StorefrontPopupLayer["device"],
  mobileViewport: boolean,
): boolean {
  return (
    device === "both" ||
    (device === "mobile" && mobileViewport) ||
    (device === "pc" && !mobileViewport)
  );
}

function koreaDateKey(): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
