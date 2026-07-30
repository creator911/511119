"use client";

import { type ReactNode, useState } from "react";
import styles from "./admin.module.css";
import {
  DataTable,
  TableResultBar,
  type DataColumn,
  type DataRowAction,
  type RowKey,
} from "./DataTable";
import { FilterPanel, type FilterField } from "./FilterPanel";
import {
  ConfirmDialog,
  StatusBadge,
  type AdminTone,
} from "./shared";

export interface MemberListRecord {
  id: RowKey;
  joinedAt: string;
  loginId: string;
  nameDisplay: string;
  contactDisplay?: string;
  levelLabel: string;
  points: number;
  balance?: number;
  statusCode: string;
  statusLabel: string;
  statusTone?: AdminTone;
  lastLoginAt?: string;
}

export interface MemberListProps {
  members: MemberListRecord[];
  total: number;
  filters?: FilterField[];
  onFilterChange?: (name: string, value: string) => void;
  onSearch?: () => void;
  onResetFilters?: () => void;
  onViewMember?: (member: MemberListRecord) => void;
  onEditMember?: (member: MemberListRecord) => void;
  onDeleteMember?: (member: MemberListRecord) => void | Promise<void>;
  selectedKeys?: ReadonlySet<RowKey>;
  onSelectionChange?: (keys: Set<RowKey>) => void;
  page?: number;
  totalPages?: number;
  onPageChange?: (page: number) => void;
  sortBy?: string;
  sortDirection?: "asc" | "desc";
  onSort?: (columnId: string, direction: "asc" | "desc") => void;
  bulkActions?: ReactNode;
  summaryPrefix?: ReactNode;
  summarySuffix?: ReactNode;
  loading?: boolean;
  currencyUnit?: string;
  deleteActionLabel?: string;
  deleteDialogTitle?: string;
  deleteDialogMessage?: ReactNode;
  deleteDialogWarning?: ReactNode;
  deleteConfirmLabel?: string;
}

export function MemberList({
  members,
  total,
  filters = [],
  onFilterChange,
  onSearch,
  onResetFilters,
  onViewMember,
  onEditMember,
  onDeleteMember,
  selectedKeys,
  onSelectionChange,
  page,
  totalPages,
  onPageChange,
  sortBy,
  sortDirection,
  onSort,
  bulkActions,
  summaryPrefix,
  summarySuffix,
  loading,
  currencyUnit = "원",
  deleteActionLabel = "삭제",
  deleteDialogTitle = "회원 삭제",
  deleteDialogMessage = "선택한 회원을 삭제하시겠습니까?",
  deleteDialogWarning = "삭제 전 주문, 포인트, 충전·출금 내역 등 연결된 기록의 보존 정책을 확인하세요.",
  deleteConfirmLabel = "회원 삭제",
}: MemberListProps) {
  const [memberToDelete, setMemberToDelete] =
    useState<MemberListRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  const columns: DataColumn<MemberListRecord>[] = [
    {
      id: "joinedAt",
      header: "가입일",
      width: 110,
      sortable: true,
      align: "center",
      render: (member) => member.joinedAt,
    },
    {
      id: "loginId",
      header: "아이디",
      width: 130,
      sortable: true,
      align: "left",
      render: (member) => member.loginId,
    },
    {
      id: "name",
      header: "회원명",
      width: 105,
      align: "center",
      render: (member) => member.nameDisplay,
    },
    {
      id: "contact",
      header: "연락처",
      width: 130,
      align: "center",
      render: (member) => member.contactDisplay ?? "-",
    },
    {
      id: "level",
      header: "등급",
      width: 90,
      align: "center",
      render: (member) => member.levelLabel,
    },
    {
      id: "points",
      header: "포인트",
      width: 105,
      sortable: true,
      align: "right",
      render: (member) => (
        <span className={styles.money}>
          {member.points.toLocaleString("ko-KR")}P
        </span>
      ),
    },
    {
      id: "balance",
      header: "보유금액",
      width: 110,
      align: "right",
      render: (member) =>
        member.balance === undefined ? (
          "-"
        ) : (
          <span className={styles.money}>
            {member.balance.toLocaleString("ko-KR")}
            {currencyUnit}
          </span>
        ),
    },
    {
      id: "status",
      header: "상태",
      width: 90,
      align: "center",
      render: (member) => (
        <StatusBadge tone={member.statusTone}>
          {member.statusLabel}
        </StatusBadge>
      ),
    },
    {
      id: "lastLoginAt",
      header: "최근접속",
      width: 125,
      sortable: true,
      align: "center",
      render: (member) => member.lastLoginAt ?? "-",
    },
  ];

  const actions: DataRowAction<MemberListRecord>[] = [
    {
      id: "view",
      label: "상세",
      onClick: onViewMember,
      ariaLabel: (member) => `${member.loginId} 상세 보기`,
    },
    {
      id: "edit",
      label: "수정",
      onClick: onEditMember,
      ariaLabel: (member) => `${member.loginId} 수정`,
    },
    {
      id: "delete",
      label: deleteActionLabel,
      variant: "danger",
      onClick: onDeleteMember
        ? (member) => setMemberToDelete(member)
        : undefined,
      ariaLabel: (member) => `${member.loginId} ${deleteActionLabel}`,
    },
  ];

  const confirmDelete = async () => {
    if (!memberToDelete || !onDeleteMember) return;
    setDeleting(true);
    try {
      await onDeleteMember(memberToDelete);
      setMemberToDelete(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      {filters.length > 0 ? (
        <FilterPanel
          fields={filters}
          onChange={onFilterChange}
          onSearch={onSearch}
          onReset={onResetFilters}
          loading={loading}
        />
      ) : null}
      <TableResultBar
        total={total}
        selectedCount={selectedKeys?.size}
        actions={bulkActions}
        prefix={summaryPrefix}
        suffix={summarySuffix}
      />
      <DataTable
        caption="회원 목록"
        rows={members}
        columns={columns}
        getRowKey={(member) => member.id}
        rowActions={actions}
        selectable={Boolean(onSelectionChange)}
        selectedKeys={selectedKeys}
        onSelectionChange={onSelectionChange}
        page={page}
        totalPages={totalPages}
        onPageChange={onPageChange}
        sortBy={sortBy}
        sortDirection={sortDirection}
        onSort={onSort}
        loading={loading}
        emptyTitle="조회된 회원이 없습니다."
        emptyDescription="검색 조건을 변경해 다시 확인해 주세요."
      />
      <ConfirmDialog
        open={memberToDelete !== null}
        title={deleteDialogTitle}
        message={deleteDialogMessage}
        warning={deleteDialogWarning}
        confirmLabel={deleteConfirmLabel}
        destructive
        busy={deleting}
        onConfirm={
          memberToDelete && onDeleteMember ? confirmDelete : undefined
        }
        onClose={() => {
          if (!deleting) setMemberToDelete(null);
        }}
      />
    </>
  );
}
