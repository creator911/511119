import { commerceDb, ensureCommerceSchema } from "@/lib/commerce-db";
import { ensurePromotionSchema } from "@/lib/commerce-promotions";
import {
  getCustomerSession,
  verifyOrderLookupToken,
} from "@/lib/customer-auth";
import { noStoreJson } from "@/lib/http-boundary";
import {
  publicOrderStatusLabel,
  publicPaymentStatusLabel,
} from "@/lib/order-status";
import { checkOrderEmailLookupRateLimit } from "@/lib/order-safety";
import { getEffectiveSiteSettings } from "@/lib/site-content";

export interface OrderLookupCredentials {
  orderId: string;
  email: string;
  token: string;
}

export async function lookupOrder(
  request: Request,
  credentials: OrderLookupCredentials,
): Promise<Response> {
  try {
    const orderId = credentials.orderId.trim();
    const email = credentials.email.trim().toLowerCase();
    const token = credentials.token;
    if (!orderId) {
      return noStoreJson(
        { error: "주문번호를 입력해 주세요." },
        { status: 400 },
      );
    }
    if (orderId.length > 100 || email.length > 254 || token.length > 2_048) {
      return noStoreJson(
        { error: "주문번호와 주문자 이메일을 확인해 주세요." },
        { status: 400 },
      );
    }

    await ensureCommerceSchema();
    await ensurePromotionSchema();
    const database = commerceDb();
    const order = await database
      .prepare(
        `SELECT id, user_id, email, recipient_name, subtotal, shipping_fee,
                discount, total, payment_method, payment_status, status,
                tracking_number, created_at,
                COALESCE((
                  SELECT points_used
                  FROM order_point_debits
                  WHERE order_id = orders.id
                ), 0) AS points_used,
                COALESCE((
                  SELECT discount_amount
                  FROM coupon_redemptions
                  WHERE order_id = orders.id
                ), 0) AS coupon_discount,
                COALESCE((
                  SELECT coupon_code
                  FROM coupon_redemptions
                  WHERE order_id = orders.id
                ), '') AS coupon_code,
                COALESCE((
                  SELECT points_earned
                  FROM order_point_credits
                  WHERE order_id = orders.id
                ), 0) AS points_earned,
                COALESCE((
                  SELECT points_reversed
                  FROM order_point_reversals
                  WHERE order_id = orders.id
                ), 0) AS points_reversed
         FROM orders WHERE id = ? LIMIT 1`,
      )
      .bind(orderId)
      .first<{
        id: string;
        user_id: string | null;
        email: string;
        recipient_name: string;
        subtotal: number;
        shipping_fee: number;
        discount: number;
        total: number;
        payment_method: string;
        payment_status: string;
        status: string;
        tracking_number: string;
        created_at: string;
        points_used: number;
        coupon_discount: number;
        coupon_code: string;
        points_earned: number;
        points_reversed: number;
      }>();
    const session = await getCustomerSession(request);
    const tokenPayload = token
      ? await verifyOrderLookupToken(request, token, orderId)
      : null;
    const sessionPermitted = Boolean(
      order && session?.userId && order.user_id === session.userId,
    );
    const tokenPermitted = Boolean(tokenPayload);

    if (email && !sessionPermitted && !tokenPermitted) {
      const rateLimit = await checkOrderEmailLookupRateLimit(
        request,
        database,
      );
      if (rateLimit.limited) {
        return noStoreJson(
          {
            error:
              "주문 조회 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
          },
          {
            status: 429,
            headers: {
              "Retry-After": rateLimit.retryAfterSeconds.toString(),
            },
          },
        );
      }
    }

    const permitted =
      order &&
      ((email && order.email.toLowerCase() === email) ||
        sessionPermitted ||
        tokenPermitted);
    if (!order || !permitted) {
      return noStoreJson(
        { error: "주문번호와 주문자 이메일을 확인해 주세요." },
        { status: 404 },
      );
    }

    const items = await database
      .prepare(
        `SELECT product_id, product_name, product_image, unit_price,
                quantity, line_total
         FROM order_items WHERE order_id = ? ORDER BY id`,
      )
      .bind(orderId)
      .all<{
        product_id: string;
        product_name: string;
        product_image: string;
        unit_price: number;
        quantity: number;
        line_total: number;
      }>();
    const payment = await database
      .prepare(
        `SELECT bank_code, depositor
         FROM order_payment_details WHERE order_id = ? LIMIT 1`,
      )
      .bind(orderId)
      .first<{ bank_code: string; depositor: string }>();
    const settings = await getEffectiveSiteSettings();
    const bankInstruction =
      settings.bankName && settings.bankAccount && settings.bankHolder
        ? `${settings.bankName} ${settings.bankAccount} (예금주 ${settings.bankHolder})로 입금해 주세요.`
        : "입금계좌는 주문 확인 후 등록하신 연락처로 별도 안내드립니다.";

    return noStoreJson({
      order: {
        id: order.id,
        createdAt: order.created_at,
        status: publicOrderStatusLabel(order.status),
        paymentStatus: publicPaymentStatusLabel(order.payment_status),
        trackingNumber: order.tracking_number,
        canCancel:
          order.status === "ordered" &&
          order.payment_status === "pending" &&
          (sessionPermitted || tokenPermitted),
        subtotal: Number(order.subtotal),
        shippingFee: Number(order.shipping_fee),
        pointsUsed: Number(order.points_used),
        couponDiscount: Number(order.coupon_discount),
        couponCode: order.coupon_code,
        earnedPoints: Number(order.points_earned),
        reversedPoints: Number(order.points_reversed),
        total: order.total,
        recipientName: order.recipient_name,
        payment: {
          method: publicPaymentMethodLabel(
            order.payment_method,
            Number(order.points_used),
            Number(order.coupon_discount),
          ),
          depositor: payment?.depositor ?? "",
          instruction:
            order.payment_method === "bank" ? bankInstruction : "",
        },
        items: (items.results ?? []).map((item) => ({
          productId: item.product_id,
          productName: item.product_name,
          productImage: item.product_image,
          unitPrice: item.unit_price,
          quantity: item.quantity,
          lineTotal: item.line_total,
        })),
      },
    });
  } catch {
    return noStoreJson(
      { error: "주문조회 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}

function publicPaymentMethodLabel(
  method: string,
  pointsUsed: number,
  couponDiscount: number,
): string {
  if (method === "points") return "포인트 전액결제";
  if (method === "coupon") return "쿠폰 전액결제";
  const label =
    {
      bank: "무통장입금",
      card: "신용카드",
      transfer: "실시간 계좌이체",
      virtual: "가상계좌",
      mobile: "휴대폰결제",
    }[method] ?? method;
  const additions = [
    couponDiscount > 0 ? "쿠폰" : "",
    pointsUsed > 0 ? "포인트" : "",
  ].filter(Boolean);
  return additions.length > 0 ? `${label} + ${additions.join(" + ")}` : label;
}
