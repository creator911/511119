import type { Metadata } from "next";
import { SiteFrame } from "@/app/components/SiteFrame";
import { WalletRequestClient } from "@/app/components/WalletClients";

export const metadata: Metadata = {
  title: "충전신청",
  robots: { index: false, follow: false },
};

export default function ChargeRequestPage() {
  return (
    <SiteFrame>
      <WalletRequestClient kind="charge" />
    </SiteFrame>
  );
}
