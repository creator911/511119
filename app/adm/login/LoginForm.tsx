"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";
import styles from "../admin-routes.module.css";

export function LoginForm({ nextPath = "/adm" }: { nextPath?: string }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [autoLogin, setAutoLogin] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const response = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string; message?: string }
          | null;
        setError(
          payload?.error ??
            payload?.message ??
            "아이디 또는 비밀번호를 확인해 주세요.",
        );
        return;
      }

      window.location.replace(nextPath);
    } catch {
      setError("로그인 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className={styles.loginForm} onSubmit={handleSubmit}>
      <div className={styles.loginField}>
        <label className={styles.loginLabel} htmlFor="admin-username">
          아이디
        </label>
        <span className={styles.loginInputWrap}>
          <input
            className={styles.loginInput}
            id="admin-username"
            name="username"
            type="text"
            placeholder="ID"
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.currentTarget.value)}
            disabled={submitting}
            required
            autoFocus
          />
          <span className={styles.loginInputIcon} aria-hidden="true">
            
          </span>
        </span>
      </div>
      <div className={styles.loginField}>
        <label className={styles.loginLabel} htmlFor="admin-password">
          비밀번호
        </label>
        <span className={styles.loginInputWrap}>
          <input
            className={styles.loginInput}
            id="admin-password"
            name="password"
            type="password"
            placeholder="Password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.currentTarget.value)}
            disabled={submitting}
            required
          />
          <span className={styles.loginPasswordIcons} aria-hidden="true">
            <span></span>
            <span></span>
          </span>
        </span>
      </div>
      <label className={styles.autoLogin}>
        <input
          type="checkbox"
          checked={autoLogin}
          onChange={(event) => setAutoLogin(event.currentTarget.checked)}
          disabled={submitting}
        />
        <span aria-hidden="true" />
        자동로그인
      </label>
      {error ? (
        <p className={styles.loginError} role="alert">
          {error}
        </p>
      ) : null}
      <p className={styles.loginLinks}>
        <Link href="/bbs/register.php">회원가입</Link>
        <span aria-hidden="true">|</span>
        <Link href="/bbs/password_lost.php">아이디/비밀번호찾기</Link>
      </p>
      <button
        className={styles.loginButton}
        type="submit"
        disabled={submitting || !username || !password}
      >
        {submitting ? "확인 중…" : "로그인"}
      </button>
      <Link className={styles.loginHome} href="/">
        메인으로 돌아가기
      </Link>
    </form>
  );
}
