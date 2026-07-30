import type { Metadata } from "next";
import { CustomerRegisterClient } from "@/app/components/CommerceClients";
import { SiteFrame } from "@/app/components/SiteFrame";
import { getPublishedContentPage } from "@/lib/site-content";

export const metadata: Metadata = { title: "회원가입" };

export default async function RegisterPage() {
  const [terms, privacy] = await Promise.all([
    getPublishedContentPage("provision"),
    getPublishedContentPage("privacy"),
  ]);
  return (
    <SiteFrame>
      <CustomerRegisterClient
        termsBody={terms?.body ?? ""}
        privacyBody={privacy?.body ?? ""}
      />
    </SiteFrame>
  );
}
