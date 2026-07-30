import type { Metadata } from "next";
import { MyPageClient } from "@/app/components/CommerceClients";
import { SiteFrame } from "@/app/components/SiteFrame";

export const metadata: Metadata = { title: "마이페이지" };

export default function MyPage() {
  return (
    <SiteFrame>
      <MyPageClient />
    </SiteFrame>
  );
}
