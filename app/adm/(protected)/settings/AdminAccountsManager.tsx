"use client";

import {
  type FormEvent,
  useCallback,
  useEffect,
  useState,
} from "react";
import { ADMIN_LEGACY_MENU_OPTIONS } from "@/lib/admin-menu-catalog";
import type {
  AdminMenuPermissionPage,
  AdminMenuPermissionRecord,
  AdminPermissionChallenge,
} from "@/lib/admin-menu-permissions";

interface PermissionApiResponse
  extends Partial<AdminMenuPermissionPage> {
  ok?: boolean;
  permission?: AdminMenuPermissionRecord;
  challenge?: AdminPermissionChallenge;
  deletedIds?: string[];
  message?: string;
  fieldErrors?: Record<string, string>;
}

// 회원 비밀번호는 저장 후 다시 표시되지 않습니다. 이 화면은 회원의
// 기존 해시를 복사하거나 노출하지 않고 로그인 검증 시에만 재사용합니다.
export function AdminAccountsManager() {
  const [page, setPage] = useState<AdminMenuPermissionPage>({
    rows: [],
    total: 0,
    page: 1,
    pageSize: 20,
    totalPages: 1,
    query: "",
  });
  const [challenge, setChallenge] =
    useState<AdminPermissionChallenge | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(),
  );
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadPermissions = useCallback(
    async (nextPage = 1, nextQuery = query) => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({
          page: String(nextPage),
          pageSize: String(page.pageSize),
        });
        if (nextQuery.trim()) params.set("q", nextQuery.trim());
        const result = await permissionRequest(
          `/api/admin/accounts/menu-permissions?${params.toString()}`,
        );
        if (
          !Array.isArray(result.rows) ||
          typeof result.total !== "number" ||
          typeof result.page !== "number" ||
          typeof result.pageSize !== "number" ||
          typeof result.totalPages !== "number" ||
          typeof result.query !== "string" ||
          !result.challenge
        ) {
          throw new Error("관리권한 목록을 불러오지 못했습니다.");
        }
        setPage(result as AdminMenuPermissionPage);
        setChallenge(result.challenge);
        setQuery(result.query);
        setSelected(new Set());
      } catch (cause) {
        setError(errorMessage(cause));
      } finally {
        setLoading(false);
      }
    },
    [page.pageSize, query],
  );

  useEffect(() => {
    let cancelled = false;
    void permissionRequest(
      "/api/admin/accounts/menu-permissions?page=1&pageSize=20",
    )
      .then((result) => {
        if (
          cancelled ||
          !Array.isArray(result.rows) ||
          typeof result.total !== "number" ||
          typeof result.page !== "number" ||
          typeof result.pageSize !== "number" ||
          typeof result.totalPages !== "number" ||
          typeof result.query !== "string" ||
          !result.challenge
        ) {
          if (!cancelled) {
            throw new Error("관리권한 목록을 불러오지 못했습니다.");
          }
          return;
        }
        setPage(result as AdminMenuPermissionPage);
        setChallenge(result.challenge);
        setQuery(result.query);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(errorMessage(cause));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function submitPermission(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    if (!challenge || busy) return;
    const form = event.currentTarget;
    const formData = new FormData(form);
    const username = String(formData.get("username") ?? "").trim();
    const menuCode = String(formData.get("menuCode") ?? "");
    const auth = ["r", "w", "d"].filter((mode) =>
      formData.has(mode),
    );
    const current = page.rows.find(
      (row) =>
        row.username.toLocaleLowerCase("en-US") ===
          username.toLocaleLowerCase("en-US") &&
        row.menuCode === menuCode,
    );
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await permissionRequest(
        "/api/admin/accounts/menu-permissions",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            username,
            menuCode,
            auth,
            expectedRevision: current?.revision ?? 0,
            captchaId: challenge.id,
            captchaAnswer: String(
              formData.get("captchaAnswer") ?? "",
            ),
          }),
        },
      );
      form.reset();
      const readCheckbox = form.elements.namedItem("r");
      if (readCheckbox instanceof HTMLInputElement) {
        readCheckbox.checked = true;
      }
      setMessage(result.message ?? "관리권한을 추가했습니다.");
      await loadPermissions(1, query);
    } catch (cause) {
      const nextError = errorMessage(cause);
      await loadPermissions(page.page, query);
      setError(nextError);
    } finally {
      setBusy(false);
    }
  }

  async function deleteSelected() {
    if (busy) return;
    const records = page.rows
      .filter((row) => selected.has(row.id))
      .map((row) => ({ id: row.id, revision: row.revision }));
    if (records.length === 0) {
      setError("선택삭제 하실 항목을 하나 이상 선택하세요.");
      return;
    }
    if (!window.confirm("선택한 자료를 정말 삭제하시겠습니까?")) {
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await permissionRequest(
        "/api/admin/accounts/menu-permissions",
        {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ records }),
        },
      );
      setMessage(result.message ?? "선택한 관리권한을 삭제했습니다.");
      await loadPermissions(page.page, query);
    } catch (cause) {
      const nextError = errorMessage(cause);
      await loadPermissions(page.page, query);
      setError(nextError);
    } finally {
      setBusy(false);
    }
  }

  function playCaptchaAudio() {
    if (!challenge) return;
    if (!("speechSynthesis" in window)) {
      setError("이 브라우저에서는 자동등록방지 음성 안내를 지원하지 않습니다.");
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(
      challenge.code.split("").join(" "),
    );
    utterance.lang = "ko-KR";
    utterance.rate = 0.72;
    utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
  }

  const allSelected =
    page.rows.length > 0 &&
    page.rows.every((row) => selected.has(row.id));

  return (
    <div className="legacy-permission-manager">
      <div className="local_ov01 local_ov legacy-permission-summary">
        <a
          className="ov_listall btn_ov02"
          href="/adm/settings?view=permissions"
        >
          전체목록
        </a>
        <span className="btn_ov01">
          <span className="ov_txt">설정된 관리권한</span>
          <span className="ov_num">
            {page.total.toLocaleString("ko-KR")}건
          </span>
        </span>
      </div>

      <form
        className="local_sch01 local_sch legacy-permission-search"
        onSubmit={(event) => {
          event.preventDefault();
          void loadPermissions(1, query);
        }}
      >
        <label className="sound_only" htmlFor="legacy-permission-query">
          회원아이디<strong className="sound_only"> 필수</strong>
        </label>
        <input
          id="legacy-permission-query"
          className="required frm_input"
          type="text"
          required
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
        <button
          id="legacy-permission-search-submit"
          className="btn_submit"
          type="submit"
        >
          검색
        </button>
      </form>

      {message ? (
        <p className="legacy-permission-message" role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="legacy-permission-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="tbl_head01 tbl_wrap legacy-permission-list-wrap">
        <table className="legacy-permission-list">
          <caption>관리권한설정 목록</caption>
          <colgroup>
            <col className="legacy-permission-col-check" />
            <col className="legacy-permission-col-user" />
            <col className="legacy-permission-col-nickname" />
            <col className="legacy-permission-col-menu" />
            <col className="legacy-permission-col-auth" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">
                <label
                  className="sound_only"
                  htmlFor="legacy-permission-check-all"
                >
                  현재 페이지 회원 전체
                </label>
                <input
                  id="legacy-permission-check-all"
                  type="checkbox"
                  checked={allSelected}
                  onChange={(event) =>
                    setSelected(
                      event.currentTarget.checked
                        ? new Set(page.rows.map((row) => row.id))
                        : new Set(),
                    )
                  }
                />
              </th>
              <th scope="col">회원아이디</th>
              <th scope="col">닉네임</th>
              <th scope="col">메뉴</th>
              <th scope="col">권한</th>
            </tr>
          </thead>
          <tbody>
            {!loading && page.rows.length > 0 ? (
              page.rows.map((row, index) => (
                <tr className={`bg${index % 2}`} key={row.id}>
                  <td className="td_chk">
                    <label
                      className="sound_only"
                      htmlFor={`legacy-permission-check-${index}`}
                    >
                      {row.nickname}님 권한
                    </label>
                    <input
                      id={`legacy-permission-check-${index}`}
                      type="checkbox"
                      checked={selected.has(row.id)}
                      onChange={(event) =>
                        setSelected((current) => {
                          const next = new Set(current);
                          if (event.currentTarget.checked) {
                            next.add(row.id);
                          } else {
                            next.delete(row.id);
                          }
                          return next;
                        })
                      }
                    />
                  </td>
                  <td className="td_mbid">
                    <button
                      className="legacy-permission-user-link"
                      type="button"
                      onClick={() => {
                        setQuery(row.username);
                        void loadPermissions(1, row.username);
                      }}
                    >
                      {row.username}
                    </button>
                  </td>
                  <td className="td_auth_mbnick">{row.nickname}</td>
                  <td className="td_menu">
                    {row.menuCode} {row.menuLabel}
                  </td>
                  <td className="td_auth">{row.auth}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="empty_table" colSpan={5}>
                  {loading ? "자료를 불러오는 중입니다." : "자료가 없습니다."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="btn_list01 btn_list legacy-permission-list-actions">
        <button
          className="btn btn_02"
          type="button"
          disabled={busy || loading}
          onClick={() => void deleteSelected()}
        >
          선택삭제
        </button>
      </div>

      <PermissionPagination
        page={page.page}
        totalPages={page.totalPages}
        onPageChange={(nextPage) =>
          void loadPermissions(nextPage, query)
        }
      />

      <section id="add_admin" className="legacy-permission-add">
        <h2 className="h2_frm">관리권한 추가</h2>
        <div className="local_desc01 local_desc">
          <p>
            다음 양식에서 회원에게 관리권한을 부여하실 수 있습니다.
            <br />
            권한 <strong>r</strong>은 읽기권한,{" "}
            <strong>w</strong>는 쓰기권한,{" "}
            <strong>d</strong>는 삭제권한입니다.
          </p>
        </div>

        <form
          id="legacy-permission-add-form"
          autoComplete="off"
          onSubmit={submitPermission}
        >
          <div className="tbl_frm01 tbl_wrap legacy-permission-form-wrap">
            <table>
              <colgroup>
                <col className="grid_4" />
                <col className="legacy-permission-form-value-col" />
              </colgroup>
              <tbody>
                <tr>
                  <th scope="row">
                    <label htmlFor="legacy-permission-member-id">
                      회원아이디
                      <strong className="sound_only">필수</strong>
                    </label>
                  </th>
                  <td>
                    <strong
                      id="msg_mb_id"
                      className="msg_sound_only"
                    />
                    <input
                      id="legacy-permission-member-id"
                      className="required frm_input"
                      name="username"
                      type="text"
                      minLength={3}
                      maxLength={64}
                      required
                    />
                  </td>
                </tr>
                <tr>
                  <th scope="row">
                    <label htmlFor="legacy-permission-menu">
                      접근가능메뉴
                      <strong className="sound_only">필수</strong>
                    </label>
                  </th>
                  <td>
                    <select
                      id="legacy-permission-menu"
                      className="required"
                      name="menuCode"
                      defaultValue=""
                      required
                    >
                      <option value="">선택하세요</option>
                      {ADMIN_LEGACY_MENU_OPTIONS.map((option) => (
                        <option key={option.code} value={option.code}>
                          {option.code} {option.label}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
                <tr>
                  <th scope="row">권한지정</th>
                  <td>
                    <input
                      id="legacy-permission-r"
                      name="r"
                      type="checkbox"
                      value="r"
                      defaultChecked
                    />
                    <label htmlFor="legacy-permission-r">r (읽기)</label>
                    <input
                      id="legacy-permission-w"
                      name="w"
                      type="checkbox"
                      value="w"
                    />
                    <label htmlFor="legacy-permission-w">w (쓰기)</label>
                    <input
                      id="legacy-permission-d"
                      name="d"
                      type="checkbox"
                      value="d"
                    />
                    <label htmlFor="legacy-permission-d">d (삭제)</label>
                  </td>
                </tr>
                <tr>
                  <th scope="row">자동등록방지</th>
                  <td>
                    <div
                      className="legacy-permission-captcha"
                      aria-live="polite"
                    >
                      {/* The original administrator CAPTCHA uses a compact
                          image followed by the answer and two controls. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        className="legacy-permission-captcha-image"
                        src={captchaImageSource(challenge?.code ?? "-----")}
                        alt={
                          challenge
                            ? `자동등록방지 숫자 ${challenge.code}`
                            : "자동등록방지 숫자를 불러오는 중"
                        }
                      />
                      <input
                        className="frm_input required"
                        name="captchaAnswer"
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]{5}"
                        maxLength={5}
                        title="자동등록방지 숫자 5자리를 입력하세요."
                        required
                      />
                      <button
                        className="legacy-permission-captcha-audio"
                        type="button"
                        disabled={loading || busy || !challenge}
                        aria-label="자동등록방지 숫자 음성 듣기"
                        title="자동등록방지 숫자 음성 듣기"
                        onClick={playCaptchaAudio}
                      >
                        <span aria-hidden="true" />
                      </button>
                      <button
                        className="legacy-permission-captcha-refresh"
                        type="button"
                        disabled={loading || busy}
                        aria-label="자동등록방지 새로고침"
                        onClick={() =>
                          void loadPermissions(page.page, query)
                        }
                      >
                        <span aria-hidden="true" />
                      </button>
                      <span className="legacy-permission-captcha-info">
                        자동등록방지 숫자를 순서대로 입력하세요.
                      </span>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="btn_confirm01 btn_confirm">
            <button
              className="btn_submit btn"
              type="submit"
              disabled={busy || !challenge}
            >
              추가
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function PermissionPagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  const start = Math.floor((page - 1) / 10) * 10 + 1;
  const end = Math.min(totalPages, start + 9);
  const pages = Array.from(
    { length: end - start + 1 },
    (_, index) => start + index,
  );
  return (
    <nav className="pg_wrap legacy-permission-pagination">
      <span className="pg">
        {pages.map((pageNumber) =>
          pageNumber === page ? (
            <span
              className="pg_current"
              aria-current="page"
              key={pageNumber}
            >
              {pageNumber}
            </span>
          ) : (
            <button
              className="pg_page"
              type="button"
              key={pageNumber}
              onClick={() => onPageChange(pageNumber)}
            >
              {pageNumber}
            </button>
          ),
        )}
      </span>
    </nav>
  );
}

async function permissionRequest(
  path: string,
  init?: RequestInit,
): Promise<PermissionApiResponse> {
  const response = await fetch(path, {
    cache: "no-store",
    ...init,
    headers: {
      Accept: "application/json",
      ...init?.headers,
    },
  });
  const result = (await response.json().catch(() => null)) as
    | PermissionApiResponse
    | null;
  if (response.status === 401) {
    window.location.assign(
      `/adm/login?next=${encodeURIComponent(
        "/adm/settings?view=permissions",
      )}`,
    );
    throw new Error("관리자 로그인이 만료되었습니다.");
  }
  if (!response.ok || !result?.ok) {
    const detail = result?.fieldErrors
      ? Object.values(result.fieldErrors)[0]
      : undefined;
    throw new Error(
      detail ??
        result?.message ??
        "관리권한 요청을 처리하지 못했습니다.",
    );
  }
  return result;
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "관리권한 요청을 처리하지 못했습니다.";
}

function captchaImageSource(code: string): string {
  const safeCode = code.replace(/[^\d-]/gu, "").slice(0, 5) || "-----";
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">',
    '<rect width="40" height="40" fill="#5875b7"/>',
    '<path d="M-3 35L36 -4M6 44L45 5M-12 22L22 -12" stroke="#ffffff" stroke-opacity=".22"/>',
    `<text x="20" y="25" text-anchor="middle" fill="#fff" font-family="Georgia,serif" font-size="11" font-style="italic" font-weight="700">${safeCode}</text>`,
    "</svg>",
  ].join("");
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}
