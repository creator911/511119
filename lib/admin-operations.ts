import { AdminApiError } from "@/lib/admin-api";
import { commerceDb, ensureCommerceSchema } from "@/lib/commerce-db";
import { MAX_POINTS } from "@/lib/commerce-limits";
import { hashCustomerPassword } from "@/lib/customer-auth";
import {
  ensureAdminProductSchema,
  getEffectiveProducts,
} from "@/lib/admin-products";

export const ADMIN_ORDER_STATUSES = [
  "ordered",
  "payment_confirmed",
  "preparing",
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
] as const;

export const ADMIN_PAYMENT_STATUSES = [
  "pending",
  "paid",
  "failed",
  "cancelled",
] as const;

export type AdminOrderStatus = (typeof ADMIN_ORDER_STATUSES)[number];
export type AdminPaymentStatus = (typeof ADMIN_PAYMENT_STATUSES)[number];

const ORDER_PROGRESS = new Map<AdminOrderStatus, number>([
  ["ordered", 0],
  ["payment_confirmed", 1],
  ["preparing", 2],
  ["shipped", 3],
  ["delivered", 4],
]);

export interface AdminOrderDetail {
  id: string;
  userId: string | null;
  memberLoginId: string | null;
  createdAt: string;
  updatedAt: string;
  orderer: {
    name: string;
    phone: string;
    email: string;
    postcode: string;
    address1: string;
    address2: string;
  };
  recipient: {
    name: string;
    phone: string;
    postcode: string;
    address1: string;
    address2: string;
    memo: string;
  };
  subtotal: number;
  shippingFee: number;
  discount: number;
  earnedPoints: number;
  reversedPoints: number;
  total: number;
  paymentMethod: string;
  payment: {
    bankCode: string;
    depositor: string;
    cashReceiptNumber: string;
  };
  paymentStatus: AdminPaymentStatus;
  status: AdminOrderStatus;
  shippingCarrier: string;
  trackingNumber: string;
  refundAmount: number;
  adminMemo: string;
  items: Array<{
    id: number;
    productId: string;
    productName: string;
    productImage: string;
    unitPrice: number;
    quantity: number;
    lineTotal: number;
  }>;
}

export interface AdminMemberDetail {
  id: string;
  joinedAt: string;
  updatedAt: string;
  loginId: string;
  name: string;
  nickname: string;
  email: string;
  phone: string;
  telephone: string;
  homepage: string;
  postcode: string;
  address1: string;
  address2: string;
  address3: string;
  adminMemo: string;
  identityMethod: "none" | "phone" | "ipin";
  identityVerified: boolean;
  emailVerified: boolean;
  adultVerified: boolean;
  publicProfile: boolean;
  signature: string;
  profile: string;
  verificationHistory: string;
  withdrawnAt: string | null;
  blockedAt: string | null;
  memberIcon: string;
  memberImage: string;
  extra1: string;
  extra2: string;
  extra3: string;
  extra4: string;
  extra5: string;
  extra6: string;
  extra7: string;
  extra8: string;
  extra9: string;
  extra10: string;
  points: number;
  level: number;
  active: boolean;
  emailOptIn: boolean;
  smsOptIn: boolean;
  lastLoginAt: string | null;
  orderCount: number;
  lifetimeValue: number;
}

interface AdminOrderRow {
  id: string;
  user_id: string | null;
  member_login_id: string | null;
  email: string;
  orderer_name: string;
  orderer_phone: string;
  orderer_postcode: string;
  orderer_address1: string;
  orderer_address2: string;
  recipient_name: string;
  recipient_phone: string;
  postcode: string;
  address1: string;
  address2: string;
  memo: string;
  subtotal: number;
  shipping_fee: number;
  discount: number;
  points_earned: number | null;
  points_reversed: number | null;
  total: number;
  payment_method: string;
  bank_code: string | null;
  depositor: string | null;
  cash_receipt_number: string | null;
  payment_status: string;
  status: string;
  shipping_carrier: string;
  tracking_number: string;
  refund_amount: number;
  admin_memo: string;
  created_at: string;
  updated_at: string;
}

interface AdminMemberRow {
  id: string;
  login_id: string;
  email: string;
  name: string;
  nickname: string;
  phone: string;
  telephone: string;
  homepage: string;
  postcode: string;
  address1: string;
  address2: string;
  address3: string;
  admin_memo: string;
  identity_method: string;
  identity_verified: number;
  email_verified: number;
  adult_verified: number;
  public_profile: number;
  member_signature: string;
  member_profile: string;
  verification_history: string;
  withdrawn_at: string;
  blocked_at: string;
  member_icon: string;
  member_image: string;
  extra1: string;
  extra2: string;
  extra3: string;
  extra4: string;
  extra5: string;
  extra6: string;
  extra7: string;
  extra8: string;
  extra9: string;
  extra10: string;
  points: number;
  level: number;
  active: number;
  email_opt_in: number;
  sms_opt_in: number;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
  order_count: number;
  lifetime_value: number;
}

const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const trackingNumberPattern = /^[0-9A-Za-z가-힣._ /-]*$/u;
const shippingCarrierPattern = /^[0-9A-Za-z가-힣._ ()/-]*$/u;
const memberLoginIdPattern = /^[A-Za-z0-9_-]{4,30}$/u;
const memberEmailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const memberPhonePattern = /^[0-9+() .-]*$/u;
let operationSchemaInitialization: Promise<void> | null = null;

export async function ensureAdminOperationsSchema(): Promise<void> {
  await ensureCommerceSchema();
  if (!operationSchemaInitialization) {
    const database = commerceDb();
    operationSchemaInitialization = database
      .batch([
        database.prepare(`CREATE TABLE IF NOT EXISTS admin_audit_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          admin_id INTEGER,
          action TEXT NOT NULL,
          entity_type TEXT NOT NULL,
          entity_id TEXT NOT NULL DEFAULT '',
          details TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        database.prepare(
          "CREATE INDEX IF NOT EXISTS admin_audit_created_idx ON admin_audit_logs(created_at)",
        ),
        database.prepare(`CREATE TABLE IF NOT EXISTS order_inventory_adjustments (
          order_id TEXT NOT NULL,
          adjustment_type TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (order_id, adjustment_type)
        )`),
      ])
      .then(() => ensureAdminMemberColumns(database))
      .catch((error) => {
        operationSchemaInitialization = null;
        throw error;
      });
  }
  await operationSchemaInitialization;
}

export async function getAdminOrderDetail(
  id: string,
): Promise<AdminOrderDetail | null> {
  assertIdentifier(id, "주문번호");
  await ensureAdminOperationsSchema();
  return readAdminOrderDetail(commerceDb(), id);
}

export async function updateAdminOrder(
  id: string,
  input: unknown,
  adminUsername: string,
): Promise<AdminOrderDetail> {
  assertIdentifier(id, "주문번호");
  const body = asObject(input);
  await ensureAdminOperationsSchema();
  const database = commerceDb();
  const current = await readAdminOrderDetail(database, id);
  if (!current) {
    throw new AdminApiError(404, "주문을 찾을 수 없습니다.");
  }

  const errors: Record<string, string> = {};
  let supplied = false;
  let status = current.status;
  let paymentStatus = current.paymentStatus;
  let shippingCarrier = current.shippingCarrier;
  let trackingNumber = current.trackingNumber;
  let refundAmount = current.refundAmount;
  let adminMemo = current.adminMemo;

  if (hasOwn(body, "status")) {
    supplied = true;
    if (
      typeof body.status !== "string" ||
      !isAdminOrderStatus(body.status)
    ) {
      errors.status = "주문 상태를 다시 선택해 주세요.";
    } else {
      status = body.status;
    }
  }

  if (hasOwn(body, "paymentStatus")) {
    supplied = true;
    if (
      typeof body.paymentStatus !== "string" ||
      !isAdminPaymentStatus(body.paymentStatus)
    ) {
      errors.paymentStatus = "결제 상태를 다시 선택해 주세요.";
    } else {
      paymentStatus = body.paymentStatus;
    }
  }

  if (hasOwn(body, "trackingNumber")) {
    supplied = true;
    if (typeof body.trackingNumber !== "string") {
      errors.trackingNumber = "송장번호를 문자열로 입력해 주세요.";
    } else {
      const nextTrackingNumber = body.trackingNumber.trim();
      if (
        nextTrackingNumber.length > 100 ||
        !trackingNumberPattern.test(nextTrackingNumber)
      ) {
        errors.trackingNumber =
          "송장번호는 100자 이하의 한글·영문·숫자와 일부 기호만 입력해 주세요.";
      } else {
        trackingNumber = nextTrackingNumber;
      }
    }
  }

  if (hasOwn(body, "shippingCarrier")) {
    supplied = true;
    if (typeof body.shippingCarrier !== "string") {
      errors.shippingCarrier = "택배사명을 문자열로 입력해 주세요.";
    } else {
      const nextShippingCarrier = body.shippingCarrier.trim();
      if (
        nextShippingCarrier.length > 80 ||
        !shippingCarrierPattern.test(nextShippingCarrier)
      ) {
        errors.shippingCarrier =
          "택배사명은 80자 이하의 한글·영문·숫자와 일부 기호만 입력해 주세요.";
      } else {
        shippingCarrier = nextShippingCarrier;
      }
    }
  }

  if (hasOwn(body, "refundAmount")) {
    supplied = true;
    if (
      typeof body.refundAmount !== "number" ||
      !Number.isSafeInteger(body.refundAmount) ||
      body.refundAmount < 0 ||
      body.refundAmount > current.total
    ) {
      errors.refundAmount =
        `환불금액은 0원 이상 ${current.total.toLocaleString("ko-KR")}원 이하의 정수로 입력해 주세요.`;
    } else {
      refundAmount = body.refundAmount;
    }
  }

  if (hasOwn(body, "adminMemo")) {
    supplied = true;
    if (typeof body.adminMemo !== "string") {
      errors.adminMemo = "상점메모를 문자열로 입력해 주세요.";
    } else {
      const nextAdminMemo = body.adminMemo.replace(/\0/gu, "").trim();
      if (nextAdminMemo.length > 5_000) {
        errors.adminMemo = "상점메모는 5,000자 이하로 입력해 주세요.";
      } else {
        adminMemo = nextAdminMemo;
      }
    }
  }

  if (!supplied) {
    throw new AdminApiError(400, "변경할 주문 정보를 입력해 주세요.");
  }
  if (Object.keys(errors).length > 0) {
    throw new AdminApiError(400, "주문 정보를 확인해 주세요.", errors);
  }
  if (
    (current.status === "cancelled" || current.status === "refunded") &&
    (status !== current.status || paymentStatus !== current.paymentStatus)
  ) {
    throw new AdminApiError(
      409,
      "종료된 주문은 주문 상태나 결제 상태를 변경할 수 없습니다.",
      {
        status: "재고와 포인트가 이미 복원된 주문입니다.",
        paymentStatus: "종료 처리 시점의 결제 상태를 유지해 주세요.",
      },
    );
  }
  if (
    status === "refunded" &&
    current.status !== "delivered" &&
    current.status !== "refunded"
  ) {
    throw new AdminApiError(
      409,
      "반품·환불완료는 배송완료 주문에서만 처리할 수 있습니다.",
      {
        status: "배송완료 전에는 주문취소를 사용해 주세요.",
      },
    );
  }
  if (
    current.status === "delivered" &&
    !(
      (status === "delivered" &&
        paymentStatus === current.paymentStatus) ||
      (status === "refunded" && paymentStatus === "cancelled")
    )
  ) {
    throw new AdminApiError(
      409,
      "배송완료 주문은 반품·환불완료로만 전환할 수 있습니다.",
      {
        status: "반품을 승인한 경우 반품·환불완료를 선택해 주세요.",
        paymentStatus: "환불 완료 후 결제취소 상태로 처리됩니다.",
      },
    );
  }
  const terminalPayment =
    paymentStatus === "failed" || paymentStatus === "cancelled";
  const terminalOrder =
    status === "cancelled" || status === "refunded";
  const paidFulfillment =
    status === "payment_confirmed" ||
    status === "preparing" ||
    status === "shipped" ||
    status === "delivered";
  if (terminalPayment !== terminalOrder) {
    throw new AdminApiError(
      409,
      "주문 상태와 결제 상태의 조합을 확인해 주세요.",
      {
        status:
          "결제실패·결제취소 주문은 주문취소 또는 반품·환불완료 상태로 함께 저장해 주세요.",
        paymentStatus:
          "종료 상태와 결제실패·결제취소 상태는 함께 처리해야 재고와 포인트가 복원됩니다.",
      },
    );
  }
  if (status === "refunded" && paymentStatus !== "cancelled") {
    throw new AdminApiError(
      409,
      "반품·환불완료 주문은 결제취소 상태여야 합니다.",
      {
        paymentStatus: "실제 환불을 마친 뒤 결제취소로 저장해 주세요.",
      },
    );
  }
  if (paymentStatus === "pending" && status !== "ordered") {
    throw new AdminApiError(
      409,
      "입금확인중 주문은 주문접수 상태로만 저장할 수 있습니다.",
      {
        status: "입금확인 후 다음 주문 단계로 진행해 주세요.",
        paymentStatus: "상품 처리 전에 결제완료로 변경해 주세요.",
      },
    );
  }
  if (paidFulfillment && paymentStatus !== "paid") {
    throw new AdminApiError(
      409,
      "상품 처리 단계의 주문은 결제완료 상태여야 합니다.",
      {
        paymentStatus: "결제완료로 변경한 뒤 주문 상태를 진행해 주세요.",
      },
    );
  }
  const currentProgress = ORDER_PROGRESS.get(current.status);
  const nextProgress = ORDER_PROGRESS.get(status);
  if (
    currentProgress !== undefined &&
    nextProgress !== undefined &&
    nextProgress < currentProgress
  ) {
    throw new AdminApiError(
      409,
      "이미 진행된 주문을 이전 단계로 되돌릴 수 없습니다.",
      {
        status:
          "다음 처리 단계로 진행하거나 주문취소를 선택해 주세요.",
      },
    );
  }
  if (
    current.paymentStatus === "paid" &&
    (paymentStatus === "pending" || paymentStatus === "failed")
  ) {
    throw new AdminApiError(
      409,
      "결제완료 주문을 입금확인중 또는 결제실패로 되돌릴 수 없습니다.",
      {
        paymentStatus:
          "환불이 필요한 경우 주문취소와 결제취소를 함께 선택해 주세요.",
      },
    );
  }
  const auditDetails = JSON.stringify({
    adminUsername: adminUsername.slice(0, 128),
    before: {
      status: current.status,
      paymentStatus: current.paymentStatus,
      shippingCarrier: current.shippingCarrier,
      hasTrackingNumber: Boolean(current.trackingNumber),
      refundAmount: current.refundAmount,
      adminMemoLength: current.adminMemo.length,
    },
    after: {
      status,
      paymentStatus,
      shippingCarrier,
      hasTrackingNumber: Boolean(trackingNumber),
      refundAmount,
      adminMemoLength: adminMemo.length,
    },
  });
  const statements: D1PreparedStatement[] = [];
  // The legacy shop records rewards explicitly; never infer a rate from the order total.
  if (
    current.status !== "delivered" &&
    status === "delivered" &&
    current.userId &&
    current.earnedPoints > 0
  ) {
    statements.push(
      database
        .prepare(
          `INSERT OR IGNORE INTO order_inventory_adjustments (
             order_id, adjustment_type
           )
           SELECT opc.order_id, 'points_credit'
           FROM order_point_credits opc
           JOIN orders o ON o.id = opc.order_id
           JOIN users u ON u.id = opc.user_id
           WHERE opc.order_id = ?
             AND opc.user_id = ?
             AND opc.points_earned > 0
             AND o.user_id = opc.user_id
             AND o.status = ?
             AND o.payment_status = ?
             AND o.updated_at = ?`,
        )
        .bind(
          id,
          current.userId,
          current.status,
          current.paymentStatus,
          current.updatedAt,
        ),
      database
        .prepare(
          `UPDATE users
           SET points = CASE
                 WHEN points <= ? - (
                   SELECT points_earned
                   FROM order_point_credits
                   WHERE order_id = ?
                 )
                 THEN points + (
                   SELECT points_earned
                   FROM order_point_credits
                   WHERE order_id = ?
                 )
                 ELSE NULL
               END,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = (
             SELECT user_id
             FROM order_point_credits
             WHERE order_id = ?
           )
             AND changes() = 1`,
        )
        .bind(MAX_POINTS, id, id, id),
    );
  }
  if (
    current.status !== "cancelled" &&
    current.status !== "refunded" &&
    (status === "cancelled" || status === "refunded")
  ) {
    await ensureAdminProductSchema(database);
    const effectiveProducts = await getEffectiveProducts({
      database,
      strict: true,
    });
    const stockByProductId = new Map(
      effectiveProducts.map((product) => [product.id, product.stock]),
    );
    const productIds = new Set(current.items.map((item) => item.productId));
    for (const productId of productIds) {
      statements.push(
        database
          .prepare(
            `INSERT INTO product_stock (product_id, stock)
             VALUES (?, ?)
             ON CONFLICT(product_id) DO NOTHING`,
          )
          .bind(productId, stockByProductId.get(productId) ?? 0),
      );
    }
    statements.push(
      database
        .prepare(
          `INSERT OR IGNORE INTO order_inventory_adjustments (
             order_id, adjustment_type
           )
           SELECT id, 'stock_restore'
           FROM orders
           WHERE id = ? AND status = ? AND payment_status = ?
             AND updated_at = ?`,
        )
        .bind(
          id,
          current.status,
          current.paymentStatus,
          current.updatedAt,
        ),
      database
        .prepare(
          `INSERT INTO product_stock (product_id, stock, updated_at)
           SELECT product_id, SUM(quantity), CURRENT_TIMESTAMP
           FROM order_items
           WHERE order_id = ? AND changes() = 1
           GROUP BY product_id
           ON CONFLICT(product_id) DO UPDATE SET
             stock = product_stock.stock + excluded.stock,
             updated_at = CURRENT_TIMESTAMP`,
        )
        .bind(id),
      database
        .prepare(
          `INSERT OR IGNORE INTO order_inventory_adjustments (
             order_id, adjustment_type
           )
           SELECT id, 'option_stock_restore'
           FROM orders
           WHERE id = ? AND status = ? AND payment_status = ?
             AND updated_at = ?
             AND EXISTS (
               SELECT 1 FROM order_option_items
               WHERE order_id = orders.id
             )`,
        )
        .bind(
          id,
          current.status,
          current.paymentStatus,
          current.updatedAt,
        ),
      database
        .prepare(
          `UPDATE product_options
           SET stock = stock + COALESCE((
                 SELECT quantity
                 FROM order_option_items
                 WHERE order_id = ? AND option_id = product_options.id
               ), 0),
               revision = revision + 1,
               updated_at = CURRENT_TIMESTAMP
           WHERE id IN (
             SELECT option_id FROM order_option_items WHERE order_id = ?
           )
             AND changes() = 1`,
        )
        .bind(id, id),
      database
        .prepare(
          `INSERT OR IGNORE INTO order_inventory_adjustments (
             order_id, adjustment_type
           )
           SELECT opd.order_id, 'points_restore'
           FROM order_point_debits opd
           JOIN orders o ON o.id = opd.order_id
           JOIN users u ON u.id = opd.user_id
           WHERE opd.order_id = ?
             AND o.status = ?
             AND o.payment_status = ?
             AND o.updated_at = ?
             AND u.points <= ? - opd.points_used`,
        )
        .bind(
          id,
          current.status,
          current.paymentStatus,
          current.updatedAt,
          MAX_POINTS,
        ),
      database
        .prepare(
          `UPDATE users
           SET points = points + (
                 SELECT points_used
                 FROM order_point_debits
                 WHERE order_id = ?
               ),
               updated_at = CURRENT_TIMESTAMP
           WHERE id = (
             SELECT user_id
             FROM order_point_debits
             WHERE order_id = ?
           )
              AND changes() = 1`,
        )
        .bind(id, id),
      database
        .prepare(
          `INSERT OR IGNORE INTO order_inventory_adjustments (
             order_id, adjustment_type
           )
           SELECT opd.order_id, 'points_restore_pending'
           FROM order_point_debits opd
           JOIN orders o ON o.id = opd.order_id
           WHERE opd.order_id = ?
             AND o.status = ?
             AND o.payment_status = ?
             AND o.updated_at = ?
             AND NOT EXISTS (
               SELECT 1
               FROM order_inventory_adjustments completed
               WHERE completed.order_id = opd.order_id
                 AND completed.adjustment_type = 'points_restore'
             )`,
        )
        .bind(
          id,
          current.status,
          current.paymentStatus,
          current.updatedAt,
        ),
    );
  }
  if (
    current.status === "delivered" &&
    status === "refunded" &&
    current.userId
  ) {
    statements.push(
      database
        .prepare(
          `INSERT OR IGNORE INTO order_inventory_adjustments (
             order_id, adjustment_type
           )
           SELECT opc.order_id, 'points_reversal'
           FROM order_point_credits opc
           JOIN orders o ON o.id = opc.order_id
           JOIN users u ON u.id = opc.user_id
            WHERE opc.order_id = ?
              AND o.user_id = ?
              AND o.status = ?
              AND o.payment_status = ?
              AND o.updated_at = ?
              AND EXISTS (
                SELECT 1
                FROM order_inventory_adjustments credit
                WHERE credit.order_id = opc.order_id
                  AND credit.adjustment_type = 'points_credit'
              )`,
        )
        .bind(
          id,
          current.userId,
          current.status,
          current.paymentStatus,
          current.updatedAt,
        ),
      database
        .prepare(
          `INSERT INTO order_point_reversals (
             order_id, user_id, points_reversed
           )
           SELECT order_id, user_id, points_earned
           FROM order_point_credits
           WHERE order_id = ? AND changes() = 1`,
        )
        .bind(id),
      database
        .prepare(
          `UPDATE users
           SET points = CASE
                 WHEN points >= (
                   SELECT points_reversed
                   FROM order_point_reversals
                   WHERE order_id = ?
                 )
                 THEN points - (
                   SELECT points_reversed
                   FROM order_point_reversals
                   WHERE order_id = ?
                 )
                 ELSE NULL
               END,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = (
             SELECT user_id
             FROM order_point_reversals
             WHERE order_id = ?
           )
             AND changes() = 1`,
        )
        .bind(id, id, id),
    );
  }
  const updateStatementIndex = statements.length;
  statements.push(
    database
      .prepare(
        `UPDATE orders
         SET status = ?, payment_status = ?, shipping_carrier = ?,
             tracking_number = ?, refund_amount = ?, admin_memo = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status = ? AND payment_status = ?
           AND shipping_carrier = ? AND tracking_number = ?
           AND refund_amount = ? AND admin_memo = ?
           AND updated_at = ?`,
      )
      .bind(
        status,
        paymentStatus,
        shippingCarrier,
        trackingNumber,
        refundAmount,
        adminMemo,
        id,
        current.status,
        current.paymentStatus,
        current.shippingCarrier,
        current.trackingNumber,
        current.refundAmount,
        current.adminMemo,
        current.updatedAt,
      ),
    conditionalAuditStatement(database, {
      action: "order.update",
      entityType: "order",
      entityId: id,
      details: auditDetails,
    }),
  );
  let results: D1Result<unknown>[];
  try {
    results = await database.batch(statements);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "";
    if (
      current.status !== "delivered" &&
      status === "delivered" &&
      current.earnedPoints > 0 &&
      /users\.points|not null/iu.test(message)
    ) {
      throw new AdminApiError(
        409,
        "주문 적립 포인트를 지급할 수 없습니다.",
        {
          status:
            "회원 포인트 상한을 초과합니다. 회원 포인트 잔액과 주문 적립 포인트를 확인한 뒤 다시 처리해 주세요.",
        },
      );
    }
    if (
      current.status === "delivered" &&
      status === "refunded" &&
      /users\.points|not null/iu.test(message)
    ) {
      throw new AdminApiError(
        409,
        "반품 주문의 적립 포인트를 회수할 수 없습니다.",
        {
          status:
            "회원의 현재 포인트가 적립 포인트보다 적습니다. 실제 환불액과 포인트 정산을 확인한 뒤 다시 처리해 주세요.",
        },
      );
    }
    throw cause;
  }
  if (!results[updateStatementIndex]?.meta.changes) {
    throw new AdminApiError(
      409,
      "주문 상태가 다른 작업에서 변경되었습니다. 최신 정보를 다시 불러와 주세요.",
    );
  }

  const updated = await readAdminOrderDetail(database, id);
  if (!updated) {
    throw new AdminApiError(500, "주문 변경사항을 불러오지 못했습니다.");
  }
  return updated;
}

export async function getAdminMemberDetail(
  id: string,
): Promise<AdminMemberDetail | null> {
  assertIdentifier(id, "회원번호");
  await ensureAdminOperationsSchema();
  return readAdminMemberDetail(commerceDb(), id);
}

export async function createAdminMember(
  input: unknown,
  adminUsername: string,
): Promise<AdminMemberDetail> {
  const body = asObject(input);
  const values = parseAdminMemberCreate(body);
  await ensureAdminOperationsSchema();
  const database = commerceDb();
  const duplicate = await database
    .prepare(
      `SELECT id FROM users
       WHERE login_id = ? OR email = ?
       LIMIT 1`,
    )
    .bind(values.loginId, values.email)
    .first<{ id: string }>();
  if (duplicate) {
    throw new AdminApiError(
      409,
      "이미 사용 중인 회원아이디 또는 이메일입니다.",
      { loginId: "회원아이디와 이메일의 중복 여부를 확인해 주세요." },
    );
  }
  const id = crypto.randomUUID();
  const passwordHash = await hashCustomerPassword(values.password);
  const auditDetails = JSON.stringify({
    adminUsername: adminUsername.trim().slice(0, 128),
    loginId: values.loginId,
    email: values.email,
    name: values.name,
    level: values.level,
    points: values.points,
    active: values.active,
    identityMethod: values.identityMethod,
    identityVerified: values.identityVerified,
    emailVerified: values.emailVerified,
    adultVerified: values.adultVerified,
    publicProfile: values.publicProfile,
    withdrawnAt: values.withdrawnAt,
    blockedAt: values.blockedAt,
  });
  const memberInsertColumns = [
    "id",
    "login_id",
    "email",
    "password_hash",
    "name",
    "nickname",
    "phone",
    "telephone",
    "homepage",
    "postcode",
    "address1",
    "address2",
    "address3",
    "admin_memo",
    "identity_method",
    "identity_verified",
    "email_verified",
    "adult_verified",
    "public_profile",
    "member_signature",
    "member_profile",
    "verification_history",
    "withdrawn_at",
    "blocked_at",
    "member_icon",
    "member_image",
    "extra1",
    "extra2",
    "extra3",
    "extra4",
    "extra5",
    "extra6",
    "extra7",
    "extra8",
    "extra9",
    "extra10",
    "points",
    "level",
    "email_opt_in",
    "sms_opt_in",
    "active",
  ] as const;
  const memberInsertValues: Array<string | number> = [
    id,
    values.loginId,
    values.email,
    passwordHash,
    values.name,
    values.nickname,
    values.phone,
    values.telephone,
    values.homepage,
    values.postcode,
    values.address1,
    values.address2,
    values.address3,
    values.adminMemo,
    values.identityMethod,
    values.identityVerified ? 1 : 0,
    values.emailVerified ? 1 : 0,
    values.adultVerified ? 1 : 0,
    values.publicProfile ? 1 : 0,
    values.signature,
    values.profile,
    values.verificationHistory,
    values.withdrawnAt ?? "",
    values.blockedAt ?? "",
    values.memberIcon,
    values.memberImage,
    values.extra1,
    values.extra2,
    values.extra3,
    values.extra4,
    values.extra5,
    values.extra6,
    values.extra7,
    values.extra8,
    values.extra9,
    values.extra10,
    values.points,
    values.level,
    values.emailOptIn ? 1 : 0,
    values.smsOptIn ? 1 : 0,
    values.active ? 1 : 0,
  ];
  try {
    await database.batch([
      database
        .prepare(
          `INSERT INTO users (${memberInsertColumns.join(", ")})
           VALUES (${memberInsertColumns.map(() => "?").join(", ")})`,
        )
        .bind(...memberInsertValues),
      database
        .prepare(
          `INSERT INTO user_session_state (user_id, session_version)
           VALUES (?, 1)`,
        )
        .bind(id),
      auditStatement(database, {
        action: "member.create",
        entityType: "member",
        entityId: id,
        details: auditDetails,
      }),
    ]);
  } catch (error) {
    if (isMemberIdentityConflict(error)) {
      throw new AdminApiError(
        409,
        "이미 사용 중인 회원아이디 또는 이메일입니다.",
        {
          loginId: "회원아이디와 이메일의 중복 여부를 확인해 주세요.",
        },
      );
    }
    throw error;
  }

  const created = await readAdminMemberDetail(database, id);
  if (!created) {
    throw new AdminApiError(500, "등록한 회원 정보를 불러오지 못했습니다.");
  }
  return created;
}

export async function updateAdminMember(
  id: string,
  input: unknown,
  adminUsername: string,
  options: { passwordResetAuthorized?: boolean } = {},
): Promise<AdminMemberDetail> {
  assertIdentifier(id, "회원번호");
  const body = asObject(input);
  await ensureAdminOperationsSchema();
  const database = commerceDb();
  const current = await readAdminMemberDetail(database, id);
  if (!current) {
    throw new AdminApiError(404, "회원을 찾을 수 없습니다.");
  }

  const errors: Record<string, string> = {};
  let supplied = false;
  let loginId = current.loginId;
  let name = current.name;
  let nickname = current.nickname;
  let email = current.email;
  let phone = current.phone;
  let telephone = current.telephone;
  let homepage = current.homepage;
  let postcode = current.postcode;
  let address1 = current.address1;
  let address2 = current.address2;
  let address3 = current.address3;
  let adminMemo = current.adminMemo;
  let identityMethod = current.identityMethod;
  let identityVerified = current.identityVerified;
  let emailVerified = current.emailVerified;
  let adultVerified = current.adultVerified;
  let publicProfile = current.publicProfile;
  let signature = current.signature;
  let profile = current.profile;
  let verificationHistory = current.verificationHistory;
  let withdrawnAt = current.withdrawnAt;
  let blockedAt = current.blockedAt;
  let memberIcon = current.memberIcon;
  let memberImage = current.memberImage;
  const extraKeys = [
    "extra1",
    "extra2",
    "extra3",
    "extra4",
    "extra5",
    "extra6",
    "extra7",
    "extra8",
    "extra9",
    "extra10",
  ] as const;
  const extras = extraKeys.map((key) => current[key]);
  let emailOptIn = current.emailOptIn;
  let smsOptIn = current.smsOptIn;
  let level = current.level;
  let points = current.points;
  let active = current.active;
  const updateLoginId = hasOwn(body, "loginId");
  const updateName = hasOwn(body, "name");
  const updateNickname = hasOwn(body, "nickname");
  const updateEmail = hasOwn(body, "email");
  const updatePhone = hasOwn(body, "phone");
  const updateTelephone = hasOwn(body, "telephone");
  const updateHomepage = hasOwn(body, "homepage");
  const updatePostcode = hasOwn(body, "postcode");
  const updateAddress1 = hasOwn(body, "address1");
  const updateAddress2 = hasOwn(body, "address2");
  const updateAddress3 = hasOwn(body, "address3");
  const updateAdminMemo = hasOwn(body, "adminMemo");
  const updateIdentityMethod = hasOwn(body, "identityMethod");
  const updateIdentityVerified = hasOwn(body, "identityVerified");
  const updateEmailVerified = hasOwn(body, "emailVerified");
  const updateAdultVerified = hasOwn(body, "adultVerified");
  const updatePublicProfile = hasOwn(body, "publicProfile");
  const updateSignature = hasOwn(body, "signature");
  const updateProfile = hasOwn(body, "profile");
  const updateVerificationHistory = hasOwn(body, "verificationHistory");
  const updateWithdrawnAt = hasOwn(body, "withdrawnAt");
  const updateBlockedAt = hasOwn(body, "blockedAt");
  const updateMemberIcon = hasOwn(body, "memberIcon");
  const updateMemberImage = hasOwn(body, "memberImage");
  const updateExtras = extraKeys.map((key) => hasOwn(body, key));
  const updateEmailOptIn = hasOwn(body, "emailOptIn");
  const updateSmsOptIn = hasOwn(body, "smsOptIn");
  const updateLevel = hasOwn(body, "level");
  const updatePoints = hasOwn(body, "points");
  const updateActive = hasOwn(body, "active");
  const updatePassword =
    hasOwn(body, "newPassword") && body.newPassword !== "";
  let expectedPoints: number | null = null;
  const expectedUpdatedAt =
    typeof body.expectedUpdatedAt === "string"
      ? body.expectedUpdatedAt
      : "";

  if (updateLoginId) {
    supplied = true;
    loginId = memberText(body.loginId, 30);
    if (!memberLoginIdPattern.test(loginId)) {
      errors.loginId = "아이디는 영문·숫자 4~30자로 입력해 주세요.";
    }
  }
  if (updateName) {
    supplied = true;
    name = memberText(body.name, 80);
    if (!name) errors.name = "회원 이름을 입력해 주세요.";
  }
  if (updateNickname) {
    supplied = true;
    nickname = memberText(body.nickname, 80);
  }
  if (updateEmail) {
    supplied = true;
    email =
      typeof body.email === "string"
        ? body.email.trim().toLowerCase()
        : "";
    if (!memberEmailPattern.test(email) || email.length > 254) {
      errors.email = "이메일 주소를 확인해 주세요.";
    }
  }
  if (updatePhone) {
    supplied = true;
    phone = memberText(body.phone, 30);
    if (phone && !memberPhonePattern.test(phone)) {
      errors.phone = "휴대전화 번호를 확인해 주세요.";
    }
  }
  if (updateTelephone) {
    supplied = true;
    telephone = memberText(body.telephone, 30);
    if (telephone && !memberPhonePattern.test(telephone)) {
      errors.telephone = "전화번호를 확인해 주세요.";
    }
  }
  if (updateHomepage) {
    supplied = true;
    homepage = memberText(body.homepage, 300);
    if (homepage && !isValidMemberHomepage(homepage)) {
      errors.homepage = "홈페이지는 http 또는 https 주소로 입력해 주세요.";
    }
  }
  if (updatePostcode) {
    supplied = true;
    postcode = memberText(body.postcode, 20);
  }
  if (updateAddress1) {
    supplied = true;
    address1 = memberText(body.address1, 200);
  }
  if (updateAddress2) {
    supplied = true;
    address2 = memberText(body.address2, 200);
  }
  if (updateAddress3) {
    supplied = true;
    address3 = memberText(body.address3, 200);
  }
  if (updateAdminMemo) {
    supplied = true;
    adminMemo = memberText(body.adminMemo, 2_000);
  }
  if (updateIdentityMethod) {
    supplied = true;
    const nextIdentityMethod = normalizeIdentityMethod(body.identityMethod);
    if (!nextIdentityMethod) {
      errors.identityMethod =
        "본인확인 방법은 미인증, 휴대폰 또는 아이핀 중에서 선택해 주세요.";
    } else {
      identityMethod = nextIdentityMethod;
    }
  }
  if (updateIdentityVerified) {
    supplied = true;
    if (typeof body.identityVerified !== "boolean") {
      errors.identityVerified = "본인확인 여부를 선택해 주세요.";
    } else {
      identityVerified = body.identityVerified;
    }
  }
  if (updateEmailVerified) {
    supplied = true;
    if (typeof body.emailVerified !== "boolean") {
      errors.emailVerified = "메일인증 여부를 선택해 주세요.";
    } else {
      emailVerified = body.emailVerified;
    }
  }
  if (updateAdultVerified) {
    supplied = true;
    if (typeof body.adultVerified !== "boolean") {
      errors.adultVerified = "성인인증 여부를 선택해 주세요.";
    } else {
      adultVerified = body.adultVerified;
    }
  }
  if (updatePublicProfile) {
    supplied = true;
    if (typeof body.publicProfile !== "boolean") {
      errors.publicProfile = "정보공개 여부를 선택해 주세요.";
    } else {
      publicProfile = body.publicProfile;
    }
  }
  if (updateSignature) {
    supplied = true;
    signature = memberText(body.signature, 1_000);
  }
  if (updateProfile) {
    supplied = true;
    profile = memberText(body.profile, 5_000);
  }
  if (updateVerificationHistory) {
    supplied = true;
    verificationHistory = memberText(body.verificationHistory, 5_000);
  }
  if (updateWithdrawnAt) {
    supplied = true;
    const nextWithdrawnAt = optionalMemberDate(body.withdrawnAt);
    if (nextWithdrawnAt === undefined) {
      errors.withdrawnAt = "탈퇴일은 YYYY-MM-DD 형식으로 입력해 주세요.";
    } else {
      withdrawnAt = nextWithdrawnAt;
    }
  }
  if (updateBlockedAt) {
    supplied = true;
    const nextBlockedAt = optionalMemberDate(body.blockedAt);
    if (nextBlockedAt === undefined) {
      errors.blockedAt = "접근차단일은 YYYY-MM-DD 형식으로 입력해 주세요.";
    } else {
      blockedAt = nextBlockedAt;
    }
  }
  if (updateMemberIcon) {
    supplied = true;
    const nextMemberIcon = memberAsset(body.memberIcon);
    if (nextMemberIcon === undefined) {
      errors.memberIcon = "회원 아이콘은 로컬 이미지 주소로 입력해 주세요.";
    } else {
      memberIcon = nextMemberIcon;
    }
  }
  if (updateMemberImage) {
    supplied = true;
    const nextMemberImage = memberAsset(body.memberImage);
    if (nextMemberImage === undefined) {
      errors.memberImage = "회원 이미지는 로컬 이미지 주소로 입력해 주세요.";
    } else {
      memberImage = nextMemberImage;
    }
  }
  for (let index = 0; index < extraKeys.length; index += 1) {
    if (!updateExtras[index]) continue;
    supplied = true;
    extras[index] = memberText(body[extraKeys[index]!], 500);
  }
  if (updateEmailOptIn) {
    supplied = true;
    if (typeof body.emailOptIn !== "boolean") {
      errors.emailOptIn = "메일 수신 여부를 선택해 주세요.";
    } else {
      emailOptIn = body.emailOptIn;
    }
  }
  if (updateSmsOptIn) {
    supplied = true;
    if (typeof body.smsOptIn !== "boolean") {
      errors.smsOptIn = "문자 수신 여부를 선택해 주세요.";
    } else {
      smsOptIn = body.smsOptIn;
    }
  }

  if (updateLevel) {
    supplied = true;
    if (
      typeof body.level !== "number" ||
      !Number.isSafeInteger(body.level) ||
      body.level < 1 ||
      body.level > 10
    ) {
      errors.level = "회원 등급은 1부터 10까지의 정수로 입력해 주세요.";
    } else {
      level = body.level;
    }
  }

  if (updatePoints) {
    supplied = true;
    if (
      typeof body.points !== "number" ||
      !Number.isSafeInteger(body.points) ||
      body.points < 0 ||
      body.points > MAX_POINTS
    ) {
      errors.points =
        `포인트는 0부터 ${MAX_POINTS.toLocaleString("ko-KR")}까지의 정수로 입력해 주세요.`;
    } else {
      points = body.points;
    }
    if (
      typeof body.expectedPoints !== "number" ||
      !Number.isSafeInteger(body.expectedPoints) ||
      body.expectedPoints < 0 ||
      body.expectedPoints > MAX_POINTS
    ) {
      errors.expectedPoints =
        "최신 포인트 잔액을 확인한 뒤 다시 저장해 주세요.";
    } else {
      expectedPoints = body.expectedPoints;
    }
  }

  if (updateActive) {
    supplied = true;
    if (typeof body.active !== "boolean") {
      errors.active = "회원 상태를 다시 선택해 주세요.";
    } else {
      active = body.active;
    }
  }

  if (updatePassword) {
    supplied = true;
    if (
      typeof body.newPassword !== "string" ||
      body.newPassword.length < 8 ||
      body.newPassword.length > 128
    ) {
      errors.newPassword =
        "새 비밀번호는 8자 이상 128자 이하로 입력해 주세요.";
    } else if (!options.passwordResetAuthorized) {
      throw new AdminApiError(
        403,
        "회원 비밀번호 변경 전 관리자 재인증이 필요합니다.",
        { adminPassword: "관리자 재인증이 필요합니다." },
      );
    }
  }

  if (!supplied) {
    throw new AdminApiError(400, "변경할 회원 정보를 입력해 주세요.");
  }
  if (!expectedUpdatedAt || expectedUpdatedAt.length > 80) {
    errors.expectedUpdatedAt =
      "최신 회원 정보를 다시 불러온 뒤 저장해 주세요.";
  } else if (expectedUpdatedAt !== current.updatedAt) {
    throw new AdminApiError(
      409,
      "회원 정보가 다른 작업에서 변경되었습니다. 최신 정보를 다시 불러와 주세요.",
    );
  }
  if (Object.keys(errors).length > 0) {
    throw new AdminApiError(400, "회원 정보를 확인해 주세요.", errors);
  }
  if (updateLoginId && loginId !== current.loginId) {
    const duplicate = await database
      .prepare("SELECT id FROM users WHERE login_id = ? AND id <> ? LIMIT 1")
      .bind(loginId, id)
      .first<{ id: string }>();
    if (duplicate) {
      throw new AdminApiError(409, "이미 사용 중인 회원아이디입니다.", {
        loginId: "다른 회원아이디를 입력해 주세요.",
      });
    }
  }
  if (updateEmail && email !== current.email) {
    const duplicate = await database
      .prepare("SELECT id FROM users WHERE email = ? AND id <> ? LIMIT 1")
      .bind(email, id)
      .first<{ id: string }>();
    if (duplicate) {
      throw new AdminApiError(409, "이미 사용 중인 이메일입니다.", {
        email: "다른 이메일을 입력해 주세요.",
      });
    }
  }

  const before: Record<string, string | number | boolean> = {};
  const after: Record<string, string | number | boolean> = {};
  if (updateLoginId) {
    before.loginId = current.loginId;
    after.loginId = loginId;
  }
  if (updateName) {
    before.name = current.name;
    after.name = name;
  }
  if (updateNickname) {
    before.nickname = current.nickname;
    after.nickname = nickname;
  }
  if (updateEmail) {
    before.email = current.email;
    after.email = email;
  }
  if (updatePhone) {
    before.phone = current.phone;
    after.phone = phone;
  }
  if (updateTelephone) {
    before.telephone = current.telephone;
    after.telephone = telephone;
  }
  if (updateHomepage) {
    before.homepage = current.homepage;
    after.homepage = homepage;
  }
  if (updatePostcode) {
    before.postcode = current.postcode;
    after.postcode = postcode;
  }
  if (updateAddress1) {
    before.address1 = current.address1;
    after.address1 = address1;
  }
  if (updateAddress2) {
    before.address2 = current.address2;
    after.address2 = address2;
  }
  if (updateAddress3) {
    before.address3 = current.address3;
    after.address3 = address3;
  }
  if (updateAdminMemo) {
    before.adminMemo = current.adminMemo;
    after.adminMemo = adminMemo;
  }
  if (updateEmailOptIn) {
    before.emailOptIn = current.emailOptIn;
    after.emailOptIn = emailOptIn;
  }
  if (updateSmsOptIn) {
    before.smsOptIn = current.smsOptIn;
    after.smsOptIn = smsOptIn;
  }
  if (updateLevel) {
    before.level = current.level;
    after.level = level;
  }
  if (updatePoints) {
    before.points = current.points;
    after.points = points;
  }
  if (updateActive) {
    before.active = current.active;
    after.active = active;
  }
  const extendedChangedFields = [
    ...(updateIdentityMethod ? ["identityMethod"] : []),
    ...(updateIdentityVerified ? ["identityVerified"] : []),
    ...(updateEmailVerified ? ["emailVerified"] : []),
    ...(updateAdultVerified ? ["adultVerified"] : []),
    ...(updatePublicProfile ? ["publicProfile"] : []),
    ...(updateSignature ? ["signature"] : []),
    ...(updateProfile ? ["profile"] : []),
    ...(updateVerificationHistory ? ["verificationHistory"] : []),
    ...(updateWithdrawnAt ? ["withdrawnAt"] : []),
    ...(updateBlockedAt ? ["blockedAt"] : []),
    ...(updateMemberIcon ? ["memberIcon"] : []),
    ...(updateMemberImage ? ["memberImage"] : []),
    ...extraKeys.filter((_, index) => updateExtras[index]),
  ];
  const auditDetails = JSON.stringify({
    adminUsername: adminUsername.slice(0, 128),
    ...(Object.keys(before).length > 0 ? { before, after } : {}),
    ...(extendedChangedFields.length > 0
      ? { changedFields: extendedChangedFields }
      : {}),
    ...(updatePassword ? { passwordReset: true } : {}),
  });
  const assignments: string[] = [];
  const bindings: Array<string | number> = [];
  if (updateLoginId) {
    assignments.push("login_id = ?");
    bindings.push(loginId);
  }
  if (updateName) {
    assignments.push("name = ?");
    bindings.push(name);
  }
  if (updateNickname) {
    assignments.push("nickname = ?");
    bindings.push(nickname);
  }
  if (updateEmail) {
    assignments.push("email = ?");
    bindings.push(email);
  }
  if (updatePhone) {
    assignments.push("phone = ?");
    bindings.push(phone);
  }
  if (updateTelephone) {
    assignments.push("telephone = ?");
    bindings.push(telephone);
  }
  if (updateHomepage) {
    assignments.push("homepage = ?");
    bindings.push(homepage);
  }
  if (updatePostcode) {
    assignments.push("postcode = ?");
    bindings.push(postcode);
  }
  if (updateAddress1) {
    assignments.push("address1 = ?");
    bindings.push(address1);
  }
  if (updateAddress2) {
    assignments.push("address2 = ?");
    bindings.push(address2);
  }
  if (updateAddress3) {
    assignments.push("address3 = ?");
    bindings.push(address3);
  }
  if (updateAdminMemo) {
    assignments.push("admin_memo = ?");
    bindings.push(adminMemo);
  }
  const extendedAssignments: Array<{
    update: boolean;
    column: string;
    value: string | number;
  }> = [
    {
      update: updateIdentityMethod,
      column: "identity_method",
      value: identityMethod,
    },
    {
      update: updateIdentityVerified,
      column: "identity_verified",
      value: identityVerified ? 1 : 0,
    },
    {
      update: updateEmailVerified,
      column: "email_verified",
      value: emailVerified ? 1 : 0,
    },
    {
      update: updateAdultVerified,
      column: "adult_verified",
      value: adultVerified ? 1 : 0,
    },
    {
      update: updatePublicProfile,
      column: "public_profile",
      value: publicProfile ? 1 : 0,
    },
    {
      update: updateSignature,
      column: "member_signature",
      value: signature,
    },
    {
      update: updateProfile,
      column: "member_profile",
      value: profile,
    },
    {
      update: updateVerificationHistory,
      column: "verification_history",
      value: verificationHistory,
    },
    {
      update: updateWithdrawnAt,
      column: "withdrawn_at",
      value: withdrawnAt ?? "",
    },
    {
      update: updateBlockedAt,
      column: "blocked_at",
      value: blockedAt ?? "",
    },
    {
      update: updateMemberIcon,
      column: "member_icon",
      value: memberIcon,
    },
    {
      update: updateMemberImage,
      column: "member_image",
      value: memberImage,
    },
  ];
  for (let index = 0; index < extraKeys.length; index += 1) {
    extendedAssignments.push({
      update: updateExtras[index] ?? false,
      column: extraKeys[index]!,
      value: extras[index] ?? "",
    });
  }
  for (const assignment of extendedAssignments) {
    if (!assignment.update) continue;
    assignments.push(`${assignment.column} = ?`);
    bindings.push(assignment.value);
  }
  if (updateEmailOptIn) {
    assignments.push("email_opt_in = ?");
    bindings.push(emailOptIn ? 1 : 0);
  }
  if (updateSmsOptIn) {
    assignments.push("sms_opt_in = ?");
    bindings.push(smsOptIn ? 1 : 0);
  }
  if (updateLevel) {
    assignments.push("level = ?");
    bindings.push(level);
  }
  if (updatePoints) {
    assignments.push("points = ?");
    bindings.push(points);
  }
  if (updateActive) {
    assignments.push("active = ?");
    bindings.push(active ? 1 : 0);
  }
  if (updatePassword) {
    assignments.push("password_hash = ?");
    bindings.push(
      await hashCustomerPassword(body.newPassword as string),
    );
  }
  const nextUpdatedAt = new Date().toISOString();
  assignments.push("updated_at = ?");
  bindings.push(nextUpdatedAt);
  bindings.push(id);
  let updateSql = `UPDATE users
                   SET ${assignments.join(", ")}
                   WHERE id = ? AND updated_at = ?`;
  bindings.push(expectedUpdatedAt);
  if (updatePoints) {
    updateSql += " AND points = ?";
    bindings.push(expectedPoints as number);
  }
  let results: D1Result[];
  try {
    results = await database.batch([
      database.prepare(updateSql).bind(...bindings),
      conditionalAuditStatement(database, {
        action: "member.update",
        entityType: "member",
        entityId: id,
        details: auditDetails,
      }),
    ]);
  } catch (error) {
    if (isMemberIdentityConflict(error)) {
      const identityErrors: Record<string, string> = {};
      if (updateLoginId) {
        identityErrors.loginId = "다른 회원아이디를 입력해 주세요.";
      }
      if (updateEmail) {
        identityErrors.email = "다른 이메일을 입력해 주세요.";
      }
      throw new AdminApiError(
        409,
        updateLoginId && updateEmail
          ? "이미 사용 중인 회원아이디 또는 이메일입니다."
          : updateLoginId
            ? "이미 사용 중인 회원아이디입니다."
            : "이미 사용 중인 이메일입니다.",
        identityErrors,
      );
    }
    throw error;
  }
  if (!results[0]?.meta.changes) {
    throw new AdminApiError(
      409,
      updatePoints
        ? "회원 포인트가 다른 주문 처리에서 변경되었습니다. 최신 정보를 다시 불러와 주세요."
        : "회원 정보가 다른 작업에서 변경되었습니다. 최신 정보를 다시 불러와 주세요.",
    );
  }

  const updated = await readAdminMemberDetail(database, id);
  if (!updated) {
    throw new AdminApiError(500, "회원 변경사항을 불러오지 못했습니다.");
  }
  return updated;
}

export async function deactivateAdminMember(
  id: string,
  adminUsername: string,
): Promise<AdminMemberDetail> {
  assertIdentifier(id, "회원번호");
  await ensureAdminOperationsSchema();
  const database = commerceDb();
  const current = await readAdminMemberDetail(database, id);
  if (!current) {
    throw new AdminApiError(404, "회원을 찾을 수 없습니다.");
  }

  if (current.active) {
    await database.batch([
      database
        .prepare(
          `UPDATE users
           SET active = 0, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
        )
        .bind(id),
      auditStatement(database, {
        action: "member.deactivate",
        entityType: "member",
        entityId: id,
        details: JSON.stringify({
          adminUsername: adminUsername.slice(0, 128),
          active: false,
        }),
      }),
    ]);
  }

  const updated = await readAdminMemberDetail(database, id);
  if (!updated) {
    throw new AdminApiError(500, "회원 상태를 불러오지 못했습니다.");
  }
  return updated;
}

async function readAdminOrderDetail(
  database: D1Database,
  id: string,
): Promise<AdminOrderDetail | null> {
  const order = await database
    .prepare(
      `SELECT
         o.id, o.user_id, u.login_id AS member_login_id, o.email,
         o.orderer_name, o.orderer_phone, o.orderer_postcode,
         o.orderer_address1, o.orderer_address2, o.recipient_name,
         o.recipient_phone, o.postcode, o.address1, o.address2, o.memo,
         o.subtotal, o.shipping_fee, o.discount, o.total,
         o.payment_method, opd.bank_code, opd.depositor,
         opd.cash_receipt_number, opc.points_earned, opr.points_reversed,
         o.payment_status,
         o.status, o.shipping_carrier, o.tracking_number,
         o.refund_amount, o.admin_memo, o.created_at, o.updated_at
       FROM orders o
       LEFT JOIN users u ON u.id = o.user_id
       LEFT JOIN order_payment_details opd ON opd.order_id = o.id
       LEFT JOIN order_point_credits opc ON opc.order_id = o.id
       LEFT JOIN order_point_reversals opr ON opr.order_id = o.id
       WHERE o.id = ? LIMIT 1`,
    )
    .bind(id)
    .first<AdminOrderRow>();
  if (!order) return null;

  if (
    !isAdminOrderStatus(order.status) ||
    !isAdminPaymentStatus(order.payment_status)
  ) {
    throw new AdminApiError(
      409,
      "저장된 주문 상태를 관리자 화면에서 처리할 수 없습니다.",
    );
  }

  const itemResult = await database
    .prepare(
      `SELECT id, product_id, product_name, product_image,
              unit_price, quantity, line_total
       FROM order_items WHERE order_id = ? ORDER BY id`,
    )
    .bind(id)
    .all<{
      id: number;
      product_id: string;
      product_name: string;
      product_image: string;
      unit_price: number;
      quantity: number;
      line_total: number;
    }>();

  return {
    id: order.id,
    userId: order.user_id,
    memberLoginId: order.member_login_id,
    createdAt: order.created_at,
    updatedAt: order.updated_at,
    orderer: {
      name: order.orderer_name,
      phone: order.orderer_phone,
      email: order.email,
      postcode: order.orderer_postcode,
      address1: order.orderer_address1,
      address2: order.orderer_address2,
    },
    recipient: {
      name: order.recipient_name,
      phone: order.recipient_phone,
      postcode: order.postcode,
      address1: order.address1,
      address2: order.address2,
      memo: order.memo,
    },
    subtotal: Number(order.subtotal),
    shippingFee: Number(order.shipping_fee),
    discount: Number(order.discount),
    earnedPoints: Number(order.points_earned ?? 0),
    reversedPoints: Number(order.points_reversed ?? 0),
    total: Number(order.total),
    paymentMethod: order.payment_method,
    payment: {
      bankCode: order.bank_code ?? "",
      depositor: order.depositor ?? "",
      cashReceiptNumber: order.cash_receipt_number ?? "",
    },
    paymentStatus: order.payment_status,
    status: order.status,
    shippingCarrier: order.shipping_carrier,
    trackingNumber: order.tracking_number,
    refundAmount: Number(order.refund_amount),
    adminMemo: order.admin_memo,
    items: (itemResult.results ?? []).map((item) => ({
      id: Number(item.id),
      productId: item.product_id,
      productName: item.product_name,
      productImage: item.product_image,
      unitPrice: Number(item.unit_price),
      quantity: Number(item.quantity),
      lineTotal: Number(item.line_total),
    })),
  };
}

async function readAdminMemberDetail(
  database: D1Database,
  id: string,
): Promise<AdminMemberDetail | null> {
  const member = await database
    .prepare(
      `SELECT
         u.id, u.login_id, u.email, u.name, u.nickname, u.phone,
         u.telephone, u.homepage, u.postcode, u.address1, u.address2,
         u.address3, u.admin_memo, u.identity_method, u.identity_verified,
         u.email_verified, u.adult_verified, u.public_profile, u.member_signature,
         u.member_profile, u.verification_history, u.withdrawn_at,
         u.blocked_at, u.member_icon, u.member_image,
         u.extra1, u.extra2, u.extra3, u.extra4, u.extra5,
         u.extra6, u.extra7, u.extra8, u.extra9, u.extra10,
         u.points, u.level, u.active,
         u.email_opt_in, u.sms_opt_in, u.last_login_at,
         u.created_at, u.updated_at,
         COUNT(o.id) AS order_count,
         COALESCE(SUM(o.total), 0) AS lifetime_value
       FROM users u
       LEFT JOIN orders o ON o.user_id = u.id
       WHERE u.id = ?
       GROUP BY u.id
       LIMIT 1`,
    )
    .bind(id)
    .first<AdminMemberRow>();
  if (!member) return null;

  return {
    id: member.id,
    joinedAt: member.created_at,
    updatedAt: member.updated_at,
    loginId: member.login_id,
    name: member.name,
    nickname: member.nickname,
    email: member.email,
    phone: member.phone,
    telephone: member.telephone,
    homepage: member.homepage,
    postcode: member.postcode,
    address1: member.address1,
    address2: member.address2,
    address3: member.address3,
    adminMemo: member.admin_memo,
    identityMethod: normalizeStoredIdentityMethod(member.identity_method),
    identityVerified: Boolean(member.identity_verified),
    emailVerified: Boolean(member.email_verified),
    adultVerified: Boolean(member.adult_verified),
    publicProfile: Boolean(member.public_profile),
    signature: member.member_signature,
    profile: member.member_profile,
    verificationHistory: member.verification_history,
    withdrawnAt: member.withdrawn_at || null,
    blockedAt: member.blocked_at || null,
    memberIcon: member.member_icon,
    memberImage: member.member_image,
    extra1: member.extra1,
    extra2: member.extra2,
    extra3: member.extra3,
    extra4: member.extra4,
    extra5: member.extra5,
    extra6: member.extra6,
    extra7: member.extra7,
    extra8: member.extra8,
    extra9: member.extra9,
    extra10: member.extra10,
    points: Number(member.points),
    level: Number(member.level),
    active: Boolean(member.active),
    emailOptIn: Boolean(member.email_opt_in),
    smsOptIn: Boolean(member.sms_opt_in),
    lastLoginAt: member.last_login_at,
    orderCount: Number(member.order_count),
    lifetimeValue: Number(member.lifetime_value),
  };
}

function parseAdminMemberCreate(
  body: Record<string, unknown>,
): {
  loginId: string;
  password: string;
  name: string;
  nickname: string;
  email: string;
  phone: string;
  telephone: string;
  homepage: string;
  postcode: string;
  address1: string;
  address2: string;
  address3: string;
  adminMemo: string;
  identityMethod: "none" | "phone" | "ipin";
  identityVerified: boolean;
  emailVerified: boolean;
  adultVerified: boolean;
  publicProfile: boolean;
  signature: string;
  profile: string;
  verificationHistory: string;
  withdrawnAt: string | null;
  blockedAt: string | null;
  memberIcon: string;
  memberImage: string;
  extra1: string;
  extra2: string;
  extra3: string;
  extra4: string;
  extra5: string;
  extra6: string;
  extra7: string;
  extra8: string;
  extra9: string;
  extra10: string;
  points: number;
  level: number;
  active: boolean;
  emailOptIn: boolean;
  smsOptIn: boolean;
} {
  const loginId = memberText(body.loginId, 30);
  const password =
    typeof body.password === "string" ? body.password : "";
  const name = memberText(body.name, 80);
  const nickname = memberText(body.nickname, 80);
  const email = memberText(body.email, 254).toLowerCase();
  const phone = memberText(body.phone, 30);
  const telephone = memberText(body.telephone, 30);
  const homepage = memberText(body.homepage, 300);
  const postcode = memberText(body.postcode, 20);
  const address1 = memberText(body.address1, 200);
  const address2 = memberText(body.address2, 200);
  const address3 = memberText(body.address3, 200);
  const adminMemo = memberText(body.adminMemo, 2_000);
  const identityMethod = normalizeIdentityMethod(body.identityMethod);
  const identityVerified =
    body.identityVerified === undefined ? false : body.identityVerified;
  const emailVerified =
    body.emailVerified === undefined ? false : body.emailVerified;
  const adultVerified =
    body.adultVerified === undefined ? false : body.adultVerified;
  const publicProfile =
    body.publicProfile === undefined ? false : body.publicProfile;
  const signature = memberText(body.signature, 1_000);
  const profile = memberText(body.profile, 5_000);
  const verificationHistory = memberText(body.verificationHistory, 5_000);
  const withdrawnAt = optionalMemberDate(body.withdrawnAt);
  const blockedAt = optionalMemberDate(body.blockedAt);
  const memberIcon = memberAsset(body.memberIcon);
  const memberImage = memberAsset(body.memberImage);
  const extras = Array.from({ length: 10 }, (_, index) =>
    memberText(body[`extra${index + 1}`], 500),
  );
  const points = body.points === undefined ? 0 : body.points;
  const level = body.level === undefined ? 1 : body.level;
  const active = body.active === undefined ? true : body.active;
  const emailOptIn =
    body.emailOptIn === undefined ? false : body.emailOptIn;
  const smsOptIn =
    body.smsOptIn === undefined ? false : body.smsOptIn;
  const errors: Record<string, string> = {};
  if (!memberLoginIdPattern.test(loginId)) {
    errors.loginId = "아이디는 영문·숫자 4~30자로 입력해 주세요.";
  }
  if (password.length < 8 || password.length > 128) {
    errors.password = "비밀번호는 8자 이상 128자 이하로 입력해 주세요.";
  }
  if (!name) errors.name = "회원 이름을 입력해 주세요.";
  if (!memberEmailPattern.test(email)) {
    errors.email = "이메일 주소를 확인해 주세요.";
  }
  if (phone && !memberPhonePattern.test(phone)) {
    errors.phone = "휴대전화 번호를 확인해 주세요.";
  }
  if (telephone && !memberPhonePattern.test(telephone)) {
    errors.telephone = "전화번호를 확인해 주세요.";
  }
  if (homepage && !isValidMemberHomepage(homepage)) {
    errors.homepage = "홈페이지는 http 또는 https 주소로 입력해 주세요.";
  }
  if (!identityMethod) {
    errors.identityMethod =
      "본인확인 방법은 미인증, 휴대폰 또는 아이핀 중에서 선택해 주세요.";
  }
  if (typeof identityVerified !== "boolean") {
    errors.identityVerified = "본인확인 여부를 선택해 주세요.";
  }
  if (typeof emailVerified !== "boolean") {
    errors.emailVerified = "메일인증 여부를 선택해 주세요.";
  }
  if (typeof adultVerified !== "boolean") {
    errors.adultVerified = "성인인증 여부를 선택해 주세요.";
  }
  if (typeof publicProfile !== "boolean") {
    errors.publicProfile = "정보공개 여부를 선택해 주세요.";
  }
  if (withdrawnAt === undefined) {
    errors.withdrawnAt = "탈퇴일은 YYYY-MM-DD 형식으로 입력해 주세요.";
  }
  if (blockedAt === undefined) {
    errors.blockedAt = "접근차단일은 YYYY-MM-DD 형식으로 입력해 주세요.";
  }
  if (memberIcon === undefined) {
    errors.memberIcon = "회원 아이콘은 로컬 이미지 주소로 입력해 주세요.";
  }
  if (memberImage === undefined) {
    errors.memberImage = "회원 이미지는 로컬 이미지 주소로 입력해 주세요.";
  }
  if (
    typeof points !== "number" ||
    !Number.isSafeInteger(points) ||
    points < 0 ||
    points > MAX_POINTS
  ) {
    errors.points =
      `포인트는 0부터 ${MAX_POINTS.toLocaleString("ko-KR")}까지의 정수로 입력해 주세요.`;
  }
  if (
    typeof level !== "number" ||
    !Number.isSafeInteger(level) ||
    level < 1 ||
    level > 10
  ) {
    errors.level = "회원 등급은 1부터 10까지의 정수로 입력해 주세요.";
  }
  if (typeof active !== "boolean") {
    errors.active = "회원 상태를 선택해 주세요.";
  }
  if (typeof emailOptIn !== "boolean") {
    errors.emailOptIn = "메일 수신 여부를 선택해 주세요.";
  }
  if (typeof smsOptIn !== "boolean") {
    errors.smsOptIn = "문자 수신 여부를 선택해 주세요.";
  }
  if (Object.keys(errors).length > 0) {
    throw new AdminApiError(400, "회원 등록 정보를 확인해 주세요.", errors);
  }
  return {
    loginId,
    password,
    name,
    nickname,
    email,
    phone,
    telephone,
    homepage,
    postcode,
    address1,
    address2,
    address3,
    adminMemo,
    identityMethod: identityMethod as "none" | "phone" | "ipin",
    identityVerified: identityVerified as boolean,
    emailVerified: emailVerified as boolean,
    adultVerified: adultVerified as boolean,
    publicProfile: publicProfile as boolean,
    signature,
    profile,
    verificationHistory,
    withdrawnAt: withdrawnAt as string | null,
    blockedAt: blockedAt as string | null,
    memberIcon: memberIcon as string,
    memberImage: memberImage as string,
    extra1: extras[0]!,
    extra2: extras[1]!,
    extra3: extras[2]!,
    extra4: extras[3]!,
    extra5: extras[4]!,
    extra6: extras[5]!,
    extra7: extras[6]!,
    extra8: extras[7]!,
    extra9: extras[8]!,
    extra10: extras[9]!,
    points: points as number,
    level: level as number,
    active: active as boolean,
    emailOptIn: emailOptIn as boolean,
    smsOptIn: smsOptIn as boolean,
  };
}

function memberText(value: unknown, maximum: number): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") {
    throw new AdminApiError(400, "회원 입력 형식을 확인해 주세요.");
  }
  const normalized = value.trim();
  if (normalized.length > maximum) {
    throw new AdminApiError(
      400,
      `회원 입력 내용은 ${maximum.toLocaleString("ko-KR")}자 이내여야 합니다.`,
    );
  }
  return normalized;
}

function normalizeIdentityMethod(
  value: unknown,
): "none" | "phone" | "ipin" | null {
  if (value === undefined || value === null || value === "" || value === "none") {
    return "none";
  }
  if (value === "phone" || value === "hp") return "phone";
  if (value === "ipin") return "ipin";
  return null;
}

function normalizeStoredIdentityMethod(
  value: string,
): "none" | "phone" | "ipin" {
  return normalizeIdentityMethod(value) ?? "none";
}

function optionalMemberDate(
  value: unknown,
): string | null | undefined {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(normalized)) return undefined;
  const [year, month, day] = normalized.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day!));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    return undefined;
  }
  return normalized;
}

function memberAsset(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  if (
    normalized.length > 500 ||
    normalized.includes("..") ||
    !/^\/[A-Za-z0-9][A-Za-z0-9._/-]*$/u.test(normalized)
  ) {
    return undefined;
  }
  return normalized;
}

function isValidMemberHomepage(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

function isMemberIdentityConflict(error: unknown): boolean {
  return (
    error instanceof Error &&
    /UNIQUE constraint failed:\s*users\.(?:login_id|email)|users_(?:login_id|email)_uq/iu.test(
      error.message,
    )
  );
}

async function ensureAdminMemberColumns(
  database: D1Database,
): Promise<void> {
  const result = await database
    .prepare("PRAGMA table_info(users)")
    .all<{ name: string }>();
  const existing = new Set(
    (result.results ?? []).map((column) => column.name),
  );
  const migrations = [
    {
      name: "telephone",
      sql: "ALTER TABLE users ADD COLUMN telephone TEXT NOT NULL DEFAULT ''",
    },
    {
      name: "homepage",
      sql: "ALTER TABLE users ADD COLUMN homepage TEXT NOT NULL DEFAULT ''",
    },
    {
      name: "address3",
      sql: "ALTER TABLE users ADD COLUMN address3 TEXT NOT NULL DEFAULT ''",
    },
    {
      name: "admin_memo",
      sql: "ALTER TABLE users ADD COLUMN admin_memo TEXT NOT NULL DEFAULT ''",
    },
    {
      name: "identity_method",
      sql: "ALTER TABLE users ADD COLUMN identity_method TEXT NOT NULL DEFAULT 'none'",
    },
    {
      name: "identity_verified",
      sql: "ALTER TABLE users ADD COLUMN identity_verified INTEGER NOT NULL DEFAULT 0",
    },
    {
      name: "email_verified",
      sql: "ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0",
    },
    {
      name: "adult_verified",
      sql: "ALTER TABLE users ADD COLUMN adult_verified INTEGER NOT NULL DEFAULT 0",
    },
    {
      name: "public_profile",
      sql: "ALTER TABLE users ADD COLUMN public_profile INTEGER NOT NULL DEFAULT 0",
    },
    {
      name: "member_signature",
      sql: "ALTER TABLE users ADD COLUMN member_signature TEXT NOT NULL DEFAULT ''",
    },
    {
      name: "member_profile",
      sql: "ALTER TABLE users ADD COLUMN member_profile TEXT NOT NULL DEFAULT ''",
    },
    {
      name: "verification_history",
      sql: "ALTER TABLE users ADD COLUMN verification_history TEXT NOT NULL DEFAULT ''",
    },
    {
      name: "withdrawn_at",
      sql: "ALTER TABLE users ADD COLUMN withdrawn_at TEXT NOT NULL DEFAULT ''",
    },
    {
      name: "blocked_at",
      sql: "ALTER TABLE users ADD COLUMN blocked_at TEXT NOT NULL DEFAULT ''",
    },
    {
      name: "member_icon",
      sql: "ALTER TABLE users ADD COLUMN member_icon TEXT NOT NULL DEFAULT ''",
    },
    {
      name: "member_image",
      sql: "ALTER TABLE users ADD COLUMN member_image TEXT NOT NULL DEFAULT ''",
    },
    ...Array.from({ length: 10 }, (_, index) => ({
      name: `extra${index + 1}`,
      sql: `ALTER TABLE users ADD COLUMN extra${index + 1} TEXT NOT NULL DEFAULT ''`,
    })),
  ] as const;
  const statements = migrations
    .filter((migration) => !existing.has(migration.name))
    .map((migration) => database.prepare(migration.sql));
  if (statements.length > 0) await database.batch(statements);
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AdminApiError(400, "요청 형식이 올바르지 않습니다.");
  }
  return value as Record<string, unknown>;
}

function assertIdentifier(id: string, label: string): void {
  if (!identifierPattern.test(id)) {
    throw new AdminApiError(400, `${label} 형식이 올바르지 않습니다.`);
  }
}

function hasOwn(
  value: Record<string, unknown>,
  key: string,
): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isAdminOrderStatus(value: string): value is AdminOrderStatus {
  return (ADMIN_ORDER_STATUSES as readonly string[]).includes(value);
}

function isAdminPaymentStatus(value: string): value is AdminPaymentStatus {
  return (ADMIN_PAYMENT_STATUSES as readonly string[]).includes(value);
}

function auditStatement(
  database: D1Database,
  entry: {
    action: string;
    entityType: string;
    entityId: string;
    details: string;
  },
): D1PreparedStatement {
  return database
    .prepare(
      `INSERT INTO admin_audit_logs (
         admin_id, action, entity_type, entity_id, details
       ) VALUES (NULL, ?, ?, ?, ?)`,
    )
    .bind(
      entry.action.slice(0, 100),
      entry.entityType.slice(0, 100),
      entry.entityId.slice(0, 128),
      entry.details.slice(0, 10_000),
    );
}

function conditionalAuditStatement(
  database: D1Database,
  entry: {
    action: string;
    entityType: string;
    entityId: string;
    details: string;
  },
): D1PreparedStatement {
  return database
    .prepare(
      `INSERT INTO admin_audit_logs (
         admin_id, action, entity_type, entity_id, details
       )
       SELECT NULL, ?, ?, ?, ?
       WHERE changes() = 1`,
    )
    .bind(
      entry.action.slice(0, 100),
      entry.entityType.slice(0, 100),
      entry.entityId.slice(0, 128),
      entry.details.slice(0, 10_000),
    );
}
