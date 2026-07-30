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
  AdminButton,
  AdminPanel,
  AdminSelect,
  ConfirmDialog,
  StatusBadge,
  type AdminTone,
} from "./shared";

export interface OrderListRecord {
  id: RowKey;
  orderNumber: string;
  orderedAt: string;
  buyerDisplay: string;
  itemSummary: string;
  quantity: number;
  totalAmount: number;
  paymentLabel: string;
  statusCode: string;
  statusLabel: string;
  statusTone?: AdminTone;
}

export interface OrderListProps {
  orders: OrderListRecord[];
  total: number;
  filters?: FilterField[];
  onFilterChange?: (name: string, value: string) => void;
  onSearch?: () => void;
  onResetFilters?: () => void;
  onViewOrder?: (order: OrderListRecord) => void;
  selectedKeys?: ReadonlySet<RowKey>;
  onSelectionChange?: (keys: Set<RowKey>) => void;
  page?: number;
  totalPages?: number;
  onPageChange?: (page: number) => void;
  sortBy?: string;
  sortDirection?: "asc" | "desc";
  onSort?: (columnId: string, direction: "asc" | "desc") => void;
  bulkActions?: ReactNode;
  loading?: boolean;
  currencyUnit?: string;
}

export function OrderList({
  orders,
  total,
  filters = [],
  onFilterChange,
  onSearch,
  onResetFilters,
  onViewOrder,
  selectedKeys,
  onSelectionChange,
  page,
  totalPages,
  onPageChange,
  sortBy,
  sortDirection,
  onSort,
  bulkActions,
  loading,
  currencyUnit = "원",
}: OrderListProps) {
  const columns: DataColumn<OrderListRecord>[] = [
    {
      id: "orderNumber",
      header: "주문번호",
      width: 145,
      sortable: true,
      align: "center",
      render: (order) => order.orderNumber,
    },
    {
      id: "orderedAt",
      header: "주문일시",
      width: 140,
      sortable: true,
      align: "center",
      render: (order) => order.orderedAt,
    },
    {
      id: "buyer",
      header: "주문자",
      width: 110,
      align: "center",
      render: (order) => order.buyerDisplay,
    },
    {
      id: "item",
      header: "주문상품",
      align: "left",
      render: (order) => (
        <span>
          {order.itemSummary}
          {order.quantity > 0
            ? ` · 총 ${order.quantity.toLocaleString("ko-KR")}개`
            : ""}
        </span>
      ),
    },
    {
      id: "payment",
      header: "결제상태",
      width: 100,
      align: "center",
      render: (order) => order.paymentLabel,
    },
    {
      id: "totalAmount",
      header: "결제금액",
      width: 120,
      sortable: true,
      align: "right",
      render: (order) => (
        <span className={styles.money}>
          {order.totalAmount.toLocaleString("ko-KR")}
          {currencyUnit}
        </span>
      ),
    },
    {
      id: "status",
      header: "주문상태",
      width: 100,
      align: "center",
      render: (order) => (
        <StatusBadge tone={order.statusTone}>{order.statusLabel}</StatusBadge>
      ),
    },
  ];

  const actions: DataRowAction<OrderListRecord>[] = [
    {
      id: "view",
      label: "상세",
      onClick: onViewOrder,
      ariaLabel: (order) => `${order.orderNumber} 상세 보기`,
    },
  ];

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
      />
      <DataTable
        caption="주문내역"
        rows={orders}
        columns={columns}
        getRowKey={(order) => order.id}
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
        emptyTitle="조회된 주문이 없습니다."
        emptyDescription="검색 조건을 변경해 다시 확인해 주세요."
      />
    </>
  );
}

export interface OrderPartyDetails {
  name: string;
  memberId?: string;
  phone?: string;
  email?: string;
}

export interface OrderShippingDetails {
  recipient: string;
  phone?: string;
  postalCode?: string;
  address?: string;
  addressDetail?: string;
  memo?: string;
  carrier?: string;
  trackingNumber?: string;
}

export interface OrderLineItem {
  id: string;
  name: string;
  optionLabel?: string;
  imageUrl?: string;
  imageAlt?: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface OrderTotalLine {
  id: string;
  label: string;
  amount: number;
  emphasized?: boolean;
}

export interface OrderHistoryItem {
  id: string;
  title: string;
  timestamp: string;
  detail?: string;
}

export interface OrderDetailRecord {
  id: RowKey;
  orderNumber: string;
  orderedAt: string;
  statusCode: string;
  statusLabel: string;
  statusTone?: AdminTone;
  paymentMethod: string;
  paymentStatus: string;
  paidAt?: string;
  buyer: OrderPartyDetails;
  shipping: OrderShippingDetails;
  items: OrderLineItem[];
  totals: OrderTotalLine[];
  history?: OrderHistoryItem[];
}

export interface OrderStatusOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface OrderDetailProps {
  order: OrderDetailRecord;
  statusOptions: OrderStatusOption[];
  onStatusChange?: (statusCode: string) => void;
  onSaveStatus?: () => void | Promise<void>;
  onCancelOrder?: () => void | Promise<void>;
  onRefundOrder?: () => void | Promise<void>;
  onBack?: () => void;
  extraActions?: ReactNode;
  saving?: boolean;
  currencyUnit?: string;
}

export function OrderDetail({
  order,
  statusOptions,
  onStatusChange,
  onSaveStatus,
  onCancelOrder,
  onRefundOrder,
  onBack,
  extraActions,
  saving = false,
  currencyUnit = "원",
}: OrderDetailProps) {
  const [pendingAction, setPendingAction] = useState<
    "cancel" | "refund" | null
  >(null);
  const [destructiveBusy, setDestructiveBusy] = useState(false);

  const confirmDestructiveAction = async () => {
    const callback =
      pendingAction === "cancel" ? onCancelOrder : onRefundOrder;
    if (!callback) return;
    setDestructiveBusy(true);
    try {
      await callback();
      setPendingAction(null);
    } finally {
      setDestructiveBusy(false);
    }
  };

  return (
    <>
      <div className={styles.detailGrid}>
        <div className={styles.detailStack}>
          <AdminPanel
            title={`주문 ${order.orderNumber}`}
            subtitle={order.orderedAt}
            action={
              <StatusBadge tone={order.statusTone}>
                {order.statusLabel}
              </StatusBadge>
            }
          >
            <div>
              {order.items.map((item) => (
                <article className={styles.orderItem} key={item.id}>
                  <div className={styles.orderItemImage}>
                    {item.imageUrl ? (
                      // Image locations are supplied by the new application.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.imageUrl} alt={item.imageAlt ?? ""} />
                    ) : (
                      <span>NO IMAGE</span>
                    )}
                  </div>
                  <div>
                    <p className={styles.orderItemName}>{item.name}</p>
                    <p className={styles.orderItemOption}>
                      {item.optionLabel ? `${item.optionLabel} · ` : ""}
                      {item.unitPrice.toLocaleString("ko-KR")}
                      {currencyUnit} × {item.quantity.toLocaleString("ko-KR")}
                    </p>
                  </div>
                  <span className={styles.orderItemPrice}>
                    {item.totalPrice.toLocaleString("ko-KR")}
                    {currencyUnit}
                  </span>
                </article>
              ))}
            </div>
          </AdminPanel>

          <AdminPanel title="주문자 정보" flush>
            <dl className={styles.descriptionList}>
              <DetailRow label="이름" value={order.buyer.name} />
              {order.buyer.memberId ? (
                <DetailRow label="회원아이디" value={order.buyer.memberId} />
              ) : null}
              {order.buyer.phone ? (
                <DetailRow label="연락처" value={order.buyer.phone} />
              ) : null}
              {order.buyer.email ? (
                <DetailRow label="이메일" value={order.buyer.email} />
              ) : null}
            </dl>
          </AdminPanel>

          <AdminPanel title="배송 정보" flush>
            <dl className={styles.descriptionList}>
              <DetailRow label="수령인" value={order.shipping.recipient} />
              {order.shipping.phone ? (
                <DetailRow label="연락처" value={order.shipping.phone} />
              ) : null}
              {order.shipping.address ? (
                <DetailRow
                  label="주소"
                  value={[
                    order.shipping.postalCode
                      ? `(${order.shipping.postalCode})`
                      : "",
                    order.shipping.address,
                    order.shipping.addressDetail,
                  ]
                    .filter(Boolean)
                    .join(" ")}
                />
              ) : null}
              {order.shipping.memo ? (
                <DetailRow label="배송메모" value={order.shipping.memo} />
              ) : null}
              {order.shipping.carrier || order.shipping.trackingNumber ? (
                <DetailRow
                  label="배송조회"
                  value={[order.shipping.carrier, order.shipping.trackingNumber]
                    .filter(Boolean)
                    .join(" / ")}
                />
              ) : null}
            </dl>
          </AdminPanel>
        </div>

        <div className={styles.detailStack}>
          <AdminPanel title="주문 상태">
            <div className={styles.fieldInlineWrap}>
              <AdminSelect
                value={order.statusCode}
                disabled={!onStatusChange || saving}
                onChange={(event) =>
                  onStatusChange?.(event.currentTarget.value)
                }
                aria-label="주문 상태"
              >
                {statusOptions.map((option) => (
                  <option
                    key={option.value}
                    value={option.value}
                    disabled={option.disabled}
                  >
                    {option.label}
                  </option>
                ))}
              </AdminSelect>
              <AdminButton
                variant="primary"
                onClick={() => void onSaveStatus?.()}
                loading={saving}
                disabled={!onSaveStatus}
              >
                상태 저장
              </AdminButton>
            </div>
          </AdminPanel>

          <AdminPanel title="결제 정보" flush>
            <dl className={styles.descriptionList}>
              <DetailRow label="결제수단" value={order.paymentMethod} />
              <DetailRow label="결제상태" value={order.paymentStatus} />
              {order.paidAt ? (
                <DetailRow label="결제일시" value={order.paidAt} />
              ) : null}
            </dl>
            <div className={styles.panelBody}>
              <ul className={styles.metricList}>
                {order.totals.map((total) => (
                  <li className={styles.metricItem} key={total.id}>
                    <span className={styles.metricLabel}>{total.label}</span>
                    <strong className={styles.metricValue}>
                      {total.amount.toLocaleString("ko-KR")}
                      {currencyUnit}
                    </strong>
                  </li>
                ))}
              </ul>
            </div>
          </AdminPanel>

          {order.history && order.history.length > 0 ? (
            <AdminPanel title="처리 이력">
              <ol className={styles.timeline}>
                {order.history.map((history) => (
                  <li className={styles.timelineItem} key={history.id}>
                    <span className={styles.timelineDot} aria-hidden="true" />
                    <p className={styles.timelineTitle}>{history.title}</p>
                    <p className={styles.timelineMeta}>
                      {history.timestamp}
                      {history.detail ? ` · ${history.detail}` : ""}
                    </p>
                  </li>
                ))}
              </ol>
            </AdminPanel>
          ) : null}
        </div>
      </div>

      <div className={styles.stickyActions}>
        <AdminButton onClick={onBack} disabled={!onBack || saving}>
          목록
        </AdminButton>
        {extraActions}
        <AdminButton
          variant="danger"
          onClick={() => setPendingAction("cancel")}
          disabled={!onCancelOrder || saving}
        >
          주문 취소
        </AdminButton>
        <AdminButton
          variant="danger"
          onClick={() => setPendingAction("refund")}
          disabled={!onRefundOrder || saving}
        >
          환불 처리
        </AdminButton>
      </div>

      <ConfirmDialog
        open={pendingAction !== null}
        title={pendingAction === "refund" ? "환불 처리" : "주문 취소"}
        message={
          pendingAction === "refund"
            ? "이 주문을 환불 처리하시겠습니까?"
            : "이 주문을 취소하시겠습니까?"
        }
        warning="처리 후에는 주문과 결제 상태를 반드시 다시 확인해 주세요."
        confirmLabel={pendingAction === "refund" ? "환불 처리" : "주문 취소"}
        destructive
        busy={destructiveBusy}
        onConfirm={
          pendingAction === "cancel"
            ? onCancelOrder
              ? confirmDestructiveAction
              : undefined
            : pendingAction === "refund" && onRefundOrder
              ? confirmDestructiveAction
              : undefined
        }
        onClose={() => {
          if (!destructiveBusy) setPendingAction(null);
        }}
      />
    </>
  );
}

interface DetailRowProps {
  label: string;
  value: ReactNode;
}

function DetailRow({ label, value }: DetailRowProps) {
  return (
    <div className={styles.descriptionRow}>
      <dt className={styles.descriptionTerm}>{label}</dt>
      <dd className={styles.descriptionValue}>{value}</dd>
    </div>
  );
}
