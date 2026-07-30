"use client";

import { useEffect } from "react";

export default function LegacyOrderDetailPage() {
  useEffect(() => {
    const orderId = String(
      new URLSearchParams(window.location.search).get("od_id") ?? "",
    )
      .trim()
      .slice(0, 80);
    window.location.replace(
      orderId
        ? `/shop/orderinquiry.php?order_id=${encodeURIComponent(orderId)}`
        : "/shop/orderinquiry.php",
    );
  }, []);

  return (
    <main className="simple-form-page">
      <div className="empty-card">주문조회 페이지로 이동하고 있습니다.</div>
    </main>
  );
}
