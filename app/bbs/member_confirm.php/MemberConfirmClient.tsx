"use client";

import { useEffect, useState, type FormEvent } from "react";

export function MemberConfirmClient() {
  const [loginId, setLoginId] = useState("");
  const [name, setName] = useState("회원");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("회원 정보를 확인하는 중입니다.");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void fetch("/api/customer/session", { cache: "no-store" })
      .then(async (response) => {
        const result = (await response.json()) as {
          user?: { loginId?: string; name?: string };
        };
        if (!result.user?.loginId) {
          window.location.assign(
            `/bbs/login.php?return_url=${encodeURIComponent(
              window.location.pathname + window.location.search,
            )}`,
          );
          return;
        }
        setLoginId(result.user.loginId);
        setName(result.user.name || "회원");
        setMessage("");
      })
      .catch(() =>
        setMessage("회원 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."),
      );
  }, []);

  async function confirmPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!loginId || !password || submitting) return;
    setSubmitting(true);
    setMessage("");
    try {
      const response = await fetch("/api/customer/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const result = (await response.json()) as {
        error?: string;
        ok?: boolean;
      };
      if (!response.ok || !result.ok) {
        throw new Error(result.error || "비밀번호를 확인해 주세요.");
      }

      const target = new URLSearchParams(window.location.search).get("url");
      if (target === "member_leave.php") {
        if (!window.confirm("정말 회원에서 탈퇴 하시겠습니까?")) {
          setSubmitting(false);
          return;
        }
        const leaveResponse = await fetch("/api/customer/profile", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ password }),
        });
        const leaveResult = (await leaveResponse.json()) as { error?: string };
        if (!leaveResponse.ok) {
          throw new Error(leaveResult.error || "회원 탈퇴를 처리하지 못했습니다.");
        }
        window.location.assign("/shop");
        return;
      }

      window.location.assign("/shop/profile.php");
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : "비밀번호를 확인해 주세요.",
      );
      setSubmitting(false);
    }
  }

  return (
    <main id="main-content" className="member-confirm-page">
      <section aria-labelledby="member-confirm-title">
        <header>
          <i className="fas fa-lock" aria-hidden="true" />
          <h1 id="member-confirm-title">비밀번호를 한번 더 입력해주세요.</h1>
          <p>
            회원님의 정보를 안전하게 보호하기 위해 비밀번호를 확인합니다.
          </p>
        </header>
        <form onSubmit={confirmPassword}>
          <label>
            <span>회원아이디</span>
            <input value={loginId} readOnly aria-label="회원아이디" />
          </label>
          <label>
            <span>비밀번호</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
              maxLength={128}
              aria-label="비밀번호"
            />
          </label>
          <button type="submit" disabled={submitting || !loginId}>
            {submitting ? "확인 중" : "확인"}
          </button>
        </form>
        <p className="member-confirm-name">{name} 님</p>
        {message ? (
          <p className="commerce-notice" role="status">
            {message}
          </p>
        ) : null}
      </section>
    </main>
  );
}
