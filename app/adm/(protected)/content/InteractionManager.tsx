"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  AdminButton,
  AdminTextarea,
  ConfirmDialog,
  FormRow,
  FormSection,
  Toggle,
} from "@/app/components/admin";
import type {
  AdminInteractionPage,
  AdminProductInteraction,
  ProductInteractionKind,
} from "@/lib/admin-interactions";
import styles from "./interaction-manager.module.css";

interface InteractionManagerProps {
  kind: ProductInteractionKind;
  initialPage: AdminInteractionPage;
  categoryOptions: ReadonlyArray<{ id: string; name: string }>;
}

export function InteractionManager({
  kind,
  initialPage,
  categoryOptions,
}: InteractionManagerProps) {
  const [items, setItems] = useState<AdminProductInteraction[]>(
    initialPage.items,
  );
  const [selected, setSelected] = useState<AdminProductInteraction | null>(null);
  const [answer, setAnswer] = useState("");
  const [active, setActive] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [itemToDelete, setItemToDelete] =
    useState<AdminProductInteraction | null>(null);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [queryText, setQueryText] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [page, setPage] = useState(initialPage.page);
  const [pagination, setPagination] = useState({
    page: initialPage.page,
    pageSize: initialPage.pageSize,
    pageCount: initialPage.pageCount,
    total: initialPage.total,
  });
  const initialRequest = useRef(true);
  const label = kind === "question" ? "상품문의" : "사용후기";
  const load = useCallback(async (signal?: AbortSignal) => {
    const params = new URLSearchParams({
      kind,
      page: String(page),
      pageSize: "30",
    });
    if (appliedQuery) params.set("q", appliedQuery);
    const response = await fetch(`/api/admin/interactions?${params.toString()}`, {
      signal,
    });
    const result = (await response.json()) as {
      interactions?: AdminProductInteraction[];
      pagination?: {
        page: number;
        pageSize: number;
        pageCount: number;
        total: number;
      };
      message?: string;
    };
    if (response.status === 401) {
      window.location.assign("/adm/login");
      return;
    }
    if (!response.ok) throw new Error(result.message);
    setItems(result.interactions ?? []);
    if (result.pagination) {
      setPagination(result.pagination);
      if (result.pagination.page !== page) setPage(result.pagination.page);
    }
  }, [appliedQuery, kind, page]);

  useEffect(() => {
    if (initialRequest.current) {
      initialRequest.current = false;
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      void load(controller.signal)
        .catch((error: unknown) => {
          if (!controller.signal.aborted) {
            setFailed(true);
            setMessage(
              error instanceof Error && error.message
                ? error.message
                : `${label}을 불러오지 못했습니다.`,
            );
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [label, load]);

  function select(item: AdminProductInteraction) {
    setSelected(item);
    setAnswer(item.answer);
    setActive(item.active);
    setMessage("");
  }

  async function save() {
    if (!selected || saving) return;
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(
        `/api/admin/interactions/${encodeURIComponent(selected.id)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ answer, active }),
        },
      );
      const result = (await response.json()) as {
        interaction?: AdminProductInteraction;
        message?: string;
        fieldErrors?: { answer?: string };
      };
      if (response.status === 401) {
        window.location.assign("/adm/login");
        return;
      }
      if (!response.ok || !result.interaction) {
        throw new Error(
          result.fieldErrors?.answer ??
            result.message ??
            `${label}을 저장하지 못했습니다.`,
        );
      }
      const updated = result.interaction;
      setItems((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setSelected(updated);
      setAnswer(updated.answer);
      setActive(updated.active);
      setFailed(false);
      setMessage(`${label} 처리 내용을 저장했습니다.`);
    } catch (error) {
      setFailed(true);
      setMessage(
        error instanceof Error ? error.message : `${label}을 저장하지 못했습니다.`,
      );
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!itemToDelete || deleting) return;
    setDeleting(true);
    setMessage("");
    try {
      const response = await fetch(
        `/api/admin/interactions/${encodeURIComponent(itemToDelete.id)}`,
        { method: "DELETE" },
      );
      const result = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;
      if (response.status === 401) {
        window.location.assign("/adm/login");
        return;
      }
      if (!response.ok) {
        throw new Error(
          result?.message ?? `${label}를 삭제하지 못했습니다.`,
        );
      }
      await load();
      if (selected?.id === itemToDelete.id) setSelected(null);
      setItemToDelete(null);
      setFailed(false);
      setMessage(`${label}를 삭제했습니다.`);
    } catch (error) {
      setFailed(true);
      setMessage(
        error instanceof Error
          ? error.message
          : `${label}를 삭제하지 못했습니다.`,
      );
    } finally {
      setDeleting(false);
    }
  }

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    setPage(1);
    setAppliedQuery(queryText.trim());
  }

  return (
    <div className={`${styles.manager} ${styles.classicManager}`}>
      <span className="sound_only">답변·상태 관리</span>
      <div className="btn_fixed_top">
        {kind === "review" ? (
          <input
            type="submit"
            name="act_button"
            value="선택수정"
            className="btn btn_02 legacy-wide-fixed-action"
            form="fitemuselist"
            onClick={() => {
              if (selected) void save();
            }}
          />
        ) : null}{" "}
        <input
          type="submit"
          name="act_button"
          value="선택삭제"
          className="btn btn_02 legacy-wide-fixed-action"
          form={kind === "review" ? "fitemuselist" : "fitemqalist"}
          onClick={() => {
            if (selected) setItemToDelete(selected);
          }}
        />
      </div>

      <div className={`local_ov01 local_ov ${styles.summary}`}>
        <a href={`/adm/content?view=${kind === "review" ? "reviews" : "inquiries"}`} className="ov_listall">
          전체목록
        </a>{" "}
        <span className="btn_ov01">
          <span className="ov_txt">
            {kind === "review" ? " 전체 후기내역" : " 전체 문의내역"}
          </span>
          <span className="ov_num"> {pagination.total}건</span>
        </span>
      </div>

      <form className={styles.listControls} onSubmit={submitSearch}>
        <label className="sound_only" htmlFor={`interaction-category-${kind}`}>
          분류선택
        </label>
        <select id={`interaction-category-${kind}`} defaultValue="">
          <option value="">전체분류</option>
          {categoryOptions.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        <label className="sound_only" htmlFor={`interaction-field-${kind}`}>
          검색대상
        </label>
        <select id={`interaction-field-${kind}`} defaultValue="product-name">
          <option value="product-name">상품명</option>
          <option value="product-id">상품코드</option>
          {kind === "review" ? <option value="name">이름</option> : null}
        </select>
        <label className="sound_only" htmlFor={`interaction-search-${kind}`}>
          검색어
        </label>
        <input
          type="text"
          id={`interaction-search-${kind}`}
          value={queryText}
          onChange={(event) => setQueryText(event.currentTarget.value)}
          maxLength={80}
          required
        />
        <input type="submit" value="검색" className="btn_submit" />
      </form>

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
        <form
          id={kind === "review" ? "fitemuselist" : "fitemqalist"}
          name={kind === "review" ? "fitemuselist" : "fitemqalist"}
          className={styles.tableForm}
          onSubmit={(event) => event.preventDefault()}
        >
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <colgroup>
                {(kind === "question"
                  ? [
                      "120.171875px",
                      "220.953125px",
                      "165.703125px",
                      "165.703125px",
                      "165.703125px",
                      "165.765625px",
                    ]
                  : [
                      "103.140625px",
                      "189.640625px",
                      "142.234375px",
                      "142.234375px",
                      "142.234375px",
                      "142.234375px",
                      "142.28125px",
                    ]
                ).map((width, index) => (
                  <col key={`${kind}-${index}`} style={{ width }} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  <th scope="col">
                    <label className="sound_only" htmlFor={`interaction-all-${kind}`}>
                      {label} 전체
                    </label>
                    <input id={`interaction-all-${kind}`} type="checkbox" />
                  </th>
                  <th scope="col">상품명</th>
                  {kind === "review" ? <th scope="col">이름</th> : null}
                  <th scope="col">{kind === "review" ? "제목" : "질문"}</th>
                  {kind === "review" ? <th scope="col">평점</th> : null}
                  <th scope="col">{kind === "review" ? "확인" : "이름"}</th>
                  <th scope="col">{kind === "review" ? "관리" : "답변"}</th>
                  {kind === "question" ? <th scope="col">관리</th> : null}
                </tr>
              </thead>
              <tbody>
                {items.length ? (
                  items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`${item.title} 선택`}
                          checked={selected?.id === item.id}
                          onChange={(event) =>
                            event.currentTarget.checked
                              ? select(item)
                              : setSelected(null)
                          }
                        />
                      </td>
                      <td>
                        <a
                          href={`/shop/item.php?it_id=${encodeURIComponent(item.productId)}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {item.productId}
                        </a>
                      </td>
                      {kind === "review" ? <td>{item.authorName}</td> : null}
                      <td>{item.title}</td>
                      {kind === "review" ? <td>{item.rating}점</td> : null}
                      <td>
                        {kind === "review"
                          ? item.active
                            ? "확인"
                            : "미확인"
                          : item.authorName}
                      </td>
                      <td>
                        {kind === "review"
                          ? (
                              <button
                                type="button"
                                className="btn btn_03"
                                onClick={() => select(item)}
                              >
                                수정
                              </button>
                            )
                          : item.answer
                            ? "완료"
                            : "대기"}
                      </td>
                      {kind === "question" ? (
                        <td>
                          <button
                            type="button"
                            className="btn btn_03"
                            onClick={() => select(item)}
                          >
                            수정
                          </button>{" "}
                          <button
                            type="button"
                            className="btn btn_02"
                            onClick={() => setItemToDelete(item)}
                          >
                            삭제
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      className={styles.empty}
                      colSpan={kind === "question" ? 6 : 7}
                    >
                      자료가 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </form>
      )}
      {pagination.pageCount > 1 ? (
        <div className={styles.pagination}>
          <AdminButton
            type="button"
            size="small"
            disabled={page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            이전
          </AdminButton>
          <span>
            {pagination.page} / {pagination.pageCount}
          </span>
          <AdminButton
            type="button"
            size="small"
            disabled={page >= pagination.pageCount}
            onClick={() =>
              setPage((current) =>
                Math.min(pagination.pageCount, current + 1),
              )
            }
          >
            다음
          </AdminButton>
        </div>
      ) : null}

      {selected ? (
        <div className={styles.editor}>
          <FormSection
            title={`${label} 처리`}
            description={`작성자 ${selected.authorName} · 상품 ${selected.productId}`}
          >
            <FormRow label="제목">
              <p className={styles.originalText}>{selected.title}</p>
            </FormRow>
            <FormRow label="작성 내용">
              <p className={styles.originalText}>{selected.body}</p>
            </FormRow>
            <FormRow label="관리자 답변" htmlFor="interaction-answer">
              <AdminTextarea
                id="interaction-answer"
                className={styles.answerInput}
                value={answer}
                maxLength={5000}
                onChange={(event) => setAnswer(event.currentTarget.value)}
              />
            </FormRow>
            <FormRow label="공개 상태">
              <Toggle
                checked={active}
                label={active ? "공개" : "숨김"}
                onChange={setActive}
              />
            </FormRow>
          </FormSection>
          <div className={styles.editorActions}>
            <AdminButton onClick={() => setSelected(null)} disabled={saving}>
              닫기
            </AdminButton>
            <AdminButton
              variant="primary"
              loading={saving}
              onClick={() => void save()}
            >
              처리 내용 저장
            </AdminButton>
          </div>
        </div>
      ) : null}
      <ConfirmDialog
        open={Boolean(itemToDelete)}
        title={`${label} 삭제`}
        message={`“${itemToDelete?.title ?? ""}” 항목을 삭제하시겠습니까?`}
        warning="삭제한 후기·문의는 공개 상품 화면과 관리자 목록에서 복구할 수 없습니다."
        confirmLabel="삭제"
        destructive
        busy={deleting}
        onConfirm={() => void remove()}
        onClose={() => {
          if (!deleting) setItemToDelete(null);
        }}
      />
    </div>
  );
}
