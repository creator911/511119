import { type ReactNode } from "react";
import { requireAdminSession } from "@/lib/auth";
import { AdminFrame } from "./AdminFrame";
import "../legacy-admin.css";

export default async function ProtectedAdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireAdminSession();
  return <AdminFrame>{children}</AdminFrame>;
}
