import styles from "./Storefront.module.css";
import type { FooterCompanyInfo, LocalAssetPath } from "./types";
import { classNames } from "./utils";

export interface StorefrontFooterProps {
  company: FooterCompanyInfo;
  logo?: LocalAssetPath;
  brandName?: string;
  primaryLinks?: Array<{ label: string; href: string; important?: boolean }>;
  secondaryLinks?: Array<{ label: string; href: string }>;
  className?: string;
}

const defaultPrimaryLinks = [
  { label: "서비스이용약관", href: "/bbs/content.php?co_id=provision" },
  {
    label: "개인정보처리방침",
    href: "/bbs/content.php?co_id=privacy",
    important: true,
  },
  { label: "이메일무단수집거부", href: "/bbs/content.php?co_id=noemail" },
];

export function StorefrontFooter({
  company,
  primaryLinks = defaultPrimaryLinks,
  secondaryLinks = [],
  className,
}: StorefrontFooterProps) {
  return (
    <footer className={classNames(styles.footer, className)}>
      <div className={styles.container}>
        <div className={styles.footerTop}>
          <nav className={styles.footerNav} aria-label="이용 안내">
            {primaryLinks.map((link) => (
              <a href={link.href} key={link.href}>
                {link.label}
              </a>
            ))}
          </nav>
          {secondaryLinks.length > 0 ? (
            <nav className={styles.footerSecondaryNav} aria-label="추가 안내">
              {secondaryLinks.map((link) => (
                <a href={link.href} key={link.href}>
                  {link.label}
                </a>
              ))}
            </nav>
          ) : null}
        </div>
        <address className={styles.footerCompany}>
          <span className={styles.footerCompanyName}>{company.companyName}</span>
          {" "}
          <span className={styles.footerDivider}>|</span>
          {" "}
          <span>대표 : {company.representative}</span>
          {" "}
          <span className={styles.footerDivider}>|</span>
          {" "}
          <span>사업자등록번호 : {company.businessNumber}</span>
          {company.mailOrderNumber ? (
            <>
              {" "}
              <span className={styles.footerDivider}>|</span>
              {" "}
              <span>통신판매업번호 : {company.mailOrderNumber}</span>
            </>
          ) : null}
          {" "}
          <span className={styles.footerDivider}>|</span>
          {" "}
          <span>주소 :  {company.address}  </span>
          <br />
          <span>
            E-mail : <a href={`mailto:${company.email}`}>{company.email}</a>
          </span>
        </address>
        <p className={styles.footerCopyright}>
          {company.copyright ??
            `Copyright © ${company.companyName}. All Rights Reserved.`}
        </p>
      </div>
    </footer>
  );
}
