import type { Metadata } from "next";
import { CustomerRecoveryClient } from "@/app/components/CommerceClients";
import { SiteFrame } from "@/app/components/SiteFrame";

export const metadata: Metadata = { title: "아이디·비밀번호 찾기" };

export default function PasswordLostPage() {
  return (
    <SiteFrame>
      <CustomerRecoveryClient />
    </SiteFrame>
  );
}
