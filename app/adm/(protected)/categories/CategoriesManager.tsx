"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  AdminButton,
  AdminInput,
  AdminPanel,
  AdminSelect,
  ConfirmDialog,
  StatusBadge,
  Toggle,
} from "@/app/components/admin";
import type {
  AdminCategoryRecord,
  ManagedCategory,
} from "@/lib/category-contract";
import styles from "./categories-manager.module.css";

interface CategoriesManagerProps {
  initialRecords: AdminCategoryRecord[];
}

interface CategoryApiResponse {
  ok?: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
  category?: AdminCategoryRecord;
  categories?: AdminCategoryRecord[];
}

interface CategoryFormState {
  id: string;
  name: string;
  parentId: string;
  sortOrder: string;
  active: boolean;
}

const emptyForm: CategoryFormState = {
  id: "",
  name: "",
  parentId: "",
  sortOrder: "0",
  active: true,
};

export function CategoriesManager({
  initialRecords,
}: CategoriesManagerProps) {
  const [records, setRecords] =
    useState<AdminCategoryRecord[]>(initialRecords);
  const [selectedId, setSelectedId] = useState("");
  const [mode, setMode] = useState<"create" | "edit">("create");
  const [form, setForm] = useState<CategoryFormState>(() => ({
    ...emptyForm,
    sortOrder: nextSortOrder(initialRecords),
  }));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = records.find(
    (record) => record.category.id === selectedId,
  );
  const categoryById = useMemo(
    () =>
      new Map(
        records.map((record) => [
          record.category.id,
          record.category,
        ]),
      ),
    [records],
  );
  const parentOptions = records
    .filter(
      (record) =>
        !record.category.parentId && record.category.id !== selectedId,
    )
    .map((record) => record.category);
  const visibleRecords = records.filter((record) => {
    const needle = query.trim().toLocaleLowerCase("ko-KR");
    if (!needle) return true;
    return `${record.category.id} ${record.category.name}`
      .toLocaleLowerCase("ko-KR")
      .includes(needle);
  });

  function startCreate() {
    setMode("create");
    setSelectedId("");
    setForm({
      ...emptyForm,
      sortOrder: nextSortOrder(records),
    });
    setFieldErrors({});
    setFeedback(null);
    setEditorOpen(true);
  }

  function startEdit(record: AdminCategoryRecord) {
    setMode("edit");
    setSelectedId(record.category.id);
    setForm({
      id: record.category.id,
      name: record.category.name,
      parentId: record.category.parentId ?? "",
      sortOrder: String(record.category.sortOrder),
      active: record.category.active,
    });
    setFieldErrors({});
    setFeedback(null);
    setEditorOpen(true);
  }

  function updateForm<K extends keyof CategoryFormState>(
    field: K,
    value: CategoryFormState[K],
  ) {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
    setFeedback(null);
  }

  async function loadRecords(): Promise<AdminCategoryRecord[] | null> {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/categories", {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      const payload = (await response.json()) as CategoryApiResponse;
      if (response.status === 401) {
        redirectToAdminLogin();
        return null;
      }
      if (!response.ok || !Array.isArray(payload.categories)) {
        throw new Error(payload.message ?? "상품분류 목록을 불러오지 못했습니다.");
      }
      setRecords(payload.categories);
      return payload.categories;
    } catch (cause) {
      setFeedback({
        tone: "error",
        message:
          cause instanceof Error
            ? cause.message
            : "상품분류 목록을 불러오지 못했습니다.",
      });
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function saveCategory() {
    if (saving) return;
    const errors = validateForm(form, parentOptions);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setFeedback({
        tone: "error",
        message: "상품분류 정보를 다시 확인해 주세요.",
      });
      return;
    }

    setSaving(true);
    setFeedback(null);
    const endpoint =
      mode === "create"
        ? "/api/admin/categories"
        : `/api/admin/categories/${encodeURIComponent(selectedId)}`;
    try {
      const response = await fetch(endpoint, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: form.id,
          name: form.name,
          parentId: form.parentId || null,
          sortOrder: Number(form.sortOrder),
          active: form.active,
          ...(mode === "edit" && selected
            ? { expectedRevision: selected.revision }
            : {}),
        }),
      });
      const payload = (await response.json()) as CategoryApiResponse;
      if (response.status === 401) {
        redirectToAdminLogin();
        return;
      }
      if (!response.ok || !payload.category) {
        setFieldErrors(payload.fieldErrors ?? {});
        throw new Error(payload.message ?? "상품분류를 저장하지 못했습니다.");
      }
      const savedId = payload.category.category.id;
      const nextRecords = await loadRecords();
      const saved = nextRecords?.find(
        (record) => record.category.id === savedId,
      );
      if (saved) startEdit(saved);
      setFeedback({
        tone: "success",
        message:
          mode === "create"
            ? "상품분류를 등록했습니다."
            : "상품분류 변경사항을 저장했습니다.",
      });
    } catch (cause) {
      setFeedback({
        tone: "error",
        message:
          cause instanceof Error
            ? cause.message
            : "상품분류를 저장하지 못했습니다.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function deleteCategory() {
    if (!selected || deleting) return;
    setDeleting(true);
    setFeedback(null);
    try {
      const response = await fetch(
        `/api/admin/categories/${encodeURIComponent(
          selected.category.id,
        )}?revision=${encodeURIComponent(String(selected.revision))}`,
        { method: "DELETE", headers: { Accept: "application/json" } },
      );
      const payload = (await response.json()) as CategoryApiResponse;
      if (response.status === 401) {
        redirectToAdminLogin();
        return;
      }
      if (!response.ok) {
        throw new Error(payload.message ?? "상품분류를 삭제하지 못했습니다.");
      }
      await loadRecords();
      startCreate();
      setFeedback({
        tone: "success",
        message: "상품분류를 삭제했습니다.",
      });
    } catch (cause) {
      setFeedback({
        tone: "error",
        message:
          cause instanceof Error
            ? cause.message
            : "상품분류를 삭제하지 못했습니다.",
      });
    } finally {
      setDeleteOpen(false);
      setDeleting(false);
    }
  }

  const cannotDelete =
    Boolean(selected?.productCount) || Boolean(selected?.childCount);

  return (
    <div className={`${styles.stack} legacy-category-page`}>
      <div className="btn_fixed_top legacy-category-actions">
        <AdminButton
          onClick={() => {
            if (mode === "edit" && editorOpen) {
              void saveCategory();
            } else {
              setFeedback({
                tone: "error",
                message: "수정할 분류를 먼저 선택해 주세요.",
              });
            }
          }}
          disabled={saving || deleting}
        >
          일괄수정
        </AdminButton>
        <AdminButton variant="primary" onClick={startCreate}>
          분류 추가
        </AdminButton>
      </div>

      {feedback ? (
        <div
          className={
            feedback.tone === "success"
              ? styles.successNotice
              : styles.errorNotice
          }
          role={feedback.tone === "error" ? "alert" : "status"}
        >
          {feedback.message}
        </div>
      ) : null}

      <div className="local_ov legacy-category-summary">
        <span className="legacy-summary-label">전체목록</span>
        <span className="legacy-summary-count">
          생성된 분류 수{" "}
          <strong>{records.length.toLocaleString("ko-KR")}</strong>개
        </span>
      </div>

      <form
        className="legacy-category-search"
        onSubmit={(event) => event.preventDefault()}
      >
        <label className="sound_only" htmlFor="legacy-category-search-kind">
          검색 기준
        </label>
        <select id="legacy-category-search-kind" defaultValue="name">
          <option value="name">분류명</option>
          <option value="code">분류코드</option>
          <option value="member">회원아이디</option>
        </select>
        <label className="sound_only" htmlFor="legacy-category-query">
          검색어
        </label>
        <input
          id="legacy-category-query"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
        <button type="submit">검색</button>
      </form>

      <div className={styles.layout}>
        <AdminPanel
          title={`상품분류 (${records.length.toLocaleString("ko-KR")}개)`}
          action={
            <div className={styles.headerActions}>
              <AdminButton
                size="small"
                onClick={() => void loadRecords()}
                loading={loading}
              >
                새로고침
              </AdminButton>
              <AdminButton
                size="small"
                variant="primary"
                onClick={startCreate}
              >
                분류 등록
              </AdminButton>
            </div>
          }
        >
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>분류명</th>
                  <th>분류코드</th>
                  <th>순서</th>
                  <th>상태</th>
                  <th>상품</th>
                  <th>관리</th>
                </tr>
              </thead>
              <tbody>
                {visibleRecords.map((record) => {
                  const category = record.category;
                  const active = category.id === selectedId;
                  return (
                    <tr
                      key={category.id}
                      className={active ? styles.activeRow : undefined}
                    >
                      <td>
                        <strong>
                          {category.parentId ? "└ " : ""}
                          {category.name}
                        </strong>
                        {category.parentId ? (
                          <small>
                            {categoryById.get(category.parentId)?.name ??
                              "상위 분류 없음"}
                          </small>
                        ) : null}
                      </td>
                      <td>{category.id}</td>
                      <td>{category.sortOrder.toLocaleString("ko-KR")}</td>
                      <td>
                        <StatusBadge
                          tone={category.active ? "success" : "neutral"}
                        >
                          {category.active ? "활성" : "비활성"}
                        </StatusBadge>
                      </td>
                      <td>{record.productCount.toLocaleString("ko-KR")}개</td>
                      <td>
                        <AdminButton
                          size="small"
                          variant={active ? "primary" : "default"}
                          onClick={() => startEdit(record)}
                        >
                          수정
                        </AdminButton>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </AdminPanel>

        {editorOpen ? (
          <AdminPanel
          title={mode === "create" ? "상품분류 등록" : "상품분류 수정"}
          subtitle={
            selected
              ? `${sourceLabel(selected.source)} · 연결상품 ${selected.productCount.toLocaleString("ko-KR")}개`
              : "새 분류 정보를 입력해 주세요."
          }
        >
          <div className={styles.form}>
            <CategoryField
              label="분류코드"
              error={fieldErrors.id}
              help="등록 후에는 변경할 수 없습니다."
            >
              <AdminInput
                value={form.id}
                maxLength={40}
                readOnly={mode === "edit"}
                disabled={saving || deleting}
                invalid={Boolean(fieldErrors.id)}
                onChange={(event) =>
                  updateForm("id", event.currentTarget.value)
                }
              />
            </CategoryField>
            <CategoryField label="분류명" error={fieldErrors.name}>
              <AdminInput
                value={form.name}
                maxLength={80}
                disabled={saving || deleting}
                invalid={Boolean(fieldErrors.name)}
                onChange={(event) =>
                  updateForm("name", event.currentTarget.value)
                }
              />
            </CategoryField>
            <CategoryField
              label="상위 분류"
              error={fieldErrors.parentId}
              help={
                selected?.childCount
                  ? "하위 분류가 연결된 대분류는 다른 분류 아래로 이동할 수 없습니다."
                  : "대분류로 사용하려면 ‘없음’을 선택하세요."
              }
            >
              <AdminSelect
                value={form.parentId}
                disabled={
                  saving || deleting || Boolean(selected?.childCount)
                }
                onChange={(event) =>
                  updateForm("parentId", event.currentTarget.value)
                }
              >
                <option value="">없음 (대분류)</option>
                {parentOptions.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name} ({category.id})
                  </option>
                ))}
              </AdminSelect>
            </CategoryField>
            <CategoryField label="정렬순서" error={fieldErrors.sortOrder}>
              <AdminInput
                type="number"
                min={0}
                max={1_000_000}
                step={1}
                value={form.sortOrder}
                disabled={saving || deleting}
                invalid={Boolean(fieldErrors.sortOrder)}
                onChange={(event) =>
                  updateForm("sortOrder", event.currentTarget.value)
                }
              />
            </CategoryField>
            <CategoryField label="공개 상태">
              <Toggle
                checked={form.active}
                label={form.active ? "공개 메뉴에 표시" : "공개 메뉴에서 숨김"}
                disabled={saving || deleting}
                onChange={(checked) => updateForm("active", checked)}
              />
            </CategoryField>
            <div className={styles.formActions}>
              {mode === "edit" ? (
                <AdminButton
                  variant="danger"
                  disabled={cannotDelete || saving}
                  onClick={() => setDeleteOpen(true)}
                >
                  삭제
                </AdminButton>
              ) : (
                <span />
              )}
              <AdminButton
                variant="primary"
                loading={saving}
                disabled={deleting}
                onClick={() => void saveCategory()}
              >
                {mode === "create" ? "등록" : "저장"}
              </AdminButton>
            </div>
            {mode === "edit" && cannotDelete ? (
              <p className={styles.deleteHelp}>
                {selected?.childCount
                  ? "하위 분류가 연결되어 삭제할 수 없습니다."
                  : "상품이 연결되어 삭제할 수 없습니다. 비활성 전환은 가능합니다."}
              </p>
            ) : null}
          </div>
          </AdminPanel>
        ) : null}
      </div>

      <ConfirmDialog
        open={deleteOpen}
        title="상품분류 삭제"
        message={`“${selected?.category.name ?? ""}” 분류를 삭제하시겠습니까?`}
        warning="삭제된 분류는 공개 메뉴와 상품분류 선택에서 사라집니다."
        confirmLabel="삭제"
        destructive
        busy={deleting}
        onConfirm={deleteCategory}
        onClose={() => {
          if (!deleting) setDeleteOpen(false);
        }}
      />
    </div>
  );
}

function CategoryField({
  label,
  error,
  help,
  children,
}: {
  label: string;
  error?: string;
  help?: string;
  children: ReactNode;
}) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      {children}
      {help ? <small>{help}</small> : null}
      {error ? (
        <small className={styles.fieldError} role="alert">
          {error}
        </small>
      ) : null}
    </label>
  );
}

function validateForm(
  form: CategoryFormState,
  parentOptions: ManagedCategory[],
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/u.test(form.id)) {
    errors.id = "영문 또는 숫자로 시작하는 40자 이하 코드를 입력해 주세요.";
  }
  const name = form.name.trim();
  if (!name || name.length > 80 || /[<>\u0000-\u001f\u007f]/u.test(name)) {
    errors.name = "분류명을 1~80자로 입력해 주세요.";
  }
  if (
    /(?:https?:\/\/|(?:^|[\s(])\/\/|www\.|\b[a-z0-9-]+(?:\.[a-z0-9-]+)+(?::\d+)?(?:\/|\b))/iu.test(
      name,
    )
  ) {
    errors.name = "외부 또는 기존 도메인 주소를 분류명에 사용할 수 없습니다.";
  }
  if (
    form.parentId &&
    !parentOptions.some((category) => category.id === form.parentId)
  ) {
    errors.parentId = "상위 분류를 다시 선택해 주세요.";
  }
  if (
    !/^\d+$/u.test(form.sortOrder) ||
    Number(form.sortOrder) > 1_000_000
  ) {
    errors.sortOrder = "0 이상 1,000,000 이하 정수를 입력해 주세요.";
  }
  return errors;
}

function nextSortOrder(records: AdminCategoryRecord[]) {
  return String(
    Math.min(
      1_000_000,
      Math.max(0, ...records.map((record) => record.category.sortOrder)) + 1,
    ),
  );
}

function sourceLabel(source: AdminCategoryRecord["source"]) {
  return source === "static"
    ? "기본 분류"
    : source === "created"
      ? "신규 분류"
      : "수정된 분류";
}

function redirectToAdminLogin() {
  window.location.assign(
    `/adm/login?next=${encodeURIComponent(window.location.pathname)}`,
  );
}
