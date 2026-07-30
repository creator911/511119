"use client";

import { useState } from "react";
import type { CouponZoneRecord } from "@/lib/commerce-promotions";

interface ClaimedCoupon {
  code: string;
  alreadyClaimed: boolean;
}

interface ClaimResponse {
  error?: string;
  code?: string;
  alreadyClaimed?: boolean;
}

export function CouponZoneClient({
  initialCoupons,
}: {
  initialCoupons: CouponZoneRecord[];
}) {
  const [claims, setClaims] = useState<Record<string, ClaimedCoupon>>({});
  const [pendingId, setPendingId] = useState("");
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);

  async function claim(coupon: CouponZoneRecord) {
    if (pendingId) return;
    setPendingId(coupon.id);
    setMessage("");
    setFailed(false);
    try {
      const response = await fetch(
        `/api/customer/coupons/${encodeURIComponent(coupon.id)}/claim`,
        { method: "POST" },
      );
      const result = (await response.json()) as ClaimResponse;
      if (response.status === 401) {
        window.location.assign(
          "/bbs/login.php?return_url=%2Fshop%2Fcouponzone.php",
        );
        return;
      }
      if (!response.ok || !result.code) {
        setFailed(true);
        setMessage(result.error ?? "쿠폰을 다운로드하지 못했습니다.");
        return;
      }
      setClaims((current) => ({
        ...current,
        [coupon.id]: {
          code: result.code!,
          alreadyClaimed: Boolean(result.alreadyClaimed),
        },
      }));
      setMessage(
        result.alreadyClaimed
          ? "이미 다운로드한 쿠폰코드를 확인했습니다."
          : "쿠폰을 다운로드했습니다. 주문서에서 쿠폰코드를 입력해 주세요.",
      );
    } catch {
      setFailed(true);
      setMessage("네트워크 상태를 확인한 뒤 다시 시도해 주세요.");
    } finally {
      setPendingId("");
    }
  }

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setFailed(false);
      setMessage("쿠폰코드를 복사했습니다.");
    } catch {
      setFailed(true);
      setMessage(`쿠폰코드 ${code}를 직접 복사해 주세요.`);
    }
  }

  return (
    <>
      {message ? (
        <p
          className={`coupon-zone-message ${
            failed ? "coupon-zone-message-error" : ""
          }`}
          role={failed ? "alert" : "status"}
        >
          {message}
        </p>
      ) : null}
      {initialCoupons.length ? (
        <div className="coupon-zone-grid">
          {initialCoupons.map((coupon) => {
            const claimResult = claims[coupon.id];
            return (
              <article className="coupon-zone-card" key={coupon.id}>
                <div className="coupon-zone-ticket">
                  <span>COUPON</span>
                  <strong>{couponValue(coupon)}</strong>
                </div>
                <div className="coupon-zone-card-copy">
                  <h3>{coupon.name}</h3>
                  <p>
                    {coupon.minimumOrder > 0
                      ? `${coupon.minimumOrder.toLocaleString("ko-KR")}원 이상 구매 시`
                      : "최소 주문금액 제한 없음"}
                  </p>
                  <p>{periodLabel(coupon.startsAt, coupon.endsAt)}</p>
                  {claimResult ? (
                    <div className="coupon-zone-code">
                      <code>{claimResult.code}</code>
                      <button
                        type="button"
                        onClick={() => void copyCode(claimResult.code)}
                      >
                        코드 복사
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="coupon-zone-download"
                      disabled={Boolean(pendingId)}
                      onClick={() => void claim(coupon)}
                    >
                      {pendingId === coupon.id
                        ? "다운로드 중…"
                        : "쿠폰 다운로드"}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="coupon-empty-state">
          사용할 수 있는 쿠폰이 없습니다.
        </div>
      )}
    </>
  );
}

function couponValue(coupon: CouponZoneRecord): string {
  return coupon.type === "percent"
    ? `${coupon.amount.toLocaleString("ko-KR")}%`
    : `${coupon.amount.toLocaleString("ko-KR")}원`;
}

function periodLabel(startsAt: string, endsAt: string): string {
  if (!startsAt && !endsAt) return "사용기한 제한 없음";
  return `${startsAt || "즉시"} ~ ${endsAt || "별도 안내 시"}`;
}
