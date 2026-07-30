"use client";

import { type ReactNode } from "react";
import styles from "./admin.module.css";
import {
  AdminPanel,
  StatusBadge,
  cx,
  type AdminTone,
} from "./shared";

export interface DashboardStat {
  id: string;
  label: string;
  value: ReactNode;
  href?: string;
  unit?: string;
  icon?: ReactNode;
  tone?: "info" | "success" | "warning" | "danger";
  meta?: ReactNode;
  delta?: ReactNode;
  deltaDirection?: "up" | "down" | "flat";
}

export interface DashboardStatsProps {
  stats: DashboardStat[];
  ariaLabel?: string;
}

export function DashboardStats({
  stats,
  ariaLabel = "주요 통계",
}: DashboardStatsProps) {
  return (
    <section className={styles.statGrid} aria-label={ariaLabel}>
      {stats.map((stat) => {
        const iconToneClass = {
          info: undefined,
          success: styles.statIconSuccess,
          warning: styles.statIconWarning,
          danger: styles.statIconDanger,
        }[stat.tone ?? "info"];

        const content = (
          <>
            <span
              className={cx(styles.statIcon, iconToneClass)}
              aria-hidden="true"
            >
              {stat.icon ?? "•"}
            </span>
            <div className={styles.statContent}>
              <p className={styles.statLabel}>{stat.label}</p>
              <div className={styles.statValueRow}>
                <p className={styles.statValue}>{stat.value}</p>
                {stat.unit ? (
                  <span className={styles.statUnit}>{stat.unit}</span>
                ) : null}
              </div>
              {stat.meta || stat.delta ? (
                <p className={styles.statMeta}>
                  {stat.delta ? (
                    <span
                      className={cx(
                        stat.deltaDirection === "up" && styles.statDeltaUp,
                        stat.deltaDirection === "down" && styles.statDeltaDown,
                      )}
                    >
                      {stat.delta}
                    </span>
                  ) : null}
                  {stat.meta}
                </p>
              ) : null}
            </div>
          </>
        );

        return stat.href ? (
          <a className={styles.statCard} href={stat.href} key={stat.id}>
            {content}
          </a>
        ) : (
          <article className={styles.statCard} key={stat.id}>
            {content}
          </article>
        );
      })}
    </section>
  );
}

export interface OrderStatusSummary {
  id: string;
  label: string;
  count: number;
  href?: string;
  unit?: string;
  meta?: ReactNode;
}

export interface OrderStatusCardsProps {
  statuses: OrderStatusSummary[];
  onSelect?: (status: OrderStatusSummary) => void;
  ariaLabel?: string;
}

export function OrderStatusCards({
  statuses,
  onSelect,
  ariaLabel = "주문 처리 현황",
}: OrderStatusCardsProps) {
  return (
    <section className={styles.orderStatusGrid} aria-label={ariaLabel}>
      {statuses.map((status) => {
        const content = (
          <>
            <p className={styles.orderStatusLabel}>{status.label}</p>
            <span className={styles.orderStatusCount}>
              <strong>{status.count.toLocaleString("ko-KR")}</strong>
              <span className={styles.orderStatusUnit}>
                {status.unit ?? "건"}
              </span>
            </span>
            {status.meta ? (
              <p className={styles.orderStatusMeta}>{status.meta}</p>
            ) : null}
          </>
        );

        return onSelect ? (
          <button
            key={status.id}
            type="button"
            className={styles.orderStatusCard}
            onClick={() => onSelect(status)}
          >
            {content}
          </button>
        ) : status.href ? (
          <a
            key={status.id}
            className={styles.orderStatusCard}
            href={status.href}
          >
            {content}
          </a>
        ) : (
          <article key={status.id} className={styles.orderStatusCard}>
            {content}
          </article>
        );
      })}
    </section>
  );
}

export interface DashboardPanelProps {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  flush?: boolean;
}

export function DashboardPanel(props: DashboardPanelProps) {
  return <AdminPanel {...props} />;
}

export interface DashboardMetric {
  id: string;
  label: ReactNode;
  value: ReactNode;
  progress?: number;
}

export interface DashboardMetricListProps {
  metrics: DashboardMetric[];
}

export function DashboardMetricList({
  metrics,
}: DashboardMetricListProps) {
  return (
    <ul className={styles.metricList}>
      {metrics.map((metric) => (
        <li className={styles.metricItem} key={metric.id}>
          <span className={styles.metricLabel}>{metric.label}</span>
          <span className={styles.metricValue}>{metric.value}</span>
          {metric.progress !== undefined ? (
            <span className={styles.srOnly}>
              진행률 {Math.max(0, Math.min(100, metric.progress))}%
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export interface DashboardFeedItem {
  id: string;
  title: string;
  href?: string;
  meta?: string;
  statusLabel?: string;
  statusTone?: AdminTone;
}

export interface DashboardFeedListProps {
  items: DashboardFeedItem[];
  onSelect?: (item: DashboardFeedItem) => void;
  emptyLabel?: string;
}

export function DashboardFeedList({
  items,
  onSelect,
  emptyLabel = "표시할 항목이 없습니다.",
}: DashboardFeedListProps) {
  if (items.length === 0) {
    return <div className={styles.feedEmpty}>{emptyLabel}</div>;
  }

  return (
    <ul className={styles.feedList}>
      {items.map((item) => {
        const content = (
          <>
            <div className={styles.feedText}>
              <p className={styles.feedTitle}>{item.title}</p>
              {item.meta ? (
                <p className={styles.feedMeta}>{item.meta}</p>
              ) : null}
            </div>
            {item.statusLabel ? (
              <StatusBadge tone={item.statusTone}>
                {item.statusLabel}
              </StatusBadge>
            ) : null}
          </>
        );

        return (
          <li className={styles.feedItem} key={item.id}>
            {onSelect ? (
              <button
                type="button"
                className={styles.feedContent}
                onClick={() => onSelect(item)}
              >
                {content}
              </button>
            ) : item.href ? (
              <a className={styles.feedContent} href={item.href}>
                {content}
              </a>
            ) : (
              <div className={styles.feedContent}>{content}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export interface MiniBarChartPoint {
  id: string;
  label: string;
  value: number;
  displayValue?: string;
}

export interface MiniBarChartProps {
  points: MiniBarChartPoint[];
  ariaLabel: string;
  maxValue?: number;
}

export function MiniBarChart({
  points,
  ariaLabel,
  maxValue,
}: MiniBarChartProps) {
  const resolvedMax = Math.max(maxValue ?? 0, ...points.map((point) => point.value), 1);

  return (
    <div className={styles.barChart} role="img" aria-label={ariaLabel}>
      {points.map((point) => {
        const height = Math.max(
          point.value > 0 ? 3 : 0,
          Math.min(100, (point.value / resolvedMax) * 100),
        );
        return (
          <div className={styles.barColumn} key={point.id}>
            <span className={styles.barValue}>
              {point.displayValue ?? point.value.toLocaleString("ko-KR")}
            </span>
            <span
              className={styles.bar}
              style={{ height: `${height}%` }}
              aria-hidden="true"
            />
            <span className={styles.barLabel}>{point.label}</span>
          </div>
        );
      })}
    </div>
  );
}

export interface AdminDashboardProps {
  orderStatuses: OrderStatusSummary[];
  stats: DashboardStat[];
  primary: ReactNode;
  secondary?: ReactNode;
  tertiary?: ReactNode;
  onSelectOrderStatus?: (status: OrderStatusSummary) => void;
}

export function AdminDashboard({
  orderStatuses,
  stats,
  primary,
  secondary,
  tertiary,
  onSelectOrderStatus,
}: AdminDashboardProps) {
  return (
    <>
      <OrderStatusCards
        statuses={orderStatuses}
        onSelect={onSelectOrderStatus}
      />
      <DashboardStats stats={stats} />
      <div className={styles.dashboardGrid}>
        <div className={styles.dashboardStack}>{primary}</div>
        <div className={styles.dashboardStack}>
          {secondary}
          {tertiary}
        </div>
      </div>
    </>
  );
}

export function dashboardToneToBadge(
  tone: DashboardStat["tone"],
): AdminTone {
  return tone ?? "info";
}
