import type { Metadata } from "next";
import {
  AdminPanel,
  Notice,
} from "@/app/components/admin";
import { requireAdminPagePermission } from "@/lib/auth";
import { listAdminProductInteractions } from "@/lib/admin-interactions";
import { listContentEntries } from "@/lib/site-content";
import styles from "../../admin-routes.module.css";
import { ContentManager } from "./ContentManager";
import { InteractionManager } from "./InteractionManager";

export const metadata: Metadata = {
  title: "게시판·콘텐츠 관리",
  robots: { index: false, follow: false },
};

interface ContentPageProps {
  searchParams: Promise<{ view?: string | string[] }>;
}

const contentViews = [
  { id: "contents", label: "내용관리", href: "/adm/content" },
  { id: "faq", label: "FAQ관리", href: "/adm/content?view=faq" },
  { id: "inquiries", label: "상품문의", href: "/adm/content?view=inquiries" },
  { id: "reviews", label: "사용후기", href: "/adm/content?view=reviews" },
] as const;

const descriptions: Record<string, string> = {
  contents: "이용안내, 개인정보처리방침 등 고정 페이지를 관리합니다.",
  faq: "자주 묻는 질문과 분류를 관리합니다.",
  inquiries: "새 사이트 상품 상세 화면에서 접수된 문의를 관리합니다.",
  reviews: "새 사이트 상품에 등록된 사용후기를 관리합니다.",
};

const LEGACY_CATEGORY_OPTIONS = [
  ["2010", "자사골드바"],
  ["4010", "고급형실버바"],
  ["5010", "돌반지"],
  ["6010", "목걸이"],
  ["7010", "목걸이"],
  ["8010", "실버쥬얼리"],
  ["9010", "소장품(동물)"],
  ["9110", "꼬냑다이아몬드"],
  ["2020", "LS-NIKKO골드바"],
  ["3020", "벽걸이형"],
  ["4020", "투자형실버바"],
  ["5020", "돌팔찌"],
  ["6020", "팔찌"],
  ["7020", "팔찌"],
  ["8020", "비스포크 반지"],
  ["9020", "골프"],
  ["9120", "랩다이아몬드"],
  ["2030", "십이지신 골드바"],
  ["3030", "멀티형"],
  ["5030", "돌목걸이"],
  ["6030", "귀걸이"],
  ["7030", "반지"],
  ["8030", "커플링"],
  ["9030", "소장품(모형)"],
  ["9130", "모이사나이트"],
  ["2040", "편지골드바"],
  ["3040", "창문형/이동식"],
  ["5040", "금수저"],
  ["6040", "반지"],
  ["7040", "펜던트"],
  ["9140", "지르코니아"],
  ["6050", "커플링"],
  ["6060", "쌍가락지"],
  ["6070", "펜던트"],
  ["10", "테마주얼리"],
  ["20", "골드바"],
  ["40", "실버바"],
  ["50", "돌선물"],
  ["60", "여성순금"],
  ["70", "남성순금"],
  ["80", "커플"],
  ["90", "기업&GIFT선물"],
  ["91", "웨딩"],
  ["30", "여름가전"],
] as const;

export default async function AdminContentPage({
  searchParams,
}: ContentPageProps) {
  await requireAdminPagePermission("content.manage");
  const params = await searchParams;
  const requestedView = Array.isArray(params.view) ? params.view[0] : params.view;
  const activeView =
    contentViews.find((view) => view.id === requestedView)?.id ?? "contents";
  const activeLabel =
    contentViews.find((view) => view.id === activeView)?.label ?? "내용관리";
  const initialContent =
    activeView === "contents" || activeView === "faq"
      ? await listContentEntries(activeView === "faq" ? "faq" : "page")
      : null;
  const interactionKind =
    activeView === "inquiries"
      ? "question"
      : activeView === "reviews"
        ? "review"
        : null;
  const initialInteractions = interactionKind
    ? await listAdminProductInteractions(interactionKind, {
        page: 1,
        pageSize: 30,
      })
    : null;

  return (
    <div className={`${styles.contentStack} legacy-content-page`}>
      <nav
        className={`${styles.sectionNav} legacy-content-nav`}
        aria-label="콘텐츠 관리 구분"
      >
        {contentViews.map((view) => (
          <a
            key={view.id}
            className={`${styles.sectionNavLink} ${
              activeView === view.id ? styles.sectionNavLinkActive : ""
            }`}
            href={view.href}
            aria-current={activeView === view.id ? "page" : undefined}
          >
            {view.label}
          </a>
        ))}
      </nav>

      {activeView === "contents" || activeView === "faq" ? (
        <ContentManager
          key={activeView}
          entryType={activeView === "faq" ? "faq" : "page"}
          initialEntries={initialContent ?? []}
        />
      ) : activeView === "inquiries" || activeView === "reviews" ? (
        <InteractionManager
          key={activeView}
          kind={activeView === "reviews" ? "review" : "question"}
          categoryOptions={LEGACY_CATEGORY_OPTIONS.map(([id, name]) => ({
            id,
            name,
          }))}
          initialPage={
            initialInteractions ?? {
              items: [],
              page: 1,
              pageSize: 30,
              pageCount: 1,
              total: 0,
            }
          }
        />
      ) : (
        <>
          <Notice>
            기존 게시물과 작성자 정보는 이전하지 않았습니다. 새 사이트에서
            생성되는 데이터만 관리 대상으로 사용합니다.
          </Notice>
          <AdminPanel title={activeLabel} subtitle={descriptions[activeView]}>
            <p className={styles.readonlyNote}>
              이 항목에 연결되는 공개 접수 화면이 아직 없어 현재 운영 대상이
              아닙니다.
            </p>
          </AdminPanel>
        </>
      )}
    </div>
  );
}
