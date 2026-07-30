"use client";

import { useMemo, useState } from "react";
import { AdminButton } from "@/app/components/admin";
import type { AdminCategoryRecord } from "@/lib/category-contract";

interface LegacyCategoriesManagerProps {
  initialRecords: AdminCategoryRecord[];
}

interface CategoryApiResponse {
  ok?: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
  category?: AdminCategoryRecord;
  categories?: AdminCategoryRecord[];
}

interface CategoryDraft {
  id: string;
  name: string;
  manager: string;
  active: boolean;
  identityRequired: boolean;
  adultOnly: boolean;
  imageWidth: string;
  imageHeight: string;
  desktopColumns: string;
  desktopRows: string;
  mobileColumns: string;
  mobileRows: string;
  skinDirectory: string;
  skin: string;
  mobileSkinDirectory: string;
  mobileSkin: string;
}

const PAGE_SIZE = 15;

export function LegacyCategoriesManager({
  initialRecords,
}: LegacyCategoriesManagerProps) {
  const [records, setRecords] = useState(initialRecords);
  const [drafts, setDrafts] = useState<Record<string, CategoryDraft>>(() =>
    Object.fromEntries(
      initialRecords.map((record) => [
        record.category.id,
        recordToDraft(record),
      ]),
    ),
  );
  const [query, setQuery] = useState("");
  const [searchField, setSearchField] = useState<
    "ca_name" | "ca_id" | "ca_mb_id"
  >("ca_name");
  const [page, setPage] = useState(1);
  const [createDraft, setCreateDraft] = useState<CategoryDraft | null>(null);
  const [createParentId, setCreateParentId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("ko-KR");
    if (!needle) return records;
    return records.filter((record) => {
      const value =
        searchField === "ca_id"
          ? record.category.id
          : searchField === "ca_mb_id"
            ? record.category.manager ?? ""
            : record.category.name;
      return value.toLocaleLowerCase("ko-KR").includes(needle);
    });
  }, [query, records, searchField]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visible = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  function updateDraft(
    id: string,
    field: keyof CategoryDraft,
    value: string | boolean,
  ) {
    setDrafts((current) => ({
      ...current,
      [id]: { ...current[id], [field]: value },
    }));
    setFeedback(null);
  }

  async function reloadRecords() {
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
    setDrafts(
      Object.fromEntries(
        payload.categories.map((record) => [
          record.category.id,
          recordToDraft(record),
        ]),
      ),
    );
    return payload.categories;
  }

  async function saveRecord(record: AdminCategoryRecord) {
    const draft = drafts[record.category.id];
    if (!draft) return;
    const response = await fetch(
      `/api/admin/categories/${encodeURIComponent(record.category.id)}`,
      {
        method: "PATCH",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...draftPayload(
            draft,
            record.category.parentId,
            record.category.sortOrder,
          ),
          expectedRevision: record.revision,
        }),
      },
    );
    const payload = (await response.json()) as CategoryApiResponse;
    if (response.status === 401) {
      redirectToAdminLogin();
      return;
    }
    if (!response.ok || !payload.category) {
      throw new Error(
        firstCategoryError(payload) ?? "상품분류를 저장하지 못했습니다.",
      );
    }
  }

  async function saveAll() {
    if (saving) return;
    const changed = records.filter((record) => {
      const draft = drafts[record.category.id];
      return draft && !sameDraft(draft, recordToDraft(record));
    });
    if (changed.length === 0) {
      setFeedback({ tone: "success", message: "변경된 분류가 없습니다." });
      return;
    }
    setSaving(true);
    setFeedback(null);
    try {
      for (const record of changed) await saveRecord(record);
      await reloadRecords();
      setFeedback({
        tone: "success",
        message: `${changed.length.toLocaleString("ko-KR")}개 분류를 수정했습니다.`,
      });
    } catch (cause) {
      setFeedback({
        tone: "error",
        message:
          cause instanceof Error
            ? cause.message
            : "상품분류를 수정하지 못했습니다.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function createCategory() {
    if (!createDraft || saving) return;
    setSaving(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/admin/categories", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          draftPayload(
            createDraft,
            createParentId,
            records.length + 1,
          ),
        ),
      });
      const payload = (await response.json()) as CategoryApiResponse;
      if (response.status === 401) {
        redirectToAdminLogin();
        return;
      }
      if (!response.ok || !payload.category) {
        throw new Error(
          firstCategoryError(payload) ?? "상품분류를 등록하지 못했습니다.",
        );
      }
      await reloadRecords();
      setCreateDraft(null);
      setCreateParentId(null);
      setFeedback({ tone: "success", message: "상품분류를 등록했습니다." });
    } catch (cause) {
      setFeedback({
        tone: "error",
        message:
          cause instanceof Error
            ? cause.message
            : "상품분류를 등록하지 못했습니다.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function deleteCategory(record: AdminCategoryRecord) {
    if (
      saving ||
      record.productCount > 0 ||
      record.childCount > 0 ||
      !window.confirm(`“${record.category.name}” 분류를 삭제하시겠습니까?`)
    ) {
      return;
    }
    setSaving(true);
    setFeedback(null);
    try {
      const response = await fetch(
        `/api/admin/categories/${encodeURIComponent(
          record.category.id,
        )}?revision=${encodeURIComponent(String(record.revision))}`,
        { method: "DELETE", headers: { Accept: "application/json" } },
      );
      const payload = (await response.json()) as CategoryApiResponse;
      if (!response.ok) {
        throw new Error(payload.message ?? "상품분류를 삭제하지 못했습니다.");
      }
      await reloadRecords();
      setFeedback({ tone: "success", message: "상품분류를 삭제했습니다." });
    } catch (cause) {
      setFeedback({
        tone: "error",
        message:
          cause instanceof Error
            ? cause.message
            : "상품분류를 삭제하지 못했습니다.",
      });
    } finally {
      setSaving(false);
    }
  }

  const createRecord: AdminCategoryRecord = {
    category: {
      id: "__new__",
      name: "",
      parentId: createParentId,
      sortOrder: 0,
      active: true,
    },
    source: "created",
    deleted: false,
    revision: 0,
    updatedBy: "",
    createdAt: null,
    updatedAt: null,
    productCount: 0,
    childCount: 0,
  };
  const rows =
    createDraft && createParentId === null
      ? [createRecord, ...visible]
      : visible.flatMap((record) =>
          createDraft && createParentId === record.category.id
            ? [record, createRecord]
            : [record],
        );

  return (
    <div className="legacy-category-inline-page">
      <div className="btn_fixed_top legacy-category-actions">
        <AdminButton onClick={() => void saveAll()} loading={saving}>
          일괄수정
        </AdminButton>
        <AdminButton
          variant="primary"
          onClick={() => {
            setCreateDraft(emptyDraft());
            setCreateParentId(null);
            setPage(1);
          }}
          disabled={Boolean(createDraft) || saving}
        >
          분류 추가
        </AdminButton>
      </div>

      {feedback ? (
        <p
          className={`legacy-category-feedback ${feedback.tone}`}
          role={feedback.tone === "error" ? "alert" : "status"}
        >
          {feedback.message}
        </p>
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
        <label className="sound_only" htmlFor="legacy-category-query">
          분류명 검색
        </label>
        <select
          aria-label="검색 기준"
          value={searchField}
          onChange={(event) => {
            setSearchField(
              event.currentTarget.value as
                | "ca_name"
                | "ca_id"
                | "ca_mb_id",
            );
            setPage(1);
          }}
        >
          <option value="ca_name">분류명</option>
          <option value="ca_id">분류코드</option>
          <option value="ca_mb_id">회원아이디</option>
        </select>
        <input
          id="legacy-category-query"
          type="text"
          value={query}
          onChange={(event) => {
            setQuery(event.currentTarget.value);
            setPage(1);
          }}
        />
        <button type="submit">검색</button>
      </form>

      <div className="legacy-category-table-wrap">
        <table className="legacy-category-table">
          <caption>상품분류 목록</caption>
          <colgroup>
            <col className="legacy-category-col-code" />
            <col className="legacy-category-col-name" />
            <col className="legacy-category-col-use" />
            <col className="legacy-category-col-auth" />
            <col className="legacy-category-col-image" />
            <col className="legacy-category-col-desktop" />
            <col className="legacy-category-col-mobile" />
            <col className="legacy-category-col-skin" />
            <col className="legacy-category-col-manage" />
          </colgroup>
          <thead>
            <tr>
              <th rowSpan={2}>분류코드</th>
              <th>분류명</th>
              <th>상품수</th>
              <th>본인인증</th>
              <th>이미지 폭</th>
              <th>1행이미지수</th>
              <th className="legacy-category-mobile-heading">
                모바일<br />1행이미지수
              </th>
              <th>PC스킨지정</th>
              <th rowSpan={2}>관리</th>
            </tr>
            <tr>
              <th>관리회원아이디</th>
              <th>판매가능</th>
              <th>성인인증</th>
              <th>이미지 높이</th>
              <th>이미지 행수</th>
              <th className="legacy-category-mobile-heading">
                모바일<br />이미지 행수
              </th>
              <th>모바일스킨지정</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((record) => {
              const creating = record.category.id === "__new__";
              const draft = creating
                ? createDraft!
                : drafts[record.category.id] ?? recordToDraft(record);
              const update = (
                field: keyof CategoryDraft,
                value: string | boolean,
              ) => {
                if (creating) {
                  setCreateDraft((current) =>
                    current ? { ...current, [field]: value } : current,
                  );
                } else {
                  updateDraft(record.category.id, field, value);
                }
              };
              return (
                <CategoryRows
                  key={creating ? "__new__" : record.category.id}
                  record={record}
                  draft={draft}
                  creating={creating}
                  disabled={saving}
                  onChange={update}
                  onSave={() =>
                    creating
                      ? void createCategory()
                      : void (async () => {
                          setSaving(true);
                          try {
                            await saveRecord(record);
                            await reloadRecords();
                            setFeedback({
                              tone: "success",
                              message: "상품분류를 수정했습니다.",
                            });
                          } catch (cause) {
                            setFeedback({
                              tone: "error",
                              message:
                                cause instanceof Error
                                  ? cause.message
                                  : "상품분류를 수정하지 못했습니다.",
                            });
                          } finally {
                            setSaving(false);
                          }
                        })()
                  }
                  onCancel={() => {
                    setCreateDraft(null);
                    setCreateParentId(null);
                  }}
                  onDelete={() => void deleteCategory(record)}
                  onCreateChild={() => {
                    setCreateDraft({
                      ...emptyDraft(),
                      id: nextChildCategoryId(record.category.id, records),
                    });
                    setCreateParentId(record.category.id);
                  }}
                />
              );
            })}
          </tbody>
        </table>
      </div>

        <nav
          className="pg_wrap legacy-category-pagination"
          aria-label="분류 목록 페이지"
        >
          <span className="pg">
          {Array.from({ length: totalPages }, (_, index) => index + 1).map(
            (pageNumber) =>
              pageNumber === currentPage ? (
              <strong className="pg_current" key={pageNumber}>
                <span className="sound_only">열린</span>
                {pageNumber}
                <span className="sound_only">페이지</span>
              </strong>
            ) : (
              <a
                href={`?page=${pageNumber}`}
                key={pageNumber}
                className="pg_page"
                onClick={(event) => {
                  event.preventDefault();
                  setPage(pageNumber);
                }}
              >
                {pageNumber}
                <span className="sound_only">페이지</span>
              </a>
            ),
          )}
          {currentPage < totalPages ? (
            <a
              href={`?page=${totalPages}`}
              className="pg_page pg_end"
              onClick={(event) => {
                event.preventDefault();
                setPage(totalPages);
              }}
            >
              맨끝
            </a>
          ) : null}
          </span>
        </nav>
    </div>
  );
}

function CategoryRows({
  record,
  draft,
  creating,
  disabled,
  onChange,
  onSave,
  onCancel,
  onDelete,
  onCreateChild,
}: {
  record: AdminCategoryRecord;
  draft: CategoryDraft;
  creating: boolean;
  disabled: boolean;
  onChange: (field: keyof CategoryDraft, value: string | boolean) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete: () => void;
  onCreateChild: () => void;
}) {
  return (
    <>
      <tr className="legacy-category-primary-row">
        <td rowSpan={2}>
          {creating ? (
            <input
              value={draft.id}
              maxLength={40}
              onChange={(event) => onChange("id", event.currentTarget.value)}
              disabled={disabled}
            />
          ) : (
            <a href={`/shop/list.php?ca_id=${encodeURIComponent(record.category.id)}`}>
              {record.category.id}
            </a>
          )}
        </td>
        <td>
          <input
            value={draft.name}
            maxLength={80}
            onChange={(event) => onChange("name", event.currentTarget.value)}
            disabled={disabled}
          />
        </td>
        <td>
          <a
            href={`/adm/products?categoryId=${encodeURIComponent(
              record.category.id,
            )}`}
          >
            {record.productCount.toLocaleString("ko-KR")}
          </a>
        </td>
        <td>
          <label className="legacy-category-check">
            <input
              type="checkbox"
              checked={draft.identityRequired}
              onChange={(event) =>
                onChange("identityRequired", event.currentTarget.checked)
              }
              disabled={disabled}
            />
            사용
          </label>
        </td>
        <NumberCell
          value={draft.imageWidth}
          field="imageWidth"
          onChange={onChange}
          disabled={disabled}
        />
        <NumberCell
          value={draft.desktopColumns}
          field="desktopColumns"
          onChange={onChange}
          disabled={disabled}
        />
        <NumberCell
          value={draft.mobileColumns}
          field="mobileColumns"
          onChange={onChange}
          disabled={disabled}
        />
        <td>
          <SkinControls
            directory={draft.skinDirectory}
            skin={draft.skin}
            directoryField="skinDirectory"
            skinField="skin"
            onChange={onChange}
            disabled={disabled}
          />
        </td>
        <td rowSpan={2} className="legacy-category-manage">
          {creating ? (
            <>
              <button
                type="button"
                className="legacy-category-add-button"
                onClick={onSave}
                disabled={disabled}
              >
                등록
              </button>
              <button type="button" onClick={onCancel} disabled={disabled}>
                취소
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="legacy-category-add-button"
                onClick={onCreateChild}
                disabled={disabled}
              >
                추가
              </button>
              <button type="button" onClick={onSave} disabled={disabled}>
                수정
              </button>
              <button
                type="button"
                onClick={onDelete}
                disabled={
                  disabled || record.productCount > 0 || record.childCount > 0
                }
                title={
                  record.productCount > 0 || record.childCount > 0
                    ? "연결 상품 또는 하위 분류가 있어 삭제할 수 없습니다."
                    : undefined
                }
              >
                삭제
              </button>
            </>
          )}
        </td>
      </tr>
      <tr className="legacy-category-secondary-row">
        <td>
          <input
            value={draft.manager}
            maxLength={80}
            onChange={(event) => onChange("manager", event.currentTarget.value)}
            disabled={disabled}
          />
        </td>
        <td>
          <label className="legacy-category-check">
            <input
              type="checkbox"
              checked={draft.active}
              onChange={(event) =>
                onChange("active", event.currentTarget.checked)
              }
              disabled={disabled}
            />
            판매
          </label>
        </td>
        <td>
          <label className="legacy-category-check">
            <input
              type="checkbox"
              checked={draft.adultOnly}
              onChange={(event) =>
                onChange("adultOnly", event.currentTarget.checked)
              }
              disabled={disabled}
            />
            사용
          </label>
        </td>
        <NumberCell
          value={draft.imageHeight}
          field="imageHeight"
          onChange={onChange}
          disabled={disabled}
        />
        <NumberCell
          value={draft.desktopRows}
          field="desktopRows"
          onChange={onChange}
          disabled={disabled}
        />
        <NumberCell
          value={draft.mobileRows}
          field="mobileRows"
          onChange={onChange}
          disabled={disabled}
        />
        <td>
          <SkinControls
            directory={draft.mobileSkinDirectory}
            skin={draft.mobileSkin}
            directoryField="mobileSkinDirectory"
            skinField="mobileSkin"
            onChange={onChange}
            disabled={disabled}
          />
        </td>
      </tr>
    </>
  );
}

function NumberCell({
  value,
  field,
  disabled,
  onChange,
}: {
  value: string;
  field: keyof CategoryDraft;
  disabled: boolean;
  onChange: (field: keyof CategoryDraft, value: string | boolean) => void;
}) {
  return (
    <td>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(event) => onChange(field, event.currentTarget.value)}
        disabled={disabled}
      />
    </td>
  );
}

function SkinControls({
  directory,
  skin,
  directoryField,
  skinField,
  disabled,
  onChange,
}: {
  directory: string;
  skin: string;
  directoryField: "skinDirectory" | "mobileSkinDirectory";
  skinField: "skin" | "mobileSkin";
  disabled: boolean;
  onChange: (field: keyof CategoryDraft, value: string | boolean) => void;
}) {
  const directoryOptions = uniqueOptions(directory, [
    "basic",
    "theme/basic",
  ]);
  const skinOptions = uniqueOptions(skin, [
    "list.10.skin.php",
    "list.20.skin.php",
    "list.30.skin.php",
  ]);
  return (
    <span className="legacy-category-skin-controls">
      <select
        aria-label={
          directoryField === "skinDirectory"
            ? "PC 스킨 폴더"
            : "모바일 스킨 폴더"
        }
        value={directory}
        onChange={(event) =>
          onChange(directoryField, event.currentTarget.value)
        }
        disabled={disabled}
      >
        {directoryOptions.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <select
        aria-label={skinField === "skin" ? "PC 스킨 파일" : "모바일 스킨 파일"}
        value={skin}
        onChange={(event) => onChange(skinField, event.currentTarget.value)}
        disabled={disabled}
      >
        {skinOptions.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </span>
  );
}

function recordToDraft(record: AdminCategoryRecord): CategoryDraft {
  const category = record.category;
  return {
    id: category.id,
    name: category.name,
    manager: category.manager ?? "",
    active: category.active,
    identityRequired: category.identityRequired ?? false,
    adultOnly: category.adultOnly ?? false,
    imageWidth: String(category.imageWidth ?? 600),
    imageHeight: String(category.imageHeight ?? 0),
    desktopColumns: String(category.desktopColumns ?? 3),
    desktopRows: String(category.desktopRows ?? 5),
    mobileColumns: String(category.mobileColumns ?? 3),
    mobileRows: String(category.mobileRows ?? 5),
    skinDirectory: category.skinDirectory ?? "basic",
    skin: category.skin ?? "list.10.skin.php",
    mobileSkinDirectory: category.mobileSkinDirectory ?? "basic",
    mobileSkin: category.mobileSkin ?? "list.10.skin.php",
  };
}

function emptyDraft(): CategoryDraft {
  return {
    id: "",
    name: "",
    manager: "",
    active: true,
    identityRequired: false,
    adultOnly: false,
    imageWidth: "600",
    imageHeight: "0",
    desktopColumns: "3",
    desktopRows: "5",
    mobileColumns: "3",
    mobileRows: "5",
    skinDirectory: "basic",
    skin: "list.10.skin.php",
    mobileSkinDirectory: "basic",
    mobileSkin: "list.10.skin.php",
  };
}

function draftPayload(
  draft: CategoryDraft,
  parentId: string | null,
  sortOrder?: number,
) {
  return {
    id: draft.id.trim(),
    name: draft.name.trim(),
    parentId,
    sortOrder: sortOrder ?? 0,
    active: draft.active,
    manager: draft.manager.trim(),
    identityRequired: draft.identityRequired,
    adultOnly: draft.adultOnly,
    imageWidth: Number(draft.imageWidth),
    imageHeight: Number(draft.imageHeight),
    desktopColumns: Number(draft.desktopColumns),
    desktopRows: Number(draft.desktopRows),
    mobileColumns: Number(draft.mobileColumns),
    mobileRows: Number(draft.mobileRows),
    skinDirectory: draft.skinDirectory,
    skin: draft.skin.trim(),
    mobileSkinDirectory: draft.mobileSkinDirectory,
    mobileSkin: draft.mobileSkin.trim(),
  };
}

function uniqueOptions(current: string, options: string[]): string[] {
  return options.includes(current) ? options : [current, ...options];
}

function nextChildCategoryId(
  parentId: string,
  records: AdminCategoryRecord[],
): string {
  const existing = new Set(records.map((record) => record.category.id));
  for (let index = 10; index <= 99; index += 10) {
    const candidate = `${parentId}${String(index).padStart(2, "0")}`;
    if (!existing.has(candidate)) return candidate;
  }
  for (let index = 1; index <= 99; index += 1) {
    const candidate = `${parentId}${String(index).padStart(2, "0")}`;
    if (!existing.has(candidate)) return candidate;
  }
  return `${parentId}01`;
}

function sameDraft(left: CategoryDraft, right: CategoryDraft) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function firstCategoryError(payload: CategoryApiResponse) {
  return payload.message ?? Object.values(payload.fieldErrors ?? {})[0];
}

function redirectToAdminLogin() {
  window.location.assign(
    `/adm/login?next=${encodeURIComponent(window.location.pathname)}`,
  );
}
