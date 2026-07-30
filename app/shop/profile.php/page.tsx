import type { Metadata } from "next";
import { ProfileClient } from "@/app/components/ProfileClient";
import { SiteFrame } from "@/app/components/SiteFrame";

export const metadata: Metadata = {
  title: "회원정보 수정",
  robots: { index: false, follow: false },
};

export default function ProfilePage() {
  return (
    <SiteFrame>
      <ProfileClient />
    </SiteFrame>
  );
}
