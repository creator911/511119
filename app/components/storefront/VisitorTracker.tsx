"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

const visitorStorageKey = "kiel-visitor-id-v1";
const recordedPrefix = "kiel-visit-recorded-v1:";

export function VisitorTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (
      !pathname ||
      pathname.startsWith("/adm") ||
      pathname.startsWith("/api")
    ) {
      return;
    }
    try {
      let visitorId = sessionStorage.getItem(visitorStorageKey);
      if (!visitorId) {
        visitorId = crypto.randomUUID().replace(/-/gu, "");
        sessionStorage.setItem(visitorStorageKey, visitorId);
      }
      const day = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Seoul",
      }).format(new Date());
      const recordedKey = `${recordedPrefix}${day}:${pathname}`;
      if (sessionStorage.getItem(recordedKey)) return;
      sessionStorage.setItem(recordedKey, "1");
      void fetch("/api/visits", {
        method: "POST",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visitorId, pathname }),
      }).catch(() => {
        sessionStorage.removeItem(recordedKey);
      });
    } catch {
      // 방문 통계 실패가 쇼핑 기능을 방해하지 않도록 조용히 건너뜁니다.
    }
  }, [pathname]);

  return null;
}
