"use client";

import {
  Fragment,
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  AdminButton,
  AdminInput,
  AdminSelect,
  AdminTextarea,
  Notice,
  ToastRegion,
  useAdminToasts,
} from "@/app/components/admin";
import { OperationDialog } from "../OperationDialog";
import dialogStyles from "../operation-dialog.module.css";
import type {
  AdminOrderDetail,
  AdminOrderStatus,
  AdminPaymentStatus,
} from "@/lib/admin-operations";
import type {
  AdminOrderListFilters,
  AdminOrderListResult,
  AdminOrderListRow,
  AdminOrderListSort,
  AdminOrderSearchField,
} from "@/lib/admin-order-list";

interface OrdersManagerProps {
  initialResult: AdminOrderListResult;
}

interface OrderApiResponse {
  ok?: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
  order?: AdminOrderDetail;
}

interface OrderListApiResponse extends Partial<AdminOrderListResult> {
  ok?: boolean;
  message?: string;
}

const statusOptions: Array<{
  value: AdminOrderStatus;
  label: string;
}> = [
  { value: "ordered", label: "주문접수" },
  { value: "payment_confirmed", label: "입금확인" },
  { value: "preparing", label: "상품준비중" },
  { value: "shipped", label: "배송중" },
  { value: "delivered", label: "배송완료" },
  { value: "cancelled", label: "주문취소" },
  { value: "refunded", label: "반품·환불완료" },
];

const paymentOptions: Array<{
  value: AdminPaymentStatus;
  label: string;
}> = [
  { value: "pending", label: "입금확인중" },
  { value: "paid", label: "결제완료" },
  { value: "failed", label: "결제실패" },
  { value: "cancelled", label: "결제취소" },
];

const legacyStatusOptions: Array<{
  value: AdminOrderListFilters["status"];
  label: string;
}> = [
  { value: "", label: "전체" },
  { value: "ordered", label: "주문" },
  { value: "payment_confirmed", label: "입금" },
  { value: "preparing", label: "준비" },
  { value: "shipped", label: "배송" },
  { value: "delivered", label: "완료" },
  { value: "cancelled", label: "전체취소" },
  { value: "partial_cancelled", label: "부분취소" },
];

const paymentMethodOptions: Array<{
  value: AdminOrderListFilters["paymentMethod"];
  label: string;
}> = [
  { value: "", label: "전체" },
  { value: "bank", label: "무통장" },
  { value: "virtual", label: "가상계좌" },
  { value: "transfer", label: "계좌이체" },
  { value: "mobile", label: "휴대폰" },
  { value: "card", label: "신용카드" },
  { value: "easy", label: "PG간편결제" },
  { value: "kakao", label: "KAKAOPAY" },
];

const searchFieldOptions: Array<{
  value: AdminOrderSearchField;
  label: string;
}> = [
  { value: "orderNumber", label: "주문번호" },
  { value: "memberId", label: "회원 ID" },
  { value: "buyer", label: "주문자" },
  { value: "buyerPhone", label: "주문자전화" },
  { value: "buyerPhone", label: "주문자핸드폰" },
  { value: "recipient", label: "받는분" },
  { value: "recipientPhone", label: "받는분전화" },
  { value: "recipientPhone", label: "받는분핸드폰" },
  { value: "depositor", label: "입금자" },
  { value: "invoice", label: "운송장번호" },
];

const paymentMethodLabels: Record<string, string> = {
  bank: "무통장입금",
  card: "신용카드",
  transfer: "실시간 계좌이체",
  virtual: "가상계좌",
  virtual_account: "가상계좌",
  mobile: "휴대폰결제",
  easy: "PG간편결제",
  easy_pay: "PG간편결제",
  pg: "PG간편결제",
  payco: "PG간편결제",
  naverpay: "PG간편결제",
  samsungpay: "PG간편결제",
  lpay: "PG간편결제",
  inicis_kakaopay: "PG간편결제",
  kakao: "KAKAOPAY",
  kakaopay: "KAKAOPAY",
  points: "포인트 전액결제",
};

function paymentMethodLabel(method: string): string {
  return paymentMethodLabels[method.toLowerCase()] ?? method;
}

function startOfLocalDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function formatDateInput(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const orderProgress = new Map<AdminOrderStatus, number>([
  ["ordered", 0],
  ["payment_confirmed", 1],
  ["preparing", 2],
  ["shipped", 3],
  ["delivered", 4],
]);

export function OrdersManager({
  initialResult,
}: OrdersManagerProps) {
  const router = useRouter();
  const { toasts, pushToast, dismissToast } = useAdminToasts();
  const [result, setResult] = useState(initialResult);
  const [filters, setFilters] = useState<AdminOrderListFilters>(
    initialResult.filters,
  );
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState("");
  const listRequestId = useRef(0);
  const [orderOverrides, setOrderOverrides] = useState<
    Record<string, AdminOrderListRow>
  >({});
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [previewOrderId, setPreviewOrderId] = useState<string | null>(null);
  const [previewOrders, setPreviewOrders] = useState<
    Record<string, AdminOrderDetail>
  >({});
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(
    null,
  );
  const [bulkStatusChecked, setBulkStatusChecked] = useState(false);
  const [bulkSendMail, setBulkSendMail] = useState(true);
  const [bulkSendSms, setBulkSendSms] = useState(true);
  const [bulkSendEscrow, setBulkSendEscrow] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [shippingDrafts, setShippingDrafts] = useState<
    Record<string, { carrier: string; trackingNumber: string }>
  >({});
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogLoading, setDialogLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [order, setOrder] = useState<AdminOrderDetail | null>(null);
  const [status, setStatus] = useState<AdminOrderStatus>("ordered");
  const [paymentStatus, setPaymentStatus] =
    useState<AdminPaymentStatus>("pending");
  const [shippingCarrier, setShippingCarrier] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [refundAmount, setRefundAmount] = useState("0");
  const [adminMemo, setAdminMemo] = useState("");

  useEffect(() => {
    if (!previewOrderId) return;
    const closePreview = (event: MouseEvent) => {
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest(".legacy-order-number-cell")
      ) {
        return;
      }
      setPreviewOrderId(null);
    };
    document.addEventListener("click", closePreview);
    return () => document.removeEventListener("click", closePreview);
  }, [previewOrderId]);

  const orders = result.rows.map(
    (record) => orderOverrides[String(record.id)] ?? record,
  );
  const closeDialog = useCallback(() => {
    if (saving) return;
    setDialogOpen(false);
    setOrder(null);
    setError("");
  }, [saving]);

  const togglePreview = async (record: AdminOrderListRow) => {
    const id = String(record.id);
    if (previewOrderId === id) {
      setPreviewOrderId(null);
      return;
    }
    setPreviewOrderId(id);
    if (previewOrders[id]) return;

    setPreviewLoadingId(id);
    try {
      const response = await fetch(
        `/api/admin/orders/${encodeURIComponent(id)}`,
        {
          cache: "no-store",
          headers: { Accept: "application/json" },
        },
      );
      const payload = await readOrderResponse(response);
      if (response.status === 401) {
        redirectToAdminLogin();
        return;
      }
      if (!response.ok || !payload.order) {
        throw new Error(
          payload.message ?? "주문상품을 불러오지 못했습니다.",
        );
      }
      setPreviewOrders((current) => ({
        ...current,
        [id]: payload.order as AdminOrderDetail,
      }));
    } catch (cause) {
      setListError(
        cause instanceof Error
          ? cause.message
          : "주문상품을 불러오지 못했습니다.",
      );
    } finally {
      setPreviewLoadingId((current) => (current === id ? null : current));
    }
  };

  const openOrder = async (record: AdminOrderListRow) => {
    const id = String(record.id);
    setDialogOpen(true);
    setDialogLoading(true);
    setError("");
    setOrder(null);
    try {
      const response = await fetch(
        `/api/admin/orders/${encodeURIComponent(id)}`,
        {
          cache: "no-store",
          headers: { Accept: "application/json" },
        },
      );
      const result = await readOrderResponse(response);
      if (response.status === 401) {
        redirectToAdminLogin();
        return;
      }
      if (!response.ok || !result.order) {
        throw new Error(result.message ?? "주문을 불러오지 못했습니다.");
      }
      setOrder(result.order);
      setStatus(result.order.status);
      setPaymentStatus(result.order.paymentStatus);
      setShippingCarrier(result.order.shippingCarrier);
      setTrackingNumber(result.order.trackingNumber);
      setRefundAmount(String(result.order.refundAmount));
      setAdminMemo(result.order.adminMemo);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "주문을 불러오지 못했습니다.",
      );
    } finally {
      setDialogLoading(false);
    }
  };

  const loadOrders = async (
    options: Partial<AdminOrderListFilters> & { page?: number },
  ) => {
    const requestId = listRequestId.current + 1;
    listRequestId.current = requestId;
    const requestedFilters = { ...result.filters, ...options };
    const params = new URLSearchParams({
      page: String(options.page ?? 1),
      pageSize: String(result.pageSize),
      sortBy: requestedFilters.sortBy,
      sortDirection: requestedFilters.sortDirection,
      searchField: requestedFilters.searchField,
    });
    for (const name of [
      "q",
      "status",
      "paymentMethod",
      "paymentStatus",
      "dateStart",
      "dateEnd",
    ] as const) {
      if (requestedFilters[name]) params.set(name, requestedFilters[name]);
    }
    for (const name of [
      "outstandingOnly",
      "cancelledOnly",
      "refundedOnly",
      "pointsOrderOnly",
      "couponOnly",
    ] as const) {
      if (requestedFilters[name]) params.set(name, "1");
    }

    setListLoading(true);
    setListError("");
    try {
      const response = await fetch(`/api/admin/orders?${params.toString()}`, {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      const payload = await readOrderListResponse(response);
      if (requestId !== listRequestId.current) return;
      if (response.status === 401) {
        redirectToAdminLogin();
        return;
      }
      if (
        !response.ok ||
        !Array.isArray(payload.rows) ||
        !payload.filters ||
        typeof payload.total !== "number" ||
        typeof payload.page !== "number" ||
        typeof payload.pageSize !== "number" ||
        typeof payload.totalPages !== "number"
      ) {
        throw new Error(payload.message ?? "주문 목록을 불러오지 못했습니다.");
      }
      const nextResult = payload as AdminOrderListResult;
      setResult(nextResult);
      setFilters(nextResult.filters);
      setSelectedOrderIds(new Set());
      setPreviewOrderId(null);
      setBulkStatusChecked(false);
    } catch (cause) {
      if (requestId !== listRequestId.current) return;
      setListError(
        cause instanceof Error
          ? cause.message
          : "주문 목록을 불러오지 못했습니다.",
      );
    } finally {
      if (requestId === listRequestId.current) setListLoading(false);
    }
  };

  const saveOrder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!order || saving) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(
        `/api/admin/orders/${encodeURIComponent(order.id)}`,
        {
          method: "PATCH",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            status,
            paymentStatus,
            shippingCarrier,
            trackingNumber,
            refundAmount: Number(refundAmount),
            adminMemo,
          }),
        },
      );
      const apiResult = await readOrderResponse(response);
      if (response.status === 401) {
        redirectToAdminLogin();
        return;
      }
      if (!response.ok || !apiResult.order) {
        throw new Error(
          firstApiError(apiResult) ?? "주문 변경사항을 저장하지 못했습니다.",
        );
      }

      const updated = apiResult.order;
      setOrder(updated);
      setStatus(updated.status);
      setPaymentStatus(updated.paymentStatus);
      setShippingCarrier(updated.shippingCarrier);
      setTrackingNumber(updated.trackingNumber);
      setRefundAmount(String(updated.refundAmount));
      setAdminMemo(updated.adminMemo);
      const currentRecord = orders.find(
        (record) => String(record.id) === updated.id,
      );
      if (currentRecord) {
        setOrderOverrides((current) => ({
          ...current,
          [updated.id]: {
            ...currentRecord,
            paymentStatus: updated.paymentStatus,
            status: updated.status,
            shippingCarrier: updated.shippingCarrier,
            trackingNumber: updated.trackingNumber,
            cancelAmount: updated.refundAmount,
            receiptAmount:
              updated.paymentStatus === "paid" || updated.refundAmount > 0
                ? updated.total
                : 0,
            outstandingAmount:
              updated.paymentStatus === "pending"
                ? Math.max(0, updated.total - updated.refundAmount)
                : 0,
          },
        }));
      }
      pushToast({
        title: "주문을 저장했습니다.",
        message: `${updated.id}의 처리 상태가 반영되었습니다.`,
        tone: "success",
      });
      void loadOrders({ ...result.filters, page: result.page });
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "주문 변경사항을 저장하지 못했습니다.",
      );
    } finally {
      setSaving(false);
    }
  };

  const setQuickDates = (
    range: "today" | "yesterday" | "week" | "month" | "lastWeek" | "lastMonth" | "all",
  ) => {
    if (range === "all") {
      setFilters((current) => ({
        ...current,
        dateStart: "",
        dateEnd: "",
      }));
      return;
    }

    const today = startOfLocalDay(new Date());
    let start = new Date(today);
    let end = new Date(today);
    if (range === "yesterday") {
      start.setDate(start.getDate() - 1);
      end = new Date(start);
    } else if (range === "week") {
      start.setDate(start.getDate() - start.getDay());
    } else if (range === "month") {
      start = new Date(start.getFullYear(), start.getMonth(), 1);
    } else if (range === "lastWeek") {
      const weekday = start.getDay();
      end.setDate(end.getDate() - weekday - 1);
      start = new Date(end);
      start.setDate(start.getDate() - 6);
    } else if (range === "lastMonth") {
      start = new Date(start.getFullYear(), start.getMonth() - 1, 1);
      end = new Date(today.getFullYear(), today.getMonth(), 0);
    }
    setFilters((current) => ({
      ...current,
      dateStart: formatDateInput(start),
      dateEnd: formatDateInput(end),
    }));
  };

  const searchFor = (searchField: AdminOrderSearchField, q: string) => {
    const next = {
      ...filters,
      searchField,
      q,
    };
    setFilters(next);
    void loadOrders({ ...next, page: 1 });
  };

  const changeSort = (sortBy: AdminOrderListSort) => {
    const sortDirection =
      result.filters.sortBy === sortBy &&
      result.filters.sortDirection === "desc"
        ? "asc"
        : "desc";
    void loadOrders({
      ...result.filters,
      sortBy,
      sortDirection,
      page: 1,
    });
  };

  const toggleOrder = (id: string, checked: boolean) => {
    setSelectedOrderIds((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleAllOrders = (checked: boolean) => {
    setSelectedOrderIds(
      checked ? new Set(orders.map((record) => record.id)) : new Set(),
    );
  };

  const updateShippingDraft = (
    id: string,
    field: "carrier" | "trackingNumber",
    value: string,
  ) => {
    const record = orders.find((candidate) => candidate.id === id);
    setShippingDrafts((current) => ({
      ...current,
      [id]: {
        carrier:
          current[id]?.carrier ??
          record?.shippingCarrier ??
          "",
        trackingNumber:
          current[id]?.trackingNumber ??
          record?.trackingNumber ??
          "",
        [field]: value,
      },
    }));
  };

  const runBulkStatusUpdate = async () => {
    const transition = legacyBulkTransition(result.filters.status);
    const selected = orders.filter((record) =>
      selectedOrderIds.has(record.id),
    );
    if (!transition || bulkBusy) return;
    if (selected.length === 0) {
      setListError("선택수정 하실 항목을 하나 이상 선택하세요.");
      return;
    }
    if (!bulkStatusChecked) {
      setListError("주문상태 변경에 체크하세요.");
      return;
    }
    if (
      !window.confirm(
        `선택하신 주문서의 주문상태를 '${transition.label}'상태로 변경하시겠습니까?`,
      )
    ) {
      return;
    }

    setBulkBusy(true);
    setListError("");
    let updatedCount = 0;
    try {
      for (const record of selected) {
        if (
          transition.status === "payment_confirmed" &&
          record.paymentMethod !== "bank"
        ) {
          throw new Error(
            "'주문' 상태의 '무통장'(결제수단)인 경우에만 '입금' 처리 가능합니다.",
          );
        }
        const draft = shippingDrafts[record.id] ?? {
          carrier: record.shippingCarrier,
          trackingNumber: record.trackingNumber,
        };
        if (
          transition.status === "shipped" &&
          (!draft.carrier.trim() || !draft.trackingNumber.trim())
        ) {
          throw new Error(
            `${record.id}: 배송회사와 운송장번호를 입력하시기 바랍니다.`,
          );
        }

        const response = await fetch(
          `/api/admin/orders/${encodeURIComponent(record.id)}`,
          {
            method: "PATCH",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              status: transition.status,
              paymentStatus:
                transition.status === "payment_confirmed"
                  ? "paid"
                  : record.paymentStatus,
              ...(transition.status === "shipped"
                ? {
                    shippingCarrier: draft.carrier.trim(),
                    trackingNumber: draft.trackingNumber.trim(),
                  }
                : {}),
            }),
          },
        );
        const payload = await readOrderResponse(response);
        if (response.status === 401) {
          redirectToAdminLogin();
          return;
        }
        if (!response.ok || !payload.order) {
          throw new Error(
            `${record.id}: ${firstApiError(payload) ?? "주문상태를 변경하지 못했습니다."}`,
          );
        }
        updatedCount += 1;
      }
      pushToast({
        title: "선택한 주문을 수정했습니다.",
        message: `${updatedCount.toLocaleString("ko-KR")}건의 상태를 ${transition.label}(으)로 변경했습니다.${
          bulkSendMail || bulkSendSms || bulkSendEscrow
            ? " 알림·에스크로 요청은 연동 설정에 따라 처리됩니다."
            : ""
        }`,
        tone: "success",
      });
      await loadOrders({ ...result.filters, page: result.page });
      router.refresh();
    } catch (cause) {
      setListError(
        cause instanceof Error
          ? cause.message
          : "선택한 주문을 수정하지 못했습니다.",
      );
      if (updatedCount > 0) {
        await loadOrders({ ...result.filters, page: result.page });
      }
    } finally {
      setBulkBusy(false);
    }
  };

  const runBulkDelete = async () => {
    const selected = orders.filter((record) =>
      selectedOrderIds.has(record.id),
    );
    if (bulkBusy) return;
    if (selected.length === 0) {
      setListError("선택삭제 하실 항목을 하나 이상 선택하세요.");
      return;
    }
    if (
      !window.confirm("선택한 자료를 정말 삭제하시겠습니까?")
    ) {
      return;
    }

    setBulkBusy(true);
    setListError("");
    let deletedCount = 0;
    try {
      for (const record of selected) {
        const response = await fetch(
          `/api/admin/orders/${encodeURIComponent(record.id)}`,
          {
            method: "DELETE",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              confirmation: record.id,
              expectedUpdatedAt: record.updatedAt,
            }),
          },
        );
        const payload = await readOrderResponse(response);
        if (response.status === 401) {
          redirectToAdminLogin();
          return;
        }
        if (!response.ok) {
          throw new Error(
            `${record.id}: ${firstApiError(payload) ?? "주문을 삭제하지 못했습니다."}`,
          );
        }
        deletedCount += 1;
      }
      pushToast({
        title: "선택한 주문을 삭제했습니다.",
        message: `${deletedCount.toLocaleString("ko-KR")}건을 안전하게 삭제했습니다.`,
        tone: "success",
      });
      await loadOrders({ ...result.filters, page: result.page });
      router.refresh();
    } catch (cause) {
      setListError(
        cause instanceof Error
          ? cause.message
          : "선택한 주문을 삭제하지 못했습니다.",
      );
      if (deletedCount > 0) {
        await loadOrders({ ...result.filters, page: result.page });
      }
    } finally {
      setBulkBusy(false);
    }
  };

  const bulkTransition = legacyBulkTransition(result.filters.status);

  return (
    <>
      {listError ? <Notice tone="danger">{listError}</Notice> : null}
      <div className="local_ov01 local_ov legacy-order-summary">
        <a className="ov_listall" href="/adm/orders">
          전체목록
        </a>
        <span className="btn_ov01">
          <span className="ov_txt">전체 주문내역</span>
          <span className="ov_num">
            {" "}
            {result.total.toLocaleString("ko-KR")}건
          </span>
        </span>
      </div>
      <form
        className="local_sch01 local_sch legacy-order-search"
        onSubmit={(event) => {
          event.preventDefault();
          void loadOrders({ ...filters, page: 1 });
        }}
      >
        <label className="sound_only" htmlFor="legacy-order-search-kind">
          검색 기준
        </label>
        <select
          id="legacy-order-search-kind"
          value={filters.searchField}
          onChange={(event) =>
            setFilters((current) => ({
              ...current,
              searchField: event.currentTarget.value as AdminOrderSearchField,
            }))
          }
        >
          {searchFieldOptions.map((option, index) => (
            <option key={`${option.value}-${index}`} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <label className="sound_only" htmlFor="legacy-order-query">
          검색어 필수
        </label>
        <input
          className="required frm_input"
          id="legacy-order-query"
          type="text"
          value={filters.q}
          autoComplete="off"
          required
          onChange={(event) =>
            setFilters((current) => ({
              ...current,
              q: event.currentTarget.value,
            }))
          }
        />
        <button className="btn_submit" type="submit">
          검색
        </button>
      </form>
      <form
        className="local_sch03 local_sch legacy-order-filter"
        onSubmit={(event) => {
          event.preventDefault();
          void loadOrders({ ...filters, page: 1 });
        }}
      >
        <div>
          <strong>주문상태</strong>
          {legacyStatusOptions.map((option) => (
            <label key={option.value}>
              <input
                type="radio"
                name="od_status"
                value={option.value}
                checked={filters.status === option.value}
                onChange={() =>
                  setFilters((current) => ({
                    ...current,
                    status: option.value,
                  }))
                }
              />
              {option.label}
            </label>
          ))}
        </div>
        <div>
          <strong>결제수단</strong>
          {paymentMethodOptions.map((option) => (
            <label key={option.value}>
              <input
                type="radio"
                name="od_settle_case"
                value={option.value}
                checked={filters.paymentMethod === option.value}
                onChange={() =>
                  setFilters((current) => ({
                    ...current,
                    paymentMethod: option.value,
                  }))
                }
              />
              {option.label}
            </label>
          ))}
        </div>
        <div>
          <strong>기타선택</strong>
          {[
            ["outstandingOnly", "미수금"],
            ["cancelledOnly", "반품,품절"],
            ["refundedOnly", "환불"],
            ["pointsOrderOnly", "포인트주문"],
            ["couponOnly", "쿠폰"],
          ].map(([name, label]) => (
            <label key={name}>
              <input
                type="checkbox"
                name={name}
                value="1"
                checked={filters[name as keyof AdminOrderListFilters] === true}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    [name]: event.currentTarget.checked,
                  }))
                }
              />
              {label}
            </label>
          ))}
        </div>
        <div className="sch_last legacy-order-date-row">
          <strong>주문일자</strong>
          <input
            className="frm_input"
            type="text"
            aria-label="주문 시작일"
            maxLength={10}
            placeholder="YYYY-MM-DD"
            value={filters.dateStart}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                dateStart: event.currentTarget.value,
              }))
            }
          />
          <span>~</span>
          <input
            className="frm_input"
            type="text"
            aria-label="주문 종료일"
            maxLength={10}
            placeholder="YYYY-MM-DD"
            value={filters.dateEnd}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                dateEnd: event.currentTarget.value,
              }))
            }
          />
          {[
            ["today", "오늘"],
            ["yesterday", "어제"],
            ["week", "이번주"],
            ["month", "이번달"],
            ["lastWeek", "지난주"],
            ["lastMonth", "지난달"],
            ["all", "전체"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() =>
                setQuickDates(
                  value as
                    | "today"
                    | "yesterday"
                    | "week"
                    | "month"
                    | "lastWeek"
                    | "lastMonth"
                    | "all",
                )
              }
            >
              {label}
            </button>
          ))}
          <button type="submit" className="btn_submit legacy-order-submit">
            검색
          </button>
        </div>
      </form>
      <LegacyOrderTable
        orders={orders}
        result={result}
        selectedOrderIds={selectedOrderIds}
        previewOrderId={previewOrderId}
        previewOrders={previewOrders}
        previewLoadingId={previewLoadingId}
        loading={listLoading}
        onToggleOrder={toggleOrder}
        onToggleAll={toggleAllOrders}
        onTogglePreview={(record) => void togglePreview(record)}
        onViewOrder={(record) => void openOrder(record)}
        onSearchFor={searchFor}
        onSort={changeSort}
        page={result.page}
        totalPages={result.totalPages}
        preparingMode={result.filters.status === "preparing"}
        shippingDrafts={shippingDrafts}
        onShippingDraftChange={updateShippingDraft}
        onPageChange={(page) =>
          void loadOrders({ ...result.filters, page })
        }
      />
      <div className="local_cmd01 local_cmd legacy-order-selection">
        {bulkTransition ? (
          <>
            <label className="cmd_tit" htmlFor="legacy-order-bulk-status">
              주문상태 변경
            </label>
            <label>
              <input
                id="legacy-order-bulk-status"
                type="checkbox"
                checked={bulkStatusChecked}
                disabled={bulkBusy}
                onChange={(event) =>
                  setBulkStatusChecked(event.currentTarget.checked)
                }
              />{" "}
              &apos;{bulkTransition.currentLabel}&apos;상태에서 &apos;
              <strong>{bulkTransition.label}</strong>&apos;상태로 변경합니다.
            </label>
            {result.filters.status === "ordered" ||
            result.filters.status === "preparing" ? (
              <>
                <label htmlFor="legacy-order-send-mail">
                  <input
                    id="legacy-order-send-mail"
                    type="checkbox"
                    checked={bulkSendMail}
                    disabled={bulkBusy}
                    onChange={(event) =>
                      setBulkSendMail(event.currentTarget.checked)
                    }
                  />{" "}
                  {bulkTransition.label}안내 메일
                </label>
                <label htmlFor="legacy-order-send-sms">
                  <input
                    id="legacy-order-send-sms"
                    type="checkbox"
                    checked={bulkSendSms}
                    disabled={bulkBusy}
                    onChange={(event) =>
                      setBulkSendSms(event.currentTarget.checked)
                    }
                  />{" "}
                  {bulkTransition.label}안내 SMS
                </label>
              </>
            ) : null}
            {result.filters.status === "preparing" ? (
              <label htmlFor="legacy-order-send-escrow">
                <input
                  id="legacy-order-send-escrow"
                  type="checkbox"
                  checked={bulkSendEscrow}
                  disabled={bulkBusy}
                  onChange={(event) =>
                    setBulkSendEscrow(event.currentTarget.checked)
                  }
                />{" "}
                에스크로배송등록
              </label>
            ) : null}
            <button
              className="btn_submit"
              type="button"
              disabled={bulkBusy}
              onClick={() => void runBulkStatusUpdate()}
            >
              선택수정
            </button>
          </>
        ) : null}
        {result.filters.status === "ordered" ? (
          <span>주문상태에서만 삭제가 가능합니다.</span>
        ) : null}
        <button
          className="btn_submit legacy-order-delete"
          type="button"
          disabled={bulkBusy}
          onClick={() => void runBulkDelete()}
        >
          선택삭제
        </button>
      </div>
      <div className="local_desc02 local_desc legacy-order-description">
        <p>
          &lt;무통장&gt;인 경우에만 &lt;주문&gt;에서 &lt;입금&gt;으로
          변경됩니다. 가상계좌는 입금시 자동으로 &lt;입금&gt;처리됩니다.
          <br />
          &lt;준비&gt;에서 &lt;배송&gt;으로 변경시
          &lt;에스크로배송등록&gt;을 체크하시면 에스크로 주문에 한해 PG사에
          배송정보가 자동 등록됩니다.
          <br />
          <strong>주의!</strong> 주문번호를 클릭하여 나오는 주문상세내역의
          주소를 외부에서 조회가 가능한곳에 올리지 마십시오.
        </p>
      </div>
      <OperationDialog
        open={dialogOpen}
        title={order ? `주문 ${order.id}` : "주문 상세"}
        subtitle={order?.createdAt}
        busy={saving}
        onClose={closeDialog}
        footer={
          <>
            <AdminButton onClick={closeDialog} disabled={saving}>
              닫기
            </AdminButton>
            <AdminButton
              variant="primary"
              type="submit"
              form="admin-order-operation-form"
              loading={saving}
              disabled={!order || dialogLoading}
            >
              변경사항 저장
            </AdminButton>
          </>
        }
      >
        {dialogLoading ? (
          <div className={dialogStyles.loading} role="status">
            주문 정보를 불러오는 중입니다.
          </div>
        ) : (
          <>
            {error ? (
              <p className={dialogStyles.error} role="alert">
                {error}
              </p>
            ) : null}
            {order ? (
              <form id="admin-order-operation-form" onSubmit={saveOrder}>
                <section className={dialogStyles.section}>
                  <h3 className={dialogStyles.sectionTitle}>주문·배송 정보</h3>
                  <dl className={dialogStyles.definitionGrid}>
                    <dt>주문자</dt>
                    <dd>
                      {order.orderer.name}
                      {order.memberLoginId
                        ? ` (${order.memberLoginId})`
                        : " (비회원)"}
                    </dd>
                    <dt>주문자 연락처</dt>
                    <dd>
                      {order.orderer.phone} · {order.orderer.email}
                    </dd>
                    <dt>주문자 주소</dt>
                    <dd>
                      {[
                        order.orderer.postcode
                          ? `(${order.orderer.postcode})`
                          : "",
                        order.orderer.address1,
                        order.orderer.address2,
                      ]
                        .filter(Boolean)
                        .join(" ") || "-"}
                    </dd>
                    <dt>수령인</dt>
                    <dd>
                      {order.recipient.name} · {order.recipient.phone}
                    </dd>
                    <dt>배송지</dt>
                    <dd>
                      {[
                        order.recipient.postcode
                          ? `(${order.recipient.postcode})`
                          : "",
                        order.recipient.address1,
                        order.recipient.address2,
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    </dd>
                    <dt>배송 메모</dt>
                    <dd>{order.recipient.memo || "-"}</dd>
                  </dl>
                </section>

                <section className={dialogStyles.section}>
                  <h3 className={dialogStyles.sectionTitle}>주문 상품</h3>
                  <ul className={dialogStyles.itemList}>
                    {order.items.map((item) => (
                      <li className={dialogStyles.item} key={item.id}>
                        <div>
                          <p className={dialogStyles.itemName}>
                            {item.productName}
                          </p>
                          <p className={dialogStyles.itemMeta}>
                            {item.productId} ·{" "}
                            {item.unitPrice.toLocaleString("ko-KR")}원 ×{" "}
                            {item.quantity.toLocaleString("ko-KR")}
                          </p>
                        </div>
                        <strong className={dialogStyles.itemPrice}>
                          {item.lineTotal.toLocaleString("ko-KR")}원
                        </strong>
                      </li>
                    ))}
                  </ul>
                  <p className={dialogStyles.summary}>
                    <span>
                      상품금액{" "}
                      <strong>
                        {order.subtotal.toLocaleString("ko-KR")}원
                      </strong>
                    </span>
                    <span>
                      배송비{" "}
                      <strong>
                        {order.shippingFee.toLocaleString("ko-KR")}원
                      </strong>
                    </span>
                    <span>
                      할인 합계{" "}
                      <strong>
                        {order.discount.toLocaleString("ko-KR")}원
                      </strong>
                    </span>
                    <span>
                      적립 포인트{" "}
                      <strong>
                        {order.earnedPoints.toLocaleString("ko-KR")}P
                      </strong>
                    </span>
                    {order.reversedPoints > 0 ? (
                      <span>
                        회수 포인트{" "}
                        <strong>
                          {order.reversedPoints.toLocaleString("ko-KR")}P
                        </strong>
                      </span>
                    ) : null}
                    <span>
                      결제금액{" "}
                      <strong>{order.total.toLocaleString("ko-KR")}원</strong>
                    </span>
                  </p>
                </section>

                <section className={dialogStyles.section}>
                  <h3 className={dialogStyles.sectionTitle}>처리 상태</h3>
                  <dl className={dialogStyles.definitionGrid}>
                    <dt>결제수단</dt>
                    <dd>{paymentMethodLabel(order.paymentMethod)}</dd>
                    <dt>입금자명</dt>
                    <dd>{order.payment.depositor || "-"}</dd>
                    <dt>은행 코드</dt>
                    <dd>
                      {order.payment.bankCode === "manual"
                        ? "수동 계좌 안내"
                        : order.payment.bankCode || "-"}
                    </dd>
                    <dt>현금영수증 번호</dt>
                    <dd>{order.payment.cashReceiptNumber || "-"}</dd>
                  </dl>
                  <div className={dialogStyles.formGrid}>
                    <label className={dialogStyles.field}>
                      <span className={dialogStyles.label}>주문 상태</span>
                      <AdminSelect
                        value={status}
                        onChange={(event) => {
                          const nextStatus = event.currentTarget
                            .value as AdminOrderStatus;
                          setStatus(nextStatus);
                          if (nextStatus === "refunded") {
                            setPaymentStatus("cancelled");
                          } else if (nextStatus === "cancelled") {
                            setPaymentStatus((current) =>
                              current === "failed" ? "failed" : "cancelled",
                            );
                          } else if (
                            nextStatus === "payment_confirmed" ||
                            nextStatus === "preparing" ||
                            nextStatus === "shipped" ||
                            nextStatus === "delivered"
                          ) {
                            setPaymentStatus("paid");
                          }
                        }}
                        disabled={
                          saving ||
                          order.status === "cancelled" ||
                          order.status === "refunded"
                        }
                      >
                        {statusOptions.map((option) => (
                          <option
                            key={option.value}
                            value={option.value}
                            disabled={
                              (order.status === "cancelled" &&
                                option.value !== "cancelled") ||
                              (order.status === "delivered" &&
                                option.value !== "delivered" &&
                                option.value !== "refunded") ||
                              (order.status === "refunded" &&
                                option.value !== "refunded") ||
                              (order.status !== "delivered" &&
                                option.value === "refunded") ||
                              ((orderProgress.get(option.value) ?? -1) >= 0 &&
                                (orderProgress.get(order.status) ?? -1) >
                                  (orderProgress.get(option.value) ?? -1))
                            }
                          >
                            {option.label}
                          </option>
                        ))}
                      </AdminSelect>
                    </label>
                    <label className={dialogStyles.field}>
                      <span className={dialogStyles.label}>결제 상태</span>
                      <AdminSelect
                        value={paymentStatus}
                        onChange={(event) => {
                          const nextPaymentStatus = event.currentTarget
                            .value as AdminPaymentStatus;
                          setPaymentStatus(nextPaymentStatus);
                          if (
                            nextPaymentStatus === "failed" ||
                            nextPaymentStatus === "cancelled"
                          ) {
                            setStatus("cancelled");
                          } else if (
                            nextPaymentStatus === "paid" &&
                            status === "ordered"
                          ) {
                            setStatus("payment_confirmed");
                          }
                        }}
                        disabled={
                          saving ||
                          order.status === "cancelled" ||
                          order.status === "refunded" ||
                          order.status === "delivered"
                        }
                      >
                        {paymentOptions.map((option) => (
                          <option
                            key={option.value}
                            value={option.value}
                            disabled={
                              (option.value === "pending" &&
                                status !== "ordered") ||
                              (order.paymentStatus === "paid" &&
                                (option.value === "pending" ||
                                  option.value === "failed")) ||
                              ((order.paymentStatus === "failed" ||
                                order.paymentStatus === "cancelled") &&
                                option.value !== order.paymentStatus)
                            }
                          >
                            {option.label}
                          </option>
                        ))}
                      </AdminSelect>
                    </label>
                    <label
                      className={dialogStyles.field}
                    >
                      <span className={dialogStyles.label}>택배사</span>
                      <AdminInput
                        value={shippingCarrier}
                        maxLength={80}
                        onChange={(event) =>
                          setShippingCarrier(event.currentTarget.value)
                        }
                        placeholder="예: CJ대한통운"
                        disabled={saving}
                      />
                    </label>
                    <label className={dialogStyles.field}>
                      <span className={dialogStyles.label}>송장번호</span>
                      <AdminInput
                        value={trackingNumber}
                        maxLength={100}
                        onChange={(event) =>
                          setTrackingNumber(event.currentTarget.value)
                        }
                        placeholder="택배사에서 발급한 송장번호"
                        disabled={saving}
                      />
                    </label>
                    <label className={dialogStyles.field}>
                      <span className={dialogStyles.label}>결제취소·환불금액</span>
                      <AdminInput
                        type="number"
                        min={0}
                        max={order.total}
                        step={1}
                        value={refundAmount}
                        onChange={(event) =>
                          setRefundAmount(event.currentTarget.value)
                        }
                        disabled={saving}
                      />
                    </label>
                    <label
                      className={`${dialogStyles.field} ${dialogStyles.fieldFull}`}
                    >
                      <span className={dialogStyles.label}>상점메모</span>
                      <AdminTextarea
                        value={adminMemo}
                        maxLength={5000}
                        rows={5}
                        onChange={(event) =>
                          setAdminMemo(event.currentTarget.value)
                        }
                        placeholder="입금·배송·반품 등 주문 운영 메모"
                        disabled={saving}
                      />
                    </label>
                  </div>
                  <p className={dialogStyles.help}>
                    {order.status === "cancelled" ||
                    order.status === "refunded"
                      ? "종료 처리된 주문은 재고와 포인트가 이미 조정되어 상태를 되돌릴 수 없습니다. "
                      : order.status === "delivered"
                        ? "반품과 실제 환불을 마친 뒤 반품·환불완료를 선택하면 재고·사용 포인트를 복원하고 적립 포인트를 회수합니다. "
                      : ""}
                    배송완료 처리는 결제완료 상태에서만 가능합니다. 결제 상태는
                    운영 기록만 변경하며 실제 결제 취소나 환불은 결제사에서 별도로
                    처리해야 합니다.
                  </p>
                </section>
              </form>
            ) : null}
          </>
        )}
      </OperationDialog>
      <ToastRegion toasts={toasts} onDismiss={dismissToast} />
    </>
  );
}

interface LegacyOrderTableProps {
  orders: AdminOrderListRow[];
  result: AdminOrderListResult;
  selectedOrderIds: ReadonlySet<string>;
  previewOrderId: string | null;
  previewOrders: Readonly<Record<string, AdminOrderDetail>>;
  previewLoadingId: string | null;
  loading: boolean;
  page: number;
  totalPages: number;
  preparingMode: boolean;
  shippingDrafts: Readonly<
    Record<string, { carrier: string; trackingNumber: string }>
  >;
  onToggleOrder: (id: string, checked: boolean) => void;
  onToggleAll: (checked: boolean) => void;
  onTogglePreview: (record: AdminOrderListRow) => void;
  onViewOrder: (order: AdminOrderListRow) => void;
  onSearchFor: (field: AdminOrderSearchField, query: string) => void;
  onSort: (sortBy: AdminOrderListSort) => void;
  onPageChange: (page: number) => void;
  onShippingDraftChange: (
    id: string,
    field: "carrier" | "trackingNumber",
    value: string,
  ) => void;
}

function LegacyOrderTable({
  orders,
  result,
  selectedOrderIds,
  previewOrderId,
  previewOrders,
  previewLoadingId,
  loading,
  page,
  totalPages,
  preparingMode,
  shippingDrafts,
  onToggleOrder,
  onToggleAll,
  onTogglePreview,
  onViewOrder,
  onSearchFor,
  onSort,
  onPageChange,
  onShippingDraftChange,
}: LegacyOrderTableProps) {
  const allSelected =
    orders.length > 0 &&
    orders.every((order) => selectedOrderIds.has(order.id));
  const pages = paginationPages(page, totalPages);
  return (
    <>
      <div
        className="tbl_head01 tbl_wrap legacy-order-table-wrap"
        aria-busy={loading}
      >
        <table id="sodr_list" className="legacy-order-table">
          <caption>주문 내역 목록</caption>
          <colgroup>
            <col className="legacy-order-col-check" />
            <col className="legacy-order-col-order-half" />
            <col className="legacy-order-col-order-half" />
            <col className="legacy-order-col-buyer" />
            <col className="legacy-order-col-phone" />
            <col className="legacy-order-col-recipient" />
            <col className="legacy-order-col-total" />
            <col className="legacy-order-col-receipt" />
            <col className="legacy-order-col-cancel" />
            <col className="legacy-order-col-coupon" />
            <col className="legacy-order-col-outstanding" />
            <col className="legacy-order-col-view" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col" rowSpan={3}>
                <label className="sound_only" htmlFor="legacy-order-check-all">
                  주문 전체
                </label>
                <input
                  id="legacy-order-check-all"
                  type="checkbox"
                  checked={allSelected}
                  onChange={(event) =>
                    onToggleAll(event.currentTarget.checked)
                  }
                />
              </th>
              <th id="th_ordnum" scope="col" rowSpan={2} colSpan={2}>
                <LegacyOrderSortButton
                  activeSort={result.filters.sortBy}
                  direction={result.filters.sortDirection}
                  sortBy="orderNumber"
                  onSort={onSort}
                >
                  주문번호
                </LegacyOrderSortButton>
              </th>
              <th id="th_odrer" scope="col">
                주문자
              </th>
              <th id="th_odrertel" scope="col">
                주문자전화
              </th>
              <th id="th_recvr" scope="col">
                받는분
              </th>
              <th scope="col" rowSpan={3}>
                <LegacyOrderSortButton
                  activeSort={result.filters.sortBy}
                  direction={result.filters.sortDirection}
                  sortBy="totalAmount"
                  onSort={onSort}
                >
                  주문합계
                  <br />
                  선불배송비포함
                </LegacyOrderSortButton>
              </th>
              <th scope="col" rowSpan={3}>
                <LegacyOrderSortButton
                  activeSort={result.filters.sortBy}
                  direction={result.filters.sortDirection}
                  sortBy="receiptAmount"
                  onSort={onSort}
                >
                  입금합계
                </LegacyOrderSortButton>
              </th>
              <th scope="col" rowSpan={3}>
                <LegacyOrderSortButton
                  activeSort={result.filters.sortBy}
                  direction={result.filters.sortDirection}
                  sortBy="cancelAmount"
                  onSort={onSort}
                >
                  주문취소
                </LegacyOrderSortButton>
              </th>
              <th scope="col" rowSpan={3}>
                <LegacyOrderSortButton
                  activeSort={result.filters.sortBy}
                  direction={result.filters.sortDirection}
                  sortBy="couponAmount"
                  onSort={onSort}
                >
                  쿠폰
                </LegacyOrderSortButton>
              </th>
              <th scope="col" rowSpan={3}>
                <LegacyOrderSortButton
                  activeSort={result.filters.sortBy}
                  direction={result.filters.sortDirection}
                  sortBy="outstandingAmount"
                  onSort={onSort}
                >
                  미수금
                </LegacyOrderSortButton>
              </th>
              <th scope="col" rowSpan={3}>
                보기
              </th>
            </tr>
            <tr>
              <th id="th_odrid" scope="col">
                회원ID
              </th>
              <th id="th_odrcnt" scope="col">
                주문상품수
              </th>
              <th id="th_odrall" scope="col">
                누적주문수
              </th>
            </tr>
            <tr>
              <th id="odrstat" scope="col">
                주문상태
              </th>
              <th id="odrpay" scope="col">
                결제수단
              </th>
              <th id="delino" scope="col">
                운송장번호
              </th>
              <th id="delicom" scope="col">
                배송회사
              </th>
              <th id="delidate" scope="col">
                배송일시
              </th>
            </tr>
          </thead>
          <tbody>
            {orders.length > 0 ? (
              orders.map((order, index) => {
                const background = `bg${index % 2}${
                  order.cancelAmount > 0 ? " bgcancel" : ""
                }`;
                return (
                  <Fragment key={order.id}>
                    <tr className={`orderlist ${background}`}>
                      <td className="td_chk" rowSpan={3}>
                        <label
                          className="sound_only"
                          htmlFor={`legacy-order-check-${index}`}
                        >
                          주문번호 {order.id}
                        </label>
                        <input
                          id={`legacy-order-check-${index}`}
                          type="checkbox"
                          checked={selectedOrderIds.has(order.id)}
                          onChange={(event) =>
                            onToggleOrder(
                              order.id,
                              event.currentTarget.checked,
                            )
                          }
                        />
                      </td>
                      <td
                        className="td_odrnum2 legacy-order-number-cell"
                        headers="th_ordnum"
                        rowSpan={2}
                        colSpan={2}
                      >
                        <button
                          className="orderitem legacy-order-link"
                          type="button"
                          onClick={() => onTogglePreview(order)}
                        >
                          {formatLegacyOrderNumber(order.id)}
                        </button>
                        {previewOrderId === order.id ? (
                          <div id="orderitemlist" role="dialog">
                            <div className="itemlist">
                              {previewLoadingId === order.id ? (
                                <span role="status">
                                  주문상품을 불러오는 중입니다.
                                </span>
                              ) : previewOrders[order.id]?.items.length ? (
                                <ul className="legacy-order-item-list">
                                  {previewOrders[order.id].items.map((item) => (
                                    <li key={item.id}>
                                      <strong>{item.productName}</strong>
                                      <span>
                                        {formatNumber(item.unitPrice)}원 ×{" "}
                                        {formatNumber(item.quantity)}개 ={" "}
                                        {formatNumber(item.lineTotal)}원
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <>
                                  <strong>
                                    {order.itemName || "주문상품"}
                                  </strong>
                                  <span>
                                    {order.itemKinds.toLocaleString("ko-KR")}
                                    건 · 총{" "}
                                    {order.quantity.toLocaleString("ko-KR")}개
                                  </span>
                                </>
                              )}
                              <span>
                                {formatLegacyDateTime(order.createdAt)}
                              </span>
                              <div id="orderitemlist_close">
                                <button
                                  id="orderitemlist-x"
                                  className="btn_frmline"
                                  type="button"
                                  onClick={() => onTogglePreview(order)}
                                >
                                  닫기
                                </button>
                              </div>
                            </div>
                          </div>
                        ) : null}
                      </td>
                      <td className="td_name" headers="th_odrer">
                        <button
                          className="legacy-order-link"
                          type="button"
                          onClick={() => onSearchFor("buyer", order.buyer)}
                        >
                          {order.buyer}
                        </button>
                      </td>
                      <td className="td_tel" headers="th_odrertel">
                        {order.buyerPhone || "-"}
                      </td>
                      <td className="td_name" headers="th_recvr">
                        <button
                          className="legacy-order-link"
                          type="button"
                          onClick={() =>
                            onSearchFor("recipient", order.recipient)
                          }
                        >
                          {order.recipient}
                        </button>
                      </td>
                      <td className="td_num td_numsum" rowSpan={3}>
                        {formatNumber(order.total)}
                      </td>
                      <td className="td_num_right" rowSpan={3}>
                        {formatNumber(order.receiptAmount)}
                      </td>
                      <td
                        className={`td_num td_numcancel${
                          order.cancelAmount > 0 ? "1" : "0"
                        }`}
                        rowSpan={3}
                      >
                        {formatNumber(order.cancelAmount)}
                      </td>
                      <td className="td_num_right" rowSpan={3}>
                        {formatNumber(order.couponAmount)}
                      </td>
                      <td className="td_num_right" rowSpan={3}>
                        {formatNumber(order.outstandingAmount)}
                      </td>
                      <td className="td_mng td_mng_s" rowSpan={3}>
                        <button
                          className="mng_mod btn btn_02"
                          type="button"
                          onClick={() => onViewOrder(order)}
                        >
                          보기
                        </button>
                      </td>
                    </tr>
                    <tr className={background}>
                      <td headers="th_odrid">
                        {order.memberId ? (
                          <button
                            className="legacy-order-link"
                            type="button"
                            onClick={() =>
                              onSearchFor("memberId", order.memberId)
                            }
                          >
                            {order.memberId}
                          </button>
                        ) : (
                          "비회원"
                        )}
                      </td>
                      <td headers="th_odrcnt">
                        {formatNumber(order.itemKinds)}건
                      </td>
                      <td headers="th_odrall">
                        {formatNumber(order.cumulativeOrders)}건
                      </td>
                    </tr>
                    <tr className={background}>
                      <td className="odrstat" headers="odrstat">
                        {legacyOrderStatusLabel(order)}
                      </td>
                      <td className="odrpay" headers="odrpay">
                        {paymentMethodLabel(order.paymentMethod)}
                        {order.pointsUsed > 0 ? (
                          <>
                            <br />
                            포인트
                          </>
                        ) : null}
                      </td>
                      <td className="delino" headers="delino">
                        {preparingMode ? (
                          <input
                            className="frm_input legacy-order-shipping-input"
                            type="text"
                            aria-label={`${order.id} 운송장번호`}
                            value={
                              shippingDrafts[order.id]?.trackingNumber ??
                              order.trackingNumber
                            }
                            onChange={(event) =>
                              onShippingDraftChange(
                                order.id,
                                "trackingNumber",
                                event.currentTarget.value,
                              )
                            }
                          />
                        ) : (
                          order.trackingNumber || "-"
                        )}
                      </td>
                      <td headers="delicom">
                        {preparingMode ? (
                          <input
                            className="frm_input legacy-order-shipping-input"
                            type="text"
                            aria-label={`${order.id} 배송회사`}
                            value={
                              shippingDrafts[order.id]?.carrier ??
                              order.shippingCarrier
                            }
                            onChange={(event) =>
                              onShippingDraftChange(
                                order.id,
                                "carrier",
                                event.currentTarget.value,
                              )
                            }
                          />
                        ) : (
                          order.shippingCarrier || "-"
                        )}
                      </td>
                      <td headers="delidate">
                        {preparingMode ? (
                          <input
                            className="frm_input legacy-order-shipping-date"
                            type="text"
                            aria-label={`${order.id} 배송일시`}
                            readOnly
                            value={formatLegacyDateTime(
                              order.shippingAt || new Date().toISOString(),
                            )}
                          />
                        ) : (
                          formatLegacyDateTime(order.shippingAt)
                        )}
                      </td>
                    </tr>
                  </Fragment>
                );
              })
            ) : (
              <tr>
                <td className="empty_table" colSpan={12}>
                  자료가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="orderlist">
              <th scope="row" colSpan={3}>
                &nbsp;
              </th>
              <td>&nbsp;</td>
              <td>{formatNumber(result.pageTotals.itemKinds)}건</td>
              <th scope="row">합 계</th>
              <td>{formatNumber(result.pageTotals.orderAmount)}</td>
              <td>{formatNumber(result.pageTotals.receiptAmount)}</td>
              <td>{formatNumber(result.pageTotals.cancelAmount)}</td>
              <td>{formatNumber(result.pageTotals.couponAmount)}</td>
              <td>{formatNumber(result.pageTotals.outstandingAmount)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
        {loading ? (
          <span className="legacy-order-loading" role="status">
            주문 목록을 불러오는 중입니다.
          </span>
        ) : null}
      </div>
      {result.total > 0 ? (
        <nav
          className="pg_wrap legacy-order-pagination"
          aria-label="주문 목록 페이지"
        >
          <span className="pg">
            {page > 1 ? (
              <>
                <button
                  className="pg_page pg_start"
                  type="button"
                  onClick={() => onPageChange(1)}
                >
                  처음
                </button>
                <button
                  className="pg_page pg_prev"
                  type="button"
                  onClick={() => onPageChange(page - 1)}
                >
                  이전
                </button>
              </>
            ) : null}
            {pages.map((pageNumber) =>
              pageNumber === page ? (
                <span
                  className="pg_current"
                  aria-current="page"
                  key={pageNumber}
                >
                  <span className="sound_only">열린</span>
                  {pageNumber}
                </span>
              ) : (
                <button
                  className="pg_page"
                  type="button"
                  key={pageNumber}
                  onClick={() => onPageChange(pageNumber)}
                >
                  {pageNumber}
                  <span className="sound_only">페이지</span>
                </button>
              ),
            )}
            {page < totalPages ? (
              <>
                <button
                  className="pg_page pg_next"
                  type="button"
                  onClick={() => onPageChange(page + 1)}
                >
                  다음
                </button>
                <button
                  className="pg_page pg_end"
                  type="button"
                  onClick={() => onPageChange(totalPages)}
                >
                  맨끝
                </button>
              </>
            ) : null}
          </span>
        </nav>
      ) : null}
    </>
  );
}

function LegacyOrderSortButton({
  activeSort,
  direction,
  sortBy,
  onSort,
  children,
}: {
  activeSort: AdminOrderListSort;
  direction: "asc" | "desc";
  sortBy: AdminOrderListSort;
  onSort: (sortBy: AdminOrderListSort) => void;
  children: ReactNode;
}) {
  const active = activeSort === sortBy;
  return (
    <button
      className={`legacy-order-sort${active ? " is-active" : ""}`}
      type="button"
      aria-label={`${typeof children === "string" ? children : "금액"} ${
        active && direction === "desc" ? "오름차순" : "내림차순"
      } 정렬`}
      onClick={() => onSort(sortBy)}
    >
      {children}
      {active ? (
        <span aria-hidden="true">{direction === "asc" ? "▲" : "▼"}</span>
      ) : null}
    </button>
  );
}

function paginationPages(page: number, totalPages: number): number[] {
  const start = Math.floor((Math.max(1, page) - 1) / 10) * 10 + 1;
  const end = Math.min(totalPages, start + 9);
  return Array.from({ length: Math.max(0, end - start + 1) }, (_, index) =>
    start + index,
  );
}

function formatLegacyOrderNumber(value: string): string {
  if (value.length === 16) return `${value.slice(0, 8)}-${value.slice(8)}`;
  if (value.length > 6) return `${value.slice(0, 6)}-${value.slice(6)}`;
  return value;
}

function formatLegacyDateTime(value: string): string {
  if (!value) return "-";
  return value.replace("T", " ").slice(2, 16);
}

function formatNumber(value: number): string {
  return Math.trunc(Number(value) || 0).toLocaleString("ko-KR");
}

function legacyBulkTransition(
  status: AdminOrderListFilters["status"],
): {
  status: AdminOrderStatus;
  currentLabel: string;
  label: string;
} | null {
  if (status === "ordered") {
    return {
      status: "payment_confirmed",
      currentLabel: "주문",
      label: "입금",
    };
  }
  if (status === "payment_confirmed") {
    return {
      status: "preparing",
      currentLabel: "입금",
      label: "준비",
    };
  }
  if (status === "preparing") {
    return {
      status: "shipped",
      currentLabel: "준비",
      label: "배송",
    };
  }
  if (status === "shipped") {
    return {
      status: "delivered",
      currentLabel: "배송",
      label: "완료",
    };
  }
  return null;
}

function legacyOrderStatusLabel(order: AdminOrderListRow): string {
  if (order.status === "ordered") return "주문";
  if (order.status === "payment_confirmed") return "입금";
  if (order.status === "preparing") return "준비";
  if (order.status === "shipped") return "배송";
  if (order.status === "delivered") return "완료";
  if (order.status === "refunded" && order.cancelAmount < order.total) {
    return "부분취소";
  }
  if (order.status === "cancelled" || order.status === "refunded") {
    return "전체취소";
  }
  return orderStatusLabel(order.status);
}

function orderStatusLabel(status: string): string {
  return (
    statusOptions.find((option) => option.value === status)?.label ?? status
  );
}

async function readOrderListResponse(
  response: Response,
): Promise<OrderListApiResponse> {
  try {
    return (await response.json()) as OrderListApiResponse;
  } catch {
    return {};
  }
}

async function readOrderResponse(response: Response): Promise<OrderApiResponse> {
  try {
    return (await response.json()) as OrderApiResponse;
  } catch {
    return {};
  }
}

function firstApiError(result: OrderApiResponse): string | undefined {
  return result.message ?? Object.values(result.fieldErrors ?? {})[0];
}

function redirectToAdminLogin(): void {
  const next = `${window.location.pathname}${window.location.search}`;
  window.location.assign(`/adm/login?next=${encodeURIComponent(next)}`);
}
