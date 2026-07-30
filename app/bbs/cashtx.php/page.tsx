import type { Metadata } from "next";
import { SiteFrame } from "@/app/components/SiteFrame";
import { WalletRequestClient } from "@/app/components/WalletClients";

export const metadata: Metadata = {
  title: "출금신청",
  robots: { index: false, follow: false },
};

export default function WithdrawalRequestPage() {
  return (
    <SiteFrame>
      <WalletRequestClient kind="withdrawal" />
    </SiteFrame>
  );
}
