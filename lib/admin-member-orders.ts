import { AdminApiError } from "@/lib/admin-api";
import {
  ensureAdminOperationsSchema,
  type AdminOrderStatus,
  type AdminPaymentStatus,
} from "@/lib/admin-operations";
import {
  ensureAdminProductSchema,
  getEffectiveProducts,
} from "@/lib/admin-products";
import { commerceDb } from "@/lib/commerce-db";
import { MAX_POINTS } from "@/lib/commerce-limits";
import { ensurePromotionSchema } from "@/lib/commerce-promotions";

const memberIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const productIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u;
let memberOrderSchemaInitialization: Promise<void> | null = null;

export interface AdminMemberOrderItem {
  itemId: number;
  orderId: string;
  productId: string;
  productName: string;
  productImage: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  subtotal: number;
  shippingFee: number;
  discount: number;
  total: number;
  pointsUsed: number;
  earnedPoints: number;
  status: AdminOrderStatus;
  paymentStatus: AdminPaymentStatus;
  purchasedAt: string;
  updatedAt: string;
}

export interface AdminMemberOrderList {
  member: {
    id: string;
    loginId: string;
    name: string;
    points: number;
  };
  items: AdminMemberOrderItem[];
}

interface MemberRow {
  id: string;
  login_id: string;
  name: string;
  points: number;
}

interface MemberOrderRow {
  item_id: number;
  order_id: string;
  product_id: string;
  product_name: string;
  product_image: string;
  unit_price: number;
  quantity: number;
  line_total: number;
  subtotal: number;
  shipping_fee: number;
  discount: number;
  total: number;
  points_used: number;
  points_earned: number;
  status: AdminOrderStatus;
  payment_status: AdminPaymentStatus;
  created_at: string;
  updated_at: string;
}

interface EditableOrderRow extends MemberOrderRow {
  user_id: string;
  member_points: number;
  points_reversed: number;
  coupon_amount: number;
  stock_restored: number;
  option_stock_restored: number;
  points_restored: number;
  points_credit_applied: number;
  points_reversal_applied: number;
  same_product_item_count: number;
  product_option_count: number;
}

interface OrderedOptionRow {
  option_id: string;
  quantity: number;
}

export async function getAdminMemberOrders(
  memberId: string,
): Promise<AdminMemberOrderList> {
  assertMemberId(memberId);
  await ensureAdminMemberOrderSchema();
  const database = commerceDb();
  const member = await database
    .prepare(
      `SELECT id, login_id, name, points
       FROM users WHERE id = ? LIMIT 1`,
    )
    .bind(memberId)
    .first<MemberRow>();
  if (!member) {
    throw new AdminApiError(404, "회원을 찾을 수 없습니다.");
  }

  const result = await database
    .prepare(
      `SELECT
         oi.id AS item_id, o.id AS order_id, oi.product_id,
         oi.product_name, oi.product_image, oi.unit_price, oi.quantity,
         oi.line_total, o.subtotal, o.shipping_fee, o.discount, o.total,
         COALESCE((
           SELECT points_used FROM order_point_debits
           WHERE order_id = o.id
         ), 0) AS points_used,
         COALESCE((
           SELECT points_earned FROM order_point_credits
           WHERE order_id = o.id
         ), 0) AS points_earned,
         o.status, o.payment_status, o.created_at, o.updated_at
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
       WHERE o.user_id = ?
       ORDER BY o.created_at DESC, oi.id DESC
       LIMIT 100`,
    )
    .bind(memberId)
    .all<MemberOrderRow>();

  return {
    member: {
      id: member.id,
      loginId: member.login_id,
      name: member.name,
      points: Number(member.points),
    },
    items: (result.results ?? []).map(memberOrderItem),
  };
}

export async function updateAdminMemberOrderItem(
  memberId: string,
  input: unknown,
  adminUsername: string,
): Promise<AdminMemberOrderList> {
  assertMemberId(memberId);
  const values = parseMemberOrderUpdate(input);
  await ensureAdminMemberOrderSchema();
  const database = commerceDb();
  const current = await database
    .prepare(
      `SELECT
         oi.id AS item_id, o.id AS order_id, o.user_id,
         oi.product_id, oi.product_name, oi.product_image,
         oi.unit_price, oi.quantity, oi.line_total,
         o.subtotal, o.shipping_fee, o.discount, o.total,
         COALESCE(opd.points_used, 0) AS points_used,
         COALESCE(opc.points_earned, 0) AS points_earned,
         COALESCE(opr.points_reversed, 0) AS points_reversed,
         COALESCE(cr.discount_amount, 0) AS coupon_amount,
         o.status, o.payment_status, o.created_at, o.updated_at,
         u.points AS member_points,
         EXISTS (
           SELECT 1 FROM order_inventory_adjustments
           WHERE order_id = o.id AND adjustment_type = 'stock_restore'
         ) AS stock_restored,
         EXISTS (
           SELECT 1 FROM order_inventory_adjustments
           WHERE order_id = o.id AND adjustment_type = 'option_stock_restore'
         ) AS option_stock_restored,
         EXISTS (
           SELECT 1 FROM order_inventory_adjustments
           WHERE order_id = o.id AND adjustment_type = 'points_restore'
         ) AS points_restored,
         EXISTS (
           SELECT 1 FROM order_inventory_adjustments
           WHERE order_id = o.id AND adjustment_type = 'points_credit'
         ) AS points_credit_applied,
         EXISTS (
           SELECT 1 FROM order_inventory_adjustments
           WHERE order_id = o.id AND adjustment_type = 'points_reversal'
         ) AS points_reversal_applied,
         (
           SELECT COUNT(*) FROM order_items duplicate_item
           WHERE duplicate_item.order_id = o.id
             AND duplicate_item.product_id = oi.product_id
         ) AS same_product_item_count,
         (
           SELECT COUNT(*) FROM order_option_items option_item
           WHERE option_item.order_id = o.id
             AND option_item.product_id = oi.product_id
         ) AS product_option_count
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       JOIN users u ON u.id = o.user_id
       LEFT JOIN order_point_debits opd ON opd.order_id = o.id
       LEFT JOIN order_point_credits opc ON opc.order_id = o.id
       LEFT JOIN order_point_reversals opr ON opr.order_id = o.id
       LEFT JOIN coupon_redemptions cr ON cr.order_id = o.id
       WHERE oi.id = ? AND o.user_id = ?
       LIMIT 1`,
    )
    .bind(values.itemId, memberId)
    .first<EditableOrderRow>();
  if (!current) {
    throw new AdminApiError(404, "수정할 구매상품을 찾을 수 없습니다.");
  }
  if (current.updated_at !== values.expectedUpdatedAt) {
    throw new AdminApiError(
      409,
      "주문이 다른 작업에서 변경되었습니다. 최신 목록을 다시 불러와 주세요.",
    );
  }

  const products = await getEffectiveProducts({ database, strict: true });
  const productsById = new Map(products.map((product) => [product.id, product]));
  const requestedProduct = productsById.get(values.productId);
  const productChanged = current.product_id !== values.productId;
  if (productChanged && (!requestedProduct || !requestedProduct.active)) {
    throw new AdminApiError(400, "판매 가능한 상품ID를 확인해 주세요.", {
      productId: "상품 페이지 주소의 it_id 숫자를 입력해 주세요.",
    });
  }
  if (
    productChanged &&
    Number(current.product_option_count) > 0 &&
    Number(current.same_product_item_count) > 1
  ) {
    throw new AdminApiError(
      409,
      "같은 상품이 여러 줄이고 옵션이 포함된 주문은 주문관리에서 먼저 분리해 주세요.",
    );
  }

  const quantity = Number(current.quantity);
  const nextUnitPrice = productChanged
    ? Math.trunc(requestedProduct!.price)
    : Number(current.unit_price);
  const nextLineTotal = nextUnitPrice * quantity;
  const nextSubtotal = Number(current.subtotal) - Number(current.line_total) + nextLineTotal;
  if (
    !Number.isSafeInteger(nextLineTotal) ||
    !Number.isSafeInteger(nextSubtotal) ||
    nextLineTotal < 0 ||
    nextSubtotal < 0 ||
    nextSubtotal > MAX_POINTS
  ) {
    throw new AdminApiError(409, "변경할 상품 금액이 허용 범위를 벗어납니다.");
  }

  const currentPointsUsed = Number(current.points_used);
  const currentCouponAmount = Number(current.coupon_amount);
  const otherDiscount = Math.max(
    0,
    Number(current.discount) - currentPointsUsed - currentCouponAmount,
  );
  const nextCouponAmount = Math.min(currentCouponAmount, nextSubtotal);
  const maximumPointUse = Math.max(
    0,
    nextSubtotal + Number(current.shipping_fee) - nextCouponAmount - otherDiscount,
  );
  const nextPointsUsed = Math.min(currentPointsUsed, maximumPointUse);
  const nextDiscount = nextCouponAmount + otherDiscount + nextPointsUsed;
  const nextTotal = Math.max(
    0,
    nextSubtotal + Number(current.shipping_fee) - nextDiscount,
  );

  const previousProduct = productsById.get(current.product_id);
  const rewardDifference = productChanged
    ? (Math.max(0, Math.trunc(requestedProduct!.rewardPoints)) -
        Math.max(0, Math.trunc(previousProduct?.rewardPoints ?? 0))) *
      quantity
    : 0;
  const nextEarnedPoints = Math.max(
    0,
    Number(current.points_earned) + rewardDifference,
  );
  if (!Number.isSafeInteger(nextEarnedPoints) || nextEarnedPoints > MAX_POINTS) {
    throw new AdminApiError(409, "변경 후 적립 마일리지가 허용 범위를 벗어납니다.");
  }
  const nextReversedPoints = Number(current.points_reversed) > 0
    ? nextEarnedPoints
    : 0;
  const creditWillBeApplied = Boolean(current.points_credit_applied) ||
    (current.status === "delivered" &&
      nextEarnedPoints > 0 &&
      !current.points_reversal_applied);
  const pointsWereRestored = Boolean(current.points_restored);
  const currentPointEffect =
    (pointsWereRestored ? 0 : -currentPointsUsed) +
    (current.points_credit_applied ? Number(current.points_earned) : 0) -
    (current.points_reversal_applied ? Number(current.points_reversed) : 0);
  const nextPointEffect =
    (pointsWereRestored ? 0 : -nextPointsUsed) +
    (creditWillBeApplied ? nextEarnedPoints : 0) -
    (current.points_reversal_applied ? nextReversedPoints : 0);
  const pointBalanceDifference = nextPointEffect - currentPointEffect;
  const nextMemberPoints = Number(current.member_points) + pointBalanceDifference;
  if (
    !Number.isSafeInteger(nextMemberPoints) ||
    nextMemberPoints < -MAX_POINTS ||
    nextMemberPoints > MAX_POINTS
  ) {
    throw new AdminApiError(409, "변경 후 회원 마일리지가 허용 범위를 벗어납니다.");
  }

  const inventoryHeld =
    current.status !== "cancelled" &&
    current.status !== "refunded" &&
    !current.stock_restored;
  if (productChanged && inventoryHeld && requestedProduct!.stock < quantity) {
    throw new AdminApiError(409, "변경할 상품의 재고가 부족합니다.");
  }
  const orderedOptions = productChanged
    ? await database
        .prepare(
          `SELECT option_id, quantity
           FROM order_option_items
           WHERE order_id = ? AND product_id = ?`,
        )
        .bind(current.order_id, current.product_id)
        .all<OrderedOptionRow>()
    : { results: [] as OrderedOptionRow[] };

  const operationId = crypto.randomUUID();
  const normalizedAdmin = adminUsername.trim().slice(0, 128);
  const guardTable = "admin_member_order_write_guards";
  const statements: D1PreparedStatement[] = [
    database
      .prepare(
        `UPDATE orders
         SET subtotal = ?, discount = ?, total = ?, created_at = ?,
             updated_at = strftime('%Y-%m-%d %H:%M:%f', 'now')
         WHERE id = ? AND user_id = ? AND updated_at = ?`,
      )
      .bind(
        nextSubtotal,
        nextDiscount,
        nextTotal,
        values.purchasedAt,
        current.order_id,
        memberId,
        values.expectedUpdatedAt,
      ),
    database
      .prepare(
        `INSERT INTO ${guardTable} (
           operation_id, order_id, order_guard, item_guard,
           balance_guard, stock_guard
         ) VALUES (?, ?, changes(), 1, 1, 1)`,
      )
      .bind(operationId, current.order_id),
    database
      .prepare(
        `UPDATE order_items
         SET product_id = ?, product_name = ?, product_image = ?,
             unit_price = ?, line_total = ?, created_at = ?
         WHERE id = ? AND order_id = ? AND product_id = ?`,
      )
      .bind(
        productChanged ? requestedProduct!.id : current.product_id,
        productChanged ? requestedProduct!.name : current.product_name,
        productChanged ? requestedProduct!.images[0] ?? "" : current.product_image,
        nextUnitPrice,
        nextLineTotal,
        values.purchasedAt,
        values.itemId,
        current.order_id,
        current.product_id,
      ),
    database
      .prepare(
        `UPDATE ${guardTable}
         SET item_guard = CASE WHEN changes() = 1 THEN 1 ELSE 0 END
         WHERE operation_id = ?`,
      )
      .bind(operationId),
  ];

  if (values.purchasedAt !== current.created_at) {
    statements.push(
      database
        .prepare("UPDATE order_items SET created_at = ? WHERE order_id = ?")
        .bind(values.purchasedAt, current.order_id),
      database
        .prepare("UPDATE order_point_debits SET created_at = ? WHERE order_id = ?")
        .bind(values.purchasedAt, current.order_id),
      database
        .prepare("UPDATE coupon_redemptions SET created_at = ? WHERE order_id = ?")
        .bind(values.purchasedAt, current.order_id),
    );
  }

  if (currentPointsUsed !== nextPointsUsed) {
    statements.push(
      nextPointsUsed > 0
        ? database
            .prepare(
              `UPDATE order_point_debits
               SET points_used = ?, created_at = ?
               WHERE order_id = ? AND points_used = ?`,
            )
            .bind(
              nextPointsUsed,
              values.purchasedAt,
              current.order_id,
              currentPointsUsed,
            )
        : database
            .prepare(
              "DELETE FROM order_point_debits WHERE order_id = ? AND points_used = ?",
            )
            .bind(current.order_id, currentPointsUsed),
    );
  }
  if (currentCouponAmount !== nextCouponAmount) {
    statements.push(
      database
        .prepare(
          `UPDATE coupon_redemptions
           SET discount_amount = ?, created_at = ?
           WHERE order_id = ? AND discount_amount = ?`,
        )
        .bind(
          nextCouponAmount,
          values.purchasedAt,
          current.order_id,
          currentCouponAmount,
        ),
    );
  }

  if (Number(current.points_earned) !== nextEarnedPoints) {
    statements.push(
      nextEarnedPoints > 0
        ? database
            .prepare(
              `INSERT INTO order_point_credits (
                 order_id, user_id, points_earned, created_at
               ) VALUES (?, ?, ?, ?)
               ON CONFLICT(order_id) DO UPDATE SET
                 points_earned = excluded.points_earned,
                 created_at = excluded.created_at`,
            )
            .bind(
              current.order_id,
              memberId,
              nextEarnedPoints,
              values.purchasedAt,
            )
        : database
            .prepare("DELETE FROM order_point_credits WHERE order_id = ?")
            .bind(current.order_id),
    );
  } else if (nextEarnedPoints > 0 && values.purchasedAt !== current.created_at) {
    statements.push(
      database
        .prepare("UPDATE order_point_credits SET created_at = ? WHERE order_id = ?")
        .bind(values.purchasedAt, current.order_id),
    );
  }
  if (Number(current.points_reversed) !== nextReversedPoints) {
    statements.push(
      nextReversedPoints > 0
        ? database
            .prepare(
              `UPDATE order_point_reversals
               SET points_reversed = ?
               WHERE order_id = ? AND points_reversed = ?`,
            )
            .bind(
              nextReversedPoints,
              current.order_id,
              Number(current.points_reversed),
            )
        : database
            .prepare("DELETE FROM order_point_reversals WHERE order_id = ?")
            .bind(current.order_id),
    );
  }
  if (creditWillBeApplied && !current.points_credit_applied) {
    statements.push(
      database
        .prepare(
          `INSERT INTO order_inventory_adjustments (
             order_id, adjustment_type
           ) VALUES (?, 'points_credit')`,
        )
        .bind(current.order_id),
    );
  }

  if (pointBalanceDifference !== 0) {
    statements.push(
      database
        .prepare(
          `UPDATE users
           SET points = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND points = ?`,
        )
        .bind(nextMemberPoints, memberId, Number(current.member_points)),
      database
        .prepare(
          `UPDATE ${guardTable}
           SET balance_guard = CASE WHEN changes() = 1 THEN 1 ELSE 0 END
           WHERE operation_id = ?`,
        )
        .bind(operationId),
    );
  }

  if (productChanged) {
    if (inventoryHeld) {
      statements.push(
        database
          .prepare(
            `INSERT INTO product_stock (product_id, stock)
             VALUES (?, ?)
             ON CONFLICT(product_id) DO NOTHING`,
          )
          .bind(current.product_id, previousProduct?.stock ?? 0),
        database
          .prepare(
            `INSERT INTO product_stock (product_id, stock)
             VALUES (?, ?)
             ON CONFLICT(product_id) DO NOTHING`,
          )
          .bind(requestedProduct!.id, requestedProduct!.stock),
        database
          .prepare(
            `UPDATE product_stock
             SET stock = stock + ?, updated_at = CURRENT_TIMESTAMP
             WHERE product_id = ?`,
          )
          .bind(quantity, current.product_id),
        database
          .prepare(
            `UPDATE product_stock
             SET stock = stock - ?, updated_at = CURRENT_TIMESTAMP
             WHERE product_id = ? AND stock >= ?`,
          )
          .bind(quantity, requestedProduct!.id, quantity),
        database
          .prepare(
            `UPDATE ${guardTable}
             SET stock_guard = CASE WHEN changes() = 1 THEN 1 ELSE 0 END
             WHERE operation_id = ?`,
          )
          .bind(operationId),
      );
      if (!current.option_stock_restored) {
        for (const option of orderedOptions.results ?? []) {
          statements.push(
            database
              .prepare(
                `UPDATE product_options
                 SET stock = stock + ?, revision = revision + 1,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?`,
              )
              .bind(Number(option.quantity), option.option_id),
          );
        }
      }
    }
    statements.push(
      database
        .prepare(
          `DELETE FROM order_option_guards
           WHERE order_id = ? AND option_id IN (
             SELECT option_id FROM order_option_items
             WHERE order_id = ? AND product_id = ?
           )`,
        )
        .bind(current.order_id, current.order_id, current.product_id),
      database
        .prepare(
          `DELETE FROM order_option_items
           WHERE order_id = ? AND product_id = ?`,
        )
        .bind(current.order_id, current.product_id),
      database
        .prepare(
          `DELETE FROM order_catalog_guards
           WHERE order_id = ? AND product_id = ?
             AND NOT EXISTS (
               SELECT 1 FROM order_items
               WHERE order_id = ? AND product_id = ?
             )`,
        )
        .bind(
          current.order_id,
          current.product_id,
          current.order_id,
          current.product_id,
        ),
      database
        .prepare(
          `INSERT INTO order_catalog_guards (
             order_id, product_id, catalog_guard
           ) VALUES (?, ?, 1)
           ON CONFLICT(order_id, product_id) DO UPDATE SET catalog_guard = 1`,
        )
        .bind(current.order_id, requestedProduct!.id),
    );
  }

  statements.push(
    database
      .prepare(
        `INSERT INTO admin_audit_logs (
           admin_id, action, entity_type, entity_id, details
         ) VALUES (NULL, 'member.order-item.update', 'order_item', ?, ?)`,
      )
      .bind(
        String(values.itemId),
        JSON.stringify({
          adminUsername: normalizedAdmin,
          memberId,
          orderId: current.order_id,
          before: {
            productId: current.product_id,
            productName: current.product_name,
            unitPrice: Number(current.unit_price),
            lineTotal: Number(current.line_total),
            subtotal: Number(current.subtotal),
            total: Number(current.total),
            pointsUsed: currentPointsUsed,
            earnedPoints: Number(current.points_earned),
            purchasedAt: current.created_at,
            memberPoints: Number(current.member_points),
          },
          after: {
            productId: productChanged ? requestedProduct!.id : current.product_id,
            productName: productChanged ? requestedProduct!.name : current.product_name,
            unitPrice: nextUnitPrice,
            lineTotal: nextLineTotal,
            subtotal: nextSubtotal,
            total: nextTotal,
            pointsUsed: nextPointsUsed,
            earnedPoints: nextEarnedPoints,
            purchasedAt: values.purchasedAt,
            memberPoints: nextMemberPoints,
          },
        }).slice(0, 10_000),
      ),
    database
      .prepare(`DELETE FROM ${guardTable} WHERE operation_id = ?`)
      .bind(operationId),
  );

  try {
    await database.batch(statements);
  } catch (error) {
    if (looksLikeMemberOrderConflict(error)) {
      throw new AdminApiError(
        409,
        "주문·포인트·재고가 다른 작업에서 변경되었습니다. 최신 목록을 다시 불러와 주세요.",
      );
    }
    throw error;
  }

  return getAdminMemberOrders(memberId);
}

async function ensureAdminMemberOrderSchema(): Promise<void> {
  if (!memberOrderSchemaInitialization) {
    memberOrderSchemaInitialization = Promise.all([
      ensureAdminOperationsSchema(),
      ensureAdminProductSchema(),
      ensurePromotionSchema(),
    ])
      .then(async () => {
        await commerceDb()
          .prepare(
            `CREATE TABLE IF NOT EXISTS admin_member_order_write_guards (
               operation_id TEXT PRIMARY KEY,
               order_id TEXT NOT NULL,
               order_guard INTEGER NOT NULL CHECK(order_guard = 1),
               item_guard INTEGER NOT NULL CHECK(item_guard = 1),
               balance_guard INTEGER NOT NULL CHECK(balance_guard = 1),
               stock_guard INTEGER NOT NULL CHECK(stock_guard = 1),
               created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
             )`,
          )
          .run();
      })
      .catch((error) => {
        memberOrderSchemaInitialization = null;
        throw error;
      });
  }
  await memberOrderSchemaInitialization;
}

function memberOrderItem(row: MemberOrderRow): AdminMemberOrderItem {
  return {
    itemId: Number(row.item_id),
    orderId: row.order_id,
    productId: row.product_id,
    productName: row.product_name,
    productImage: row.product_image,
    unitPrice: Number(row.unit_price),
    quantity: Number(row.quantity),
    lineTotal: Number(row.line_total),
    subtotal: Number(row.subtotal),
    shippingFee: Number(row.shipping_fee),
    discount: Number(row.discount),
    total: Number(row.total),
    pointsUsed: Number(row.points_used),
    earnedPoints: Number(row.points_earned),
    status: row.status,
    paymentStatus: row.payment_status,
    purchasedAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseMemberOrderUpdate(input: unknown): {
  itemId: number;
  productId: string;
  purchasedAt: string;
  expectedUpdatedAt: string;
} {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new AdminApiError(400, "상품변경 요청 형식이 올바르지 않습니다.");
  }
  const value = input as Record<string, unknown>;
  const itemId = Number(value.itemId);
  if (!Number.isSafeInteger(itemId) || itemId < 1) {
    throw new AdminApiError(400, "구매상품 번호를 확인해 주세요.");
  }
  const productId = typeof value.productId === "string"
    ? value.productId.trim()
    : "";
  if (!productIdPattern.test(productId)) {
    throw new AdminApiError(400, "상품ID 형식을 확인해 주세요.", {
      productId: "상품 페이지 주소의 it_id 숫자를 입력해 주세요.",
    });
  }
  const purchasedAt = normalizePurchaseDate(value.purchasedAt);
  const expectedUpdatedAt = typeof value.expectedUpdatedAt === "string"
    ? value.expectedUpdatedAt.trim()
    : "";
  if (!expectedUpdatedAt || expectedUpdatedAt.length > 64) {
    throw new AdminApiError(400, "수정 기준시각을 확인해 주세요.");
  }
  return { itemId, productId, purchasedAt, expectedUpdatedAt };
}

function normalizePurchaseDate(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length > 40 ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/u.test(value)
  ) {
    throw new AdminApiError(400, "구매일시는 초 단위까지 입력해 주세요.");
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new AdminApiError(400, "구매일시가 올바르지 않습니다.");
  }
  const year = date.getUTCFullYear();
  if (year < 2000 || year > 2100) {
    throw new AdminApiError(400, "구매일시는 2000년부터 2100년 사이로 입력해 주세요.");
  }
  return date.toISOString().slice(0, 19).replace("T", " ");
}

function assertMemberId(memberId: string): void {
  if (!memberIdPattern.test(memberId)) {
    throw new AdminApiError(400, "회원번호가 올바르지 않습니다.");
  }
}

function looksLikeMemberOrderConflict(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /admin_member_order_write_guards|CHECK constraint|constraint failed|product_stock|order_point_(?:debits|credits|reversals)/iu.test(
    message,
  );
}
