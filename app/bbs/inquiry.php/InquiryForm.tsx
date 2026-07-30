"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Panel } from "@/app/components/storefront";
import type {
  InquirySettings,
  PaginatedResult,
  PublicInquiryDetail,
  PublicInquirySummary,
} from "@/lib/admin-community";
import styles from "./inquiry.module.css";

const TOKEN_STORAGE_KEY = "kg_inquiry_lookup_tokens_v1";
const MAX_STORED_TOKENS = 10;

interface StoredToken {
  id: string;
  token: string;
  createdAt: string;
}

interface OverviewPayload {
  settings?: InquirySettings;
  viewer?: "guest" | "member";
  inquiries?: PaginatedResult<PublicInquirySummary>;
  message?: string;
}

const EMPTY_PAGE: PaginatedResult<PublicInquirySummary> = {
  items: [],
  page: 1,
  pageSize: 10,
  pageCount: 1,
  total: 0,
};

export function InquiryForm() {
  const [settings, setSettings] = useState<InquirySettings | null>(null);
  const [viewer, setViewer] = useState<"guest" | "member">("guest");
  const [inquiries, setInquiries] = useState(EMPTY_PAGE);
  const [guestInquiries, setGuestInquiries] = useState<PublicInquiryDetail[]>([]);
  const [selected, setSelected] = useState<PublicInquiryDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [issuedToken, setIssuedToken] = useState("");
  const [lookupToken, setLookupToken] = useState("");
  const [query, setQuery] = useState("");
  const [form, setForm] = useState({
    authorName: "",
    email: "",
    phone: "",
    category: "",
    title: "",
    content: "",
  });

  useEffect(() => {
    const controller = new AbortController();
    void loadOverview(1, "", controller.signal)
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        showMessage(
          error instanceof Error
            ? error.message
            : "문의 정보를 불러오지 못했습니다.",
          true,
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
    // The initial request intentionally captures the first-page defaults.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadOverview(
    page = 1,
    search = query,
    signal?: AbortSignal,
  ) {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: "10",
    });
    if (search.trim()) params.set("q", search.trim());
    const response = await fetch(`/api/inquiries?${params.toString()}`, {
      headers: { accept: "application/json" },
      cache: "no-store",
      signal,
    });
    const payload = (await response.json()) as OverviewPayload;
    if (!response.ok || !payload.settings || !payload.viewer) {
      throw new Error(payload.message ?? "문의 정보를 불러오지 못했습니다.");
    }
    setSettings(payload.settings);
    setViewer(payload.viewer);
    setInquiries(payload.inquiries ?? EMPTY_PAGE);
    setForm((current) => ({
      ...current,
      category:
        current.category || payload.settings?.categories[0] || "",
    }));
    if (payload.viewer === "guest") {
      await loadStoredGuestInquiries(signal);
    }
  }

  async function loadStoredGuestInquiries(signal?: AbortSignal) {
    const stored = readStoredTokens();
    if (stored.length === 0) {
      setGuestInquiries([]);
      return;
    }
    const results = await Promise.all(
      stored.map(async (entry) => {
        try {
          return await lookupGuestInquiry(entry.token, signal);
        } catch {
          return null;
        }
      }),
    );
    setGuestInquiries(
      results
        .filter((entry): entry is PublicInquiryDetail => Boolean(entry))
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving || !settings?.enabled) return;
    setSaving(true);
    setMessage("");
    setFailed(false);
    setIssuedToken("");
    try {
      const response = await fetch("/api/inquiries", {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify(form),
      });
      const payload = (await response.json()) as {
        inquiry?: { id: string; createdAt: string };
        lookupToken?: string;
        message?: string;
      };
      if (!response.ok || !payload.inquiry) {
        throw new Error(payload.message ?? "문의를 접수하지 못했습니다.");
      }
      setForm({
        authorName: "",
        email: "",
        phone: "",
        category: settings.categories[0] ?? "",
        title: "",
        content: "",
      });
      if (payload.lookupToken) {
        rememberToken({
          id: payload.inquiry.id,
          token: payload.lookupToken,
          createdAt: payload.inquiry.createdAt,
        });
        setIssuedToken(payload.lookupToken);
        const detail = await lookupGuestInquiry(payload.lookupToken);
        setGuestInquiries((current) => [
          detail,
          ...current.filter((entry) => entry.id !== detail.id),
        ]);
        setSelected(detail);
      } else {
        await loadOverview(1, query);
      }
      setMessage(`문의가 접수되었습니다. 접수번호: ${payload.inquiry.id}`);
    } catch (error) {
      setFailed(true);
      setMessage(
        error instanceof Error ? error.message : "문의를 접수하지 못했습니다.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function searchMember(event: FormEvent) {
    event.preventDefault();
    setLookupLoading(true);
    setMessage("");
    try {
      await loadOverview(1, query);
    } catch (error) {
      showMessage(
        error instanceof Error ? error.message : "문의 목록을 불러오지 못했습니다.",
        true,
      );
    } finally {
      setLookupLoading(false);
    }
  }

  async function selectMemberInquiry(id: string) {
    setLookupLoading(true);
    setMessage("");
    try {
      const response = await fetch(
        `/api/inquiries?id=${encodeURIComponent(id)}`,
        {
          headers: { accept: "application/json" },
          cache: "no-store",
        },
      );
      const payload = (await response.json()) as {
        inquiry?: PublicInquiryDetail;
        message?: string;
      };
      if (!response.ok || !payload.inquiry) {
        throw new Error(payload.message ?? "문의를 불러오지 못했습니다.");
      }
      setSelected(payload.inquiry);
    } catch (error) {
      showMessage(
        error instanceof Error ? error.message : "문의를 불러오지 못했습니다.",
        true,
      );
    } finally {
      setLookupLoading(false);
    }
  }

  async function submitGuestLookup(event: FormEvent) {
    event.preventDefault();
    const token = lookupToken.trim();
    if (!token || lookupLoading) return;
    setLookupLoading(true);
    setMessage("");
    setFailed(false);
    try {
      const detail = await lookupGuestInquiry(token);
      rememberToken({
        id: detail.id,
        token,
        createdAt: detail.createdAt,
      });
      setGuestInquiries((current) => [
        detail,
        ...current.filter((entry) => entry.id !== detail.id),
      ]);
      setSelected(detail);
      setLookupToken("");
      setMessage("문의와 답변을 불러왔습니다.");
    } catch (error) {
      showMessage(
        error instanceof Error ? error.message : "문의를 조회하지 못했습니다.",
        true,
      );
    } finally {
      setLookupLoading(false);
    }
  }

  async function changeMemberPage(page: number) {
    if (lookupLoading) return;
    setLookupLoading(true);
    try {
      await loadOverview(page, query);
    } catch (error) {
      showMessage(
        error instanceof Error ? error.message : "문의 목록을 불러오지 못했습니다.",
        true,
      );
    } finally {
      setLookupLoading(false);
    }
  }

  function showMessage(text: string, danger = false) {
    setMessage(text);
    setFailed(danger);
  }

  if (loading) {
    return (
      <Panel title="1:1 문의">
        <p className={styles.unavailable}>불러오는 중입니다.</p>
      </Panel>
    );
  }

  return (
    <div className={styles.sections}>
      {message ? (
        <p
          className={`${styles.message} ${failed ? styles.error : ""}`}
          role={failed ? "alert" : "status"}
        >
          {message}
        </p>
      ) : null}

      {settings?.enabled && (viewer === "member" || settings.allowGuest) ? (
        <Panel title={settings.title} description={settings.description}>
          <form className={styles.form} onSubmit={submit}>
            <div className={styles.grid}>
              <Field label="이름" required>
                <input
                  required
                  maxLength={80}
                  value={form.authorName}
                  onChange={(event) =>
                    setForm({ ...form, authorName: event.currentTarget.value })
                  }
                />
              </Field>
              <Field label="이메일" required={settings.requireEmail}>
                <input
                  type="email"
                  required={settings.requireEmail}
                  maxLength={254}
                  value={form.email}
                  onChange={(event) =>
                    setForm({ ...form, email: event.currentTarget.value })
                  }
                />
              </Field>
              <Field label="연락처">
                <input
                  maxLength={40}
                  value={form.phone}
                  onChange={(event) =>
                    setForm({ ...form, phone: event.currentTarget.value })
                  }
                />
              </Field>
              <Field label="문의 분류" required>
                <select
                  required
                  value={form.category}
                  onChange={(event) =>
                    setForm({ ...form, category: event.currentTarget.value })
                  }
                >
                  {settings.categories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="제목" required full>
                <input
                  required
                  maxLength={200}
                  value={form.title}
                  onChange={(event) =>
                    setForm({ ...form, title: event.currentTarget.value })
                  }
                />
              </Field>
              <Field label="문의 내용" required full>
                <textarea
                  required
                  maxLength={30000}
                  value={form.content}
                  onChange={(event) =>
                    setForm({ ...form, content: event.currentTarget.value })
                  }
                />
              </Field>
            </div>
            <div className={styles.actions}>
              <button className={styles.button} type="submit" disabled={saving}>
                {saving ? "접수 중..." : "문의 접수"}
              </button>
            </div>
          </form>
          {issuedToken ? (
            <div className={styles.tokenNotice} role="status">
              <strong>비회원 문의 조회 토큰</strong>
              <p>
                이 토큰은 다시 발급하거나 화면에 다시 표시할 수 없습니다.
                안전한 곳에 보관해 주세요.
              </p>
              <code>{issuedToken}</code>
              <button
                type="button"
                onClick={() => void navigator.clipboard?.writeText(issuedToken)}
              >
                토큰 복사
              </button>
            </div>
          ) : null}
        </Panel>
      ) : (
        <Panel title={settings?.title ?? "1:1 문의"}>
          <p className={styles.unavailable}>
            {settings
              ? settings.enabled
                ? "회원 로그인 후 새 문의를 접수할 수 있습니다. 기존 비회원 문의 조회는 가능합니다."
                : "현재 1:1 문의 접수를 받지 않습니다. 기존 문의 조회는 가능합니다."
              : "문의 설정을 불러오지 못했습니다."}
          </p>
        </Panel>
      )}

      <Panel
        title="내 문의 확인"
        description={
          viewer === "member"
            ? "로그인한 회원님의 문의만 표시됩니다."
            : "접수할 때 발급된 조회 토큰으로 본인의 문의와 답변을 확인할 수 있습니다."
        }
      >
        {viewer === "member" ? (
          <MemberInquiryList
            page={inquiries}
            query={query}
            loading={lookupLoading}
            onQuery={setQuery}
            onSearch={searchMember}
            onSelect={(id) => void selectMemberInquiry(id)}
            onPage={(page) => void changeMemberPage(page)}
          />
        ) : (
          <>
            <form className={styles.lookupForm} onSubmit={submitGuestLookup}>
              <label htmlFor="inquiry-lookup-token">조회 토큰</label>
              <input
                id="inquiry-lookup-token"
                value={lookupToken}
                onChange={(event) => setLookupToken(event.currentTarget.value)}
                maxLength={80}
                autoComplete="off"
                spellCheck={false}
                placeholder="접수 시 발급된 조회 토큰"
              />
              <button type="submit" disabled={lookupLoading}>
                조회
              </button>
            </form>
            <InquiryEntries
              entries={guestInquiries}
              selectedId={selected?.id}
              onSelect={(entry) => setSelected(entry)}
            />
          </>
        )}
        {selected ? <InquiryDetail inquiry={selected} /> : null}
      </Panel>
    </div>
  );
}

function MemberInquiryList({
  page,
  query,
  loading,
  onQuery,
  onSearch,
  onSelect,
  onPage,
}: {
  page: PaginatedResult<PublicInquirySummary>;
  query: string;
  loading: boolean;
  onQuery: (value: string) => void;
  onSearch: (event: FormEvent) => void;
  onSelect: (id: string) => void;
  onPage: (page: number) => void;
}) {
  return (
    <>
      <form className={styles.lookupForm} onSubmit={onSearch}>
        <label htmlFor="member-inquiry-search">문의 검색</label>
        <input
          id="member-inquiry-search"
          value={query}
          onChange={(event) => onQuery(event.currentTarget.value)}
          maxLength={80}
          placeholder="제목, 내용, 분류"
        />
        <button type="submit" disabled={loading}>
          검색
        </button>
      </form>
      {page.items.length ? (
        <div className={styles.inquiryList}>
          {page.items.map((inquiry) => (
            <button
              type="button"
              key={inquiry.id}
              onClick={() => onSelect(inquiry.id)}
            >
              <span>
                [{inquiry.category}] {inquiry.title}
              </span>
              <small>
                {inquiryStatusLabel(inquiry.status)} ·{" "}
                {formatDate(inquiry.createdAt)}
              </small>
            </button>
          ))}
        </div>
      ) : (
        <p className={styles.empty}>등록된 문의가 없습니다.</p>
      )}
      {page.pageCount > 1 ? (
        <div className={styles.pagination} aria-label="문의 목록 페이지">
          <button
            type="button"
            disabled={loading || page.page <= 1}
            onClick={() => onPage(page.page - 1)}
          >
            이전
          </button>
          <span>
            {page.page} / {page.pageCount}
          </span>
          <button
            type="button"
            disabled={loading || page.page >= page.pageCount}
            onClick={() => onPage(page.page + 1)}
          >
            다음
          </button>
        </div>
      ) : null}
    </>
  );
}

function InquiryEntries({
  entries,
  selectedId,
  onSelect,
}: {
  entries: PublicInquiryDetail[];
  selectedId?: string;
  onSelect: (entry: PublicInquiryDetail) => void;
}) {
  if (!entries.length) {
    return (
      <p className={styles.empty}>
        이 브라우저에 저장된 비회원 문의가 없습니다.
      </p>
    );
  }
  return (
    <div className={styles.inquiryList}>
      {entries.map((inquiry) => (
        <button
          type="button"
          key={inquiry.id}
          aria-pressed={selectedId === inquiry.id}
          onClick={() => onSelect(inquiry)}
        >
          <span>
            [{inquiry.category}] {inquiry.title}
          </span>
          <small>
            {inquiryStatusLabel(inquiry.status)} · {formatDate(inquiry.createdAt)}
          </small>
        </button>
      ))}
    </div>
  );
}

function InquiryDetail({ inquiry }: { inquiry: PublicInquiryDetail }) {
  return (
    <article className={styles.detail}>
      <header>
        <span className={styles.status}>
          {inquiryStatusLabel(inquiry.status)}
        </span>
        <h3>{inquiry.title}</h3>
        <time dateTime={inquiry.createdAt}>{formatDate(inquiry.createdAt)}</time>
      </header>
      <section>
        <h4>문의 내용</h4>
        <p>{inquiry.content}</p>
      </section>
      <section className={styles.answer}>
        <h4>답변</h4>
        {inquiry.answer ? (
          <>
            <p>{inquiry.answer}</p>
            {inquiry.answeredAt ? (
              <time dateTime={inquiry.answeredAt}>
                {formatDate(inquiry.answeredAt)}
              </time>
            ) : null}
          </>
        ) : (
          <p className={styles.answerWaiting}>
            담당자가 확인 중입니다. 답변이 등록되면 이 화면에서 확인할 수
            있습니다.
          </p>
        )}
      </section>
    </article>
  );
}

async function lookupGuestInquiry(
  token: string,
  signal?: AbortSignal,
): Promise<PublicInquiryDetail> {
  const response = await fetch("/api/inquiries/lookup", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({ token }),
    cache: "no-store",
    signal,
  });
  const payload = (await response.json()) as {
    inquiry?: PublicInquiryDetail;
    message?: string;
  };
  if (!response.ok || !payload.inquiry) {
    throw new Error(payload.message ?? "문의를 조회하지 못했습니다.");
  }
  return payload.inquiry;
}

function readStoredTokens(): StoredToken[] {
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(TOKEN_STORAGE_KEY) ?? "[]",
    ) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (entry): entry is StoredToken =>
          Boolean(entry) &&
          typeof entry === "object" &&
          typeof (entry as StoredToken).id === "string" &&
          typeof (entry as StoredToken).token === "string" &&
          /^[A-Za-z0-9_-]{43}$/u.test((entry as StoredToken).token) &&
          typeof (entry as StoredToken).createdAt === "string",
      )
      .slice(0, MAX_STORED_TOKENS);
  } catch {
    return [];
  }
}

function rememberToken(entry: StoredToken) {
  const next = [
    entry,
    ...readStoredTokens().filter((stored) => stored.id !== entry.id),
  ].slice(0, MAX_STORED_TOKENS);
  window.localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(next));
}

function inquiryStatusLabel(status: PublicInquirySummary["status"]) {
  if (status === "pending") return "접수 대기";
  if (status === "in_progress") return "처리 중";
  if (status === "answered") return "답변 완료";
  return "종결";
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "-"
    : date.toLocaleString("ko-KR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
}

function Field({
  label,
  required,
  full,
  children,
}: {
  label: string;
  required?: boolean;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`${styles.field} ${full ? styles.fieldFull : ""}`}>
      <label>
        {label} {required ? <span className={styles.required}>*</span> : null}
      </label>
      {children}
    </div>
  );
}
