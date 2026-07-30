"use client";

import { type CSSProperties, type ReactNode } from "react";
import styles from "./admin.module.css";
import { AdminButton, cx } from "./shared";

export type TableAlign = "left" | "center" | "right";
export type SortDirection = "asc" | "desc";
export type RowKey = string | number;

export interface DataColumn<T> {
  id: string;
  header: ReactNode;
  align?: TableAlign;
  width?: string | number;
  sortable?: boolean;
  render: (row: T, rowIndex: number) => ReactNode;
}

export interface DataRowAction<T> {
  id: string;
  label: string;
  variant?: "default" | "primary" | "danger";
  onClick?: (row: T) => void;
  disabled?: boolean | ((row: T) => boolean);
  hidden?: (row: T) => boolean;
  ariaLabel?: (row: T) => string;
}

export interface DataTableProps<T> {
  rows: T[];
  columns: DataColumn<T>[];
  getRowKey: (row: T) => RowKey;
  caption?: string;
  rowActions?: DataRowAction<T>[];
  actionsHeader?: string;
  selectable?: boolean;
  selectedKeys?: ReadonlySet<RowKey>;
  onSelectionChange?: (keys: Set<RowKey>) => void;
  sortBy?: string;
  sortDirection?: SortDirection;
  onSort?: (columnId: string, direction: SortDirection) => void;
  emptyTitle?: string;
  emptyDescription?: string;
  loading?: boolean;
  page?: number;
  totalPages?: number;
  onPageChange?: (page: number) => void;
  className?: string;
}

function alignClass(align: TableAlign | undefined): string {
  if (align === "right") return styles.cellRight;
  if (align === "center") return styles.cellCenter;
  return styles.cellLeft;
}

function pageWindow(page: number, totalPages: number): Array<number | "gap"> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const candidates = new Set([
    1,
    2,
    page - 1,
    page,
    page + 1,
    totalPages - 1,
    totalPages,
  ]);
  const pages = [...candidates]
    .filter((value) => value >= 1 && value <= totalPages)
    .sort((a, b) => a - b);
  const result: Array<number | "gap"> = [];
  pages.forEach((value, index) => {
    if (index > 0 && value - pages[index - 1] > 1) result.push("gap");
    result.push(value);
  });
  return result;
}

export function DataTable<T>({
  rows,
  columns,
  getRowKey,
  caption = "관리 데이터",
  rowActions = [],
  actionsHeader = "관리",
  selectable = false,
  selectedKeys = new Set<RowKey>(),
  onSelectionChange,
  sortBy,
  sortDirection = "asc",
  onSort,
  emptyTitle = "등록된 데이터가 없습니다.",
  emptyDescription,
  loading = false,
  page = 1,
  totalPages = 1,
  onPageChange,
  className,
}: DataTableProps<T>) {
  const visibleKeys = rows.map(getRowKey);
  const allSelected =
    visibleKeys.length > 0 && visibleKeys.every((key) => selectedKeys.has(key));
  const partlySelected =
    !allSelected && visibleKeys.some((key) => selectedKeys.has(key));

  const toggleAll = () => {
    if (!onSelectionChange) return;
    const next = new Set(selectedKeys);
    if (allSelected) {
      visibleKeys.forEach((key) => next.delete(key));
    } else {
      visibleKeys.forEach((key) => next.add(key));
    }
    onSelectionChange(next);
  };

  const toggleRow = (key: RowKey) => {
    if (!onSelectionChange) return;
    const next = new Set(selectedKeys);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onSelectionChange(next);
  };

  const renderSortHeader = (column: DataColumn<T>) => {
    if (!column.sortable) return column.header;
    const active = sortBy === column.id;
    const nextDirection: SortDirection =
      active && sortDirection === "asc" ? "desc" : "asc";

    return (
      <button
        type="button"
        className={styles.sortButton}
        onClick={() => onSort?.(column.id, nextDirection)}
        disabled={!onSort}
      >
        {column.header}
        <span className={styles.sortIndicator} aria-hidden="true">
          {active ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </button>
    );
  };

  return (
    <div className={cx(styles.tableFrame, className)} aria-busy={loading}>
      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <caption className={styles.srOnly}>{caption}</caption>
          <colgroup>
            {selectable ? <col style={{ width: 42 }} /> : null}
            {columns.map((column) => (
              <col
                key={column.id}
                style={
                  column.width !== undefined
                    ? ({ width: column.width } as CSSProperties)
                    : undefined
                }
              />
            ))}
            {rowActions.length > 0 ? <col style={{ width: 124 }} /> : null}
          </colgroup>
          <thead>
            <tr>
              {selectable ? (
                <th className={styles.checkboxCell} scope="col">
                  <input
                    className={styles.checkbox}
                    type="checkbox"
                    checked={allSelected}
                    ref={(node) => {
                      if (node) node.indeterminate = partlySelected;
                    }}
                    disabled={!onSelectionChange || visibleKeys.length === 0}
                    onChange={toggleAll}
                    aria-label="현재 페이지 전체 선택"
                  />
                </th>
              ) : null}
              {columns.map((column) => (
                <th
                  key={column.id}
                  scope="col"
                  className={alignClass(column.align ?? "center")}
                >
                  {renderSortHeader(column)}
                </th>
              ))}
              {rowActions.length > 0 ? <th scope="col">{actionsHeader}</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => {
              const key = getRowKey(row);
              const selected = selectedKeys.has(key);
              return (
                <tr
                  key={key}
                  className={selected ? styles.tableRowSelected : undefined}
                >
                  {selectable ? (
                    <td className={styles.checkboxCell}>
                      <input
                        className={styles.checkbox}
                        type="checkbox"
                        checked={selected}
                        disabled={!onSelectionChange}
                        onChange={() => toggleRow(key)}
                        aria-label={`${rowIndex + 1}번째 행 선택`}
                      />
                    </td>
                  ) : null}
                  {columns.map((column) => (
                    <td
                      key={column.id}
                      className={alignClass(column.align)}
                    >
                      {column.render(row, rowIndex)}
                    </td>
                  ))}
                  {rowActions.length > 0 ? (
                    <td className={styles.cellCenter}>
                      <span className={styles.tableActions}>
                        {rowActions.map((action) => {
                          if (action.hidden?.(row)) return null;
                          const explicitlyDisabled =
                            typeof action.disabled === "function"
                              ? action.disabled(row)
                              : action.disabled;
                          return (
                            <AdminButton
                              key={action.id}
                              size="small"
                              variant={action.variant}
                              onClick={() => action.onClick?.(row)}
                              disabled={explicitlyDisabled || !action.onClick}
                              aria-label={action.ariaLabel?.(row)}
                            >
                              {action.label}
                            </AdminButton>
                          );
                        })}
                      </span>
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {rows.length === 0 ? (
        <div className={styles.emptyState}>
          <div>
            <div className={styles.emptyIcon} aria-hidden="true">
              {loading ? "···" : "∅"}
            </div>
            <p className={styles.emptyTitle}>
              {loading ? "데이터를 불러오는 중입니다." : emptyTitle}
            </p>
            {!loading && emptyDescription ? (
              <p className={styles.emptyDescription}>{emptyDescription}</p>
            ) : null}
          </div>
        </div>
      ) : null}

      {totalPages > 1 ? (
        <nav className={styles.pagination} aria-label="페이지 이동">
          <button
            type="button"
            className={styles.pageButton}
            onClick={() => onPageChange?.(Math.max(1, page - 1))}
            disabled={!onPageChange || page <= 1}
            aria-label="이전 페이지"
          >
            ‹
          </button>
          {pageWindow(page, totalPages).map((item, index) =>
            item === "gap" ? (
              <span key={`gap-${index}`} className={styles.pageButton}>
                …
              </span>
            ) : (
              <button
                key={item}
                type="button"
                className={cx(
                  styles.pageButton,
                  item === page && styles.pageButtonActive,
                )}
                onClick={() => onPageChange?.(item)}
                disabled={!onPageChange}
                aria-current={item === page ? "page" : undefined}
              >
                {item}
              </button>
            ),
          )}
          <button
            type="button"
            className={styles.pageButton}
            onClick={() => onPageChange?.(Math.min(totalPages, page + 1))}
            disabled={!onPageChange || page >= totalPages}
            aria-label="다음 페이지"
          >
            ›
          </button>
        </nav>
      ) : null}
    </div>
  );
}

export interface TableResultBarProps {
  total: number;
  selectedCount?: number;
  actions?: ReactNode;
  prefix?: ReactNode;
  suffix?: ReactNode;
}

export function TableResultBar({
  total,
  selectedCount = 0,
  actions,
  prefix,
  suffix,
}: TableResultBarProps) {
  return (
    <div className={styles.searchSummary}>
      {prefix}
      <span className={styles.resultCount}>
        총 <strong>{total.toLocaleString("ko-KR")}</strong>건
        {selectedCount > 0
          ? ` · ${selectedCount.toLocaleString("ko-KR")}건 선택`
          : ""}
      </span>
      {suffix}
      {actions ? <div className={styles.summaryActions}>{actions}</div> : null}
    </div>
  );
}
