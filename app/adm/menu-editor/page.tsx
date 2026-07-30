import type { Metadata } from "next";
import { requireAdminPagePermission } from "@/lib/auth";
import { MenuEditorWindow } from "./MenuEditorWindow";

interface MenuEditorPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export const metadata: Metadata = {
  title: "메뉴 추가·수정",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function MenuEditorPage({
  searchParams,
}: MenuEditorPageProps) {
  await requireAdminPagePermission("settings.manage");
  const query = await searchParams;
  const value = (key: string) => {
    const raw = query[key];
    return (Array.isArray(raw) ? raw[0] : raw) ?? "";
  };
  const requestedOrder = Number(value("order"));
  return (
    <MenuEditorWindow
      initialValues={{
        id: value("id").slice(0, 80),
        label: value("label").slice(0, 60),
        href: value("href").slice(0, 300),
        newWindow: value("newWindow") === "1",
        order:
          Number.isSafeInteger(requestedOrder) &&
          requestedOrder >= 0 &&
          requestedOrder <= 9_999
            ? requestedOrder
            : 0,
        usePc: value("usePc") !== "0",
        useMobile: value("useMobile") !== "0",
      }}
    />
  );
}
