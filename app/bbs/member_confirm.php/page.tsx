import type { Metadata } from "next";
import { SiteFrame } from "@/app/components/SiteFrame";
import { PageHeading } from "@/app/components/storefront";
import { MemberConfirmClient } from "./MemberConfirmClient";

export const metadata: Metadata = {
  title: "회원 비밀번호 확인",
  robots: { index: false, follow: false },
};

export default function MemberConfirmPage() {
  return (
    <SiteFrame>
      <PageHeading
        title="회원 비밀번호 확인"
        breadcrumbs={[
          { label: "Home", href: "/shop" },
          { label: "쇼핑몰", href: "/shop" },
          { label: "회원 비밀번호 확인" },
        ]}
      />
      <MemberConfirmClient />
    </SiteFrame>
  );
}
