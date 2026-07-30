export type ConfigurablePaymentMethod =
  | "bank"
  | "card"
  | "transfer"
  | "virtual"
  | "mobile";

export interface ShopOperationSettings {
  paymentBankEnabled: boolean;
  paymentCardEnabled: boolean;
  paymentTransferEnabled: boolean;
  paymentVirtualEnabled: boolean;
  paymentMobileEnabled: boolean;
  pointUseEnabled: boolean;
  pointUseMinimum: number;
  pointUseMaximum: number;
  pointUseUnit: number;
  defaultShippingFee: number;
}

export const DEFAULT_POINT_USE_MINIMUM = 1_000;
export const DEFAULT_POINT_USE_MAXIMUM = 100_000_000;
export const DEFAULT_POINT_USE_UNIT = 100;

export const defaultShopOperationSettings: ShopOperationSettings = {
  paymentBankEnabled: true,
  paymentCardEnabled: false,
  paymentTransferEnabled: false,
  paymentVirtualEnabled: false,
  paymentMobileEnabled: false,
  pointUseEnabled: true,
  pointUseMinimum: DEFAULT_POINT_USE_MINIMUM,
  pointUseMaximum: DEFAULT_POINT_USE_MAXIMUM,
  pointUseUnit: DEFAULT_POINT_USE_UNIT,
  defaultShippingFee: 0,
};

export function enabledPaymentMethods(
  settings: ShopOperationSettings,
): ConfigurablePaymentMethod[] {
  const methods: ConfigurablePaymentMethod[] = [];
  if (settings.paymentBankEnabled) methods.push("bank");
  // Card, real-time transfer, virtual-account, and mobile payments must stay
  // fail-closed until a verified PG authorization/capture adapter is wired.
  // Persisted legacy flags are intentionally ignored so an old setting cannot
  // create an unpaid order while appearing to have completed a PG payment.
  return methods;
}

export type PointUseFailure =
  | "disabled"
  | "authentication"
  | "minimum"
  | "maximum"
  | "unit"
  | "order-total"
  | "balance";

export interface PointUseValidation {
  ok: boolean;
  failure?: PointUseFailure;
}

export function pointUseFailureMessage(
  failure: PointUseFailure,
  settings: ShopOperationSettings,
): string {
  switch (failure) {
    case "disabled":
      return "현재 포인트 결제를 사용할 수 없습니다.";
    case "authentication":
      return "포인트는 로그인한 회원만 사용할 수 있습니다.";
    case "minimum":
      return `포인트는 ${settings.pointUseMinimum.toLocaleString("ko-KR")}P 이상부터 사용할 수 있습니다.`;
    case "maximum":
      return `한 주문에는 최대 ${settings.pointUseMaximum.toLocaleString("ko-KR")}P까지 사용할 수 있습니다.`;
    case "unit":
      return `포인트는 ${settings.pointUseUnit.toLocaleString("ko-KR")}P 단위로 사용해 주세요.`;
    case "order-total":
      return "사용 포인트는 주문금액을 초과할 수 없습니다.";
    case "balance":
      return "보유 포인트가 변경되었습니다. 사용 포인트를 다시 확인해 주세요.";
  }
}

export function validatePointUse(params: {
  pointsUsed: number;
  orderTotal: number;
  availablePoints: number;
  authenticated: boolean;
  settings: ShopOperationSettings;
}): PointUseValidation {
  const {
    pointsUsed,
    orderTotal,
    availablePoints,
    authenticated,
    settings,
  } = params;
  if (pointsUsed === 0) return { ok: true };
  if (!settings.pointUseEnabled) return { ok: false, failure: "disabled" };
  if (!authenticated) return { ok: false, failure: "authentication" };
  if (pointsUsed < settings.pointUseMinimum) {
    return { ok: false, failure: "minimum" };
  }
  if (pointsUsed > settings.pointUseMaximum) {
    return { ok: false, failure: "maximum" };
  }
  if (pointsUsed % settings.pointUseUnit !== 0) {
    return { ok: false, failure: "unit" };
  }
  if (pointsUsed > orderTotal) {
    return { ok: false, failure: "order-total" };
  }
  if (pointsUsed > availablePoints) {
    return { ok: false, failure: "balance" };
  }
  return { ok: true };
}

export function maximumSelectablePoints(params: {
  orderTotal: number;
  availablePoints: number;
  settings: ShopOperationSettings;
}): number {
  const { orderTotal, availablePoints, settings } = params;
  if (!settings.pointUseEnabled || settings.pointUseUnit < 1) return 0;
  const rawMaximum = Math.min(
    Math.max(0, Math.trunc(orderTotal)),
    Math.max(0, Math.trunc(availablePoints)),
    settings.pointUseMaximum,
  );
  return rawMaximum - (rawMaximum % settings.pointUseUnit);
}
