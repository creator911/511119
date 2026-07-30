import type { Metadata } from "next";
import { Notice } from "@/app/components/admin";
import { hasAdminPermission } from "@/lib/admin-permissions";
import {
  requireAdminPagePermission,
  requireAdminSession,
} from "@/lib/auth";
import { getEffectiveSiteSettings } from "@/lib/site-content";
import {
  getLegacyAdminSettings,
  getLegacyProviderStatus,
} from "@/lib/legacy-admin-settings";
import { getLegacyShopSettings } from "@/lib/legacy-shop-settings";
import styles from "../../admin-routes.module.css";
import { AdminAccountsManager } from "./AdminAccountsManager";
import { LegacyShopSettingsEditor } from "./LegacyShopSettingsEditor";
import { LegacySettingsEditor } from "./LegacySettingsEditor";

export const metadata: Metadata = {
  title: "환경설정",
  robots: { index: false, follow: false },
};

interface SettingsPageProps {
  searchParams: Promise<{ view?: string | string[] }>;
}

const settingsViews = [
  { id: "basic", label: "기본환경설정", href: "/adm/settings" },
  {
    id: "permissions",
    label: "관리권한설정",
    href: "/adm/settings?view=permissions",
  },
  { id: "shop", label: "쇼핑몰설정", href: "/adm/settings?view=shop" },
] as const;

export default async function AdminSettingsPage({
  searchParams,
}: SettingsPageProps) {
  const params = await searchParams;
  const requestedView = Array.isArray(params.view) ? params.view[0] : params.view;
  const activeView =
    settingsViews.find((view) => view.id === requestedView)?.id ?? "basic";
  await requireAdminPagePermission(
    activeView === "permissions" ? "admins.manage" : "settings.manage",
  );

  return (
    <div
      className={`${styles.contentStack} legacy-settings-page ${
        activeView === "permissions" ? "legacy-settings-permissions" : ""
      }`}
    >
      {activeView === "permissions" ? (
        <nav
          className={styles.sectionNav}
          aria-label="환경설정 구분"
        >
          {settingsViews.map((view) => (
          <a
            key={view.id}
            className={`${styles.sectionNavLink} ${
              activeView === view.id
                ? styles.sectionNavLinkActive
                : ""
            }`}
            href={view.href}
            aria-current={
              activeView === view.id ? "page" : undefined
            }
          >
            {view.label}
          </a>
          ))}
        </nav>
      ) : null}

      {activeView === "permissions" ? (
        <PermissionsSettings />
      ) : activeView === "shop" ? (
        <ShopSettings />
      ) : (
        <BasicSettings />
      )}
    </div>
  );
}

async function BasicSettings() {
  const [settings, legacySettings] = await Promise.all([
    getEffectiveSiteSettings({ strict: true }),
    getLegacyAdminSettings({ strict: true }),
  ]);
  return (
    <LegacySettingsEditor
      initialSettings={settings}
      initialLegacySettings={legacySettings}
      providerStatus={getLegacyProviderStatus()}
    />
  );
}

async function PermissionsSettings() {
  const session = await requireAdminSession();
  if (!hasAdminPermission(session.permissions, "admins.manage")) {
    return (
      <Notice tone="danger">
        관리자 계정과 권한을 관리할 권한이 없습니다.
      </Notice>
    );
  }
  return (
    <AdminAccountsManager />
  );
}

async function ShopSettings() {
  const snapshot = await getLegacyShopSettings({ strict: true });
  return <LegacyShopSettingsEditor initialSnapshot={snapshot} />;
}
