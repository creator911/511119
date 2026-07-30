import type { Metadata } from "next";
import { SiteFrame } from "@/app/components/SiteFrame";
import { WalletRequestListClient } from "@/app/components/WalletClients";

export const metadata: Metadata = {
  title: "충전·출금 신청내역",
  robots: { index: false, follow: false },
};

export default function WalletRequestHistoryPage() {
  return (
    <SiteFrame>
      <WalletRequestListClient />
    </SiteFrame>
  );
}
