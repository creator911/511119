"use client";

import { useMemo, useState, type FormEvent } from "react";
import {
  AdminButton,
  AdminInput,
  AdminPanel,
  AdminSelect,
  AdminTextarea,
  FormRow,
  FormSection,
  Notice,
  StatusBadge,
  Toggle,
} from "@/app/components/admin";
import type {
  ContentEntry,
  ContentEntryStatus,
  ContentEntryType,
} from "@/lib/site-content";
import styles from "./content-manager.module.css";

interface ContentManagerProps {
  entryType: ContentEntryType;
  initialEntries: ContentEntry[];
}

type EntryDraft = Pick<
  ContentEntry,
  | "entryType"
  | "slug"
  | "title"
  | "body"
  | "category"
  | "status"
  | "sortOrder"
  | "showInMenu"
  | "seoTitle"
  | "seoDescription"
> & { id?: string };

type FieldErrors = Partial<Record<keyof EntryDraft, string>>;

const FAQ_CATEGORIES = [
  { value: "general", label: "일반" },
  { value: "product", label: "상품" },
  { value: "order", label: "주문" },
  { value: "payment", label: "결제" },
  { value: "shipping", label: "배송" },
  { value: "exchange", label: "교환·반품" },
] as const;

function emptyDraft(entryType: ContentEntryType): EntryDraft {
  return {
    entryType,
    slug: "",
    title: "",
    body: "",
    category: entryType === "faq" ? "general" : "page",
    status: "draft",
    sortOrder: 0,
    showInMenu: false,
    seoTitle: "",
    seoDescription: "",
  };
}

function toDraft(entry: ContentEntry): EntryDraft {
  return {
    id: entry.id,
    entryType: entry.entryType,
    slug: entry.slug,
    title: entry.title,
    body: entry.body,
    category: entry.category,
    status: entry.status,
    sortOrder: entry.sortOrder,
    showInMenu: entry.showInMenu,
    seoTitle: entry.seoTitle,
    seoDescription: entry.seoDescription,
  };
}

export function ContentManager({
  entryType,
  initialEntries,
}: ContentManagerProps) {
  const [entries, setEntries] = useState<ContentEntry[]>(initialEntries);
  const [editing, setEditing] = useState<EntryDraft | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [loading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);

  const label = entryType === "faq" ? "FAQ" : "고정 페이지";
  const publishedCount = useMemo(
    () => entries.filter((entry) => entry.status === "published").length,
    [entries],
  );

  function change<K extends keyof EntryDraft>(
    field: K,
    value: EntryDraft[K],
  ) {
    setEditing((current) => (current ? { ...current, [field]: value } : null));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setMessage("");
  }

  function announce(text: string, danger = false) {
    setFailed(danger);
    setMessage(text);
  }

  async function requestEntry(
    draft: EntryDraft,
    method: "POST" | "PATCH",
  ): Promise<ContentEntry | null> {
    const target =
      method === "POST"
        ? "/api/admin/content"
        : `/api/admin/content/${encodeURIComponent(draft.id ?? "")}`;
    const response = await fetch(target, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(draft),
    });
    const result = (await response.json()) as {
      entry?: ContentEntry;
      message?: string;
      fieldErrors?: FieldErrors;
    };
    if (response.status === 401) {
      window.location.assign("/adm/login");
      return null;
    }
    if (!response.ok || !result.entry) {
      setErrors(result.fieldErrors ?? {});
      throw new Error(result.message ?? "콘텐츠를 저장하지 못했습니다.");
    }
    return result.entry;
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing || saving) return;
    setSaving(true);
    setErrors({});
    try {
      const saved = await requestEntry(
        editing,
        editing.id ? "PATCH" : "POST",
      );
      if (!saved) return;
      setEntries((current) => {
        const withoutSaved = current.filter((entry) => entry.id !== saved.id);
        return [...withoutSaved, saved].sort(compareEntries);
      });
      setEditing(null);
      announce(`${label} 항목을 저장했습니다.`);
    } catch (error) {
      announce(
        error instanceof Error ? error.message : "콘텐츠를 저장하지 못했습니다.",
        true,
      );
    } finally {
      setSaving(false);
    }
  }

  async function togglePublish(entry: ContentEntry) {
    if (saving) return;
    setSaving(true);
    const draft = toDraft(entry);
    draft.status = entry.status === "published" ? "draft" : "published";
    try {
      const saved = await requestEntry(draft, "PATCH");
      if (!saved) return;
      setEntries((current) =>
        current.map((item) => (item.id === saved.id ? saved : item)),
      );
      announce(
        saved.status === "published"
          ? "공개 페이지에 게시했습니다."
          : "공개 페이지에서 내렸습니다.",
      );
    } catch (error) {
      announce(
        error instanceof Error ? error.message : "게시 상태를 바꾸지 못했습니다.",
        true,
      );
    } finally {
      setSaving(false);
    }
  }

  async function remove(entry: ContentEntry) {
    if (
      saving ||
      !window.confirm(
        `"${entry.title}" 항목을 삭제할까요? 삭제한 내용은 복구할 수 없습니다.`,
      )
    ) {
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(
        `/api/admin/content/${encodeURIComponent(entry.id)}`,
        { method: "DELETE" },
      );
      const result = (await response.json()) as { message?: string };
      if (response.status === 401) {
        window.location.assign("/adm/login");
        return;
      }
      if (!response.ok) {
        throw new Error(result.message ?? "콘텐츠를 삭제하지 못했습니다.");
      }
      setEntries((current) => current.filter((item) => item.id !== entry.id));
      if (editing?.id === entry.id) setEditing(null);
      announce(`${label} 항목을 삭제했습니다.`);
    } catch (error) {
      announce(
        error instanceof Error ? error.message : "콘텐츠를 삭제하지 못했습니다.",
        true,
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className={`${styles.manager} ${
        entryType === "page" ? styles.classicManager : ""
      }`}
    >
      {entryType === "page" ? (
        <>
          <div className="btn_fixed_top">
            <AdminButton
              variant="primary"
              onClick={() => {
                setEditing(emptyDraft(entryType));
                setErrors({});
                setMessage("");
              }}
            >
              내용 추가
            </AdminButton>
          </div>
          <div className={`local_ov ${styles.contentSummary}`}>
            <span className="btn_ov01">
              <span className="ov_txt">전체 내용</span>
              <span className="ov_num"> {entries.length}건</span>
            </span>
          </div>
          {message ? (
            <p
              className={failed ? styles.messageError : styles.messageSuccess}
              role={failed ? "alert" : "status"}
            >
              {message}
            </p>
          ) : null}
          {loading ? (
            <p className={styles.empty}>목록을 불러오는 중입니다…</p>
          ) : (
            <div className={`${styles.tableWrap} ${styles.classicTableWrap}`}>
              <table className={`${styles.table} ${styles.classicTable}`}>
                <thead>
                  <tr>
                    <th scope="col">ID</th>
                    <th scope="col">제목</th>
                    <th scope="col">관리</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.length ? (
                    entries.map((entry) => (
                      <tr key={entry.id}>
                        <td className={styles.contentId}>{entry.slug}</td>
                        <td className={styles.contentTitle}>{entry.title}</td>
                        <td className={styles.contentManage}>
                          <button
                            type="button"
                            className="btn btn_03"
                            onClick={() => {
                              setEditing(toDraft(entry));
                              setErrors({});
                              setMessage("");
                            }}
                          >
                            수정
                          </button>{" "}
                          <a
                            className="btn btn_02"
                            href={`/bbs/content.php?co_id=${encodeURIComponent(entry.slug)}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            보기
                          </a>{" "}
                          <button
                            type="button"
                            className="btn btn_02"
                            onClick={() => void remove(entry)}
                            disabled={saving}
                          >
                            삭제
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className={styles.empty} colSpan={3}>
                        자료가 한건도 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        <>
          <Notice>게시 상태인 FAQ만 공개 FAQ 화면에 표시됩니다.</Notice>
          <AdminPanel
        title={`${label} 목록`}
        subtitle={`전체 ${entries.length}건 · 게시 ${publishedCount}건`}
        action={
          <AdminButton
            variant="primary"
            onClick={() => {
              setEditing(emptyDraft(entryType));
              setErrors({});
              setMessage("");
            }}
          >
            새 항목 등록
          </AdminButton>
        }
      >
        {message ? (
          <p
            className={failed ? styles.messageError : styles.messageSuccess}
            role={failed ? "alert" : "status"}
          >
            {message}
          </p>
        ) : null}
        {loading ? (
          <p className={styles.empty}>목록을 불러오는 중입니다…</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>제목</th>
                  <th>{entryType === "faq" ? "분류" : "고유주소"}</th>
                  <th>상태</th>
                  <th>정렬</th>
                  <th>수정일</th>
                  <th>관리</th>
                </tr>
              </thead>
              <tbody>
                {entries.length ? (
                  entries.map((entry) => (
                    <tr key={entry.id}>
                      <td>
                        <strong>{entry.title}</strong>
                      </td>
                      <td>
                        {entryType === "faq"
                          ? faqCategoryLabel(entry.category)
                          : entry.slug}
                      </td>
                      <td>
                        <StatusBadge
                          tone={
                            entry.status === "published"
                              ? "success"
                              : "neutral"
                          }
                        >
                          {entry.status === "published" ? "게시" : "임시저장"}
                        </StatusBadge>
                      </td>
                      <td>{entry.sortOrder}</td>
                      <td>{formatDate(entry.updatedAt)}</td>
                      <td>
                        <div className={styles.rowActions}>
                          <AdminButton
                            size="small"
                            onClick={() => {
                              setEditing(toDraft(entry));
                              setErrors({});
                              setMessage("");
                            }}
                          >
                            수정
                          </AdminButton>
                          <AdminButton
                            size="small"
                            onClick={() => void togglePublish(entry)}
                            disabled={saving}
                          >
                            {entry.status === "published"
                              ? "게시 내리기"
                              : "게시"}
                          </AdminButton>
                          <AdminButton
                            size="small"
                            variant="danger"
                            onClick={() => void remove(entry)}
                            disabled={saving}
                          >
                            삭제
                          </AdminButton>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className={styles.empty} colSpan={6}>
                      등록된 {label} 항목이 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
          </AdminPanel>
        </>
      )}

      {editing ? (
        <form className={styles.form} onSubmit={save}>
          <FormSection
            title={editing.id ? `${label} 수정` : `${label} 등록`}
            description={
              entryType === "faq"
                ? "질문과 답변을 작성하고 공개 여부를 선택합니다."
                : "고객에게 보여 줄 고정 안내 페이지를 작성합니다."
            }
          >
            {entryType === "page" ? (
              <FormRow
                label="고유주소"
                required
                htmlFor="content-slug"
                error={errors.slug}
                help="영문 소문자, 숫자와 하이픈만 사용할 수 있습니다."
              >
                <AdminInput
                  id="content-slug"
                  value={editing.slug}
                  maxLength={80}
                  invalid={Boolean(errors.slug)}
                  onChange={(event) => change("slug", event.currentTarget.value)}
                />
              </FormRow>
            ) : (
              <FormRow
                label="분류"
                required
                htmlFor="content-category"
                error={errors.category}
              >
                <AdminSelect
                  id="content-category"
                  value={editing.category}
                  onChange={(event) =>
                    change("category", event.currentTarget.value)
                  }
                >
                  {FAQ_CATEGORIES.map((category) => (
                    <option key={category.value} value={category.value}>
                      {category.label}
                    </option>
                  ))}
                </AdminSelect>
              </FormRow>
            )}
            <FormRow
              label={entryType === "faq" ? "질문" : "제목"}
              required
              htmlFor="content-title"
              error={errors.title}
            >
              <AdminInput
                id="content-title"
                value={editing.title}
                maxLength={200}
                invalid={Boolean(errors.title)}
                onChange={(event) => change("title", event.currentTarget.value)}
              />
            </FormRow>
            <FormRow
              label={entryType === "faq" ? "답변" : "본문"}
              required
              htmlFor="content-body"
              error={errors.body}
            >
              <AdminTextarea
                id="content-body"
                className={styles.bodyInput}
                value={editing.body}
                maxLength={30_000}
                invalid={Boolean(errors.body)}
                onChange={(event) => change("body", event.currentTarget.value)}
              />
            </FormRow>
            <FormRow
              label="정렬순서"
              htmlFor="content-sort"
              error={errors.sortOrder}
            >
              <AdminInput
                id="content-sort"
                type="number"
                min={0}
                max={100000}
                step={1}
                value={editing.sortOrder}
                invalid={Boolean(errors.sortOrder)}
                onChange={(event) =>
                  change("sortOrder", Number(event.currentTarget.value))
                }
              />
            </FormRow>
            <FormRow label="게시 상태" error={errors.status}>
              <AdminSelect
                value={editing.status}
                aria-label="게시 상태"
                onChange={(event) =>
                  change(
                    "status",
                    event.currentTarget.value as ContentEntryStatus,
                  )
                }
              >
                <option value="draft">임시저장</option>
                <option value="published">게시</option>
              </AdminSelect>
            </FormRow>
            {entryType === "page" ? (
              <>
                <FormRow label="메뉴 노출">
                  <Toggle
                    checked={editing.showInMenu}
                    label={editing.showInMenu ? "메뉴 노출" : "메뉴 숨김"}
                    onChange={(checked) => change("showInMenu", checked)}
                  />
                </FormRow>
                <FormRow
                  label="검색 제목"
                  htmlFor="content-seo-title"
                  error={errors.seoTitle}
                >
                  <AdminInput
                    id="content-seo-title"
                    value={editing.seoTitle}
                    maxLength={100}
                    onChange={(event) =>
                      change("seoTitle", event.currentTarget.value)
                    }
                  />
                </FormRow>
                <FormRow
                  label="검색 설명"
                  htmlFor="content-seo-description"
                  error={errors.seoDescription}
                >
                  <AdminTextarea
                    id="content-seo-description"
                    value={editing.seoDescription}
                    maxLength={300}
                    onChange={(event) =>
                      change("seoDescription", event.currentTarget.value)
                    }
                  />
                </FormRow>
              </>
            ) : null}
          </FormSection>
          <div className={styles.formActions}>
            <AdminButton
              type="button"
              onClick={() => setEditing(null)}
              disabled={saving}
            >
              취소
            </AdminButton>
            <AdminButton type="submit" variant="primary" loading={saving}>
              저장
            </AdminButton>
          </div>
        </form>
      ) : null}
    </div>
  );
}

function compareEntries(left: ContentEntry, right: ContentEntry) {
  return (
    left.sortOrder - right.sortOrder ||
    right.updatedAt.localeCompare(left.updatedAt) ||
    left.id.localeCompare(right.id)
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "-"
    : date.toLocaleDateString("ko-KR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
}

function faqCategoryLabel(value: string) {
  return (
    FAQ_CATEGORIES.find((category) => category.value === value)?.label ?? value
  );
}
