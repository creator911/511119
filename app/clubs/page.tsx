import type { Metadata } from "next";
import { SiteFrame } from "@/app/components/SiteFrame";
import { PageHeading } from "@/app/components/storefront";
import {
  getClubSettings,
  listApprovedClubs,
} from "@/lib/clubs";
import { ClubsClient } from "./ClubsClient";
import styles from "./clubs.module.css";

export const metadata: Metadata = {
  title: "동호회",
  description: "승인된 동호회를 확인하고 새 동호회 개설을 신청합니다.",
};

export const dynamic = "force-dynamic";

export default async function ClubsPage() {
  const [settings, clubs] = await Promise.all([
    getClubSettings(),
    listApprovedClubs(),
  ]);
  return (
    <SiteFrame>
      <PageHeading
        title="동호회"
        breadcrumbs={[
          { label: "Home", href: "/shop" },
          { label: "동호회" },
        ]}
      />
      <main id="main-content" className={styles.page}>
        <ClubsClient initialClubs={clubs} initialSettings={settings} />
      </main>
    </SiteFrame>
  );
}
