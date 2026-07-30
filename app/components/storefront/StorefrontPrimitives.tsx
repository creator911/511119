import type { ReactNode } from "react";
import styles from "./Storefront.module.css";
import type { BreadcrumbItem } from "./types";
import { classNames, formatKRW } from "./utils";

export function Breadcrumbs({
  items,
  className,
}: {
  items: BreadcrumbItem[];
  className?: string;
}) {
  return (
    <nav
      className={classNames(styles.breadcrumbs, className)}
      aria-label="현재 위치"
    >
      <ol>
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`}>
            {item.href ? <a href={item.href}>{item.label}</a> : item.label}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function PageHeading({
  title,
  breadcrumbs,
  actions,
}: {
  title: ReactNode;
  breadcrumbs?: BreadcrumbItem[];
  actions?: ReactNode;
}) {
  return (
    <div className={styles.pageHeading}>
      <div className={styles.container}>
        <div className={styles.pageHeadingRow}>
          <h1>{title}</h1>
          {breadcrumbs ? <Breadcrumbs items={breadcrumbs} /> : null}
        </div>
        {actions ? <div className={styles.pageHeadingActions}>{actions}</div> : null}
      </div>
    </div>
  );
}

export function SectionTitle({
  lead,
  suffix,
  href,
}: {
  lead: string;
  suffix?: string;
  href?: string;
}) {
  const content = (
    <>
      <span>{lead}</span>
      {suffix ? <span className={styles.sectionTitleSuffix}>{suffix}</span> : null}
    </>
  );

  return (
    <div className={styles.sectionTitle}>
      <h2>{href ? <a href={href}>{content}</a> : content}</h2>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className={styles.emptyState}>
      <span className={styles.emptyStateMark} aria-hidden="true">
        !
      </span>
      <strong>{title}</strong>
      {description ? <p>{description}</p> : null}
      {action ? <div className={styles.emptyStateAction}>{action}</div> : null}
    </div>
  );
}

export function PriceSummary({
  rows,
  total,
  totalLabel = "최종 결제금액",
}: {
  rows: Array<{ label: string; value: number; muted?: boolean }>;
  total: number;
  totalLabel?: string;
}) {
  return (
    <dl className={styles.priceSummary}>
      {rows.map((row) => (
        <div key={row.label} className={row.muted ? styles.priceMuted : undefined}>
          <dt>{row.label}</dt>
          <dd>{formatKRW(row.value)}</dd>
        </div>
      ))}
      <div className={styles.priceSummaryTotal}>
        <dt>{totalLabel}</dt>
        <dd>{formatKRW(total)}</dd>
      </div>
    </dl>
  );
}

export function Panel({
  title,
  description,
  children,
  className,
  actions,
}: {
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
  actions?: ReactNode;
}) {
  return (
    <section className={classNames(styles.panel, className)}>
      {title || description || actions ? (
        <header className={styles.panelHeader}>
          <div>
            {title ? <h2>{title}</h2> : null}
            {description ? <p>{description}</p> : null}
          </div>
          {actions ? <div className={styles.panelHeaderActions}>{actions}</div> : null}
        </header>
      ) : null}
      <div className={styles.panelBody}>{children}</div>
    </section>
  );
}

