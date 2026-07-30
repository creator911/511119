const orderStatusLabels: Record<string, string> = {
  ordered: "주문접수",
  payment_confirmed: "입금확인",
  preparing: "상품준비중",
  shipped: "배송중",
  delivered: "배송완료",
  cancelled: "주문취소",
  refunded: "반품·환불완료",
};

const paymentStatusLabels: Record<string, string> = {
  pending: "입금확인중",
  paid: "결제완료",
  failed: "결제실패",
  cancelled: "결제취소",
};

export function publicOrderStatusLabel(status: string): string {
  return orderStatusLabels[status] ?? "처리중";
}

export function publicPaymentStatusLabel(status: string): string {
  return paymentStatusLabels[status] ?? "확인중";
}
