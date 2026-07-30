import type { Metadata } from "next";
import {
  listCommunityResource,
  type CommunityPost,
  type PaginatedResult,
} from "@/lib/admin-community";
import {
  getAdminDashboardData,
  getAdminMembersPage,
} from "@/lib/admin-data";
import { getPointReport } from "@/lib/admin-reports";
import { requireAdminPagePermission } from "@/lib/auth";

export const metadata: Metadata = {
  title: "관리자메인",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  await requireAdminPagePermission("dashboard.view");
  // The legacy dashboard renders member identities, point ledgers and recent
  // community posts together. Require every underlying scope so a secondary
  // account cannot use the dashboard permission to bypass those boundaries.
  await requireAdminPagePermission("members.manage");
  await requireAdminPagePermission("reports.view");
  await requireAdminPagePermission("content.manage");
  const [dashboard, memberPage, pointReport, communityResult] =
    await Promise.all([
      getAdminDashboardData(),
      getAdminMembersPage({ page: 1, pageSize: 100 }),
      getPointReport({ pageSize: 5, ledgerPage: 1 }),
      listCommunityResource("posts", { page: 1, pageSize: 5 }),
    ]);

  const blockedMembers = memberPage.rows.filter(
    (member) => !member.active,
  ).length;
  const recentPosts = isPostPage(communityResult)
    ? communityResult.items
    : [];

  return (
    <div className="legacy-dashboard">
      <section className="legacy-dashboard-section">
        <h2>신규가입회원 5건 목록</h2>
        <div className="local_desc02 local_desc">
          총회원수 {dashboard.totalMembers.toLocaleString("ko-KR")}명 중 차단{" "}
          {blockedMembers.toLocaleString("ko-KR")}명, 탈퇴 : 0명
        </div>
        <div className="tbl_head01 tbl_wrap">
          <table>
            <caption>신규가입회원</caption>
            <thead>
              <tr>
                <th scope="col">회원아이디</th>
                <th scope="col">이름</th>
                <th scope="col">닉네임</th>
                <th scope="col">권한</th>
                <th scope="col">포인트</th>
                <th scope="col">수신</th>
                <th scope="col">공개</th>
                <th scope="col">인증</th>
                <th scope="col">차단</th>
                <th scope="col">그룹</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.recentMembers.slice(0, 5).map((member) => (
                <tr key={member.id}>
                  <td>{member.loginId}</td>
                  <td>{member.name}</td>
                  <td>{member.name}</td>
                  <td>2</td>
                  <td className="td_num">
                    <a
                      href={`/adm/reports?view=points&q=${encodeURIComponent(member.loginId)}`}
                    >
                      {member.points.toLocaleString("ko-KR")}
                    </a>
                  </td>
                  <td>예</td>
                  <td>예</td>
                  <td>예</td>
                  <td>아니오</td>
                  <td />
                </tr>
              ))}
              {dashboard.recentMembers.length === 0 ? (
                <tr>
                  <td className="empty_table" colSpan={10}>
                    자료가 없습니다.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="btn_list03 btn_list">
          <a href="/adm/users">회원 전체보기</a>
        </div>
      </section>

      <section className="legacy-dashboard-section">
        <h2>최근게시물</h2>
        <div className="tbl_head01 tbl_wrap">
          <table>
            <caption>최근게시물</caption>
            <thead>
              <tr>
                <th scope="col">그룹</th>
                <th scope="col">게시판</th>
                <th scope="col">제목</th>
                <th scope="col">이름</th>
                <th scope="col">일시</th>
              </tr>
            </thead>
            <tbody>
              {recentPosts.map((post) => (
                <tr key={post.id}>
                  <td>쇼핑몰</td>
                  <td>{post.boardName}</td>
                  <td className="td_left">{post.title}</td>
                  <td>{post.authorName}</td>
                  <td>{formatLegacyDateTime(post.createdAt)}</td>
                </tr>
              ))}
              {recentPosts.length === 0 ? (
                <tr>
                  <td className="empty_table legacy-empty-posts" colSpan={5}>
                    자료가 없습니다.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="btn_list03 btn_list">
          <a href="/adm/community?view=posts">최근게시물 더보기</a>
        </div>
      </section>

      <section className="legacy-dashboard-section">
        <h2>최근 포인트 발생내역</h2>
        <div className="local_desc02 local_desc">
          전체 {pointReport.ledger.total.toLocaleString("ko-KR")} 건 중{" "}
          {Math.min(5, pointReport.ledger.total).toLocaleString("ko-KR")}건 목록
        </div>
        <div className="tbl_head01 tbl_wrap">
          <table>
            <caption>최근 포인트 발생내역</caption>
            <thead>
              <tr>
                <th scope="col">회원아이디</th>
                <th scope="col">이름</th>
                <th scope="col">닉네임</th>
                <th scope="col">일시</th>
                <th scope="col">포인트 내용</th>
                <th scope="col">포인트</th>
                <th scope="col">포인트합</th>
              </tr>
            </thead>
            <tbody>
              {pointReport.ledger.rows.slice(0, 5).map((entry, index) => {
                const balance = pointReport.balances.rows.find(
                  (row) => row.userId === entry.userId,
                )?.points;
                return (
                  <tr key={`${entry.eventType}-${entry.orderId}-${index}`}>
                    <td>
                      <a
                        href={`/adm/reports?view=points&q=${encodeURIComponent(entry.loginId)}`}
                      >
                        {entry.loginId}
                      </a>
                    </td>
                    <td>{entry.name}</td>
                    <td>{entry.loginId}</td>
                    <td>{formatLegacyDateTime(entry.occurredAt)}</td>
                    <td className="td_left">
                      {pointEventLabel(entry.eventType, entry.orderId)}
                    </td>
                    <td className="td_num">
                      {entry.points.toLocaleString("ko-KR")}
                    </td>
                    <td className="td_num">
                      {(balance ?? 0).toLocaleString("ko-KR")}
                    </td>
                  </tr>
                );
              })}
              {pointReport.ledger.rows.length === 0 ? (
                <tr>
                  <td className="empty_table" colSpan={7}>
                    자료가 없습니다.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="btn_list03 btn_list">
          <a href="/adm/reports?view=points">포인트내역 전체보기</a>
        </div>
      </section>
    </div>
  );
}

function isPostPage(
  value:
    | PaginatedResult<
        | import("@/lib/admin-community").CommunityGroup
        | import("@/lib/admin-community").CommunityBoard
        | CommunityPost
        | import("@/lib/admin-community").CommunityComment
        | import("@/lib/admin-community").OneToOneInquiry
      >
    | import("@/lib/admin-community").InquirySettings,
): value is PaginatedResult<CommunityPost> {
  return (
    "items" in value &&
    value.items.every(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        "boardName" in item &&
        "title" in item,
    )
  );
}

function pointEventLabel(eventType: string, orderId: string): string {
  const label =
    {
      used: "결제 사용",
      restored: "결제 취소 복원",
      restore_pending: "복원 대기",
      earned: "구매 적립",
      reversed: "적립 회수",
      charged: "충전",
      withdrawn: "출금완료",
      adjusted: "관리자 조정",
    }[eventType] ?? eventType;
  return orderId ? `주문번호 ${orderId} ${label}` : label;
}

function formatLegacyDateTime(value: string): string {
  const normalized = /(?:Z|[+-]\d{2}:\d{2})$/u.test(value)
    ? value
    : `${value.replace(" ", "T")}Z`;
  const date = new Date(normalized);
  if (!Number.isFinite(date.getTime())) return value;
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}:${part("second")}`;
}
