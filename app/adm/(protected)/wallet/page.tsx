import type { Metadata } from "next";
import { requireAdminPagePermission } from "@/lib/auth";
import { listAdminWalletRequests } from "@/lib/wallet";
import { WalletRequestsManager } from "./WalletRequestsManager";

export const metadata: Metadata = {
  title: "충전·출금 관리",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminWalletPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminPagePermission("wallet.manage");
  const params = await searchParams;
  const requestedKind = Array.isArray(params.kind) ? params.kind[0] : params.kind;
  const initialKind =
    requestedKind === "withdrawal" ? "withdrawal" : "charge";
  const initialRequests = await listAdminWalletRequests();
  return (
    <WalletRequestsManager
      initialRequests={initialRequests}
      initialKind={initialKind}
    />
  );
}
