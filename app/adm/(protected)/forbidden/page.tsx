import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "접근 권한 없음",
  robots: { index: false, follow: false },
};

export default function AdminForbiddenPage() {
  return (
    <section className="legacy-dashboard-section">
      <h2>접근 권한 없음</h2>
      <div className="local_desc01 local_desc">
        <p>이 관리자 메뉴를 열 수 있는 권한이 없습니다.</p>
        <p>
          필요한 업무 권한은 기본 관리자에게 요청하고, 허용된 메뉴를
          이용해 주세요.
        </p>
      </div>
    </section>
  );
}
