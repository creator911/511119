import { NextResponse } from "next/server";
import { commerceDb, ensureCommerceSchema } from "@/lib/commerce-db";
import { MAX_POINTS } from "@/lib/commerce-limits";
import {
  calculateShippingQuote,
  CouponApplicationError,
  couponRedemptionStatement,
  customerClaimantKey,
  guestClaimantKey,
  validateCouponForOrder,
} from "@/lib/commerce-promotions";
import {
  createOrderLookupToken,
  getCustomerSession,
} from "@/lib/customer-auth";
import {
  ensureAdminProductSchema,
} from "@/lib/admin-products";
import {
  enabledPaymentMethods,
  pointUseFailureMessage,
  validatePointUse,
} from "@/lib/shop-settings";
import { getEffectiveSiteSettings } from "@/lib/site-content";
import {
  checkOrderRateLimit,
  findExistingOrderRequest,
  readOrderRequestKey,
} from "@/lib/order-safety";
import { getStorefrontProductRecords } from "@/lib/storefront-products";
import {
  ensureProductOptionSchema,
  getProductOptionRows,
  type ProductOptionRow,
} from "@/lib/product-options";

interface IncomingLine {
  id: string;
  quantity: number;
  unitPrice: number;
  optionIds: string[];
}

interface OrderContact {
  name: string;
  phone: string;
  postcode: string;
  address1: string;
  address2: string;
}

interface IncomingOrder {
  items: IncomingLine[];
  buyer: OrderContact & {
    email: string;
  };
  recipient: OrderContact;
  deliveryMemo: string;
  paymentMethod: string;
  depositor: string;
  bankCode: string;
  cashReceiptNumber: string;
  couponCode: string;
  pointsUsed: number;
}

const MAX_ORDER_BODY_BYTES = 131_072;

class OrderInputError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "OrderInputError";
  }
}

function orderNumber() {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1_000);
  const stamp = [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, "0"),
    String(now.getUTCDate()).padStart(2, "0"),
    String(now.getUTCHours()).padStart(2, "0"),
    String(now.getUTCMinutes()).padStart(2, "0"),
    String(now.getUTCSeconds()).padStart(2, "0"),
  ].join("");
  const random = crypto.getRandomValues(new Uint32Array(1))[0]
    .toString(36)
    .toUpperCase()
    .padStart(6, "0")
    .slice(0, 6);
  return `KG${stamp}${random}`;
}

export async function POST(request: Request) {
  let attemptedRequestKey = "";
  let attemptedEmail = "";
  let attemptedUserId = "";
  let attemptedPointsUsed = 0;
  let attemptedCouponCode = "";
  try {
    if (!isSameOrigin(request)) {
      return orderJson({ error: "잘못된 주문 요청입니다." }, { status: 400 });
    }
    const body = normalizeIncomingOrder(await readOrderJson(request));
    const buyer = body.buyer;
    const recipient = body.recipient;
    const email = buyer.email.toLowerCase();
    const paymentMethod = body.paymentMethod;
    const depositor = body.depositor;
    const bankCode = body.bankCode;
    const cashReceiptNumber = body.cashReceiptNumber.replace(/[^0-9-]/gu, "");
    attemptedCouponCode = body.couponCode;
    if (
      !body.items.length ||
      body.items.length > 20 ||
      !buyer.name ||
      !buyer.phone ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      !buyer.postcode ||
      !buyer.address1 ||
      !recipient.name ||
      !recipient.phone ||
      !recipient.postcode ||
      !recipient.address1
    ) {
      return orderJson(
        { error: "주문자·배송지 정보를 모두 입력해 주세요." },
        { status: 400 },
      );
    }
    if (
      buyer.postcode.replace(/\D/gu, "").length !== 5 ||
      recipient.postcode.replace(/\D/gu, "").length !== 5
    ) {
      return orderJson(
        { error: "우편번호는 5자리 숫자로 입력해 주세요." },
        { status: 400 },
      );
    }
    const requestKey = readOrderRequestKey(request);
    if (!requestKey) {
      return orderJson(
        { error: "주문 요청 식별값을 확인해 주세요." },
        { status: 400 },
      );
    }
    attemptedRequestKey = requestKey;
    attemptedEmail = email;
    await ensureCommerceSchema();
    const database = commerceDb();
    const existingOrderId = await findExistingOrderRequest(
      requestKey,
      email,
      database,
    );
    if (existingOrderId) {
      return orderJson({
        orderId: existingOrderId,
        lookupToken: await createOrderLookupToken(request, existingOrderId),
        duplicate: true,
      });
    }
    const rateLimit = await checkOrderRateLimit(request, database);
    if (rateLimit.limited) {
      return orderJson(
        { error: "주문 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." },
        {
          status: 429,
          headers: {
            "Retry-After": rateLimit.retryAfterSeconds.toString(),
          },
        },
      );
    }

    const requestedQuantities = new Map<string, number>();
    const requestedLines = new Map<string, IncomingLine>();
    for (const line of body.items) {
      const productId = String(line.id ?? "");
      const quantity = Number(line.quantity);
      const unitPrice = Number(line.unitPrice);
      const optionIds = [...new Set(line.optionIds)].sort();
      if (
        !productId ||
        !Number.isSafeInteger(quantity) ||
        quantity < 1 ||
        quantity > 99 ||
        !Number.isSafeInteger(unitPrice) ||
        unitPrice < 0
      ) {
        return orderJson(
          { error: "주문 상품과 수량을 확인해 주세요." },
          { status: 400 },
        );
      }
      if (optionIds.length !== line.optionIds.length) {
        return orderJson(
          { error: "선택한 상품 옵션을 다시 확인해 주세요." },
          { status: 400 },
        );
      }
      const lineKey = optionIds.length
        ? `${productId}::${optionIds.join(".")}`
        : productId;
      const previousLine = requestedLines.get(lineKey);
      if (previousLine && previousLine.unitPrice !== unitPrice) {
        return orderJson(
          { error: "주문 상품 가격 정보를 다시 확인해 주세요." },
          { status: 400 },
        );
      }
      const combinedLineQuantity =
        (previousLine?.quantity ?? 0) + quantity;
      if (combinedLineQuantity > 99) {
        return orderJson(
          { error: "같은 상품 옵션은 최대 99개까지 주문할 수 있습니다." },
          { status: 400 },
        );
      }
      requestedLines.set(lineKey, {
        id: productId,
        optionIds,
        unitPrice,
        quantity: combinedLineQuantity,
      });
      const combinedQuantity =
        (requestedQuantities.get(productId) ?? 0) + quantity;
      if (combinedQuantity > 99) {
        return orderJson(
          { error: "한 상품은 최대 99개까지 주문할 수 있습니다." },
          { status: 400 },
        );
      }
      requestedQuantities.set(
        productId,
        combinedQuantity,
      );
    }
    const totalQuantity = [...requestedQuantities.values()].reduce(
      (sum, quantity) => sum + quantity,
      0,
    );
    if (totalQuantity > 100) {
      return orderJson(
        { error: "한 주문의 전체 수량은 최대 100개까지 가능합니다." },
        { status: 400 },
      );
    }

    const effectiveProductRecords = await getStorefrontProductRecords({
      strict: true,
    });
    const productById = new Map(
      effectiveProductRecords.map((record) => [record.product.id, record]),
    );
    await ensureProductOptionSchema(database);
    const optionRows = await getProductOptionRows(
      [...requestedQuantities.keys()],
      { database },
    );
    const optionsByProduct = new Map<string, ProductOptionRow[]>();
    for (const option of optionRows) {
      const current = optionsByProduct.get(option.productId) ?? [];
      current.push(option);
      optionsByProduct.set(option.productId, current);
    }
    for (const [productId, quantity] of requestedQuantities) {
      const record = productById.get(productId);
      const product = record?.product;
      if (
        !record ||
        !product ||
        !product.active ||
        product.soldOut ||
        product.stock <= 0
      ) {
        throw new Error("판매할 수 없는 상품이 포함되어 있습니다.");
      }
      if (quantity > product.stock) {
        throw new Error(
          `${product.name} 상품은 현재 ${product.stock.toLocaleString("ko-KR")}개까지 주문할 수 있습니다.`,
        );
      }
    }

    const resolved = [...requestedLines].map(([lineKey, line]) => {
      const record = productById.get(line.id)!;
      const product = record.product;
      const configuredOptions = optionsByProduct.get(product.id) ?? [];
      const selectedOptions = line.optionIds.map((optionId) =>
        configuredOptions.find((option) => option.id === optionId),
      );
      if (configuredOptions.length > 0) {
        const requiredNames = new Set(
          configuredOptions.map((option) => option.optionName),
        );
        const selectedNames = new Set(
          selectedOptions.flatMap((option) =>
            option ? [option.optionName] : [],
          ),
        );
        if (
          selectedOptions.some((option) => !option) ||
          selectedOptions.length !== requiredNames.size ||
          selectedNames.size !== requiredNames.size
        ) {
          throw new Error("필수 상품 옵션을 모두 다시 선택해 주세요.");
        }
      } else if (line.optionIds.length > 0) {
        throw new Error("선택한 상품 옵션을 찾을 수 없습니다.");
      }
      const validOptions = selectedOptions as ProductOptionRow[];
      for (const option of validOptions) {
        if (!option.saleEnabled || option.soldOut || option.stock <= 0) {
          throw new Error(
            `${product.name}의 ${option.optionName}: ${option.optionValue} 옵션은 현재 구매할 수 없습니다.`,
          );
        }
      }
      const unitPrice =
        product.price +
        validOptions.reduce((sum, option) => sum + option.priceDelta, 0);
      if (!Number.isSafeInteger(unitPrice) || unitPrice < 0) {
        throw new Error("상품 옵션 가격을 확인할 수 없습니다.");
      }
      const optionLabel = validOptions
        .map((option) => `${option.optionName}: ${option.optionValue}`)
        .join(" / ");
      return {
        lineKey,
        product,
        quantity: line.quantity,
        displayedPrice: line.unitPrice,
        unitPrice,
        lineTotal: unitPrice * line.quantity,
        selectedOptions: validOptions,
        optionLabel,
        source: record.source,
        revision: record.revision,
      };
    });
    const optionUsage = new Map<
      string,
      { option: ProductOptionRow; quantity: number }
    >();
    for (const line of resolved) {
      for (const option of line.selectedOptions) {
        const current = optionUsage.get(option.id);
        optionUsage.set(option.id, {
          option,
          quantity: (current?.quantity ?? 0) + line.quantity,
        });
      }
    }
    for (const { option, quantity } of optionUsage.values()) {
      if (quantity > option.stock) {
        throw new Error(
          `${option.optionName}: ${option.optionValue} 옵션은 현재 ${option.stock.toLocaleString("ko-KR")}개까지 주문할 수 있습니다.`,
        );
      }
    }
    const priceChanged = resolved.some(
      ({ displayedPrice, unitPrice }) => displayedPrice !== unitPrice,
    );
    if (priceChanged) {
      return orderJson(
        {
          error:
            "상품 가격이 변경되어 최신 금액으로 갱신했습니다. 주문 내용을 다시 확인해 주세요.",
          priceChanged: true,
          quoteItems: resolved.map(
            ({
              lineKey,
              product,
              quantity,
              unitPrice,
              selectedOptions,
              optionLabel,
            }) => ({
              id: product.id,
              lineKey,
              productId: product.id,
              name: product.name,
              href: `/shop/item.php?it_id=${encodeURIComponent(product.id)}`,
              image: product.images[0] ?? "/legacy/logo.png",
              option: optionLabel || undefined,
              optionIds: selectedOptions.map((option) => option.id),
              unitPrice,
              quantity,
              points: 0,
              shippingFee: 0,
              maximumQuantity: Math.max(
                1,
                Math.min(
                  product.stock,
                  ...selectedOptions.map((option) => option.stock),
                ),
              ),
            }),
          ),
        },
        { status: 409 },
      );
    }
    const subtotal = resolved.reduce((sum, line) => sum + line.lineTotal, 0);
    const shopSettings = await getEffectiveSiteSettings({ strict: true });
    const session = await getCustomerSession(request);
    const shippingQuote = await calculateShippingQuote({
      baseFee: shopSettings.defaultShippingFee,
      postcode: recipient.postcode,
      address: recipient.address1,
    });
    const shippingFee = shippingQuote.totalFee;
    const claimantKey = session
      ? customerClaimantKey(session.userId)
      : guestClaimantKey(email);
    const couponApplication = body.couponCode
      ? await validateCouponForOrder({
          code: body.couponCode,
          subtotal,
          claimantKey,
          userId: session?.userId,
        })
      : null;
    const couponDiscount = couponApplication?.discount ?? 0;
    const orderTotal = Math.max(
      0,
      subtotal + shippingFee - couponDiscount,
    );
    const pointsUsed = body.pointsUsed;

    const id = orderNumber();
    let availablePoints = 0;
    if (session) {
      const pointAccount = await database
        .prepare(
          `SELECT points
           FROM users
           WHERE id = ? AND active = 1
           LIMIT 1`,
        )
        .bind(session.userId)
        .first<{ points: number }>();
      availablePoints = Math.max(
        0,
        Math.trunc(Number(pointAccount?.points) || 0),
      );
    }
    const pointValidation = validatePointUse({
      pointsUsed,
      orderTotal,
      availablePoints,
      authenticated: Boolean(session),
      settings: shopSettings,
    });
    if (!pointValidation.ok && pointValidation.failure) {
      const error = pointUseFailureMessage(
        pointValidation.failure,
        shopSettings,
      );
      if (pointValidation.failure === "balance") {
        return orderJson(
          {
            error,
            pointsChanged: true,
            availablePoints,
          },
          { status: 409 },
        );
      }
      return orderJson(
        { error },
        {
          status:
            pointValidation.failure === "authentication" ? 401 : 400,
        },
      );
    }

    const total = orderTotal - pointsUsed;
    const fullyPaidWithoutGateway =
      total === 0 && (pointsUsed > 0 || couponDiscount > 0);
    const configuredPaymentMethods = enabledPaymentMethods(shopSettings);
    if (
      !fullyPaidWithoutGateway &&
      !configuredPaymentMethods.includes(
        paymentMethod as (typeof configuredPaymentMethods)[number],
      )
    ) {
      return orderJson(
        { error: "현재 사용할 수 없는 결제수단입니다." },
        { status: 400 },
      );
    }
    if (
      !fullyPaidWithoutGateway &&
      paymentMethod === "bank" &&
      (!depositor || bankCode !== "manual")
    ) {
      return orderJson(
        { error: "무통장입금 정보와 입금자명을 확인해 주세요." },
        { status: 400 },
      );
    }
    attemptedUserId = session?.userId ?? "";
    attemptedPointsUsed = pointsUsed;

    await ensureAdminProductSchema(database);
    const guardedProducts = [...requestedQuantities.keys()].map(
      (productId) => {
        const record = productById.get(productId)!;
        return {
          product: record.product,
          source: record.source,
          revision: record.revision,
        };
      },
    );
    const catalogGuardStatements = guardedProducts.map(
      ({ product, source, revision }) =>
        source === "static"
          ? database
              .prepare(
                `INSERT INTO order_catalog_guards (
                   order_id, product_id, catalog_guard
                 )
                 VALUES (
                   ?, ?,
                   CASE WHEN NOT EXISTS (
                     SELECT 1 FROM product_changes WHERE product_id = ?
                   ) THEN 1 ELSE 0 END
                 )`,
              )
              .bind(id, product.id, product.id)
          : database
              .prepare(
                `INSERT INTO order_catalog_guards (
                   order_id, product_id, catalog_guard
                 )
                 VALUES (
                   ?, ?,
                   CASE WHEN EXISTS (
                     SELECT 1
                     FROM product_changes
                     WHERE product_id = ?
                       AND revision = ?
                       AND change_type = ?
                   ) THEN 1 ELSE 0 END
                 )`,
              )
              .bind(id, product.id, product.id, revision, source),
    );
    const pointStatements: D1PreparedStatement[] =
      pointsUsed > 0 && session
        ? [
            database
              .prepare(
                `UPDATE users
                 SET points = CASE
                       WHEN active = 1 AND points >= ? THEN points - ?
                       ELSE NULL
                     END,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?`,
              )
              .bind(pointsUsed, pointsUsed, session.userId),
            database
              .prepare(
                `INSERT INTO order_point_debits (
                   order_id, user_id, points_used, guard_value
                 ) VALUES (?, ?, ?, changes())`,
              )
              .bind(id, session.userId, pointsUsed),
          ]
        : [];
    const couponStatements: D1PreparedStatement[] = couponApplication
      ? [
          couponRedemptionStatement(database, {
            application: couponApplication,
            orderId: id,
            claimantKey,
            userId: session?.userId,
            subtotal,
          }),
        ]
      : [];
    const stockStatements = [...requestedQuantities].flatMap(
      ([productId, quantity]) => {
        const product = productById.get(productId)!.product;
        return [
          database
            .prepare(
              `INSERT INTO product_stock (product_id, stock)
               VALUES (?, ?)
               ON CONFLICT(product_id) DO NOTHING`,
            )
            .bind(product.id, product.stock),
          database
            .prepare(
              `UPDATE product_stock
               SET stock = stock - ?, updated_at = CURRENT_TIMESTAMP
               WHERE product_id = ?`,
            )
            .bind(quantity, product.id),
        ];
      },
    );
    const optionStockStatements = [...optionUsage.values()].flatMap(
      ({ option, quantity }) => [
        database
          .prepare(
            `UPDATE product_options
             SET stock = stock - ?,
                 revision = revision + 1,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?
               AND product_id = ?
               AND revision = ?
               AND stock = ?
               AND stock >= ?
               AND sale_enabled = 1
               AND sold_out = 0
               AND deleted = 0`,
          )
          .bind(
            quantity,
            option.id,
            option.productId,
            option.revision,
            option.stock,
            quantity,
          ),
        database
          .prepare(
            `INSERT INTO order_option_guards (
               order_id, option_id, guard_value
             ) VALUES (
               ?, ?,
               CASE WHEN changes() = 1 THEN 1 ELSE 0 END
             )`,
          )
          .bind(id, option.id),
      ],
    );
    const statements = [
      ...catalogGuardStatements,
      ...pointStatements,
      ...couponStatements,
      ...stockStatements,
      ...optionStockStatements,
      database
        .prepare(
          `INSERT INTO orders (
            id, user_id, email, orderer_name, orderer_phone,
            orderer_postcode, orderer_address1, orderer_address2,
            recipient_name, recipient_phone, postcode, address1, address2,
            memo, subtotal, shipping_fee, discount, total, payment_method,
            payment_status, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          session?.userId ?? null,
          email,
          buyer.name,
          buyer.phone,
          buyer.postcode,
          buyer.address1,
          buyer.address2,
          recipient.name,
          recipient.phone,
          recipient.postcode,
          recipient.address1,
          recipient.address2,
          body.deliveryMemo,
          subtotal,
          shippingFee,
          couponDiscount + pointsUsed,
          total,
          fullyPaidWithoutGateway
            ? pointsUsed > 0
              ? "points"
              : "coupon"
            : paymentMethod,
          fullyPaidWithoutGateway ? "paid" : "pending",
          fullyPaidWithoutGateway ? "payment_confirmed" : "ordered",
        ),
      ...resolved.map(
        ({ product, quantity, lineTotal, unitPrice, optionLabel }) =>
        database
          .prepare(
            `INSERT INTO order_items (
              order_id, product_id, product_name, product_image,
              unit_price, quantity, line_total
            ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            id,
            product.id,
            optionLabel
              ? `${product.name} (${optionLabel})`
              : product.name,
            product.images[0] ?? "",
            unitPrice,
            quantity,
            lineTotal,
          ),
      ),
      ...[...optionUsage.values()].map(({ option, quantity }) =>
        database
          .prepare(
            `INSERT INTO order_option_items (
               order_id, option_id, product_id, quantity,
               option_name, option_value, price_delta
             ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            id,
            option.id,
            option.productId,
            quantity,
            option.optionName,
            option.optionValue,
            option.priceDelta,
          ),
      ),
      database
        .prepare(
          `INSERT INTO order_payment_details (
            order_id, bank_code, depositor, cash_receipt_number
          ) VALUES (?, ?, ?, ?)`,
        )
        .bind(
          id,
          fullyPaidWithoutGateway || paymentMethod !== "bank" ? "" : bankCode,
          fullyPaidWithoutGateway || paymentMethod !== "bank" ? "" : depositor,
          fullyPaidWithoutGateway || paymentMethod !== "bank"
            ? ""
            : cashReceiptNumber,
        ),
      database
        .prepare(
          `INSERT INTO order_requests (
            request_key, order_id, email
          ) VALUES (?, ?, ?)`,
        )
        .bind(requestKey, id, email),
    ];
    await database.batch(statements);

    return orderJson(
      {
        orderId: id,
        lookupToken: await createOrderLookupToken(request, id),
      },
      { status: 201 },
    );
  } catch (cause) {
    if (cause instanceof OrderInputError) {
      return orderJson({ error: cause.message }, { status: cause.status });
    }
    if (cause instanceof CouponApplicationError) {
      return orderJson(
        {
          error: cause.message,
          couponChanged: true,
          couponReason: cause.reason,
        },
        { status: cause.status },
      );
    }
    const message =
      cause instanceof Error ? cause.message : "주문 처리 중 오류가 발생했습니다.";
    if (attemptedRequestKey && attemptedEmail) {
      try {
        const existingOrderId = await findExistingOrderRequest(
          attemptedRequestKey,
          attemptedEmail,
        );
        if (existingOrderId) {
          return orderJson({
            orderId: existingOrderId,
            lookupToken: await createOrderLookupToken(
              request,
              existingOrderId,
            ),
            duplicate: true,
          });
        }
      } catch {
        // Fall through to the generic response without exposing database errors.
      }
    }
    const pointConflict =
      attemptedUserId &&
      attemptedPointsUsed > 0 &&
      /order_point_debits|users\.points/iu.test(message);
    const catalogRevisionConflict =
      /order_catalog_guards|catalog_guard/iu.test(message);
    if (catalogRevisionConflict) {
      return orderJson(
        {
          error:
            "주문 중 상품 정보가 변경되었습니다. 최신 상품 정보를 다시 확인해 주세요.",
          priceChanged: true,
        },
        { status: 409 },
      );
    }
    if (pointConflict) {
      try {
        const current = await commerceDb()
          .prepare(
            `SELECT points
             FROM users
             WHERE id = ? AND active = 1
             LIMIT 1`,
          )
          .bind(attemptedUserId)
          .first<{ points: number }>();
        return orderJson(
          {
            error:
              "보유 포인트가 변경되었습니다. 사용 포인트를 다시 확인해 주세요.",
            pointsChanged: true,
            availablePoints: Math.max(
              0,
              Math.trunc(Number(current?.points) || 0),
            ),
          },
          { status: 409 },
        );
      } catch {
        return orderJson(
          {
            error:
              "포인트 잔액을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.",
          },
          { status: 503 },
        );
      }
    }
    const couponConflict =
      attemptedCouponCode &&
      /coupon_redemptions|guard_value|coupon.*constraint/iu.test(message);
    if (couponConflict) {
      return orderJson(
        {
          error:
            "쿠폰 상태가 변경되었거나 이미 사용되었습니다. 쿠폰을 다시 확인해 주세요.",
          couponChanged: true,
        },
        { status: 409 },
      );
    }
    const stockConflict =
      /product_stock|product_options|order_option_guards|check constraint|constraint failed/iu.test(
        message,
      );
    const catalogConflict =
      message === "판매할 수 없는 상품이 포함되어 있습니다." ||
      /상품은 현재 [0-9,]+개까지 주문할 수 있습니다\.$/u.test(message) ||
      /옵션/u.test(message);
    return orderJson(
      {
        error: stockConflict
          ? "주문 중 재고가 변경되었습니다. 장바구니를 확인해 주세요."
          : catalogConflict
            ? message
            : "주문 처리 중 오류가 발생했습니다.",
      },
      { status: stockConflict || catalogConflict ? 409 : 500 },
    );
  }
}

function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

async function readOrderJson(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";
  const [mediaType, ...parameters] = contentType
    .split(";")
    .map((part) => part.trim().toLowerCase());
  if (mediaType !== "application/json") {
    throw new OrderInputError(
      "주문 요청은 JSON 형식으로 전송해 주세요.",
      415,
    );
  }
  const charsetParameter = parameters.find((parameter) =>
    parameter.startsWith("charset="),
  );
  if (charsetParameter) {
    const charset = charsetParameter
      .slice("charset=".length)
      .replace(/^["']|["']$/gu, "");
    if (charset !== "utf-8" && charset !== "utf8") {
      throw new OrderInputError(
        "주문 요청은 UTF-8 JSON 형식으로 전송해 주세요.",
        415,
      );
    }
  }

  const contentLength = Number(request.headers.get("content-length"));
  if (
    Number.isFinite(contentLength) &&
    contentLength > MAX_ORDER_BODY_BYTES
  ) {
    throw new OrderInputError(
      "주문 요청 본문이 너무 큽니다.",
      413,
    );
  }

  const reader = request.body?.getReader();
  if (!reader) {
    throw new OrderInputError("주문 요청 본문을 확인해 주세요.");
  }
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_ORDER_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new OrderInputError(
          "주문 요청 본문이 너무 큽니다.",
          413,
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new OrderInputError(
      "주문 요청은 UTF-8 JSON 형식으로 전송해 주세요.",
    );
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new OrderInputError(
      "주문 요청 본문이 올바른 JSON 형식이 아닙니다.",
    );
  }
}

function normalizeIncomingOrder(value: unknown): IncomingOrder {
  if (!isRecord(value)) {
    throw new OrderInputError("주문 요청 본문을 확인해 주세요.");
  }
  if (
    !Array.isArray(value.items) ||
    value.items.length < 1 ||
    value.items.length > 20
  ) {
    throw new OrderInputError(
      "주문 상품은 한 번에 1개 이상 20개 이하로 선택해 주세요.",
    );
  }
  const items = value.items.map((item) => {
    if (!isRecord(item)) {
      throw new OrderInputError("주문 상품과 수량을 확인해 주세요.");
    }
    const id = readText(item.id, "상품 식별값", 120, true);
    const quantity = item.quantity;
    const unitPrice = item.unitPrice;
    const optionIdsValue = item.optionIds ?? [];
    if (
      typeof quantity !== "number" ||
      !Number.isSafeInteger(quantity) ||
      quantity < 1 ||
      quantity > 99 ||
      typeof unitPrice !== "number" ||
      !Number.isSafeInteger(unitPrice) ||
      unitPrice < 0
    ) {
      throw new OrderInputError("주문 상품과 수량을 확인해 주세요.");
    }
    if (
      !Array.isArray(optionIdsValue) ||
      optionIdsValue.length > 12 ||
      !optionIdsValue.every(
        (optionId) =>
          typeof optionId === "string" &&
          /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u.test(optionId),
      )
    ) {
      throw new OrderInputError("선택한 상품 옵션을 확인해 주세요.");
    }
    return {
      id,
      quantity,
      unitPrice,
      optionIds: optionIdsValue as string[],
    };
  });

  if (!isRecord(value.buyer) || !isRecord(value.recipient)) {
    throw new OrderInputError(
      "주문자·배송지 정보를 모두 입력해 주세요.",
    );
  }
  const buyer = {
    name: readText(value.buyer.name, "주문자 이름", 80, true),
    phone: readText(value.buyer.phone, "주문자 전화번호", 30, true),
    email: readText(value.buyer.email, "주문자 이메일", 254, true),
    postcode: readText(value.buyer.postcode, "주문자 우편번호", 20),
    address1: readText(value.buyer.address1, "주문자 기본주소", 200),
    address2: readText(value.buyer.address2, "주문자 상세주소", 200),
  };
  const recipient = {
    name: readText(value.recipient.name, "받는 분 이름", 80, true),
    phone: readText(value.recipient.phone, "받는 분 전화번호", 30, true),
    postcode: readText(value.recipient.postcode, "배송지 우편번호", 20),
    address1: readText(
      value.recipient.address1,
      "배송지 기본주소",
      200,
      true,
    ),
    address2: readText(value.recipient.address2, "배송지 상세주소", 200),
  };
  const pointsUsed = value.pointsUsed ?? 0;
  if (
    typeof pointsUsed !== "number" ||
    !Number.isSafeInteger(pointsUsed) ||
    pointsUsed < 0 ||
    pointsUsed > MAX_POINTS
  ) {
    throw new OrderInputError(
      "사용 포인트는 0 이상의 정수로 입력해 주세요.",
    );
  }

  return {
    items,
    buyer,
    recipient,
    deliveryMemo: readText(value.deliveryMemo, "배송 메모", 500),
    paymentMethod: readText(
      value.paymentMethod ?? "bank",
      "결제수단",
      20,
      true,
    ),
    depositor: readText(value.depositor, "입금자명", 100),
    bankCode: readText(value.bankCode, "입금 방식", 50),
    cashReceiptNumber: readText(
      value.cashReceiptNumber,
      "현금영수증 번호",
      30,
    ),
    couponCode: readText(value.couponCode, "쿠폰코드", 40).toUpperCase(),
    pointsUsed,
  };
}

function readText(
  value: unknown,
  label: string,
  maxLength: number,
  required = false,
): string {
  if (value === undefined || value === null) {
    if (required) {
      throw new OrderInputError(`${label} 항목을 입력해 주세요.`);
    }
    return "";
  }
  if (typeof value !== "string") {
    throw new OrderInputError(`${label} 형식이 올바르지 않습니다.`);
  }
  if (value.length > maxLength) {
    throw new OrderInputError(
      `${label} 길이는 ${maxLength}자 이하여야 합니다.`,
    );
  }
  const normalized = value.trim();
  if (required && !normalized) {
    throw new OrderInputError(`${label} 항목을 입력해 주세요.`);
  }
  return normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function orderJson(data: unknown, init: ResponseInit = {}): NextResponse {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "private, no-store, max-age=0");
  return NextResponse.json(data, { ...init, headers });
}
