import type { Metadata } from "next";
import styles from "../../admin-routes.module.css";
import { requireAdminPagePermission } from "@/lib/auth";
import {
  listCommunityResource,
  type CommunityBoard,
  type CommunityComment,
  type CommunityGroup,
  type CommunityPost,
  type InquirySettings,
  type OneToOneInquiry,
  type PaginatedResult,
} from "@/lib/admin-community";
import {
  CommunityManager,
  type CommunityInitialData,
  type CommunityView,
} from "./CommunityManager";

export const metadata: Metadata = {
  title: "게시판 운영관리",
  robots: { index: false, follow: false },
};

interface CommunityPageProps {
  searchParams: Promise<{ view?: string | string[] }>;
}

const views = [
  { id: "groups", label: "게시판 그룹", href: "/adm/community?view=groups" },
  { id: "boards", label: "게시판", href: "/adm/community?view=boards" },
  { id: "posts", label: "게시물", href: "/adm/community?view=posts" },
  { id: "comments", label: "댓글", href: "/adm/community?view=comments" },
  { id: "inquiries", label: "1:1 문의", href: "/adm/community?view=inquiries" },
  {
    id: "inquiry-settings",
    label: "1:1 문의 설정",
    href: "/adm/community?view=inquiry-settings",
  },
] as const satisfies ReadonlyArray<{
  id: CommunityView;
  label: string;
  href: string;
}>;

export default async function AdminCommunityPage({
  searchParams,
}: CommunityPageProps) {
  await requireAdminPagePermission("content.manage");
  const params = await searchParams;
  const requested = Array.isArray(params.view) ? params.view[0] : params.view;
  const activeView: CommunityView =
    views.find((view) => view.id === requested)?.id ?? "groups";
  const [groups, boards, posts, comments, inquiries, settings] =
    await Promise.all([
      listCommunityResource("groups", {
        pageSize: activeView === "groups" ? 30 : 200,
      }),
      listCommunityResource("boards", {
        pageSize: activeView === "boards" ? 30 : 200,
      }),
      listCommunityResource("posts", {
        pageSize: activeView === "posts" ? 30 : 200,
      }),
      listCommunityResource("comments", {
        pageSize: activeView === "comments" ? 30 : 200,
      }),
      listCommunityResource("inquiries", {
        pageSize: activeView === "inquiries" ? 30 : 200,
      }),
      listCommunityResource("inquiry-settings"),
    ]);
  const activeResult = {
    groups,
    boards,
    posts,
    comments,
    inquiries,
    "inquiry-settings": null,
  }[activeView];
  const initialData: CommunityInitialData = {
    groups: communityItems<CommunityGroup>(groups),
    boards: communityItems<CommunityBoard>(boards),
    posts: communityItems<CommunityPost>(posts),
    comments: communityItems<CommunityComment>(comments),
    inquiries: communityItems<OneToOneInquiry>(inquiries),
    settings: settings as InquirySettings,
    pagination: activeResult
      ? communityPagination(activeResult)
      : { page: 1, pageSize: 30, pageCount: 1, total: 0 },
  };

  return (
    <div
      className={`${styles.contentStack} ${
        activeView === "groups" ||
        activeView === "boards" ||
        activeView === "posts"
          ? "legacy-board-page"
          : ""
      }`}
    >
      {activeView !== "inquiry-settings" ? (
        <nav className={styles.sectionNav} aria-label="게시판 운영관리 구분">
          {views.map((view) => (
            <a
              key={view.id}
              className={`${styles.sectionNavLink} ${
                view.id === activeView ? styles.sectionNavLinkActive : ""
              }`}
              href={view.href}
              aria-current={view.id === activeView ? "page" : undefined}
            >
              {view.label}
            </a>
          ))}
        </nav>
      ) : null}
      <CommunityManager
        key={activeView}
        view={activeView}
        initialData={initialData}
      />
    </div>
  );
}

type CommunityListResult = PaginatedResult<
  | CommunityGroup
  | CommunityBoard
  | CommunityPost
  | CommunityComment
  | OneToOneInquiry
>;

function communityItems<Item>(result: CommunityListResult | InquirySettings) {
  return ("items" in result ? result.items : []) as Item[];
}

function communityPagination(
  result: CommunityListResult | InquirySettings,
): CommunityInitialData["pagination"] {
  if (!("items" in result)) {
    return { page: 1, pageSize: 30, pageCount: 1, total: 0 };
  }
  return {
    page: result.page,
    pageSize: result.pageSize,
    pageCount: result.pageCount,
    total: result.total,
  };
}
