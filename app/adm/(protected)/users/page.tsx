import type { Metadata } from "next";
import { Notice } from "@/app/components/admin";
import { getAdminMembersPage } from "@/lib/admin-data";
import { requireAdminPagePermission } from "@/lib/auth";
import { UsersManager } from "./UsersManager";
import styles from "../../admin-routes.module.css";

export const metadata: Metadata = {
  title: "회원관리",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

interface AdminUsersPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AdminUsersPage({
  searchParams,
}: AdminUsersPageProps) {
  await requireAdminPagePermission("members.manage");
  const params = await searchParams;
  const initialResult = await getAdminMembersPage({
    page: readNumber(params.page),
    q: readString(params.q) || readString(params.stx),
    status: readString(params.status),
    dateStart: readString(params.dateStart),
    dateEnd: readString(params.dateEnd),
    sortBy: readString(params.sortBy),
    sortDirection: readString(params.sortDirection),
  });

  return (
    <div className={`${styles.contentStack} legacy-member-page`}>
      <Notice>
        회원자료 삭제 시 다른 회원이 기존 회원아이디를 사용하지 못하도록
        회원아이디, 이름, 닉네임은 삭제하지 않고 영구 보관합니다.
      </Notice>
      <UsersManager initialResult={initialResult} />
    </div>
  );
}

function readString(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function readNumber(
  value: string | string[] | undefined,
): number | undefined {
  const candidate = readString(value);
  if (!/^\d+$/u.test(candidate)) return undefined;
  const parsed = Number(candidate);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}
