"use client";

import { useEffect } from "react";

const supportedContentIds = new Set(["provision", "privacy", "noemail"]);

export default function LegacyContentPage() {
  useEffect(() => {
    const rawId = new URLSearchParams(window.location.search).get("co_id");
    const contentId =
      rawId && supportedContentIds.has(rawId) ? rawId : "provision";
    window.location.replace(`/page/?pid=${encodeURIComponent(contentId)}`);
  }, []);

  return (
    <main className="simple-form-page">
      <div className="empty-card">이용안내 페이지로 이동하고 있습니다.</div>
    </main>
  );
}
