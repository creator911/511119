"use client";

import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  AdminButton,
  AdminInput,
  ConfirmDialog,
  FormRow,
  FormSection,
  StatusBadge,
  Toggle,
} from "@/app/components/admin";
import type {
  AdminBannerRecord,
  ManagedBanner,
} from "@/lib/banner-contract";
import styles from "./banner-manager.module.css";

interface BannerManagerProps {
  initialBanners: AdminBannerRecord[];
}

type BannerFieldErrors = Partial<
  Record<keyof ManagedBanner | "request", string>
>;

interface BannerApiPayload {
  ok?: boolean;
  banner?: AdminBannerRecord;
  banners?: AdminBannerRecord[];
  message?: string;
  fieldErrors?: BannerFieldErrors;
}

type UploadTarget = "image" | "mobileImage";
type BannerFilter = {
  position: "all" | "main" | "left";
  device: "all" | "pc" | "mobile";
  time: "all" | "active" | "ended";
};

const defaultBannerFilter: BannerFilter = {
  position: "all",
  device: "all",
  time: "all",
};

const emptyDraft = (): ManagedBanner => ({
  id: "",
  image: "",
  mobileImage: "",
  href: "/shop",
  sortOrder: 0,
  active: true,
});

export function BannerManager({ initialBanners }: BannerManagerProps) {
  const [records, setRecords] = useState(() => sortRecords(initialBanners));
  const [draft, setDraft] = useState<ManagedBanner | null>(null);
  const [draftRevision, setDraftRevision] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<UploadTarget | null>(null);
  const [deleteTarget, setDeleteTarget] =
    useState<AdminBannerRecord | null>(null);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<BannerFieldErrors>({});
  const [filterDraft, setFilterDraft] =
    useState<BannerFilter>(defaultBannerFilter);
  const [appliedFilter, setAppliedFilter] =
    useState<BannerFilter>(defaultBannerFilter);

  const managedRecords = useMemo(
    () => records.filter((record) => record.source !== "static"),
    [records],
  );
  const displayedRecords = useMemo(
    () =>
      managedRecords.filter((record) => {
        if (appliedFilter.position === "left") return false;
        if (
          appliedFilter.time === "active" &&
          !record.banner.active
        ) {
          return false;
        }
        if (
          appliedFilter.time === "ended" &&
          record.banner.active
        ) {
          return false;
        }
        return true;
      }),
    [appliedFilter, managedRecords],
  );
  const isFiltered =
    appliedFilter.position !== "all" ||
    appliedFilter.device !== "all" ||
    appliedFilter.time !== "all";

  useEffect(() => {
    let cancelled = false;
    void loadRecords()
      .then((nextRecords) => {
        if (!cancelled) setRecords(sortRecords(nextRecords));
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          announce(
            error instanceof Error
              ? `${error.message} 현재 화면에는 기본 배너가 표시됩니다.`
              : "최신 배너 목록을 불러오지 못했습니다. 현재 화면에는 기본 배너가 표시됩니다.",
            true,
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function announce(text: string, danger = false) {
    setMessage(text);
    setFailed(danger);
  }

  function startCreate() {
    setDraft(emptyDraft());
    setDraftRevision(null);
    setFieldErrors({});
    announce("");
  }

  function startEdit(record: AdminBannerRecord) {
    setDraft({ ...record.banner });
    setDraftRevision(record.revision);
    setFieldErrors({});
    announce("");
  }

  function change<K extends keyof ManagedBanner>(
    field: K,
    value: ManagedBanner[K],
  ) {
    setDraft((current) => (current ? { ...current, [field]: value } : null));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    announce("");
  }

  async function uploadImage(file: File, target: UploadTarget) {
    if (!draft || uploading || saving) return;
    setUploading(target);
    setFieldErrors((current) => ({ ...current, [target]: undefined }));
    announce("");
    try {
      const formData = new FormData();
      formData.set("file", file);
      const response = await fetch("/api/admin/media", {
        method: "POST",
        body: formData,
      });
      const result = (await response.json()) as {
        ok?: boolean;
        url?: string;
        message?: string;
      };
      redirectIfSignedOut(response);
      if (!response.ok || !result.url) {
        throw new Error(result.message ?? "이미지를 업로드하지 못했습니다.");
      }
      change(target, result.url);
      announce(
        target === "image"
          ? "PC 이미지를 업로드했습니다. 저장 버튼을 눌러 적용해 주세요."
          : "모바일 이미지를 업로드했습니다. 저장 버튼을 눌러 적용해 주세요.",
      );
    } catch (error) {
      announce(
        error instanceof Error
          ? error.message
          : "이미지를 업로드하지 못했습니다.",
        true,
      );
    } finally {
      setUploading(null);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || saving || uploading) return;
    setSaving(true);
    setFieldErrors({});
    announce("");
    const editing = Boolean(draft.id);
    const target = editing
      ? `/api/admin/banners/${encodeURIComponent(draft.id)}`
      : "/api/admin/banners";

    try {
      const response = await fetch(target, {
        method: editing ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          image: draft.image,
          mobileImage: draft.mobileImage,
          href: draft.href,
          sortOrder: draft.sortOrder,
          active: draft.active,
          ...(editing ? { expectedRevision: draftRevision } : {}),
        }),
      });
      const result = (await response.json()) as BannerApiPayload;
      redirectIfSignedOut(response);
      if (!response.ok || !result.banner) {
        setFieldErrors(result.fieldErrors ?? {});
        throw new Error(result.message ?? "배너를 저장하지 못했습니다.");
      }

      setRecords((current) =>
        sortRecords([
          ...current.filter(
            (record) => record.banner.id !== result.banner?.banner.id,
          ),
          result.banner as AdminBannerRecord,
        ]),
      );
      setDraft(null);
      setDraftRevision(null);
      announce(editing ? "배너를 수정했습니다." : "새 배너를 등록했습니다.");
    } catch (error) {
      announce(
        error instanceof Error ? error.message : "배너를 저장하지 못했습니다.",
        true,
      );
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(record: AdminBannerRecord) {
    if (saving || uploading) return;
    setSaving(true);
    announce("");
    try {
      const response = await fetch(
        `/api/admin/banners/${encodeURIComponent(record.banner.id)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...record.banner,
            active: !record.banner.active,
            expectedRevision: record.revision,
          }),
        },
      );
      const result = (await response.json()) as BannerApiPayload;
      redirectIfSignedOut(response);
      if (!response.ok || !result.banner) {
        throw new Error(result.message ?? "노출 상태를 변경하지 못했습니다.");
      }
      setRecords((current) =>
        sortRecords(
          current.map((item) =>
            item.banner.id === result.banner?.banner.id
              ? (result.banner as AdminBannerRecord)
              : item,
          ),
        ),
      );
      announce(
        result.banner.banner.active
          ? "배너를 공개 화면에 노출했습니다."
          : "배너를 공개 화면에서 숨겼습니다.",
      );
    } catch (error) {
      announce(
        error instanceof Error
          ? error.message
          : "노출 상태를 변경하지 못했습니다.",
        true,
      );
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!deleteTarget || saving) return;
    setSaving(true);
    announce("");
    try {
      const response = await fetch(
        `/api/admin/banners/${encodeURIComponent(
          deleteTarget.banner.id,
        )}?revision=${encodeURIComponent(String(deleteTarget.revision))}`,
        { method: "DELETE" },
      );
      const result = (await response.json()) as BannerApiPayload;
      redirectIfSignedOut(response);
      if (!response.ok) {
        throw new Error(result.message ?? "배너를 삭제하지 못했습니다.");
      }
      const deletedId = deleteTarget.banner.id;
      setRecords((current) =>
        current.filter((record) => record.banner.id !== deletedId),
      );
      if (draft?.id === deletedId) {
        setDraft(null);
        setDraftRevision(null);
      }
      setDeleteTarget(null);
      announce("배너를 삭제했습니다.");
    } catch (error) {
      setDeleteTarget(null);
      announce(
        error instanceof Error ? error.message : "배너를 삭제하지 못했습니다.",
        true,
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={`${styles.manager} legacy-banner-page`}>
      <div className="btn_fixed_top">
        <AdminButton
          type="button"
          variant="primary"
          onClick={startCreate}
          disabled={saving || Boolean(uploading)}
        >
          배너추가
        </AdminButton>
      </div>

      {message ? (
        <p
          className={failed ? styles.messageError : styles.messageSuccess}
          role={failed ? "alert" : "status"}
        >
          {message}
        </p>
      ) : null}

      <div className="local_ov01 local_ov legacy-banner-summary">
        <span className="btn_ov01">
          <span className="ov_txt">
            {isFiltered ? "검색된 배너" : "등록된 배너"}
          </span>
          <span className="ov_num">
            {displayedRecords.length.toLocaleString("ko-KR")}개
          </span>
        </span>
        <form
          className="local_sch01 local_sch legacy-banner-search"
          onSubmit={(event) => {
            event.preventDefault();
            setAppliedFilter(filterDraft);
          }}
        >
          <select
            aria-label="배너 위치"
            value={filterDraft.position}
            onChange={(event) =>
              setFilterDraft((current) => ({
                ...current,
                position: event.currentTarget.value as BannerFilter["position"],
              }))
            }
          >
            <option value="all">위치 전체</option>
            <option value="main">메인</option>
            <option value="left">왼쪽</option>
          </select>
          <select
            aria-label="접속기기"
            value={filterDraft.device}
            onChange={(event) =>
              setFilterDraft((current) => ({
                ...current,
                device: event.currentTarget.value as BannerFilter["device"],
              }))
            }
          >
            <option value="all">PC와 모바일</option>
            <option value="pc">PC</option>
            <option value="mobile">모바일</option>
          </select>
          <select
            aria-label="배너 시간"
            value={filterDraft.time}
            onChange={(event) =>
              setFilterDraft((current) => ({
                ...current,
                time: event.currentTarget.value as BannerFilter["time"],
              }))
            }
          >
            <option value="all">배너 시간 전체</option>
            <option value="active">진행중인 배너</option>
            <option value="ended">종료된 배너</option>
          </select>
          <input className="btn_submit" type="submit" value="검색" />
        </form>
      </div>

      <div className="legacy-banner-table-wrap">
        <table>
          <caption>배너관리</caption>
          <colgroup>
            {[
              64.328125, 162.015625, 97.1875, 162.015625, 162.015625,
              162.015625, 97.1875, 97.234375,
            ].map((width, index) => (
              <col key={index} style={{ width }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th rowSpan={2}>ID</th>
              <th>접속기기</th>
              <th>위치</th>
              <th>시작일시</th>
              <th>종료일시</th>
              <th>출력순서</th>
              <th>조회</th>
              <th>관리</th>
            </tr>
            <tr>
              <th colSpan={7}>이미지</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="legacy-banner-empty">
                  최신 배너 목록을 확인하는 중입니다…
                </td>
              </tr>
            ) : displayedRecords.length === 0 ? (
              <tr>
                <td colSpan={8} className="legacy-banner-empty">
                  자료가 없습니다.
                </td>
              </tr>
            ) : (
              displayedRecords.map((record) => (
                <tr key={record.banner.id}>
                  <td>{record.banner.id}</td>
                  <td>PC+모바일</td>
                  <td>메인</td>
                  <td>{formatDate(record.updatedAt)}</td>
                  <td>-</td>
                  <td>{record.banner.sortOrder}</td>
                  <td>
                    <StatusBadge
                      tone={record.banner.active ? "success" : "neutral"}
                    >
                      {record.banner.active ? "노출" : "숨김"}
                    </StatusBadge>
                  </td>
                  <td>
                    <div className={styles.cardActions}>
                      <AdminButton
                        type="button"
                        size="small"
                        onClick={() => startEdit(record)}
                        disabled={saving || Boolean(uploading)}
                      >
                        수정
                      </AdminButton>
                      <AdminButton
                        type="button"
                        size="small"
                        onClick={() => void toggleActive(record)}
                        disabled={saving || Boolean(uploading)}
                      >
                        {record.banner.active ? "숨김" : "노출"}
                      </AdminButton>
                      <AdminButton
                        type="button"
                        size="small"
                        variant="danger"
                        onClick={() => setDeleteTarget(record)}
                        disabled={saving || Boolean(uploading)}
                      >
                        삭제
                      </AdminButton>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {draft ? (
        <form className={styles.editor} onSubmit={save}>
          <FormSection
            title={draft.id ? "배너 수정" : "배너 등록"}
            description="PC와 모바일 이미지를 각각 선택하고, 새 사이트 내부 연결 주소를 입력합니다."
          >
            {draft.id ? (
              <FormRow label="배너 식별값">
                <AdminInput value={draft.id} readOnly />
              </FormRow>
            ) : null}
            <FormRow
              label="PC 이미지"
              required
              error={fieldErrors.image}
              help="JPG, PNG, WEBP, GIF · 최대 5MB"
            >
              <ImagePicker
                inputId="banner-desktop-upload"
                src={draft.image}
                label="PC 이미지 선택"
                busy={uploading === "image"}
                disabled={saving || Boolean(uploading)}
                onSelect={(file) => void uploadImage(file, "image")}
              />
            </FormRow>
            <FormRow
              label="모바일 이미지"
              error={fieldErrors.mobileImage}
              help="선택하지 않으면 PC 이미지를 사용합니다."
            >
              <ImagePicker
                inputId="banner-mobile-upload"
                src={draft.mobileImage || draft.image}
                label="모바일 이미지 선택"
                busy={uploading === "mobileImage"}
                disabled={saving || Boolean(uploading)}
                onSelect={(file) => void uploadImage(file, "mobileImage")}
                secondaryAction={
                  draft.mobileImage && draft.mobileImage !== draft.image ? (
                    <AdminButton
                      type="button"
                      size="small"
                      onClick={() => change("mobileImage", "")}
                      disabled={saving || Boolean(uploading)}
                    >
                      PC 이미지와 동일
                    </AdminButton>
                  ) : null
                }
              />
            </FormRow>
            <FormRow
              label="연결 주소"
              htmlFor="banner-href"
              error={fieldErrors.href}
              help="/shop처럼 새 사이트 내부의 / 로 시작하는 주소만 입력할 수 있습니다."
            >
              <AdminInput
                id="banner-href"
                value={draft.href}
                maxLength={2_048}
                placeholder="/shop"
                invalid={Boolean(fieldErrors.href)}
                onChange={(event) => change("href", event.currentTarget.value)}
              />
            </FormRow>
            <FormRow
              label="정렬순서"
              htmlFor="banner-sort"
              error={fieldErrors.sortOrder}
            >
              <AdminInput
                id="banner-sort"
                type="number"
                min={0}
                max={100_000}
                step={1}
                value={draft.sortOrder}
                invalid={Boolean(fieldErrors.sortOrder)}
                onChange={(event) =>
                  change("sortOrder", Number(event.currentTarget.value))
                }
              />
            </FormRow>
            <FormRow label="노출 상태" error={fieldErrors.active}>
              <Toggle
                checked={draft.active}
                label={draft.active ? "공개 화면에 노출" : "숨김"}
                onChange={(checked) => change("active", checked)}
              />
            </FormRow>
          </FormSection>
          {fieldErrors.request ? (
            <p className={styles.messageError} role="alert">
              {fieldErrors.request}
            </p>
          ) : null}
          <div className={styles.editorActions}>
            <AdminButton
              type="button"
              onClick={() => {
                setDraft(null);
                setFieldErrors({});
              }}
              disabled={saving || Boolean(uploading)}
            >
              취소
            </AdminButton>
            <AdminButton
              type="submit"
              variant="primary"
              loading={saving}
              disabled={Boolean(uploading)}
            >
              저장
            </AdminButton>
          </div>
        </form>
      ) : null}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="배너 삭제"
        message={`“${deleteTarget?.banner.id ?? ""}” 배너를 삭제하시겠습니까?`}
        warning="삭제하면 공개 화면에서 즉시 제외됩니다. 같은 이미지 파일은 다른 항목에서 계속 사용할 수 있습니다."
        confirmLabel="삭제"
        destructive
        busy={saving}
        onConfirm={() => void remove()}
        onClose={() => {
          if (!saving) setDeleteTarget(null);
        }}
      />
    </div>
  );
}

interface ImagePickerProps {
  inputId: string;
  src: string;
  label: string;
  busy: boolean;
  disabled: boolean;
  onSelect: (file: File) => void;
  secondaryAction?: ReactNode;
}

function ImagePicker({
  inputId,
  src,
  label,
  busy,
  disabled,
  onSelect,
  secondaryAction,
}: ImagePickerProps) {
  return (
    <div className={styles.imagePicker}>
      <div className={styles.editorPreview}>
        {src ? (
          // Administrators can select only application-owned media paths.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" />
        ) : (
          <span>이미지를 선택해 주세요.</span>
        )}
      </div>
      <div className={styles.imagePickerActions}>
        <input
          id={inputId}
          className={styles.fileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          disabled={disabled}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (file) onSelect(file);
            event.currentTarget.value = "";
          }}
        />
        <label
          className={`${styles.fileButton} ${
            disabled ? styles.fileButtonDisabled : ""
          }`}
          htmlFor={inputId}
        >
          {busy ? "업로드 중…" : label}
        </label>
        {secondaryAction}
      </div>
      {src ? <code className={styles.mediaPath}>{src}</code> : null}
    </div>
  );
}

async function loadRecords(): Promise<AdminBannerRecord[]> {
  const response = await fetch("/api/admin/banners", {
    cache: "no-store",
    headers: { accept: "application/json" },
  });
  const result = (await response.json()) as BannerApiPayload;
  redirectIfSignedOut(response);
  if (!response.ok || !Array.isArray(result.banners)) {
    throw new Error(result.message ?? "최신 배너 목록을 불러오지 못했습니다.");
  }
  return result.banners;
}

function redirectIfSignedOut(response: Response) {
  if (response.status === 401) {
    window.location.assign("/adm/login");
    throw new Error("관리자 로그인이 필요합니다.");
  }
}

function sortRecords(records: AdminBannerRecord[]) {
  return [...records].sort(
    (left, right) =>
      left.banner.sortOrder - right.banner.sortOrder ||
      left.banner.id.localeCompare(right.banner.id),
  );
}

function formatDate(value: string | null) {
  if (!value) return "기본값";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("ko-KR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
}
