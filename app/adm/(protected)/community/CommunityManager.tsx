"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  AdminButton,
  AdminInput,
  AdminPanel,
  AdminSelect,
  AdminTextarea,
  Notice,
  StatusBadge,
  Toggle,
} from "@/app/components/admin";
import type {
  CommunityBoard,
  CommunityComment,
  CommunityGroup,
  CommunityPost,
  CommunityPostStatus,
  CommunityResource,
  InquirySettings,
  InquiryStatus,
  OneToOneInquiry,
} from "@/lib/admin-community";
import styles from "./community-manager.module.css";

export type CommunityView =
  | "groups"
  | "boards"
  | "posts"
  | "comments"
  | "inquiries"
  | "inquiry-settings";

interface CommunityManagerProps {
  view: CommunityView;
  initialData: CommunityInitialData;
}

export interface CommunityInitialData {
  groups: CommunityGroup[];
  boards: CommunityBoard[];
  posts: CommunityPost[];
  comments: CommunityComment[];
  inquiries: OneToOneInquiry[];
  settings: InquirySettings;
  pagination: {
    page: number;
    pageSize: number;
    pageCount: number;
    total: number;
  };
}

interface GroupDraft {
  id?: string;
  name: string;
  sortOrder: number;
  active: boolean;
}

interface BoardDraft {
  id?: string;
  groupId: string;
  slug: string;
  name: string;
  description: string;
  readLevel: number;
  writeLevel: number;
  commentEnabled: boolean;
  active: boolean;
  sortOrder: number;
}

interface PostDraft {
  id?: string;
  boardId: string;
  authorName: string;
  title: string;
  content: string;
  status: CommunityPostStatus;
  pinned: boolean;
}

interface CommentDraft {
  id?: string;
  postId: string;
  authorName: string;
  content: string;
  visible: boolean;
}

interface InquiryDraft {
  id: string;
  authorName: string;
  email: string;
  phone: string;
  category: string;
  title: string;
  content: string;
  status: InquiryStatus;
  answer: string;
}

const EMPTY_GROUP: GroupDraft = {
  name: "",
  sortOrder: 0,
  active: true,
};

const EMPTY_BOARD: BoardDraft = {
  groupId: "",
  slug: "",
  name: "",
  description: "",
  readLevel: 0,
  writeLevel: 1,
  commentEnabled: true,
  active: true,
  sortOrder: 0,
};

const EMPTY_POST: PostDraft = {
  boardId: "",
  authorName: "관리자",
  title: "",
  content: "",
  status: "published",
  pinned: false,
};

const EMPTY_COMMENT: CommentDraft = {
  postId: "",
  authorName: "관리자",
  content: "",
  visible: true,
};

export function CommunityManager({
  view,
  initialData,
}: CommunityManagerProps) {
  const [groups, setGroups] = useState<CommunityGroup[]>(initialData.groups);
  const [boards, setBoards] = useState<CommunityBoard[]>(initialData.boards);
  const [posts, setPosts] = useState<CommunityPost[]>(initialData.posts);
  const [comments, setComments] = useState<CommunityComment[]>(
    initialData.comments,
  );
  const [inquiries, setInquiries] = useState<OneToOneInquiry[]>(
    initialData.inquiries,
  );
  const [settings, setSettings] = useState<InquirySettings | null>(
    initialData.settings,
  );
  const [groupDraft, setGroupDraft] = useState<GroupDraft | null>(null);
  const [boardDraft, setBoardDraft] = useState<BoardDraft | null>(null);
  const [postDraft, setPostDraft] = useState<PostDraft | null>(null);
  const [commentDraft, setCommentDraft] = useState<CommentDraft | null>(null);
  const [inquiryDraft, setInquiryDraft] = useState<InquiryDraft | null>(null);
  const [settingsDraft, setSettingsDraft] = useState<InquirySettings | null>(
    initialData.settings,
  );
  const [categoriesText, setCategoriesText] = useState(
    initialData.settings.categories.join("|"),
  );
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [listPage, setListPage] = useState(initialData.pagination.page);
  const [pagination, setPagination] = useState(initialData.pagination);
  const initialRequest = useRef(true);

  const load = useCallback(async (signal?: AbortSignal) => {
    const resources: CommunityResource[] = [
      "groups",
      "boards",
      "posts",
      "comments",
      "inquiries",
      "inquiry-settings",
    ];
    const responses = await Promise.all(
      resources.map(async (resource) => {
        const params = new URLSearchParams({ resource });
        if (resource === view && resource !== "inquiry-settings") {
          params.set("page", String(listPage));
          params.set("pageSize", "30");
          if (appliedQuery) params.set("q", appliedQuery);
        } else if (resource !== "inquiry-settings") {
          params.set("pageSize", "200");
        }
        const response = await fetch(
          `/api/admin/community?${params.toString()}`,
          { headers: { accept: "application/json" }, signal },
        );
        const payload = (await response.json()) as {
          data?: unknown;
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
          throw new Error("관리자 로그인이 필요합니다.");
        }
        if (!response.ok) {
          throw new Error(payload.message ?? "관리 데이터를 불러오지 못했습니다.");
        }
        return [resource, payload.data, payload.pagination] as const;
      }),
    );
    for (const [resource, data, resourcePagination] of responses) {
      if (resource === "groups") setGroups(data as CommunityGroup[]);
      else if (resource === "boards") setBoards(data as CommunityBoard[]);
      else if (resource === "posts") setPosts(data as CommunityPost[]);
      else if (resource === "comments") setComments(data as CommunityComment[]);
      else if (resource === "inquiries") {
        setInquiries(data as OneToOneInquiry[]);
      } else {
        const next = data as InquirySettings;
        setSettings(next);
        setSettingsDraft((current) => current ?? next);
        setCategoriesText((current) =>
          current ? current : next.categories.join("|"),
        );
      }
      if (
        resource === view &&
        resource !== "inquiry-settings" &&
        resourcePagination
      ) {
        setPagination(resourcePagination);
        if (resourcePagination.page !== listPage) {
          setListPage(resourcePagination.page);
        }
      }
    }
  }, [appliedQuery, listPage, view]);

  useEffect(() => {
    if (initialRequest.current) {
      initialRequest.current = false;
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void load(controller.signal)
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          showMessage(
            error instanceof Error
              ? error.message
              : "관리 데이터를 불러오지 못했습니다.",
            true,
          );
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [load]);

  const unansweredCount = useMemo(
    () =>
      inquiries.filter(
        (inquiry) =>
          inquiry.status === "pending" || inquiry.status === "in_progress",
      ).length,
    [inquiries],
  );

  function showMessage(text: string, danger = false) {
    setMessage(text);
    setFailed(danger);
  }

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    setListPage(1);
    setAppliedQuery(searchText.trim());
  }

  async function mutate(
    method: "POST" | "PATCH",
    resource: CommunityResource,
    input: unknown,
    id?: string,
  ) {
    if (saving) return;
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/community", {
        method,
        headers: {
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify({ resource, id, input }),
      });
      const payload = (await response.json()) as { message?: string };
      if (response.status === 401) {
        window.location.assign("/adm/login");
        return;
      }
      if (!response.ok) {
        throw new Error(payload.message ?? "저장하지 못했습니다.");
      }
      await load();
      showMessage("저장했습니다.");
    } catch (error) {
      showMessage(
        error instanceof Error ? error.message : "저장하지 못했습니다.",
        true,
      );
      throw error;
    } finally {
      setSaving(false);
    }
  }

  async function remove(resource: Exclude<CommunityResource, "inquiry-settings">, id: string, label: string) {
    if (saving || !window.confirm(`${label}을(를) 삭제할까요? 삭제 후 복구할 수 없습니다.`)) {
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(
        `/api/admin/community?resource=${encodeURIComponent(resource)}&id=${encodeURIComponent(id)}`,
        { method: "DELETE", headers: { accept: "application/json" } },
      );
      const payload = (await response.json()) as { message?: string };
      if (response.status === 401) {
        window.location.assign("/adm/login");
        return;
      }
      if (!response.ok) {
        throw new Error(payload.message ?? "삭제하지 못했습니다.");
      }
      await load();
      showMessage("삭제했습니다.");
      if (inquiryDraft?.id === id) setInquiryDraft(null);
    } catch (error) {
      showMessage(
        error instanceof Error ? error.message : "삭제하지 못했습니다.",
        true,
      );
    } finally {
      setSaving(false);
    }
  }

  async function submitGroup(event: FormEvent) {
    event.preventDefault();
    if (!groupDraft) return;
    try {
      await mutate(
        groupDraft.id ? "PATCH" : "POST",
        "groups",
        groupDraft,
        groupDraft.id,
      );
      setGroupDraft(null);
    } catch {
      // The error is already displayed by mutate.
    }
  }

  async function submitBoard(event: FormEvent) {
    event.preventDefault();
    if (!boardDraft) return;
    try {
      await mutate(
        boardDraft.id ? "PATCH" : "POST",
        "boards",
        boardDraft,
        boardDraft.id,
      );
      setBoardDraft(null);
    } catch {
      // The error is already displayed by mutate.
    }
  }

  async function submitPost(event: FormEvent) {
    event.preventDefault();
    if (!postDraft) return;
    try {
      await mutate(
        postDraft.id ? "PATCH" : "POST",
        "posts",
        postDraft,
        postDraft.id,
      );
      setPostDraft(null);
    } catch {
      // The error is already displayed by mutate.
    }
  }

  async function submitComment(event: FormEvent) {
    event.preventDefault();
    if (!commentDraft) return;
    try {
      await mutate(
        commentDraft.id ? "PATCH" : "POST",
        "comments",
        commentDraft,
        commentDraft.id,
      );
      setCommentDraft(null);
    } catch {
      // The error is already displayed by mutate.
    }
  }

  async function submitInquiry(event: FormEvent) {
    event.preventDefault();
    if (!inquiryDraft) return;
    try {
      await mutate("PATCH", "inquiries", inquiryDraft, inquiryDraft.id);
      setInquiryDraft(null);
    } catch {
      // The error is already displayed by mutate.
    }
  }

  async function submitSettings(event: FormEvent) {
    event.preventDefault();
    if (!settingsDraft) return;
    const categories = categoriesText
      .split(/[|\r\n]+/u)
      .map((value) => value.trim())
      .filter(Boolean);
    try {
      await mutate("PATCH", "inquiry-settings", {
        ...settingsDraft,
        categories,
      });
      setSettingsDraft((current) =>
        current ? { ...current, categories } : current,
      );
    } catch {
      // The error is already displayed by mutate.
    }
  }

  async function submitGroupList(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const selectedValue = formData.get("chk[]");
    const selectedIndex = selectedValue === null ? -1 : Number(selectedValue);
    const group = groups[selectedIndex];
    const action = (
      (event.nativeEvent as SubmitEvent).submitter as HTMLInputElement | null
    )?.value;
    if (!group) {
      window.alert(`${action || "처리"} 하실 항목을 하나 이상 선택하세요.`);
      return;
    }
    if (action === "선택삭제") {
      await remove("groups", group.id, group.name);
      return;
    }
    try {
      await mutate(
        "PATCH",
        "groups",
        {
          name:
            String(formData.get(`gr_subject[${selectedIndex}]`) ?? "").trim() ||
            group.name,
          sortOrder: Number(
            formData.get(`gr_order[${selectedIndex}]`) ?? group.sortOrder,
          ),
          active: group.active,
        },
        group.id,
      );
    } catch {
      // mutate already reports the validation or persistence error.
    }
  }

  async function submitBoardList(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const selectedValue = formData.get("chk[]");
    const selectedIndex = selectedValue === null ? -1 : Number(selectedValue);
    const board = boards[selectedIndex];
    const action = (
      (event.nativeEvent as SubmitEvent).submitter as HTMLInputElement | null
    )?.value;
    if (!board) {
      window.alert(`${action || "처리"} 하실 항목을 하나 이상 선택하세요.`);
      return;
    }
    if (action === "선택삭제") {
      await remove("boards", board.id, board.name);
      return;
    }
    try {
      await mutate(
        "PATCH",
        "boards",
        {
          groupId:
            String(formData.get(`gr_id[${selectedIndex}]`) ?? board.groupId) ||
            board.groupId,
          slug: board.slug,
          name:
            String(formData.get(`bo_subject[${selectedIndex}]`) ?? "").trim() ||
            board.name,
          description: board.description,
          readLevel: board.readLevel,
          writeLevel: board.writeLevel,
          commentEnabled: board.commentEnabled,
          active: formData.has(`bo_use_search[${selectedIndex}]`),
          sortOrder: Number(
            formData.get(`bo_order[${selectedIndex}]`) ?? board.sortOrder,
          ),
        },
        board.id,
      );
    } catch {
      // mutate already reports the validation or persistence error.
    }
  }

  return (
    <div
      className={`${styles.manager} ${
        view === "boards" ? "legacy-board-manager" : ""
      } ${view === "groups" ? "legacy-group-manager" : ""} ${
        view === "posts"
          ? `legacy-post-manager ${
              posts.length === 0 ? "legacy-post-manager-empty" : ""
            }`
          : ""
      } ${view === "inquiry-settings" ? "legacy-inquiry-settings-page" : ""}`}
    >
      {message ? (
        <p
          className={`${styles.message} ${failed ? styles.messageError : ""}`}
          role={failed ? "alert" : "status"}
        >
          {message}
        </p>
      ) : null}
      {!loading && view !== "inquiry-settings" ? (
        <form className={styles.listControls} onSubmit={submitSearch}>
          {view === "posts" ? (
            <>
              <select aria-label="게시판" defaultValue="">
                <option value="">전체게시판</option>
                <option value="free">자유게시판</option>
                <option value="notice">공지사항</option>
                <option value="qa">질문답변</option>
                <option value="gallery">갤러리</option>
              </select>
              <select aria-label="기간" defaultValue="today">
                <option value="today">오늘</option>
                <option value="yesterday">어제</option>
                <option value="week">7일전</option>
                <option value="two-weeks">14일전</option>
                <option value="month">30일전</option>
                <option value="three-months">3개월전</option>
                <option value="six-months">6개월전</option>
                <option value="year">1년전</option>
                <option value="two-years">2년전</option>
                <option value="three-years">3년전</option>
                <option value="five-years">5년전</option>
                <option value="ten-years">10년전</option>
              </select>
              <select aria-label="그래프" defaultValue="line">
                <option value="line">선그래프</option>
                <option value="bar">막대그래프</option>
              </select>
              <input type="submit" value="확인" />
            </>
          ) : (
            <>
              {view === "boards" || view === "groups" ? (
                <select
                  aria-label="검색 기준"
                  defaultValue={view === "boards" ? "table" : "name"}
                >
                  {view === "boards" ? (
                    <>
                      <option value="table">TABLE</option>
                      <option value="name">제목</option>
                      <option value="group">그룹ID</option>
                    </>
                  ) : (
                    <>
                      <option value="name">제목</option>
                      <option value="id">ID</option>
                      <option value="admin">그룹관리자</option>
                    </>
                  )}
                </select>
              ) : (
                <label htmlFor="community-admin-search">목록 검색</label>
              )}
              <input
                id="community-admin-search"
                value={searchText}
                onChange={(event) => setSearchText(event.currentTarget.value)}
                maxLength={80}
                placeholder={
                  view === "groups" || view === "boards"
                    ? ""
                    : "제목, 내용, 작성자 검색"
                }
              />
              <AdminButton type="submit">검색</AdminButton>
              {appliedQuery ? (
                <AdminButton
                  type="button"
                  onClick={() => {
                    setSearchText("");
                    setAppliedQuery("");
                    setListPage(1);
                  }}
                >
                  초기화
                </AdminButton>
              ) : null}
              <div className={styles.listPagination}>
                <AdminButton
                  type="button"
                  size="small"
                  disabled={listPage <= 1}
                  onClick={() =>
                    setListPage((current) => Math.max(1, current - 1))
                  }
                >
                  이전
                </AdminButton>
                <span>
                  {pagination.page} / {pagination.pageCount} · 전체{" "}
                  {pagination.total}
                </span>
                <AdminButton
                  type="button"
                  size="small"
                  disabled={listPage >= pagination.pageCount}
                  onClick={() =>
                    setListPage((current) =>
                      Math.min(pagination.pageCount, current + 1),
                    )
                  }
                >
                  다음
                </AdminButton>
              </div>
            </>
          )}
        </form>
      ) : null}
      {loading ? (
        <AdminPanel title="운영 데이터">
          <p className={styles.empty}>관리 데이터를 불러오는 중입니다.</p>
        </AdminPanel>
      ) : view === "groups" ? (
        <>
          <div className="btn_fixed_top legacy-board-actions">
            <input
              type="submit"
              name="act_button"
              value="선택수정"
              className="btn btn_02 legacy-wide-fixed-action"
              form="fboardgrouplist"
            />
            <input
              type="submit"
              name="act_button"
              value="선택삭제"
              className="btn btn_02 legacy-wide-fixed-action"
              form="fboardgrouplist"
            />
            <a
              href="#group-editor"
              className="btn btn_01"
              onClick={(event) => {
                event.preventDefault();
                setGroupDraft({ ...EMPTY_GROUP });
              }}
            >
              게시판그룹 추가
            </a>
          </div>
          <div className="local_ov01 local_ov legacy-group-summary">
            <a className="ov_listall" href="/adm/community?view=groups">
              처음
            </a>{" "}
            <span className="btn_ov01">
              <span className="ov_txt">전체그룹</span>
              <span className="ov_num">
                {" "}
                {pagination.total.toLocaleString("ko-KR")}개
              </span>
            </span>
          </div>
          <form
            id="fboardgrouplist"
            name="fboardgrouplist"
            className={styles.groupListForm}
            onSubmit={(event) => void submitGroupList(event)}
          >
            <div className={styles.tableWrap}>
              <table className={`${styles.table} ${styles.groupTable}`}>
              <colgroup>
                <col style={{ width: "30px" }} />
                <col style={{ width: "155.234375px" }} />
                <col style={{ width: "358.765625px" }} />
                <col style={{ width: "100px" }} />
                <col style={{ width: "60px" }} />
                <col style={{ width: "40px" }} />
                <col style={{ width: "60px" }} />
                <col style={{ width: "40px" }} />
                <col style={{ width: "100px" }} />
                <col style={{ width: "60px" }} />
              </colgroup>
              <thead>
                <tr>
                  <th scope="col">
                    <span className="sound_only">그룹 전체</span>
                    <input
                      type="checkbox"
                      aria-label="그룹 전체"
                      onChange={(event) => {
                        event.currentTarget.form
                          ?.querySelectorAll<HTMLInputElement>(
                            'input[name="chk[]"]',
                          )
                          .forEach((input) => {
                            input.checked = event.currentTarget.checked;
                          });
                      }}
                    />
                  </th>
                  <th scope="col">
                    <a href="/adm/community?view=groups&sst=gr_id">그룹아이디</a>
                  </th>
                  <th scope="col">
                    <a href="/adm/community?view=groups&sst=gr_subject">제목</a>
                  </th>
                  <th scope="col">
                    <a href="/adm/community?view=groups&sst=gr_admin">
                      그룹관리자
                    </a>
                  </th>
                  <th scope="col">게시판</th>
                  <th scope="col">접근<br />사용</th>
                  <th scope="col">접근<br />회원수</th>
                  <th scope="col">
                    <a href="/adm/community?view=groups&sst=gr_order">
                      출력<br />순서
                    </a>
                  </th>
                  <th scope="col">접속기기</th>
                  <th scope="col">관리</th>
                </tr>
              </thead>
              <tbody>
                {groups.length ? (
                  groups.map((group, index) => (
                    <tr key={group.id}>
                      <td>
                        <input
                          type="checkbox"
                          name="chk[]"
                          value={index}
                          aria-label={`${group.name} 선택`}
                        />
                      </td>
                      <td className={styles.leftCell}>{group.id}</td>
                      <td className={styles.inputCell}>
                        <input
                          className={styles.tableInput}
                          type="text"
                          name={`gr_subject[${index}]`}
                          defaultValue={group.name}
                          aria-label={`${group.name} 그룹 제목`}
                        />
                      </td>
                      <td className={styles.inputCell}>
                        <input
                          className={styles.tableInput}
                          type="text"
                          name={`gr_admin[${index}]`}
                          defaultValue=""
                          size={10}
                          maxLength={20}
                          aria-label={`${group.name} 그룹 관리자`}
                        />
                      </td>
                      <td className={styles.numberCell}>{group.boardCount}</td>
                      <td className={styles.smallNumberCell}>
                        <input
                          type="checkbox"
                          name={`gr_use_access[${index}]`}
                          defaultChecked={false}
                          aria-label={`${group.name} 접근회원 사용`}
                        />
                      </td>
                      <td className={styles.numberCell}>0</td>
                      <td className={styles.smallNumberCell}>
                        <input
                          className={styles.tableInput}
                          type="text"
                          name={`gr_order[${index}]`}
                          defaultValue={0}
                          size={2}
                          aria-label={`${group.name} 출력 순서`}
                        />
                      </td>
                      <td className={styles.manageCell}>
                        <select
                          className={styles.tableSelect}
                          name={`gr_device[${index}]`}
                          defaultValue="both"
                          aria-label={`${group.name} 접속 기기`}
                        >
                          <option value="both">모두</option>
                          <option value="pc">PC</option>
                          <option value="mobile">모바일</option>
                        </select>
                      </td>
                      <td className={styles.smallManageCell}>
                        <a
                          href="#group-editor"
                          className="btn btn_03"
                          onClick={() =>
                            setGroupDraft({
                              id: group.id,
                              name: group.name,
                              sortOrder: group.sortOrder,
                              active: group.active,
                            })
                          }
                        >
                          수정
                        </a>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={10} className={styles.empty}>
                      등록된 게시판 그룹이 없습니다.
                    </td>
                  </tr>
                )}
                </tbody>
              </table>
            </div>
          </form>
          <div className={`local_desc01 local_desc ${styles.groupDescription}`}>
            <p>
              접근사용 옵션을 설정하시면 관리자가 지정한 회원만 해당 그룹에
              접근할 수 있습니다.
              <br />
              접근사용 옵션은 해당 그룹에 속한 모든 게시판에 적용됩니다.
            </p>
          </div>
          {groupDraft ? (
            <AdminPanel title={groupDraft.id ? "그룹 수정" : "그룹 등록"}>
              <form className={styles.form} onSubmit={submitGroup}>
                <div className={styles.formGrid}>
                  <Field label="그룹명">
                    <AdminInput
                      required
                      maxLength={80}
                      value={groupDraft.name}
                      onChange={(event) =>
                        setGroupDraft({ ...groupDraft, name: event.currentTarget.value })
                      }
                    />
                  </Field>
                  <Field label="정렬 순서">
                    <AdminInput
                      type="number"
                      min={0}
                      max={100000}
                      value={groupDraft.sortOrder}
                      onChange={(event) =>
                        setGroupDraft({
                          ...groupDraft,
                          sortOrder: Number(event.currentTarget.value),
                        })
                      }
                    />
                  </Field>
                  <Field label="사용 여부">
                    <Toggle
                      checked={groupDraft.active}
                      label={groupDraft.active ? "사용" : "중지"}
                      onChange={(active) => setGroupDraft({ ...groupDraft, active })}
                    />
                  </Field>
                </div>
                <FormActions saving={saving} cancel={() => setGroupDraft(null)} />
              </form>
            </AdminPanel>
          ) : null}
        </>
      ) : view === "boards" ? (
        <>
          <div className="btn_fixed_top legacy-board-actions">
            <input
              type="submit"
              name="act_button"
              value="선택수정"
              className="btn btn_02 legacy-wide-fixed-action"
              form="fboardlist"
            />
            <input
              type="submit"
              name="act_button"
              value="선택삭제"
              className="btn btn_02 legacy-wide-fixed-action"
              form="fboardlist"
            />
            <a
              href="#board-editor"
              className="btn btn_01"
              aria-disabled={groups.length === 0}
              onClick={(event) => {
                event.preventDefault();
                if (groups.length === 0) return;
                setBoardDraft({
                  ...EMPTY_BOARD,
                  groupId: groups[0]?.id ?? "",
                });
              }}
            >
              게시판 추가
            </a>
          </div>
          <div className="local_ov legacy-board-summary">
            <span className="legacy-summary-label">전체목록</span>
            <span className="legacy-summary-count">
              생성된 게시판수{" "}
              <strong>{pagination.total.toLocaleString("ko-KR")}</strong>개
            </span>
          </div>
          <form
            id="fboardlist"
            name="fboardlist"
            className={styles.boardListForm}
            onSubmit={(event) => void submitBoardList(event)}
          >
            <div className={styles.tableWrap}>
              <table className={styles.table}>
              <colgroup>
                <col style={{ width: "30px" }} />
                <col style={{ width: "105.421875px" }} />
                <col style={{ width: "72.53125px" }} />
                <col style={{ width: "106.953125px" }} />
                <col style={{ width: "106.953125px" }} />
                <col style={{ width: "142.140625px" }} />
                <col style={{ width: "40px" }} />
                <col style={{ width: "40px" }} />
                <col style={{ width: "40px" }} />
                <col style={{ width: "40px" }} />
                <col style={{ width: "40px" }} />
                <col style={{ width: "40px" }} />
                <col style={{ width: "40px" }} />
                <col style={{ width: "60px" }} />
                <col style={{ width: "100px" }} />
              </colgroup>
              <thead>
                <tr>
                  <th scope="col">
                    <span className="sound_only">게시판 전체</span>
                     <input
                       type="checkbox"
                       aria-label="게시판 전체"
                       onChange={(event) => {
                         event.currentTarget.form
                           ?.querySelectorAll<HTMLInputElement>(
                             'input[name="chk[]"]',
                           )
                           .forEach((input) => {
                             input.checked = event.currentTarget.checked;
                           });
                       }}
                     />
                   </th>
                  <th>
                    <a href="/adm/community?view=boards&sst=a.gr_id">그룹</a>
                  </th>
                  <th>
                    <a href="/adm/community?view=boards&sst=bo_table">TABLE</a>
                  </th>
                  <th>
                    <a href="/adm/community?view=boards&sst=bo_skin">스킨</a>
                  </th>
                  <th>
                    <a href="/adm/community?view=boards&sst=bo_mobile_skin">
                      모바일<br />스킨
                    </a>
                  </th>
                  <th>
                    <a href="/adm/community?view=boards&sst=bo_subject">제목</a>
                  </th>
                  <th>
                    읽기P<span className="sound_only">포인트</span>
                  </th>
                  <th>
                    쓰기P<span className="sound_only">포인트</span>
                  </th>
                  <th>
                    댓글P<span className="sound_only">포인트</span>
                  </th>
                  <th>
                    다운P<span className="sound_only">포인트</span>
                  </th>
                  <th>
                    <a href="/adm/community?view=boards&sst=bo_use_sns">
                      SNS<br />사용
                    </a>
                  </th>
                  <th>
                    <a href="/adm/community?view=boards&sst=bo_use_search">
                      검색<br />사용
                    </a>
                  </th>
                  <th>
                    <a href="/adm/community?view=boards&sst=bo_order">
                      출력<br />순서
                    </a>
                  </th>
                  <th>접속기기</th>
                  <th>관리</th>
                </tr>
              </thead>
              <tbody>
                {boards.length ? (
                  boards.map((board, index) => (
                    <tr key={board.id}>
                      <td>
                        <input
                          type="checkbox"
                          name="chk[]"
                          value={index}
                          aria-label={`${board.name} 선택`}
                        />
                      </td>
                      <td>
                        <select
                          className={styles.tableSelect}
                          name={`gr_id[${index}]`}
                          defaultValue={board.groupId}
                          aria-label={`${board.name} 그룹`}
                        >
                          <option value="">선택</option>
                          {groups.map((group) => (
                            <option key={group.id} value={group.id}>
                              {group.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>{board.slug}</td>
                      <td>
                        <select
                          className={styles.tableSelect}
                          name={`bo_skin[${index}]`}
                          defaultValue="basic"
                          aria-label={`${board.name} 스킨`}
                        >
                          <option value="">선택</option>
                          <option value="basic">basic</option>
                          <option value="gallery">gallery</option>
                        </select>
                      </td>
                      <td>
                        <select
                          className={styles.tableSelect}
                          name={`bo_mobile_skin[${index}]`}
                          defaultValue="basic"
                          aria-label={`${board.name} 모바일 스킨`}
                        >
                          <option value="">선택</option>
                          <option value="basic">basic</option>
                          <option value="gallery">gallery</option>
                        </select>
                      </td>
                      <td>
                        <input
                          className={styles.tableInput}
                          type="text"
                          name={`bo_subject[${index}]`}
                          defaultValue={board.name}
                          aria-label={`${board.name} 게시판 제목`}
                        />
                      </td>
                      <td className={styles.smallNumberCell}>
                        <input
                          className={styles.tableInput}
                          type="text"
                          name={`bo_read_point[${index}]`}
                          defaultValue={-1}
                          size={2}
                          aria-label={`${board.name} 읽기 포인트`}
                        />
                      </td>
                      <td className={styles.smallNumberCell}>
                        <input
                          className={styles.tableInput}
                          type="text"
                          name={`bo_write_point[${index}]`}
                          defaultValue={5}
                          size={2}
                          aria-label={`${board.name} 쓰기 포인트`}
                        />
                      </td>
                      <td className={styles.smallNumberCell}>
                        <input
                          className={styles.tableInput}
                          type="text"
                          name={`bo_comment_point[${index}]`}
                          defaultValue={1}
                          size={2}
                          aria-label={`${board.name} 댓글 포인트`}
                        />
                      </td>
                      <td className={styles.smallNumberCell}>
                        <input
                          className={styles.tableInput}
                          type="text"
                          name={`bo_download_point[${index}]`}
                          defaultValue={-20}
                          size={2}
                          aria-label={`${board.name} 다운로드 포인트`}
                        />
                      </td>
                      <td className={styles.smallNumberCell}>
                        <input
                          type="checkbox"
                          name={`bo_use_sns[${index}]`}
                          defaultChecked={board.commentEnabled}
                          aria-label={`${board.name} SNS 사용`}
                        />
                      </td>
                      <td className={styles.smallNumberCell}>
                        <input
                          type="checkbox"
                          name={`bo_use_search[${index}]`}
                          defaultChecked={board.active}
                          aria-label={`${board.name} 검색 사용`}
                        />
                      </td>
                      <td className={styles.smallNumberCell}>
                        <input
                          className={styles.tableInput}
                          type="text"
                          name={`bo_order[${index}]`}
                          defaultValue={0}
                          size={2}
                          aria-label={`${board.name} 출력 순서`}
                        />
                      </td>
                      <td className={styles.smallManageCell}>
                        <select
                          className={styles.tableSelect}
                          name={`bo_device[${index}]`}
                          defaultValue="both"
                          aria-label={`${board.name} 접속 기기`}
                        >
                          <option value="both">모두</option>
                          <option value="pc">PC</option>
                          <option value="mobile">모바일</option>
                        </select>
                      </td>
                      <td className={styles.mediumManageCell}>
                          <a
                            href="#board-editor"
                            className="btn btn_03"
                            onClick={() =>
                              setBoardDraft({
                                id: board.id,
                                groupId: board.groupId,
                                slug: board.slug,
                                name: board.name,
                                description: board.description,
                                readLevel: board.readLevel,
                                writeLevel: board.writeLevel,
                                commentEnabled: board.commentEnabled,
                                active: board.active,
                                sortOrder: board.sortOrder,
                              })
                            }
                          >
                            수정
                          </a>{" "}
                          <a
                            href="#board-copy"
                            className="btn btn_02"
                            aria-disabled={saving}
                            onClick={(event) => {
                              event.preventDefault();
                              if (saving) return;
                              setBoardDraft({
                                ...EMPTY_BOARD,
                                id: "",
                                groupId: board.groupId,
                                slug: `${board.slug}-copy`,
                                name: `${board.name} 복사`,
                              });
                            }}
                          >
                            복사
                          </a>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={15} className={styles.empty}>
                      등록된 게시판이 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
              </table>
            </div>
            <div className={styles.boardFooterSpacer} aria-hidden="true" />
          </form>
          {boardDraft ? (
            <AdminPanel title={boardDraft.id ? "게시판 수정" : "게시판 등록"}>
              <form
                className={styles.form}
                data-board-editor="true"
                onSubmit={submitBoard}
              >
                <div className={styles.formGrid}>
                  <Field label="게시판 그룹">
                    <AdminSelect
                      required
                      value={boardDraft.groupId}
                      onChange={(event) =>
                        setBoardDraft({ ...boardDraft, groupId: event.currentTarget.value })
                      }
                    >
                      {groups.map((group) => (
                        <option key={group.id} value={group.id}>{group.name}</option>
                      ))}
                    </AdminSelect>
                  </Field>
                  <Field label="게시판명">
                    <AdminInput
                      required
                      maxLength={100}
                      value={boardDraft.name}
                      onChange={(event) =>
                        setBoardDraft({ ...boardDraft, name: event.currentTarget.value })
                      }
                    />
                  </Field>
                  <Field label="게시판 주소" help="영문 소문자, 숫자, 하이픈 3~80자">
                    <AdminInput
                      required
                      pattern="[a-z0-9][a-z0-9-]{1,78}[a-z0-9]"
                      maxLength={80}
                      value={boardDraft.slug}
                      onChange={(event) =>
                        setBoardDraft({
                          ...boardDraft,
                          slug: event.currentTarget.value.toLowerCase(),
                        })
                      }
                    />
                  </Field>
                  <Field label="정렬 순서">
                    <AdminInput
                      type="number"
                      min={0}
                      max={100000}
                      value={boardDraft.sortOrder}
                      onChange={(event) =>
                        setBoardDraft({
                          ...boardDraft,
                          sortOrder: Number(event.currentTarget.value),
                        })
                      }
                    />
                  </Field>
                  <Field label="읽기 레벨">
                    <AdminInput
                      type="number"
                      min={0}
                      max={10}
                      value={boardDraft.readLevel}
                      onChange={(event) =>
                        setBoardDraft({
                          ...boardDraft,
                          readLevel: Number(event.currentTarget.value),
                        })
                      }
                    />
                  </Field>
                  <Field label="쓰기 레벨">
                    <AdminInput
                      type="number"
                      min={0}
                      max={10}
                      value={boardDraft.writeLevel}
                      onChange={(event) =>
                        setBoardDraft({
                          ...boardDraft,
                          writeLevel: Number(event.currentTarget.value),
                        })
                      }
                    />
                  </Field>
                  <Field label="댓글">
                    <Toggle
                      checked={boardDraft.commentEnabled}
                      label={boardDraft.commentEnabled ? "허용" : "허용 안 함"}
                      onChange={(commentEnabled) =>
                        setBoardDraft({ ...boardDraft, commentEnabled })
                      }
                    />
                  </Field>
                  <Field label="게시판 상태">
                    <Toggle
                      checked={boardDraft.active}
                      label={boardDraft.active ? "사용" : "중지"}
                      onChange={(active) => setBoardDraft({ ...boardDraft, active })}
                    />
                  </Field>
                  <div className={styles.full}>
                    <Field label="설명">
                      <AdminTextarea
                        maxLength={500}
                        value={boardDraft.description}
                        onChange={(event) =>
                          setBoardDraft({
                            ...boardDraft,
                            description: event.currentTarget.value,
                          })
                        }
                      />
                    </Field>
                  </div>
                </div>
                <FormActions saving={saving} cancel={() => setBoardDraft(null)} />
              </form>
            </AdminPanel>
          ) : null}
        </>
      ) : view === "posts" ? (
        <>
          <div className="btn_fixed_top legacy-board-actions">
            <AdminButton disabled={!postDraft?.id || saving}>
              선택삭제
            </AdminButton>
            <AdminButton
              variant="primary"
              disabled={boards.length === 0}
              onClick={() =>
                setPostDraft({
                  ...EMPTY_POST,
                  boardId: boards[0]?.id ?? "",
                })
              }
            >
              게시물 등록
            </AdminButton>
          </div>
          {posts.length ? (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>게시판</th>
                    <th>제목</th>
                    <th>작성자</th>
                    <th>상태</th>
                    <th>댓글/조회</th>
                    <th>작성일</th>
                    <th>관리</th>
                  </tr>
                </thead>
                <tbody>
                  {posts.map((post) => (
                      <tr key={post.id}>
                        <td>{post.boardName || "-"}</td>
                        <td className={styles.titleCell}>
                          <strong>{post.pinned ? "[공지] " : ""}{post.title}</strong>
                          <div className={styles.summary}>{post.content}</div>
                        </td>
                        <td>{post.authorName}</td>
                        <td><PostStatus status={post.status} /></td>
                        <td>{post.commentCount} / {post.hitCount}</td>
                        <td>{formatDate(post.createdAt)}</td>
                        <td>
                          <div className={styles.rowActions}>
                            <AdminButton
                              size="small"
                              onClick={() =>
                                setPostDraft({
                                  id: post.id,
                                  boardId: post.boardId,
                                  authorName: post.authorName,
                                  title: post.title,
                                  content: post.content,
                                  status: post.status,
                                  pinned: post.pinned,
                                })
                              }
                            >
                              수정
                            </AdminButton>
                            <AdminButton
                              size="small"
                              variant="danger"
                              disabled={saving}
                              onClick={() => void remove("posts", post.id, post.title)}
                            >
                              삭제
                            </AdminButton>
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {postDraft ? (
            <AdminPanel title={postDraft.id ? "게시물 수정" : "게시물 등록"}>
              <form className={styles.form} onSubmit={submitPost}>
                <div className={styles.formGrid}>
                  <Field label="게시판">
                    <AdminSelect
                      required
                      value={postDraft.boardId}
                      onChange={(event) =>
                        setPostDraft({ ...postDraft, boardId: event.currentTarget.value })
                      }
                    >
                      {boards.map((board) => (
                        <option key={board.id} value={board.id}>{board.name}</option>
                      ))}
                    </AdminSelect>
                  </Field>
                  <Field label="작성자">
                    <AdminInput
                      required
                      maxLength={80}
                      value={postDraft.authorName}
                      onChange={(event) =>
                        setPostDraft({ ...postDraft, authorName: event.currentTarget.value })
                      }
                    />
                  </Field>
                  <Field label="상태">
                    <AdminSelect
                      value={postDraft.status}
                      onChange={(event) =>
                        setPostDraft({
                          ...postDraft,
                          status: event.currentTarget.value as CommunityPostStatus,
                        })
                      }
                    >
                      <option value="published">게시</option>
                      <option value="draft">임시저장</option>
                      <option value="hidden">숨김</option>
                    </AdminSelect>
                  </Field>
                  <Field label="상단 고정">
                    <Toggle
                      checked={postDraft.pinned}
                      label={postDraft.pinned ? "고정" : "일반"}
                      onChange={(pinned) => setPostDraft({ ...postDraft, pinned })}
                    />
                  </Field>
                  <div className={styles.full}>
                    <Field label="제목">
                      <AdminInput
                        required
                        maxLength={200}
                        value={postDraft.title}
                        onChange={(event) =>
                          setPostDraft({ ...postDraft, title: event.currentTarget.value })
                        }
                      />
                    </Field>
                  </div>
                  <div className={styles.full}>
                    <Field label="내용">
                      <AdminTextarea
                        required
                        maxLength={50000}
                        className={styles.bodyInput}
                        value={postDraft.content}
                        onChange={(event) =>
                          setPostDraft({ ...postDraft, content: event.currentTarget.value })
                        }
                      />
                    </Field>
                  </div>
                </div>
                <FormActions saving={saving} cancel={() => setPostDraft(null)} />
              </form>
            </AdminPanel>
          ) : null}
        </>
      ) : view === "comments" ? (
        <>
          <AdminPanel
            title="댓글 관리"
            subtitle={`전체 ${pagination.total}개`}
            action={
              <AdminButton
                variant="primary"
                disabled={posts.length === 0}
                onClick={() =>
                  setCommentDraft({
                    ...EMPTY_COMMENT,
                    postId: posts[0]?.id ?? "",
                  })
                }
              >
                댓글 등록
              </AdminButton>
            }
          >
            {comments.length ? (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>게시물</th>
                      <th>댓글</th>
                      <th>작성자</th>
                      <th>상태</th>
                      <th>작성일</th>
                      <th>관리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comments.map((comment) => (
                      <tr key={comment.id}>
                        <td className={styles.titleCell}>{comment.postTitle || "-"}</td>
                        <td><div className={styles.summary}>{comment.content}</div></td>
                        <td>{comment.authorName}</td>
                        <td>
                          <StatusBadge tone={comment.visible ? "success" : "neutral"}>
                            {comment.visible ? "공개" : "숨김"}
                          </StatusBadge>
                        </td>
                        <td>{formatDate(comment.createdAt)}</td>
                        <td>
                          <div className={styles.rowActions}>
                            <AdminButton
                              size="small"
                              onClick={() =>
                                setCommentDraft({
                                  id: comment.id,
                                  postId: comment.postId,
                                  authorName: comment.authorName,
                                  content: comment.content,
                                  visible: comment.visible,
                                })
                              }
                            >
                              수정
                            </AdminButton>
                            <AdminButton
                              size="small"
                              variant="danger"
                              disabled={saving}
                              onClick={() => void remove("comments", comment.id, "댓글")}
                            >
                              삭제
                            </AdminButton>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className={styles.empty}>등록된 댓글이 없습니다.</p>
            )}
          </AdminPanel>
          {commentDraft ? (
            <AdminPanel title={commentDraft.id ? "댓글 수정" : "댓글 등록"}>
              <form className={styles.form} onSubmit={submitComment}>
                <div className={styles.formGrid}>
                  <Field label="게시물">
                    <AdminSelect
                      required
                      disabled={Boolean(commentDraft.id)}
                      value={commentDraft.postId}
                      onChange={(event) =>
                        setCommentDraft({
                          ...commentDraft,
                          postId: event.currentTarget.value,
                        })
                      }
                    >
                      {posts.map((post) => (
                        <option key={post.id} value={post.id}>{post.title}</option>
                      ))}
                    </AdminSelect>
                  </Field>
                  <Field label="작성자">
                    <AdminInput
                      required
                      maxLength={80}
                      value={commentDraft.authorName}
                      onChange={(event) =>
                        setCommentDraft({
                          ...commentDraft,
                          authorName: event.currentTarget.value,
                        })
                      }
                    />
                  </Field>
                  <Field label="공개 상태">
                    <Toggle
                      checked={commentDraft.visible}
                      label={commentDraft.visible ? "공개" : "숨김"}
                      onChange={(visible) =>
                        setCommentDraft({ ...commentDraft, visible })
                      }
                    />
                  </Field>
                  <div className={styles.full}>
                    <Field label="댓글">
                      <AdminTextarea
                        required
                        maxLength={5000}
                        className={styles.answerInput}
                        value={commentDraft.content}
                        onChange={(event) =>
                          setCommentDraft({
                            ...commentDraft,
                            content: event.currentTarget.value,
                          })
                        }
                      />
                    </Field>
                  </div>
                </div>
                <FormActions saving={saving} cancel={() => setCommentDraft(null)} />
              </form>
            </AdminPanel>
          ) : null}
        </>
      ) : view === "inquiries" ? (
        <>
          <Notice>
            현재 표시 목록의 접수 대기·처리 중 문의가 {unansweredCount}건
            있습니다. 답변 완료 상태는 답변 내용이 있어야 저장됩니다.
          </Notice>
          <div className={styles.inquiryGrid}>
            <AdminPanel title="1:1 문의 목록" subtitle={`전체 ${pagination.total}건`}>
              <div className={styles.inquiryList}>
                {inquiries.length ? inquiries.map((inquiry) => (
                  <button
                    key={inquiry.id}
                    type="button"
                    className={`${styles.inquiryButton} ${
                      inquiryDraft?.id === inquiry.id ? styles.inquiryButtonActive : ""
                    }`}
                    onClick={() => setInquiryDraft(toInquiryDraft(inquiry))}
                  >
                    <strong>[{inquiry.category}] {inquiry.title}</strong>
                    <span className={styles.inquiryMeta}>
                      <span>{inquiry.authorName}</span>
                      <span>{inquiryStatusLabel(inquiry.status)}</span>
                      <span>{formatDate(inquiry.createdAt)}</span>
                    </span>
                  </button>
                )) : (
                  <p className={styles.empty}>접수된 1:1 문의가 없습니다.</p>
                )}
              </div>
            </AdminPanel>
            <AdminPanel title={inquiryDraft ? "문의 처리" : "문의 상세"}>
              {inquiryDraft ? (
                <form className={styles.form} onSubmit={submitInquiry}>
                  <div className={styles.formGrid}>
                    <Field label="작성자">
                      <AdminInput
                        required
                        maxLength={80}
                        value={inquiryDraft.authorName}
                        onChange={(event) =>
                          setInquiryDraft({
                            ...inquiryDraft,
                            authorName: event.currentTarget.value,
                          })
                        }
                      />
                    </Field>
                    <Field label="처리 상태">
                      <AdminSelect
                        value={inquiryDraft.status}
                        onChange={(event) =>
                          setInquiryDraft({
                            ...inquiryDraft,
                            status: event.currentTarget.value as InquiryStatus,
                          })
                        }
                      >
                        <option value="pending">접수 대기</option>
                        <option value="in_progress">처리 중</option>
                        <option value="answered">답변 완료</option>
                        <option value="closed">종결</option>
                      </AdminSelect>
                    </Field>
                    <Field label="이메일">
                      <AdminInput
                        type="email"
                        maxLength={254}
                        value={inquiryDraft.email}
                        onChange={(event) =>
                          setInquiryDraft({
                            ...inquiryDraft,
                            email: event.currentTarget.value,
                          })
                        }
                      />
                    </Field>
                    <Field label="연락처">
                      <AdminInput
                        maxLength={40}
                        value={inquiryDraft.phone}
                        onChange={(event) =>
                          setInquiryDraft({
                            ...inquiryDraft,
                            phone: event.currentTarget.value,
                          })
                        }
                      />
                    </Field>
                    <Field label="분류">
                      <AdminInput
                        required
                        maxLength={80}
                        value={inquiryDraft.category}
                        onChange={(event) =>
                          setInquiryDraft({
                            ...inquiryDraft,
                            category: event.currentTarget.value,
                          })
                        }
                      />
                    </Field>
                    <div className={styles.full}>
                      <Field label="제목">
                        <AdminInput
                          required
                          maxLength={200}
                          value={inquiryDraft.title}
                          onChange={(event) =>
                            setInquiryDraft({
                              ...inquiryDraft,
                              title: event.currentTarget.value,
                            })
                          }
                        />
                      </Field>
                    </div>
                    <div className={styles.full}>
                      <Field label="문의 내용">
                        <p className={styles.detailBlock}>{inquiryDraft.content}</p>
                      </Field>
                    </div>
                    <div className={styles.full}>
                      <Field label="답변">
                        <AdminTextarea
                          required={inquiryDraft.status === "answered"}
                          maxLength={20000}
                          className={styles.answerInput}
                          value={inquiryDraft.answer}
                          onChange={(event) =>
                            setInquiryDraft({
                              ...inquiryDraft,
                              answer: event.currentTarget.value,
                            })
                          }
                        />
                      </Field>
                    </div>
                  </div>
                  <div className={styles.formActions}>
                    <AdminButton
                      type="button"
                      variant="danger"
                      disabled={saving}
                      onClick={() =>
                        void remove(
                          "inquiries",
                          inquiryDraft.id,
                          inquiryDraft.title,
                        )
                      }
                    >
                      삭제
                    </AdminButton>
                    <AdminButton
                      type="button"
                      disabled={saving}
                      onClick={() => setInquiryDraft(null)}
                    >
                      닫기
                    </AdminButton>
                    <AdminButton type="submit" variant="primary" loading={saving}>
                      저장
                    </AdminButton>
                  </div>
                </form>
              ) : (
                <p className={styles.empty}>왼쪽 목록에서 문의를 선택해 주세요.</p>
              )}
            </AdminPanel>
          </div>
        </>
      ) : settingsDraft && settings ? (
        <LegacyInquirySettingsForm
          draft={settingsDraft}
          categoriesText={categoriesText}
          saving={saving}
          onDraftChange={setSettingsDraft}
          onCategoriesChange={setCategoriesText}
          onSubmit={submitSettings}
        />
      ) : (
        <AdminPanel title="1:1 문의 설정">
          <p className={styles.empty}>설정을 불러오지 못했습니다.</p>
        </AdminPanel>
      )}
    </div>
  );
}

function LegacyInquirySettingsForm({
  draft,
  categoriesText,
  saving,
  onDraftChange,
  onCategoriesChange,
  onSubmit,
}: {
  draft: InquirySettings;
  categoriesText: string;
  saving: boolean;
  onDraftChange: (value: InquirySettings | null) => void;
  onCategoriesChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}) {
  const updateLegacy = <Key extends keyof InquirySettings["legacy"]>(
    key: Key,
    value: InquirySettings["legacy"][Key],
  ) => {
    onDraftChange({
      ...draft,
      legacy: { ...draft.legacy, [key]: value },
    });
  };
  const updateExtra = (
    key: "extraSubjects" | "extraValues",
    index: number,
    value: string,
  ) => {
    updateLegacy(
      key,
      draft.legacy[key].map((current, currentIndex) =>
        currentIndex === index ? value : current,
      ),
    );
  };

  return (
    <>
      <h2 className="legacy-inquiry-settings-heading">1:1문의 설정</h2>
      <form
        className="legacy-inquiry-settings-form"
        onSubmit={(event) => void onSubmit(event)}
      >
        <div className="btn_fixed_top legacy-inquiry-settings-actions">
          <AdminButton type="submit" variant="primary" loading={saving}>
            확인
          </AdminButton>
        </div>
        <div className="tbl_frm01">
          <table className="legacy-inquiry-settings-table">
            <caption>1:1문의 환경설정</caption>
            <tbody>
              <InquirySettingRow index={0} label="타이틀">
                <input
                  id="qa_title"
                  className="required frm_input"
                  required
                  size={40}
                  maxLength={100}
                  value={draft.title}
                  onChange={(event) =>
                    onDraftChange({ ...draft, title: event.currentTarget.value })
                  }
                />
                <a className="btn_frmline" href="/support/inquiries">
                  1:1문의 바로가기
                </a>
              </InquirySettingRow>
              <InquirySettingRow index={1} label="분류">
                <span className="frm_info">
                  분류와 분류 사이는 | 로 구분하세요. 첫 글자로 #은 입력하지
                  마세요.
                </span>
                <input
                  id="qa_category"
                  className="required frm_input"
                  required
                  size={70}
                  value={categoriesText}
                  onChange={(event) =>
                    onCategoriesChange(event.currentTarget.value)
                  }
                />
              </InquirySettingRow>
              <InquirySettingRow index={2} label="스킨 디렉토리">
                <select
                  id="qa_skin"
                  required
                  value={draft.legacy.skin}
                  onChange={(event) =>
                    updateLegacy("skin", event.currentTarget.value)
                  }
                >
                  <option value="basic">basic</option>
                </select>
              </InquirySettingRow>
              <InquirySettingRow index={3} label="모바일 스킨 디렉토리">
                <select
                  id="qa_mobile_skin"
                  required
                  value={draft.legacy.mobileSkin}
                  onChange={(event) =>
                    updateLegacy("mobileSkin", event.currentTarget.value)
                  }
                >
                  <option value="basic">basic</option>
                </select>
              </InquirySettingRow>
              <InquirySettingRow index={4} label="이메일 입력">
                <LegacyCheck
                  id="qa_use_email"
                  label="보이기"
                  checked={draft.legacy.showEmail}
                  onChange={(checked) => updateLegacy("showEmail", checked)}
                />
                <LegacyCheck
                  id="qa_req_email"
                  label="필수입력"
                  checked={draft.requireEmail}
                  onChange={(requireEmail) =>
                    onDraftChange({ ...draft, requireEmail })
                  }
                />
              </InquirySettingRow>
              <InquirySettingRow index={5} label="휴대폰 입력">
                <LegacyCheck
                  id="qa_use_hp"
                  label="보이기"
                  checked={draft.legacy.showPhone}
                  onChange={(checked) => updateLegacy("showPhone", checked)}
                />
                <LegacyCheck
                  id="qa_req_hp"
                  label="필수입력"
                  checked={draft.legacy.requirePhone}
                  onChange={(checked) => updateLegacy("requirePhone", checked)}
                />
              </InquirySettingRow>
              <InquirySettingRow index={6} label="SMS 알림">
                <span className="frm_info">
                  문의글 등록 및 답변 등록 시 SMS 알림 수신을 선택할 수 있도록
                  합니다.
                </span>
                <select
                  id="qa_use_sms"
                  value={draft.legacy.useSms ? "1" : "0"}
                  onChange={(event) =>
                    updateLegacy("useSms", event.currentTarget.value === "1")
                  }
                >
                  <option value="0">사용안함</option>
                  <option value="1">사용함</option>
                </select>
              </InquirySettingRow>
              <InquirySettingRow index={7} label="SMS 발신번호">
                <span className="frm_info">
                  SMS 알림 전송 시 발신번호로 사용됩니다.
                </span>
                <input
                  id="qa_send_number"
                  className="frm_input"
                  size={30}
                  maxLength={30}
                  value={draft.legacy.sendNumber}
                  onChange={(event) =>
                    updateLegacy("sendNumber", event.currentTarget.value)
                  }
                />
              </InquirySettingRow>
              <InquirySettingRow index={8} label="관리자 휴대폰번호">
                <span className="frm_info">
                  문의글 등록 시 알림을 받을 관리자 휴대폰번호입니다.
                  <br />
                  SMS 알림을 사용하지 않으면 전송되지 않습니다.
                </span>
                <input
                  id="qa_admin_hp"
                  className="frm_input"
                  size={30}
                  maxLength={30}
                  value={draft.legacy.adminPhone}
                  onChange={(event) =>
                    updateLegacy("adminPhone", event.currentTarget.value)
                  }
                />
              </InquirySettingRow>
              <InquirySettingRow index={9} label="관리자 이메일">
                <span className="frm_info">
                  문의글 등록 알림을 받을 관리자 이메일입니다.
                </span>
                <input
                  id="qa_admin_email"
                  className="frm_input"
                  size={50}
                  maxLength={254}
                  value={draft.legacy.adminEmail}
                  onChange={(event) =>
                    updateLegacy("adminEmail", event.currentTarget.value)
                  }
                />
              </InquirySettingRow>
              <InquirySettingRow index={10} label="DHTML 에디터 사용">
                <span className="frm_info">
                  글 작성 시 내용을 DHTML 에디터로 입력할지 설정합니다.
                </span>
                <select
                  id="qa_use_editor"
                  value={draft.legacy.useEditor ? "1" : "0"}
                  onChange={(event) =>
                    updateLegacy("useEditor", event.currentTarget.value === "1")
                  }
                >
                  <option value="0">사용안함</option>
                  <option value="1">사용함</option>
                </select>
              </InquirySettingRow>
              <InquiryNumberRow
                index={11}
                label="제목 길이"
                id="qa_subject_len"
                help="목록에서 출력할 제목 글자 수"
                value={draft.legacy.subjectLength}
                onChange={(value) => updateLegacy("subjectLength", value)}
              />
              <InquiryNumberRow
                index={12}
                label="모바일 제목 길이"
                id="qa_mobile_subject_len"
                help="모바일 목록에서 출력할 제목 글자 수"
                value={draft.legacy.mobileSubjectLength}
                onChange={(value) =>
                  updateLegacy("mobileSubjectLength", value)
                }
              />
              <InquiryNumberRow
                index={13}
                label="페이지당 목록 수"
                id="qa_page_rows"
                value={draft.legacy.pageRows}
                onChange={(value) => updateLegacy("pageRows", value)}
              />
              <InquiryNumberRow
                index={14}
                label="모바일 페이지당 목록 수"
                id="qa_mobile_page_rows"
                value={draft.legacy.mobilePageRows}
                onChange={(value) => updateLegacy("mobilePageRows", value)}
              />
              <InquiryNumberRow
                index={15}
                label="이미지 폭 크기"
                id="qa_image_width"
                help="게시판에서 출력되는 이미지의 폭 크기"
                suffix=" 픽셀"
                value={draft.legacy.imageWidth}
                onChange={(value) => updateLegacy("imageWidth", value)}
              />
              <InquiryNumberRow
                index={16}
                label="파일 업로드 용량"
                id="qa_upload_size"
                help="업로드 파일 한 개당 허용할 최대 용량입니다."
                prefix="업로드 파일 한개당 "
                suffix=" bytes 이하"
                value={draft.legacy.uploadSize}
                onChange={(value) => updateLegacy("uploadSize", value)}
              />
              <InquirySettingRow index={17} label="상단 파일 경로">
                <input
                  id="qa_include_head"
                  className="frm_input"
                  size={50}
                  value={draft.legacy.includeHead}
                  onChange={(event) =>
                    updateLegacy("includeHead", event.currentTarget.value)
                  }
                />
              </InquirySettingRow>
              <InquirySettingRow index={18} label="하단 파일 경로">
                <input
                  id="qa_include_tail"
                  className="frm_input"
                  size={50}
                  value={draft.legacy.includeTail}
                  onChange={(event) =>
                    updateLegacy("includeTail", event.currentTarget.value)
                  }
                />
              </InquirySettingRow>
              <tr
                className="legacy-inquiry-row legacy-inquiry-row-19"
                aria-hidden="true"
              >
                <th scope="row">자동등록방지</th>
                <td>
                  <input
                    type="checkbox"
                    checked={draft.legacy.useCaptcha}
                    readOnly
                  />
                </td>
              </tr>
              <InquiryEditorRow
                index={20}
                label="상단 내용"
                id="qa_content_head"
                value={draft.legacy.contentHead}
                onChange={(value) => updateLegacy("contentHead", value)}
              />
              <InquiryEditorRow
                index={21}
                label="하단 내용"
                id="qa_content_tail"
                value={draft.legacy.contentTail}
                onChange={(value) => updateLegacy("contentTail", value)}
              />
              <InquiryEditorRow
                index={22}
                label="모바일 상단 내용"
                id="qa_mobile_content_head"
                value={draft.legacy.mobileContentHead}
                onChange={(value) => updateLegacy("mobileContentHead", value)}
              />
              <InquiryEditorRow
                index={23}
                label="모바일 하단 내용"
                id="qa_mobile_content_tail"
                value={draft.legacy.mobileContentTail}
                onChange={(value) => updateLegacy("mobileContentTail", value)}
              />
              <InquirySettingRow index={24} label="글쓰기 기본 내용">
                <textarea
                  id="qa_insert_content"
                  rows={5}
                  value={draft.legacy.insertContent}
                  onChange={(event) =>
                    updateLegacy("insertContent", event.currentTarget.value)
                  }
                />
              </InquirySettingRow>
              {Array.from({ length: 5 }, (_, index) => (
                <InquirySettingRow
                  key={`qa-extra-${index + 1}`}
                  index={25 + index}
                  label={`여분필드${index + 1}`}
                >
                  <span className="legacy-inquiry-extra">
                    <label htmlFor={`qa_${index + 1}_subj`}>
                      여분필드 {index + 1} 제목
                    </label>
                    <input
                      id={`qa_${index + 1}_subj`}
                      className="frm_input"
                      value={draft.legacy.extraSubjects[index] ?? ""}
                      onChange={(event) =>
                        updateExtra(
                          "extraSubjects",
                          index,
                          event.currentTarget.value,
                        )
                      }
                    />
                    <label htmlFor={`qa_${index + 1}`}>
                      여분필드 {index + 1} 값
                    </label>
                    <input
                      id={`qa_${index + 1}`}
                      className="frm_input"
                      value={draft.legacy.extraValues[index] ?? ""}
                      onChange={(event) =>
                        updateExtra(
                          "extraValues",
                          index,
                          event.currentTarget.value,
                        )
                      }
                    />
                  </span>
                </InquirySettingRow>
              ))}
            </tbody>
          </table>
        </div>
      </form>
    </>
  );
}

function InquirySettingRow({
  index,
  label,
  children,
}: {
  index: number;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <tr className={`legacy-inquiry-row legacy-inquiry-row-${index}`}>
      <th scope="row">{label}</th>
      <td>{children}</td>
    </tr>
  );
}

function InquiryNumberRow({
  index,
  label,
  id,
  help,
  prefix,
  suffix,
  value,
  onChange,
}: {
  index: number;
  label: string;
  id: string;
  help?: string;
  prefix?: string;
  suffix?: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <InquirySettingRow index={index} label={label}>
      {help ? <span className="frm_info">{help}</span> : null}
      {prefix}
      <input
        id={id}
        className="required numeric frm_input"
        required
        size={10}
        inputMode="numeric"
        value={value}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
      {suffix}
    </InquirySettingRow>
  );
}

function InquiryEditorRow({
  index,
  label,
  id,
  value,
  onChange,
}: {
  index: number;
  label: string;
  id: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <InquirySettingRow index={index} label={label}>
      <div className="legacy-inquiry-editor">
        <div className="legacy-inquiry-editor-toolbar" aria-hidden="true">
          <button type="button" tabIndex={-1}>
            문단
          </button>
          <button type="button" tabIndex={-1}>
            굵게
          </button>
          <button type="button" tabIndex={-1}>
            링크
          </button>
        </div>
        <textarea
          id={id}
          aria-label={label}
          value={value}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
      </div>
    </InquirySettingRow>
  );
}

function LegacyCheck({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label htmlFor={id} className="legacy-inquiry-check">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />{" "}
      {label}
    </label>
  );
}

function Field({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      {children}
      {help ? <p className={styles.fieldHelp}>{help}</p> : null}
    </div>
  );
}

function FormActions({
  saving,
  cancel,
}: {
  saving: boolean;
  cancel: () => void;
}) {
  return (
    <div className={styles.formActions}>
      <AdminButton type="button" disabled={saving} onClick={cancel}>
        취소
      </AdminButton>
      <AdminButton type="submit" variant="primary" loading={saving}>
        저장
      </AdminButton>
    </div>
  );
}

function PostStatus({ status }: { status: CommunityPostStatus }) {
  return (
    <StatusBadge tone={status === "published" ? "success" : "neutral"}>
      {status === "published" ? "게시" : status === "draft" ? "임시저장" : "숨김"}
    </StatusBadge>
  );
}

function toInquiryDraft(inquiry: OneToOneInquiry): InquiryDraft {
  return {
    id: inquiry.id,
    authorName: inquiry.authorName,
    email: inquiry.email,
    phone: inquiry.phone,
    category: inquiry.category,
    title: inquiry.title,
    content: inquiry.content,
    status: inquiry.status,
    answer: inquiry.answer,
  };
}

function inquiryStatusLabel(status: InquiryStatus) {
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
        year: "2-digit",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
}
