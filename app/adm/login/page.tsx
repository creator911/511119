import type { Metadata } from "next";
import { LoginForm } from "./LoginForm";
import styles from "../admin-routes.module.css";

export const metadata: Metadata = {
  title: "관리자 로그인",
  robots: { index: false, follow: false },
};

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const params = await searchParams;
  const requestedNext = Array.isArray(params.next)
    ? params.next[0]
    : params.next;
  const nextPath = safeAdminNextPath(requestedNext);

  return (
    <main className={styles.loginPage}>
      <section className={styles.loginCard} aria-labelledby="admin-login-title">
        <header className={styles.loginHeader}>
          <h1 className={styles.loginTitle} id="admin-login-title">
            로그인
          </h1>
        </header>
        <LoginForm nextPath={nextPath} />
      </section>
    </main>
  );
}

function safeAdminNextPath(value: string | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/adm";
  }

  try {
    const parsed = new URL(value, "https://admin.local");
    if (
      parsed.origin !== "https://admin.local" ||
      !/^\/adm(?:\/|$)/u.test(parsed.pathname) ||
      parsed.pathname === "/adm/login"
    ) {
      return "/adm";
    }
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return "/adm";
  }
}
