import { AdminApiError } from "@/lib/admin-api";
import { commerceDb, ensureCommerceSchema } from "@/lib/commerce-db";
import { isJsonObject } from "@/lib/http-boundary";

export type CouponType = "fixed" | "percent";

export interface AdminCouponRecord {
  id: string;
  code: string;
  name: string;
  type: CouponType;
  amount: number;
  minimumOrder: number;
  startsAt: string;
  endsAt: string;
  active: boolean;
  zoneEnabled: boolean;
  claimCount: number;
  redemptionCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CouponZoneRecord {
  id: string;
  name: string;
  type: CouponType;
  amount: number;
  minimumOrder: number;
  startsAt: string;
  endsAt: string;
}

export interface CouponApplication {
  id: string;
  code: string;
  name: string;
  type: CouponType;
  amount: number;
  minimumOrder: number;
  startsAt: string;
  endsAt: string;
  zoneEnabled: boolean;
  discount: number;
}

export interface AdditionalShippingRule {
  id: string;
  regionName: string;
  postcodeStart: string;
  postcodeEnd: string;
  extraFee: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ShippingQuote {
  baseFee: number;
  additionalFee: number;
  totalFee: number;
  ruleId: string;
  ruleName: string;
}

interface CouponDatabaseRow {
  id: string;
  code: string;
  name: string;
  type: string;
  amount: number;
  minimum_order: number;
  starts_at: string | null;
  ends_at: string | null;
  active: number;
  zone_enabled: number;
  claim_count?: number;
  redemption_count?: number;
  created_at: string;
  updated_at: string;
}

interface ShippingRuleDatabaseRow {
  id: string;
  region_name: string;
  postcode_start: string;
  postcode_end: string;
  extra_fee: number;
  active: number;
  created_at: string;
  updated_at: string;
}

interface CouponInput {
  code: string;
  name: string;
  type: CouponType;
  amount: number;
  minimumOrder: number;
  startsAt: string | null;
  endsAt: string | null;
  active: boolean;
  zoneEnabled: boolean;
}

interface ShippingRuleInput {
  regionName: string;
  postcodeStart: string;
  postcodeEnd: string;
  extraFee: number;
  active: boolean;
}

export class CouponApplicationError extends Error {
  constructor(
    message: string,
    readonly status = 409,
    readonly reason:
      | "invalid"
      | "inactive"
      | "period"
      | "minimum"
      | "authentication"
      | "claim"
      | "duplicate" = "invalid",
  ) {
    super(message);
    this.name = "CouponApplicationError";
  }
}

const couponCodePattern = /^[A-Z0-9][A-Z0-9_-]{3,39}$/u;
const postcodePattern = /^\d{5}$/u;
const maximumMoney = 100_000_000;
let promotionSchemaInitialization: Promise<void> | null = null;

export async function ensurePromotionSchema(): Promise<void> {
  if (!promotionSchemaInitialization) {
    promotionSchemaInitialization = initializePromotionSchema().catch(
      (error) => {
        promotionSchemaInitialization = null;
        throw error;
      },
    );
  }
  await promotionSchemaInitialization;
}

async function initializePromotionSchema(): Promise<void> {
  await ensureCommerceSchema();
  const database = commerceDb();
  await database.batch([
    database.prepare(`CREATE TABLE IF NOT EXISTS coupons (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'fixed',
      amount INTEGER NOT NULL DEFAULT 0,
      minimum_order INTEGER NOT NULL DEFAULT 0,
      starts_at TEXT,
      ends_at TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      zone_enabled INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    database.prepare(
      "CREATE UNIQUE INDEX IF NOT EXISTS coupons_code_uq ON coupons(code)",
    ),
    database.prepare(`CREATE TABLE IF NOT EXISTS coupon_claims (
      coupon_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      claimed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (coupon_id, user_id)
    )`),
    database.prepare(
      "CREATE INDEX IF NOT EXISTS coupon_claims_user_idx ON coupon_claims(user_id, claimed_at)",
    ),
    database.prepare(`CREATE TABLE IF NOT EXISTS coupon_redemptions (
      order_id TEXT PRIMARY KEY,
      coupon_id TEXT NOT NULL,
      coupon_code TEXT NOT NULL,
      claimant_key TEXT NOT NULL,
      discount_amount INTEGER NOT NULL CHECK(discount_amount >= 0),
      guard_value INTEGER NOT NULL CHECK(guard_value = 1),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    database.prepare(
      "CREATE UNIQUE INDEX IF NOT EXISTS coupon_redemptions_customer_uq ON coupon_redemptions(coupon_id, claimant_key)",
    ),
    database.prepare(
      "CREATE INDEX IF NOT EXISTS coupon_redemptions_coupon_idx ON coupon_redemptions(coupon_id, created_at)",
    ),
    database.prepare(`CREATE TABLE IF NOT EXISTS additional_shipping_rules (
      id TEXT PRIMARY KEY,
      region_name TEXT NOT NULL,
      postcode_start TEXT NOT NULL,
      postcode_end TEXT NOT NULL,
      extra_fee INTEGER NOT NULL DEFAULT 0 CHECK(extra_fee >= 0),
      active INTEGER NOT NULL DEFAULT 1,
      created_by TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    database.prepare(
      "CREATE INDEX IF NOT EXISTS additional_shipping_rules_range_idx ON additional_shipping_rules(active, postcode_start, postcode_end)",
    ),
  ]);

  const columns = await database
    .prepare("PRAGMA table_info(coupons)")
    .all<{ name: string }>();
  if (!(columns.results ?? []).some((column) => column.name === "zone_enabled")) {
    await database
      .prepare(
        "ALTER TABLE coupons ADD COLUMN zone_enabled INTEGER NOT NULL DEFAULT 0",
      )
      .run();
  }
}

export async function listAdminCoupons(options?: {
  zoneOnly?: boolean;
}): Promise<AdminCouponRecord[]> {
  await ensurePromotionSchema();
  const database = commerceDb();
  const result = await database
    .prepare(
      `SELECT c.id, c.code, c.name, c.type, c.amount, c.minimum_order,
              c.starts_at, c.ends_at, c.active, c.zone_enabled,
              c.created_at, c.updated_at,
              (SELECT COUNT(*) FROM coupon_claims cc
               WHERE cc.coupon_id = c.id) AS claim_count,
              (SELECT COUNT(*) FROM coupon_redemptions cr
               WHERE cr.coupon_id = c.id) AS redemption_count
       FROM coupons c
       ${options?.zoneOnly ? "WHERE c.zone_enabled = 1" : ""}
       ORDER BY c.created_at DESC, c.id DESC
       LIMIT 500`,
    )
    .all<CouponDatabaseRow>();
  return (result.results ?? []).map(mapAdminCoupon);
}

export async function createAdminCoupon(
  input: unknown,
  adminUsername: string,
): Promise<AdminCouponRecord> {
  const coupon = parseCouponInput(input);
  await ensurePromotionSchema();
  const database = commerceDb();
  const id = crypto.randomUUID();
  try {
    await database
      .prepare(
        `INSERT INTO coupons (
           id, code, name, type, amount, minimum_order,
           starts_at, ends_at, active, zone_enabled
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        coupon.code,
        coupon.name,
        coupon.type,
        coupon.amount,
        coupon.minimumOrder,
        coupon.startsAt,
        coupon.endsAt,
        coupon.active ? 1 : 0,
        coupon.zoneEnabled ? 1 : 0,
      )
      .run();
  } catch (error) {
    if (isCouponCodeConflict(error)) {
      throw new AdminApiError(409, "이미 등록된 쿠폰코드입니다.", {
        code: "다른 쿠폰코드를 입력해 주세요.",
      });
    }
    throw error;
  }
  await writePromotionAudit(
    database,
    adminUsername,
    "coupon.create",
    id,
    `쿠폰 ${coupon.code} 등록`,
  );
  return requireCoupon(await findAdminCoupon(database, id));
}

export async function updateAdminCoupon(
  couponId: string,
  input: unknown,
  adminUsername: string,
): Promise<AdminCouponRecord> {
  const id = parseId(couponId, "쿠폰");
  const coupon = parseCouponInput(input);
  await ensurePromotionSchema();
  const database = commerceDb();
  try {
    const result = await database
      .prepare(
        `UPDATE coupons
         SET code = ?, name = ?, type = ?, amount = ?, minimum_order = ?,
             starts_at = ?, ends_at = ?, active = ?, zone_enabled = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      )
      .bind(
        coupon.code,
        coupon.name,
        coupon.type,
        coupon.amount,
        coupon.minimumOrder,
        coupon.startsAt,
        coupon.endsAt,
        coupon.active ? 1 : 0,
        coupon.zoneEnabled ? 1 : 0,
        id,
      )
      .run();
    if (!result.meta.changes) {
      throw new AdminApiError(404, "수정할 쿠폰을 찾지 못했습니다.");
    }
  } catch (error) {
    if (isCouponCodeConflict(error)) {
      throw new AdminApiError(409, "이미 등록된 쿠폰코드입니다.", {
        code: "다른 쿠폰코드를 입력해 주세요.",
      });
    }
    throw error;
  }
  await writePromotionAudit(
    database,
    adminUsername,
    "coupon.update",
    id,
    `쿠폰 ${coupon.code} 수정`,
  );
  return requireCoupon(await findAdminCoupon(database, id));
}

export async function deleteAdminCoupon(
  couponId: string,
  adminUsername: string,
): Promise<void> {
  const id = parseId(couponId, "쿠폰");
  await ensurePromotionSchema();
  const database = commerceDb();
  const redemptions = await database
    .prepare(
      "SELECT COUNT(*) AS total FROM coupon_redemptions WHERE coupon_id = ?",
    )
    .bind(id)
    .first<{ total: number }>();
  if (Number(redemptions?.total ?? 0) > 0) {
    throw new AdminApiError(
      409,
      "사용 내역이 있는 쿠폰은 삭제할 수 없습니다. 사용안함으로 변경해 주세요.",
    );
  }
  const result = await database.batch([
    database
      .prepare("DELETE FROM coupon_claims WHERE coupon_id = ?")
      .bind(id),
    database.prepare("DELETE FROM coupons WHERE id = ?").bind(id),
  ]);
  if (!result[1]?.meta.changes) {
    throw new AdminApiError(404, "삭제할 쿠폰을 찾지 못했습니다.");
  }
  await writePromotionAudit(
    database,
    adminUsername,
    "coupon.delete",
    id,
    "쿠폰 삭제",
  );
}

export async function listCouponZoneCoupons(): Promise<CouponZoneRecord[]> {
  await ensurePromotionSchema();
  const result = await commerceDb()
    .prepare(
      `SELECT id, code, name, type, amount, minimum_order, starts_at,
              ends_at, active, zone_enabled, created_at, updated_at
       FROM coupons
       WHERE active = 1 AND zone_enabled = 1
       ORDER BY created_at DESC, id DESC
       LIMIT 100`,
    )
    .all<CouponDatabaseRow>();
  const today = koreaToday();
  return (result.results ?? [])
    .filter((coupon) => couponIsWithinPeriod(coupon, today))
    .map((coupon) => ({
      id: coupon.id,
      name: coupon.name,
      type: normalizedCouponType(coupon.type),
      amount: safeMoney(coupon.amount),
      minimumOrder: safeMoney(coupon.minimum_order),
      startsAt: coupon.starts_at ?? "",
      endsAt: coupon.ends_at ?? "",
    }));
}

export async function countAvailableCustomerCoupons(
  userId: string,
): Promise<number> {
  const normalizedUserId = parseId(userId, "회원");
  await ensurePromotionSchema();
  const today = koreaToday();
  const claimantKey = customerClaimantKey(normalizedUserId);
  const row = await commerceDb()
    .prepare(
      `SELECT COUNT(*) AS total
       FROM coupon_claims cc
       JOIN coupons c ON c.id = cc.coupon_id
       WHERE cc.user_id = ?
         AND c.active = 1
         AND c.zone_enabled = 1
         AND (c.starts_at IS NULL OR substr(c.starts_at, 1, 10) <= ?)
         AND (c.ends_at IS NULL OR substr(c.ends_at, 1, 10) >= ?)
         AND NOT EXISTS (
           SELECT 1 FROM coupon_redemptions cr
           WHERE cr.coupon_id = c.id AND cr.claimant_key = ?
         )`,
    )
    .bind(normalizedUserId, today, today, claimantKey)
    .first<{ total: number }>();
  return safeCount(row?.total);
}

export async function claimCouponForCustomer(
  couponId: string,
  userId: string,
): Promise<{ coupon: CouponZoneRecord; code: string; alreadyClaimed: boolean }> {
  const id = parseId(couponId, "쿠폰");
  const normalizedUserId = parseId(userId, "회원");
  await ensurePromotionSchema();
  const database = commerceDb();
  const coupon = await database
    .prepare(
      `SELECT id, code, name, type, amount, minimum_order, starts_at,
              ends_at, active, zone_enabled, created_at, updated_at
       FROM coupons WHERE id = ? LIMIT 1`,
    )
    .bind(id)
    .first<CouponDatabaseRow>();
  const today = koreaToday();
  if (
    !coupon ||
    !coupon.active ||
    !coupon.zone_enabled ||
    !couponIsWithinPeriod(coupon, today)
  ) {
    throw new CouponApplicationError(
      "현재 다운로드할 수 없는 쿠폰입니다.",
      409,
      "period",
    );
  }
  const claimantKey = customerClaimantKey(normalizedUserId);
  const redeemed = await database
    .prepare(
      `SELECT 1 FROM coupon_redemptions
       WHERE coupon_id = ? AND claimant_key = ? LIMIT 1`,
    )
    .bind(id, claimantKey)
    .first();
  if (redeemed) {
    throw new CouponApplicationError(
      "이미 사용한 쿠폰입니다.",
      409,
      "duplicate",
    );
  }
  const existing = await database
    .prepare(
      "SELECT 1 FROM coupon_claims WHERE coupon_id = ? AND user_id = ? LIMIT 1",
    )
    .bind(id, normalizedUserId)
    .first();
  await database
    .prepare(
      `INSERT OR IGNORE INTO coupon_claims (coupon_id, user_id)
       VALUES (?, ?)`,
    )
    .bind(id, normalizedUserId)
    .run();
  return {
    coupon: {
      id: coupon.id,
      name: coupon.name,
      type: normalizedCouponType(coupon.type),
      amount: safeMoney(coupon.amount),
      minimumOrder: safeMoney(coupon.minimum_order),
      startsAt: coupon.starts_at ?? "",
      endsAt: coupon.ends_at ?? "",
    },
    code: coupon.code,
    alreadyClaimed: Boolean(existing),
  };
}

export async function validateCouponForOrder(input: {
  code: string;
  subtotal: number;
  claimantKey?: string;
  userId?: string;
}): Promise<CouponApplication> {
  const code = normalizeCouponCode(input.code);
  if (!couponCodePattern.test(code)) {
    throw new CouponApplicationError(
      "쿠폰코드를 확인해 주세요.",
      400,
      "invalid",
    );
  }
  if (
    !Number.isSafeInteger(input.subtotal) ||
    input.subtotal < 0 ||
    input.subtotal > maximumMoney * 100
  ) {
    throw new CouponApplicationError(
      "주문금액을 확인해 주세요.",
      400,
      "invalid",
    );
  }
  await ensurePromotionSchema();
  const database = commerceDb();
  const coupon = await database
    .prepare(
      `SELECT id, code, name, type, amount, minimum_order, starts_at,
              ends_at, active, zone_enabled, created_at, updated_at
       FROM coupons WHERE code = ? LIMIT 1`,
    )
    .bind(code)
    .first<CouponDatabaseRow>();
  if (!coupon) {
    throw new CouponApplicationError(
      "등록되지 않은 쿠폰코드입니다.",
      404,
      "invalid",
    );
  }
  if (!coupon.active) {
    throw new CouponApplicationError(
      "현재 사용할 수 없는 쿠폰입니다.",
      409,
      "inactive",
    );
  }
  if (!couponIsWithinPeriod(coupon, koreaToday())) {
    throw new CouponApplicationError(
      "쿠폰 사용기간을 확인해 주세요.",
      409,
      "period",
    );
  }
  const minimumOrder = safeMoney(coupon.minimum_order);
  if (input.subtotal < minimumOrder) {
    throw new CouponApplicationError(
      `${minimumOrder.toLocaleString("ko-KR")}원 이상 주문할 때 사용할 수 있습니다.`,
      409,
      "minimum",
    );
  }
  if (coupon.zone_enabled) {
    if (!input.userId) {
      throw new CouponApplicationError(
        "쿠폰존 쿠폰은 로그인 후 사용할 수 있습니다.",
        401,
        "authentication",
      );
    }
    const claim = await database
      .prepare(
        "SELECT 1 FROM coupon_claims WHERE coupon_id = ? AND user_id = ? LIMIT 1",
      )
      .bind(coupon.id, input.userId)
      .first();
    if (!claim) {
      throw new CouponApplicationError(
        "쿠폰존에서 쿠폰을 먼저 다운로드해 주세요.",
        409,
        "claim",
      );
    }
  }
  if (input.claimantKey) {
    const previous = await database
      .prepare(
        `SELECT 1 FROM coupon_redemptions
         WHERE coupon_id = ? AND claimant_key = ? LIMIT 1`,
      )
      .bind(coupon.id, input.claimantKey)
      .first();
    if (previous) {
      throw new CouponApplicationError(
        "이미 사용한 쿠폰입니다.",
        409,
        "duplicate",
      );
    }
  }

  const type = normalizedCouponType(coupon.type);
  const amount = safeMoney(coupon.amount);
  const rawDiscount =
    type === "percent"
      ? Math.floor((input.subtotal * Math.min(amount, 100)) / 100)
      : amount;
  return {
    id: coupon.id,
    code: coupon.code,
    name: coupon.name,
    type,
    amount,
    minimumOrder,
    startsAt: coupon.starts_at ?? "",
    endsAt: coupon.ends_at ?? "",
    zoneEnabled: Boolean(coupon.zone_enabled),
    discount: Math.min(input.subtotal, Math.max(0, rawDiscount)),
  };
}

export function couponRedemptionStatement(
  database: D1Database,
  input: {
    application: CouponApplication;
    orderId: string;
    claimantKey: string;
    userId?: string;
    subtotal: number;
  },
): D1PreparedStatement {
  const coupon = input.application;
  const today = koreaToday();
  return database
    .prepare(
      `INSERT INTO coupon_redemptions (
         order_id, coupon_id, coupon_code, claimant_key,
         discount_amount, guard_value
       ) VALUES (
         ?, ?, ?, ?, ?,
         CASE WHEN EXISTS (
           SELECT 1
           FROM coupons c
           WHERE c.id = ? AND c.code = ? AND c.active = 1
             AND c.type = ? AND c.amount = ? AND c.minimum_order = ?
             AND COALESCE(c.starts_at, '') = ?
             AND COALESCE(c.ends_at, '') = ?
             AND c.zone_enabled = ?
             AND (c.starts_at IS NULL OR substr(c.starts_at, 1, 10) <= ?)
             AND (c.ends_at IS NULL OR substr(c.ends_at, 1, 10) >= ?)
             AND c.minimum_order <= ?
             AND (
               c.zone_enabled = 0 OR EXISTS (
                 SELECT 1 FROM coupon_claims cc
                 WHERE cc.coupon_id = c.id AND cc.user_id = ?
               )
             )
             AND NOT EXISTS (
               SELECT 1 FROM coupon_redemptions cr
               WHERE cr.coupon_id = c.id AND cr.claimant_key = ?
             )
         ) THEN 1 ELSE 0 END
       )`,
    )
    .bind(
      input.orderId,
      coupon.id,
      coupon.code,
      input.claimantKey,
      coupon.discount,
      coupon.id,
      coupon.code,
      coupon.type,
      coupon.amount,
      coupon.minimumOrder,
      coupon.startsAt,
      coupon.endsAt,
      coupon.zoneEnabled ? 1 : 0,
      today,
      today,
      input.subtotal,
      input.userId ?? "",
      input.claimantKey,
    );
}

export function customerClaimantKey(userId: string): string {
  return `user:${userId}`;
}

export function guestClaimantKey(email: string): string {
  return `guest:${email.trim().toLowerCase()}`;
}

export async function listAdminShippingRules(): Promise<
  AdditionalShippingRule[]
> {
  await ensurePromotionSchema();
  const result = await commerceDb()
    .prepare(
      `SELECT id, region_name, postcode_start, postcode_end, extra_fee,
              active, created_at, updated_at
       FROM additional_shipping_rules
       ORDER BY postcode_start ASC, postcode_end ASC, created_at ASC
       LIMIT 500`,
    )
    .all<ShippingRuleDatabaseRow>();
  return (result.results ?? []).map(mapShippingRule);
}

export async function createAdminShippingRule(
  input: unknown,
  adminUsername: string,
): Promise<AdditionalShippingRule> {
  const rule = parseShippingRuleInput(input);
  await ensurePromotionSchema();
  const database = commerceDb();
  await assertShippingRuleIsUnique(database, rule);
  const id = crypto.randomUUID();
  await database
    .prepare(
      `INSERT INTO additional_shipping_rules (
         id, region_name, postcode_start, postcode_end,
         extra_fee, active, created_by
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      rule.regionName,
      rule.postcodeStart,
      rule.postcodeEnd,
      rule.extraFee,
      rule.active ? 1 : 0,
      normalizedAdmin(adminUsername),
    )
    .run();
  await writePromotionAudit(
    database,
    adminUsername,
    "shipping_rule.create",
    id,
    `${rule.regionName} 추가배송비 등록`,
  );
  return requireShippingRule(await findShippingRule(database, id));
}

export async function updateAdminShippingRule(
  ruleId: string,
  input: unknown,
  adminUsername: string,
): Promise<AdditionalShippingRule> {
  const id = parseId(ruleId, "추가배송비");
  const rule = parseShippingRuleInput(input);
  await ensurePromotionSchema();
  const database = commerceDb();
  await assertShippingRuleIsUnique(database, rule, id);
  const result = await database
    .prepare(
      `UPDATE additional_shipping_rules
       SET region_name = ?, postcode_start = ?, postcode_end = ?,
           extra_fee = ?, active = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
    .bind(
      rule.regionName,
      rule.postcodeStart,
      rule.postcodeEnd,
      rule.extraFee,
      rule.active ? 1 : 0,
      id,
    )
    .run();
  if (!result.meta.changes) {
    throw new AdminApiError(404, "수정할 추가배송비 내역을 찾지 못했습니다.");
  }
  await writePromotionAudit(
    database,
    adminUsername,
    "shipping_rule.update",
    id,
    `${rule.regionName} 추가배송비 수정`,
  );
  return requireShippingRule(await findShippingRule(database, id));
}

export async function deleteAdminShippingRule(
  ruleId: string,
  adminUsername: string,
): Promise<void> {
  const id = parseId(ruleId, "추가배송비");
  await ensurePromotionSchema();
  const database = commerceDb();
  const result = await database
    .prepare("DELETE FROM additional_shipping_rules WHERE id = ?")
    .bind(id)
    .run();
  if (!result.meta.changes) {
    throw new AdminApiError(404, "삭제할 추가배송비 내역을 찾지 못했습니다.");
  }
  await writePromotionAudit(
    database,
    adminUsername,
    "shipping_rule.delete",
    id,
    "추가배송비 내역 삭제",
  );
}

export async function calculateShippingQuote(input: {
  baseFee: number;
  postcode: string;
  address: string;
}): Promise<ShippingQuote> {
  const baseFee = safeMoney(input.baseFee);
  const postcodeDigits = input.postcode.replace(/\D/gu, "");
  const postcode =
    postcodeDigits.length === 5 ? postcodeDigits : "";
  const normalizedAddress = normalizeAddress(input.address);
  await ensurePromotionSchema();
  const result = await commerceDb()
    .prepare(
      `SELECT id, region_name, postcode_start, postcode_end, extra_fee,
              active, created_at, updated_at
       FROM additional_shipping_rules
       WHERE active = 1
       ORDER BY extra_fee DESC, created_at ASC, id ASC
       LIMIT 500`,
    )
    .all<ShippingRuleDatabaseRow>();
  const matched = (result.results ?? []).find((rule) => {
    const postcodeMatches =
      postcodePattern.test(postcode) &&
      rule.postcode_start <= postcode &&
      rule.postcode_end >= postcode;
    const region = normalizeAddress(rule.region_name);
    const addressMatches =
      Boolean(normalizedAddress) &&
      region.length >= 2 &&
      normalizedAddress.includes(region);
    return postcodeMatches || addressMatches;
  });
  const additionalFee = matched ? safeMoney(matched.extra_fee) : 0;
  return {
    baseFee,
    additionalFee,
    totalFee: baseFee + additionalFee,
    ruleId: matched?.id ?? "",
    ruleName: matched?.region_name ?? "",
  };
}

function parseCouponInput(input: unknown): CouponInput {
  if (!isJsonObject(input)) {
    throw new AdminApiError(400, "쿠폰 입력 형식을 확인해 주세요.");
  }
  const errors: Record<string, string> = {};
  const code =
    typeof input.code === "string" ? normalizeCouponCode(input.code) : "";
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const type = input.type;
  const amount = normalizedInteger(input.amount);
  const minimumOrder = normalizedInteger(input.minimumOrder);
  const startsAt = parseAdminDate(input.startsAt, "startsAt", errors);
  const endsAt = parseAdminDate(input.endsAt, "endsAt", errors);
  if (!couponCodePattern.test(code)) {
    errors.code = "영문 대문자·숫자·하이픈으로 4~40자 이내로 입력해 주세요.";
  }
  if (!name || name.length > 100) {
    errors.name = "쿠폰이름은 1~100자로 입력해 주세요.";
  }
  if (type !== "fixed" && type !== "percent") {
    errors.type = "쿠폰종류를 선택해 주세요.";
  }
  if (
    amount === null ||
    amount < 1 ||
    amount > (type === "percent" ? 100 : maximumMoney)
  ) {
    errors.amount =
      type === "percent"
        ? "할인율은 1~100 사이의 정수로 입력해 주세요."
        : "할인금액은 1원 이상으로 입력해 주세요.";
  }
  if (
    minimumOrder === null ||
    minimumOrder < 0 ||
    minimumOrder > maximumMoney
  ) {
    errors.minimumOrder = "최소주문금액을 확인해 주세요.";
  }
  if (startsAt && endsAt && startsAt > endsAt) {
    errors.endsAt = "사용종료일은 사용시작일보다 빠를 수 없습니다.";
  }
  if (typeof input.active !== "boolean") {
    errors.active = "사용 여부를 선택해 주세요.";
  }
  if (typeof input.zoneEnabled !== "boolean") {
    errors.zoneEnabled = "쿠폰존 노출 여부를 선택해 주세요.";
  }
  if (Object.keys(errors).length > 0) {
    throw new AdminApiError(400, "쿠폰 입력 내용을 확인해 주세요.", errors);
  }
  return {
    code,
    name,
    type: type as CouponType,
    amount: amount!,
    minimumOrder: minimumOrder!,
    startsAt,
    endsAt,
    active: input.active as boolean,
    zoneEnabled: input.zoneEnabled as boolean,
  };
}

function parseShippingRuleInput(input: unknown): ShippingRuleInput {
  if (!isJsonObject(input)) {
    throw new AdminApiError(400, "추가배송비 입력 형식을 확인해 주세요.");
  }
  const errors: Record<string, string> = {};
  const regionName =
    typeof input.regionName === "string" ? input.regionName.trim() : "";
  const postcodeStart =
    typeof input.postcodeStart === "string"
      ? input.postcodeStart.replace(/\s/gu, "")
      : "";
  const postcodeEnd =
    typeof input.postcodeEnd === "string"
      ? input.postcodeEnd.replace(/\s/gu, "")
      : "";
  const extraFee = normalizedInteger(input.extraFee);
  if (!regionName || regionName.length > 80) {
    errors.regionName = "지역명은 1~80자로 입력해 주세요.";
  }
  if (!postcodePattern.test(postcodeStart)) {
    errors.postcodeStart = "우편번호 시작은 5자리 숫자로 입력해 주세요.";
  }
  if (!postcodePattern.test(postcodeEnd)) {
    errors.postcodeEnd = "우편번호 끝은 5자리 숫자로 입력해 주세요.";
  }
  if (
    postcodePattern.test(postcodeStart) &&
    postcodePattern.test(postcodeEnd) &&
    postcodeStart > postcodeEnd
  ) {
    errors.postcodeEnd =
      "우편번호 끝은 우편번호 시작보다 작을 수 없습니다.";
  }
  if (extraFee === null || extraFee < 0 || extraFee > maximumMoney) {
    errors.extraFee = "추가배송비는 0원 이상의 정수로 입력해 주세요.";
  }
  if (typeof input.active !== "boolean") {
    errors.active = "사용 여부를 선택해 주세요.";
  }
  if (Object.keys(errors).length > 0) {
    throw new AdminApiError(
      400,
      "추가배송비 입력 내용을 확인해 주세요.",
      errors,
    );
  }
  return {
    regionName,
    postcodeStart,
    postcodeEnd,
    extraFee: extraFee!,
    active: input.active as boolean,
  };
}

function parseAdminDate(
  value: unknown,
  field: string,
  errors: Record<string, string>,
): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    errors[field] = "날짜를 YYYY-MM-DD 형식으로 입력해 주세요.";
    return null;
  }
  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    errors[field] = "올바른 날짜를 입력해 주세요.";
    return null;
  }
  return value;
}

async function assertShippingRuleIsUnique(
  database: D1Database,
  rule: ShippingRuleInput,
  excludingId = "",
): Promise<void> {
  const duplicate = await database
    .prepare(
      `SELECT id FROM additional_shipping_rules
       WHERE region_name = ? AND postcode_start = ? AND postcode_end = ?
         AND id <> ?
       LIMIT 1`,
    )
    .bind(
      rule.regionName,
      rule.postcodeStart,
      rule.postcodeEnd,
      excludingId,
    )
    .first();
  if (duplicate) {
    throw new AdminApiError(409, "같은 지역과 우편번호 구간이 이미 있습니다.");
  }
}

async function findAdminCoupon(
  database: D1Database,
  couponId: string,
): Promise<AdminCouponRecord | null> {
  const row = await database
    .prepare(
      `SELECT c.id, c.code, c.name, c.type, c.amount, c.minimum_order,
              c.starts_at, c.ends_at, c.active, c.zone_enabled,
              c.created_at, c.updated_at,
              (SELECT COUNT(*) FROM coupon_claims cc
               WHERE cc.coupon_id = c.id) AS claim_count,
              (SELECT COUNT(*) FROM coupon_redemptions cr
               WHERE cr.coupon_id = c.id) AS redemption_count
       FROM coupons c WHERE c.id = ? LIMIT 1`,
    )
    .bind(couponId)
    .first<CouponDatabaseRow>();
  return row ? mapAdminCoupon(row) : null;
}

async function findShippingRule(
  database: D1Database,
  ruleId: string,
): Promise<AdditionalShippingRule | null> {
  const row = await database
    .prepare(
      `SELECT id, region_name, postcode_start, postcode_end, extra_fee,
              active, created_at, updated_at
       FROM additional_shipping_rules WHERE id = ? LIMIT 1`,
    )
    .bind(ruleId)
    .first<ShippingRuleDatabaseRow>();
  return row ? mapShippingRule(row) : null;
}

function mapAdminCoupon(row: CouponDatabaseRow): AdminCouponRecord {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    type: normalizedCouponType(row.type),
    amount: safeMoney(row.amount),
    minimumOrder: safeMoney(row.minimum_order),
    startsAt: row.starts_at ?? "",
    endsAt: row.ends_at ?? "",
    active: Boolean(row.active),
    zoneEnabled: Boolean(row.zone_enabled),
    claimCount: safeCount(row.claim_count),
    redemptionCount: safeCount(row.redemption_count),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapShippingRule(
  row: ShippingRuleDatabaseRow,
): AdditionalShippingRule {
  return {
    id: row.id,
    regionName: row.region_name,
    postcodeStart: row.postcode_start,
    postcodeEnd: row.postcode_end,
    extraFee: safeMoney(row.extra_fee),
    active: Boolean(row.active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function requireCoupon(
  value: AdminCouponRecord | null,
): AdminCouponRecord {
  if (!value) throw new Error("저장된 쿠폰을 찾지 못했습니다.");
  return value;
}

function requireShippingRule(
  value: AdditionalShippingRule | null,
): AdditionalShippingRule {
  if (!value) throw new Error("저장된 추가배송비 내역을 찾지 못했습니다.");
  return value;
}

function normalizedCouponType(value: string): CouponType {
  return value === "percent" ? "percent" : "fixed";
}

function normalizeCouponCode(value: string): string {
  return value.trim().toUpperCase();
}

function normalizedInteger(value: unknown): number | null {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    !Number.isFinite(value)
  ) {
    return null;
  }
  return value;
}

function safeMoney(value: unknown): number {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : 0;
}

function safeCount(value: unknown): number {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : 0;
}

function couponIsWithinPeriod(
  coupon: Pick<CouponDatabaseRow, "starts_at" | "ends_at">,
  today: string,
): boolean {
  const startsAt = coupon.starts_at?.slice(0, 10) ?? "";
  const endsAt = coupon.ends_at?.slice(0, 10) ?? "";
  return (!startsAt || startsAt <= today) && (!endsAt || endsAt >= today);
}

function koreaToday(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: "year" | "month" | "day") =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function parseId(value: string, label: string): string {
  const normalized = value.trim();
  if (
    !normalized ||
    normalized.length > 120 ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(normalized)
  ) {
    throw new AdminApiError(400, `${label} 식별값을 확인해 주세요.`);
  }
  return normalized;
}

function normalizedAdmin(value: string): string {
  return value.trim().slice(0, 100);
}

function normalizeAddress(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, "").toLowerCase();
}

function isCouponCodeConflict(error: unknown): boolean {
  return (
    error instanceof Error &&
    /coupons_code_uq|coupons\.code|unique constraint/iu.test(error.message)
  );
}

async function writePromotionAudit(
  database: D1Database,
  adminUsername: string,
  action: string,
  entityId: string,
  details: string,
): Promise<void> {
  await database
    .prepare(
      `INSERT INTO admin_audit_logs (
         action, entity_type, entity_id, details
       ) VALUES (?, 'promotion', ?, ?)`,
    )
    .bind(
      action,
      entityId,
      `${details} · 관리자 ${normalizedAdmin(adminUsername)}`,
    )
    .run();
}
