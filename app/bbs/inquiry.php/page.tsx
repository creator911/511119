import type { Metadata } from "next";
import { SiteFrame } from "@/app/components/SiteFrame";
import { PageHeading } from "@/app/components/storefront";
import { InquiryForm } from "./InquiryForm";
import styles from "./inquiry.module.css";

export const metadata: Metadata = {
  title: "1:1 문의",
  robots: { index: false, follow: false },
};

export default function InquiryPage() {
  return (
    <SiteFrame>
      <PageHeading
        title="1:1 문의"
        breadcrumbs={[
          { label: "홈", href: "/" },
          { label: "1:1 문의" },
        ]}
      />
      <main id="main-content" className={styles.page}>
        <InquiryForm />
      </main>
    </SiteFrame>
  );
}
