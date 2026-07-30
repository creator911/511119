import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const timestamps = () => ({
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

const createdTimestamp = () => ({
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const categories = sqliteTable(
  "categories",
  {
    id: text("id").primaryKey(),
    parentId: text("parent_id"),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    ...timestamps(),
  },
  (table) => [
    index("categories_parent_idx").on(table.parentId),
    index("categories_sort_idx").on(table.sortOrder),
  ],
);

export const categoryChanges = sqliteTable(
  "category_changes",
  {
    categoryId: text("category_id").primaryKey(),
    changeType: text("change_type").notNull(),
    payloadJson: text("payload_json").notNull().default("{}"),
    revision: integer("revision").notNull().default(1),
    updatedBy: text("updated_by").notNull().default(""),
    ...timestamps(),
  },
  (table) => [
    index("category_changes_type_idx").on(table.changeType),
    index("category_changes_updated_idx").on(table.updatedAt),
  ],
);

export const products = sqliteTable(
  "products",
  {
    id: text("id").primaryKey(),
    categoryId: text("category_id").notNull(),
    name: text("name").notNull(),
    basic: text("basic").notNull().default(""),
    detailHtml: text("detail_html").notNull().default(""),
    price: integer("price").notNull().default(0),
    originalPrice: integer("original_price").notNull().default(0),
    stock: integer("stock").notNull().default(0),
    maker: text("maker").notNull().default(""),
    origin: text("origin").notNull().default(""),
    brand: text("brand").notNull().default(""),
    model: text("model").notNull().default(""),
    imagesJson: text("images_json").notNull().default("[]"),
    hit: integer("hit", { mode: "boolean" }).notNull().default(false),
    recommend: integer("recommend", { mode: "boolean" }).notNull().default(false),
    isNew: integer("is_new", { mode: "boolean" }).notNull().default(false),
    popular: integer("popular", { mode: "boolean" }).notNull().default(false),
    sale: integer("sale", { mode: "boolean" }).notNull().default(false),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    ...timestamps(),
  },
  (table) => [
    index("products_category_idx").on(table.categoryId),
    index("products_active_idx").on(table.active),
    index("products_price_idx").on(table.price),
    index("products_updated_idx").on(table.updatedAt),
  ],
);

export const productChanges = sqliteTable(
  "product_changes",
  {
    productId: text("product_id").primaryKey(),
    changeType: text("change_type").notNull(),
    payloadJson: text("payload_json").notNull().default("{}"),
    revision: integer("revision").notNull().default(1),
    updatedBy: text("updated_by").notNull().default(""),
    ...timestamps(),
  },
  (table) => [
    index("product_changes_type_idx").on(table.changeType),
    index("product_changes_updated_idx").on(table.updatedAt),
  ],
);

export const bannerChanges = sqliteTable(
  "banner_changes",
  {
    bannerId: text("banner_id").primaryKey(),
    changeType: text("change_type").notNull(),
    payloadJson: text("payload_json").notNull().default("{}"),
    revision: integer("revision").notNull().default(1),
    updatedBy: text("updated_by").notNull().default(""),
    ...timestamps(),
  },
  (table) => [
    index("banner_changes_type_idx").on(table.changeType),
    index("banner_changes_updated_idx").on(table.updatedAt),
  ],
);

export const productStock = sqliteTable(
  "product_stock",
  {
    productId: text("product_id").primaryKey(),
    stock: integer("stock").notNull().default(0),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    check("product_stock_nonnegative_check", sql`${table.stock} >= 0`),
  ],
);

export const productStockControls = sqliteTable(
  "product_stock_controls",
  {
    productId: text("product_id").primaryKey(),
    notificationQty: integer("notification_qty").notNull().default(0),
    saleEnabled: integer("sale_enabled", { mode: "boolean" })
      .notNull()
      .default(true),
    soldOut: integer("sold_out", { mode: "boolean" })
      .notNull()
      .default(false),
    restockNotification: integer("restock_notification", {
      mode: "boolean",
    })
      .notNull()
      .default(false),
    revision: integer("revision").notNull().default(1),
    updatedBy: text("updated_by").notNull().default(""),
    ...timestamps(),
  },
  (table) => [
    check(
      "product_stock_controls_notification_check",
      sql`${table.notificationQty} >= 0`,
    ),
    check(
      "product_stock_controls_sale_check",
      sql`${table.saleEnabled} IN (0, 1)`,
    ),
    check(
      "product_stock_controls_soldout_check",
      sql`${table.soldOut} IN (0, 1)`,
    ),
    check(
      "product_stock_controls_restock_check",
      sql`${table.restockNotification} IN (0, 1)`,
    ),
  ],
);

export const productStockWriteGuards = sqliteTable(
  "product_stock_write_guards",
  {
    productId: text("product_id").primaryKey(),
    guardValue: integer("guard_value").notNull(),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    check(
      "product_stock_write_guards_value_check",
      sql`${table.guardValue} = 1`,
    ),
  ],
);

export const productTypeWriteGuards = sqliteTable(
  "product_type_write_guards",
  {
    operationId: text("operation_id").primaryKey(),
    productId: text("product_id").notNull(),
    guardValue: integer("guard_value").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("product_type_write_guards_product_idx").on(table.productId),
    check(
      "product_type_write_guards_value_check",
      sql`${table.guardValue} = 1`,
    ),
  ],
);

export const productOptions = sqliteTable(
  "product_options",
  {
    id: text("id").primaryKey(),
    productId: text("product_id").notNull(),
    optionName: text("option_name").notNull(),
    optionValue: text("option_value").notNull(),
    priceDelta: integer("price_delta").notNull().default(0),
    stock: integer("stock").notNull().default(0),
    saleEnabled: integer("sale_enabled", { mode: "boolean" })
      .notNull()
      .default(true),
    soldOut: integer("sold_out", { mode: "boolean" })
      .notNull()
      .default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    deleted: integer("deleted", { mode: "boolean" })
      .notNull()
      .default(false),
    revision: integer("revision").notNull().default(1),
    updatedBy: text("updated_by").notNull().default(""),
    ...timestamps(),
  },
  (table) => [
    index("product_options_product_idx").on(
      table.productId,
      table.deleted,
      table.sortOrder,
    ),
    uniqueIndex("product_options_active_value_uq")
      .on(table.productId, table.optionName, table.optionValue)
      .where(sql`${table.deleted} = 0`),
    check("product_options_stock_check", sql`${table.stock} >= 0`),
    check(
      "product_options_sale_check",
      sql`${table.saleEnabled} IN (0, 1)`,
    ),
    check(
      "product_options_soldout_check",
      sql`${table.soldOut} IN (0, 1)`,
    ),
    check(
      "product_options_deleted_check",
      sql`${table.deleted} IN (0, 1)`,
    ),
    check("product_options_revision_check", sql`${table.revision} >= 1`),
  ],
);

export const productOptionSets = sqliteTable("product_option_sets", {
  productId: text("product_id").primaryKey(),
  revision: integer("revision").notNull().default(1),
  updatedBy: text("updated_by").notNull().default(""),
  ...timestamps(),
});

export const productOptionWriteGuards = sqliteTable(
  "product_option_write_guards",
  {
    operationId: text("operation_id").primaryKey(),
    optionId: text("option_id").notNull(),
    guardValue: integer("guard_value").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("product_option_write_guards_option_idx").on(table.optionId),
    check(
      "product_option_write_guards_value_check",
      sql`${table.guardValue} = 1`,
    ),
  ],
);

export const orderOptionItems = sqliteTable(
  "order_option_items",
  {
    orderId: text("order_id").notNull(),
    optionId: text("option_id").notNull(),
    productId: text("product_id").notNull(),
    quantity: integer("quantity").notNull(),
    optionName: text("option_name").notNull(),
    optionValue: text("option_value").notNull(),
    priceDelta: integer("price_delta").notNull().default(0),
    ...createdTimestamp(),
  },
  (table) => [
    primaryKey({ columns: [table.orderId, table.optionId] }),
    index("order_option_items_product_idx").on(table.productId),
    check("order_option_items_quantity_check", sql`${table.quantity} > 0`),
  ],
);

export const orderOptionGuards = sqliteTable(
  "order_option_guards",
  {
    orderId: text("order_id").notNull(),
    optionId: text("option_id").notNull(),
    guardValue: integer("guard_value").notNull(),
    ...createdTimestamp(),
  },
  (table) => [
    primaryKey({ columns: [table.orderId, table.optionId] }),
    check(
      "order_option_guards_value_check",
      sql`${table.guardValue} = 1`,
    ),
  ],
);

export const restockRequests = sqliteTable(
  "restock_requests",
  {
    id: text("id").primaryKey(),
    productId: text("product_id").notNull(),
    phone: text("phone").notNull(),
    phoneHash: text("phone_hash").notNull(),
    status: text("status").notNull().default("waiting_provider"),
    revision: integer("revision").notNull().default(1),
    adminMemo: text("admin_memo").notNull().default(""),
    ...timestamps(),
  },
  (table) => [
    index("restock_requests_product_idx").on(
      table.productId,
      table.createdAt,
    ),
    index("restock_requests_status_idx").on(table.status, table.createdAt),
    uniqueIndex("restock_requests_active_uq")
      .on(table.productId, table.phoneHash)
      .where(
        sql`${table.status} IN ('waiting_provider', 'queued')`,
      ),
    check(
      "restock_requests_status_check",
      sql`${table.status} IN ('waiting_provider', 'queued', 'sent', 'failed', 'cancelled')`,
    ),
    check("restock_requests_revision_check", sql`${table.revision} >= 1`),
  ],
);

export const restockSmsQueue = sqliteTable(
  "restock_sms_queue",
  {
    id: text("id").primaryKey(),
    requestId: text("request_id").notNull(),
    status: text("status").notNull().default("waiting_provider"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error").notNull().default(""),
    revision: integer("revision").notNull().default(1),
    queuedAt: text("queued_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    sentAt: text("sent_at"),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("restock_sms_queue_request_uq").on(table.requestId),
    index("restock_sms_queue_status_idx").on(table.status, table.queuedAt),
    check(
      "restock_sms_queue_status_check",
      sql`${table.status} IN ('waiting_provider', 'queued', 'sent', 'failed', 'cancelled')`,
    ),
    check("restock_sms_queue_attempts_check", sql`${table.attempts} >= 0`),
    check("restock_sms_queue_revision_check", sql`${table.revision} >= 1`),
  ],
);

export const restockRequestRateLimits = sqliteTable(
  "restock_request_rate_limits",
  {
    clientKey: text("client_key").notNull(),
    windowStart: integer("window_start").notNull(),
    attempts: integer("attempts").notNull().default(0),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    primaryKey({ columns: [table.clientKey, table.windowStart] }),
    check(
      "restock_request_rate_limits_attempts_check",
      sql`${table.attempts} >= 0`,
    ),
  ],
);

export const restockWriteGuards = sqliteTable(
  "restock_write_guards",
  {
    operationId: text("operation_id").primaryKey(),
    requestId: text("request_id").notNull(),
    guardValue: integer("guard_value").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("restock_write_guards_request_idx").on(table.requestId),
    check(
      "restock_write_guards_value_check",
      sql`${table.guardValue} = 1`,
    ),
  ],
);

export const banners = sqliteTable(
  "banners",
  {
    id: text("id").primaryKey(),
    image: text("image").notNull(),
    mobileImage: text("mobile_image").notNull().default(""),
    href: text("href").notNull().default("/shop"),
    alt: text("alt").notNull().default(""),
    sortOrder: integer("sort_order").notNull().default(0),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    ...timestamps(),
  },
  (table) => [index("banners_sort_idx").on(table.sortOrder)],
);

export const siteSettings = sqliteTable("site_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const legacyShopSettings = sqliteTable(
  "legacy_shop_settings",
  {
    id: integer("id").primaryKey(),
    valuesJson: text("values_json").notNull().default("{}"),
    revision: integer("revision").notNull().default(1),
    updatedBy: text("updated_by").notNull().default(""),
    ...timestamps(),
  },
  (table) => [
    check("legacy_shop_settings_id_check", sql`${table.id} = 1`),
    check(
      "legacy_shop_settings_revision_check",
      sql`${table.revision} >= 1`,
    ),
  ],
);

export const legacyShopWriteGuards = sqliteTable(
  "legacy_shop_write_guards",
  {
    operationId: text("operation_id").primaryKey(),
    guardValue: integer("guard_value").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    check(
      "legacy_shop_write_guards_value_check",
      sql`${table.guardValue} = 1`,
    ),
  ],
);

export const mediaAssets = sqliteTable(
  "media_assets",
  {
    id: text("id").primaryKey(),
    objectKey: text("object_key").notNull(),
    fileName: text("file_name").notNull(),
    contentType: text("content_type").notNull(),
    size: integer("size").notNull().default(0),
    alt: text("alt").notNull().default(""),
    ...createdTimestamp(),
  },
  (table) => [uniqueIndex("media_assets_object_key_uq").on(table.objectKey)],
);

export const admins = sqliteTable(
  "admins",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    username: text("username").notNull(),
    passwordHash: text("password_hash").notNull(),
    memberUserId: text("member_user_id"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    permissionsJson: text("permissions_json").notNull().default("[]"),
    sessionVersion: integer("session_version").notNull().default(1),
    lastLoginAt: text("last_login_at"),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("admins_username_uq").on(table.username),
    index("admins_active_idx").on(table.active, table.username),
    index("admins_member_user_idx").on(table.memberUserId),
  ],
);

export const adminMenuPermissions = sqliteTable(
  "admin_menu_permissions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    adminId: integer("admin_id").notNull(),
    menuCode: text("menu_code").notNull(),
    authFlags: text("auth_flags").notNull(),
    revision: integer("revision").notNull().default(1),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("admin_menu_permissions_admin_menu_uq").on(
      table.adminId,
      table.menuCode,
    ),
    index("admin_menu_permissions_admin_idx").on(
      table.adminId,
      table.menuCode,
    ),
    check(
      "admin_menu_permissions_revision_check",
      sql`${table.revision} >= 1`,
    ),
  ],
);

export const adminPermissionChallenges = sqliteTable(
  "admin_permission_challenges",
  {
    id: text("id").primaryKey(),
    adminUsername: text("admin_username").notNull(),
    answerHash: text("answer_hash").notNull(),
    expiresAt: integer("expires_at").notNull(),
    ...createdTimestamp(),
  },
  (table) => [
    index("admin_permission_challenges_expiry_idx").on(table.expiresAt),
  ],
);

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    loginId: text("login_id").notNull(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    name: text("name").notNull(),
    nickname: text("nickname").notNull().default(""),
    phone: text("phone").notNull().default(""),
    telephone: text("telephone").notNull().default(""),
    homepage: text("homepage").notNull().default(""),
    postcode: text("postcode").notNull().default(""),
    address1: text("address1").notNull().default(""),
    address2: text("address2").notNull().default(""),
    address3: text("address3").notNull().default(""),
    adminMemo: text("admin_memo").notNull().default(""),
    identityMethod: text("identity_method").notNull().default("none"),
    identityVerified: integer("identity_verified", { mode: "boolean" })
      .notNull()
      .default(false),
    emailVerified: integer("email_verified", { mode: "boolean" })
      .notNull()
      .default(false),
    adultVerified: integer("adult_verified", { mode: "boolean" })
      .notNull()
      .default(false),
    publicProfile: integer("public_profile", { mode: "boolean" })
      .notNull()
      .default(false),
    memberSignature: text("member_signature").notNull().default(""),
    memberProfile: text("member_profile").notNull().default(""),
    verificationHistory: text("verification_history").notNull().default(""),
    withdrawnAt: text("withdrawn_at").notNull().default(""),
    blockedAt: text("blocked_at").notNull().default(""),
    memberIcon: text("member_icon").notNull().default(""),
    memberImage: text("member_image").notNull().default(""),
    extra1: text("extra1").notNull().default(""),
    extra2: text("extra2").notNull().default(""),
    extra3: text("extra3").notNull().default(""),
    extra4: text("extra4").notNull().default(""),
    extra5: text("extra5").notNull().default(""),
    extra6: text("extra6").notNull().default(""),
    extra7: text("extra7").notNull().default(""),
    extra8: text("extra8").notNull().default(""),
    extra9: text("extra9").notNull().default(""),
    extra10: text("extra10").notNull().default(""),
    points: integer("points").notNull().default(0),
    level: integer("level").notNull().default(1),
    emailOptIn: integer("email_opt_in", { mode: "boolean" }).notNull().default(false),
    smsOptIn: integer("sms_opt_in", { mode: "boolean" }).notNull().default(false),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    lastLoginAt: text("last_login_at"),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("users_login_id_uq").on(table.loginId),
    uniqueIndex("users_email_uq").on(table.email),
    index("users_created_idx").on(table.createdAt),
  ],
);

export const adminPointLedger = sqliteTable(
  "admin_point_ledger",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    delta: integer("delta").notNull(),
    balanceBefore: integer("balance_before").notNull(),
    balanceAfter: integer("balance_after").notNull(),
    reason: text("reason").notNull(),
    expiresAt: text("expires_at"),
    revision: integer("revision").notNull().default(1),
    adminUsername: text("admin_username").notNull().default(""),
    deletedAt: text("deleted_at"),
    deletedBy: text("deleted_by").notNull().default(""),
    deleteReason: text("delete_reason").notNull().default(""),
    ...createdTimestamp(),
  },
  (table) => [
    index("admin_point_ledger_user_idx").on(table.userId, table.createdAt),
    index("admin_point_ledger_active_idx").on(
      table.deletedAt,
      table.createdAt,
    ),
    check("admin_point_ledger_delta_check", sql`${table.delta} <> 0`),
    check(
      "admin_point_ledger_before_check",
      sql`${table.balanceBefore} >= 0 AND ${table.balanceBefore} <= 9007199254740991`,
    ),
    check(
      "admin_point_ledger_after_check",
      sql`${table.balanceAfter} >= 0 AND ${table.balanceAfter} <= 9007199254740991`,
    ),
    check(
      "admin_point_ledger_balance_check",
      sql`${table.balanceAfter} = ${table.balanceBefore} + ${table.delta}`,
    ),
    check(
      "admin_point_ledger_revision_check",
      sql`${table.revision} >= 1`,
    ),
  ],
);

export const adminPointWriteGuards = sqliteTable(
  "admin_point_write_guards",
  {
    operationId: text("operation_id").primaryKey(),
    targetId: text("target_id").notNull(),
    guardValue: integer("guard_value").notNull(),
    ...createdTimestamp(),
  },
  (table) => [
    check(
      "admin_point_write_guards_value_check",
      sql`${table.guardValue} = 1`,
    ),
  ],
);

export const cartItems = sqliteTable(
  "cart_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ownerKey: text("owner_key").notNull(),
    productId: text("product_id").notNull(),
    quantity: integer("quantity").notNull().default(1),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("cart_items_owner_product_uq").on(table.ownerKey, table.productId),
    index("cart_items_owner_idx").on(table.ownerKey),
  ],
);

export const wishlistItems = sqliteTable(
  "wishlist_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ownerKey: text("owner_key").notNull(),
    productId: text("product_id").notNull(),
    ...createdTimestamp(),
  },
  (table) => [
    uniqueIndex("wishlist_owner_product_uq").on(table.ownerKey, table.productId),
    index("wishlist_owner_idx").on(table.ownerKey),
  ],
);

export const coupons = sqliteTable(
  "coupons",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    type: text("type").notNull().default("fixed"),
    amount: integer("amount").notNull().default(0),
    minimumOrder: integer("minimum_order").notNull().default(0),
    startsAt: text("starts_at"),
    endsAt: text("ends_at"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    zoneEnabled: integer("zone_enabled", { mode: "boolean" })
      .notNull()
      .default(false),
    ...timestamps(),
  },
  (table) => [uniqueIndex("coupons_code_uq").on(table.code)],
);

export const couponClaims = sqliteTable(
  "coupon_claims",
  {
    couponId: text("coupon_id").notNull(),
    userId: text("user_id").notNull(),
    claimedAt: text("claimed_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    primaryKey({ columns: [table.couponId, table.userId] }),
    index("coupon_claims_user_idx").on(table.userId, table.claimedAt),
  ],
);

export const couponRedemptions = sqliteTable(
  "coupon_redemptions",
  {
    orderId: text("order_id").primaryKey(),
    couponId: text("coupon_id").notNull(),
    couponCode: text("coupon_code").notNull(),
    claimantKey: text("claimant_key").notNull(),
    discountAmount: integer("discount_amount").notNull(),
    guardValue: integer("guard_value").notNull(),
    ...createdTimestamp(),
  },
  (table) => [
    uniqueIndex("coupon_redemptions_customer_uq").on(
      table.couponId,
      table.claimantKey,
    ),
    index("coupon_redemptions_coupon_idx").on(
      table.couponId,
      table.createdAt,
    ),
    check(
      "coupon_redemptions_discount_check",
      sql`${table.discountAmount} >= 0`,
    ),
    check(
      "coupon_redemptions_guard_check",
      sql`${table.guardValue} = 1`,
    ),
  ],
);

export const additionalShippingRules = sqliteTable(
  "additional_shipping_rules",
  {
    id: text("id").primaryKey(),
    regionName: text("region_name").notNull(),
    postcodeStart: text("postcode_start").notNull(),
    postcodeEnd: text("postcode_end").notNull(),
    extraFee: integer("extra_fee").notNull().default(0),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdBy: text("created_by").notNull().default(""),
    ...timestamps(),
  },
  (table) => [
    index("additional_shipping_rules_range_idx").on(
      table.active,
      table.postcodeStart,
      table.postcodeEnd,
    ),
    check(
      "additional_shipping_rules_fee_check",
      sql`${table.extraFee} >= 0`,
    ),
  ],
);

export const orders = sqliteTable(
  "orders",
  {
    id: text("id").primaryKey(),
    userId: text("user_id"),
    email: text("email").notNull(),
    ordererName: text("orderer_name").notNull(),
    ordererPhone: text("orderer_phone").notNull(),
    ordererPostcode: text("orderer_postcode").notNull().default(""),
    ordererAddress1: text("orderer_address1").notNull().default(""),
    ordererAddress2: text("orderer_address2").notNull().default(""),
    recipientName: text("recipient_name").notNull(),
    recipientPhone: text("recipient_phone").notNull(),
    postcode: text("postcode").notNull().default(""),
    address1: text("address1").notNull(),
    address2: text("address2").notNull().default(""),
    memo: text("memo").notNull().default(""),
    subtotal: integer("subtotal").notNull().default(0),
    shippingFee: integer("shipping_fee").notNull().default(0),
    discount: integer("discount").notNull().default(0),
    total: integer("total").notNull().default(0),
    paymentMethod: text("payment_method").notNull().default("bank"),
    paymentStatus: text("payment_status").notNull().default("pending"),
    status: text("status").notNull().default("ordered"),
    shippingCarrier: text("shipping_carrier").notNull().default(""),
    trackingNumber: text("tracking_number").notNull().default(""),
    refundAmount: integer("refund_amount").notNull().default(0),
    adminMemo: text("admin_memo").notNull().default(""),
    ...timestamps(),
  },
  (table) => [
    index("orders_user_idx").on(table.userId),
    index("orders_email_idx").on(table.email),
    index("orders_status_idx").on(table.status),
    index("orders_created_idx").on(table.createdAt),
  ],
);

export const orderItems = sqliteTable(
  "order_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    orderId: text("order_id").notNull(),
    productId: text("product_id").notNull(),
    productName: text("product_name").notNull(),
    productImage: text("product_image").notNull().default(""),
    unitPrice: integer("unit_price").notNull(),
    quantity: integer("quantity").notNull(),
    lineTotal: integer("line_total").notNull(),
    ...createdTimestamp(),
  },
  (table) => [index("order_items_order_idx").on(table.orderId)],
);

export const reviews = sqliteTable(
  "reviews",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    productId: text("product_id").notNull(),
    userId: text("user_id"),
    authorName: text("author_name").notNull(),
    rating: integer("rating").notNull().default(5),
    title: text("title").notNull().default(""),
    content: text("content").notNull(),
    visible: integer("visible", { mode: "boolean" }).notNull().default(true),
    ...timestamps(),
  },
  (table) => [
    index("reviews_product_idx").on(table.productId),
    index("reviews_created_idx").on(table.createdAt),
  ],
);

export const questions = sqliteTable(
  "questions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    productId: text("product_id"),
    userId: text("user_id"),
    authorName: text("author_name").notNull(),
    email: text("email").notNull().default(""),
    title: text("title").notNull(),
    content: text("content").notNull(),
    answer: text("answer").notNull().default(""),
    answeredAt: text("answered_at"),
    secret: integer("secret", { mode: "boolean" }).notNull().default(false),
    visible: integer("visible", { mode: "boolean" }).notNull().default(true),
    ...timestamps(),
  },
  (table) => [
    index("questions_product_idx").on(table.productId),
    index("questions_created_idx").on(table.createdAt),
  ],
);

export const faqs = sqliteTable(
  "faqs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    category: text("category").notNull().default("general"),
    question: text("question").notNull(),
    answer: text("answer").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    ...timestamps(),
  },
  (table) => [index("faqs_sort_idx").on(table.sortOrder)],
);

export const contentPages = sqliteTable("content_pages", {
  slug: text("slug").primaryKey(),
  title: text("title").notNull(),
  contentHtml: text("content_html").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const chargeRequests = sqliteTable(
  "charge_requests",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    amount: integer("amount").notNull(),
    depositorName: text("depositor_name").notNull(),
    status: text("status").notNull().default("requested"),
    adminMemo: text("admin_memo").notNull().default(""),
    ...timestamps(),
  },
  (table) => [
    index("charge_requests_user_idx").on(table.userId),
    index("charge_requests_status_idx").on(table.status),
  ],
);

export const withdrawalRequests = sqliteTable(
  "withdrawal_requests",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    amount: integer("amount").notNull(),
    bankName: text("bank_name").notNull(),
    accountNumber: text("account_number").notNull(),
    accountHolder: text("account_holder").notNull(),
    status: text("status").notNull().default("requested"),
    adminMemo: text("admin_memo").notNull().default(""),
    ...timestamps(),
  },
  (table) => [
    index("withdrawal_requests_user_idx").on(table.userId),
    index("withdrawal_requests_status_idx").on(table.status),
  ],
);

export const walletRequestRateLimits = sqliteTable(
  "wallet_request_rate_limits",
  {
    userId: text("user_id").notNull(),
    requestType: text("request_type").notNull(),
    windowStart: integer("window_start").notNull(),
    attempts: integer("attempts").notNull().default(0),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    primaryKey({
      columns: [table.userId, table.requestType, table.windowStart],
    }),
  ],
);

export const walletProcessingGuards = sqliteTable(
  "wallet_processing_guards",
  {
    requestType: text("request_type").notNull(),
    requestId: text("request_id").notNull(),
    transitionGuard: integer("transition_guard").notNull(),
    balanceGuard: integer("balance_guard").notNull(),
    ...createdTimestamp(),
  },
  (table) => [
    primaryKey({ columns: [table.requestType, table.requestId] }),
    check(
      "wallet_processing_guards_type_check",
      sql`${table.requestType} IN ('charge', 'withdrawal')`,
    ),
    check(
      "wallet_processing_guards_transition_check",
      sql`${table.transitionGuard} = 1`,
    ),
    check(
      "wallet_processing_guards_balance_check",
      sql`${table.balanceGuard} = 1`,
    ),
  ],
);

export const walletLedger = sqliteTable(
  "wallet_ledger",
  {
    id: text("id").primaryKey(),
    requestType: text("request_type").notNull(),
    requestId: text("request_id").notNull(),
    userId: text("user_id").notNull(),
    delta: integer("delta").notNull(),
    balanceAfter: integer("balance_after").notNull(),
    adminUsername: text("admin_username").notNull().default(""),
    ...createdTimestamp(),
  },
  (table) => [
    uniqueIndex("wallet_ledger_request_uq").on(
      table.requestType,
      table.requestId,
    ),
    index("wallet_ledger_user_idx").on(table.userId, table.createdAt),
    check(
      "wallet_ledger_type_check",
      sql`${table.requestType} IN ('charge', 'withdrawal')`,
    ),
    check("wallet_ledger_delta_check", sql`${table.delta} <> 0`),
    check(
      "wallet_ledger_balance_check",
      sql`${table.balanceAfter} >= 0`,
    ),
  ],
);

export const adminAuditLogs = sqliteTable(
  "admin_audit_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    adminId: integer("admin_id"),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull().default(""),
    details: text("details").notNull().default(""),
    ...createdTimestamp(),
  },
  (table) => [index("admin_audit_created_idx").on(table.createdAt)],
);

export const communityGroups = sqliteTable(
  "community_groups",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    ...timestamps(),
  },
  (table) => [
    index("community_groups_sort_idx").on(table.sortOrder, table.name),
  ],
);

export const memberAccessGroups = sqliteTable(
  "member_access_groups",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    groupId: text("group_id")
      .notNull()
      .references(() => communityGroups.id, { onDelete: "cascade" }),
    createdBy: text("created_by").notNull().default(""),
    ...createdTimestamp(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.groupId] }),
    index("member_access_groups_group_idx").on(
      table.groupId,
      table.userId,
    ),
  ],
);

export const memberAccessGroupState = sqliteTable(
  "member_access_group_state",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull().default(1),
    updatedBy: text("updated_by").notNull().default(""),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    check(
      "member_access_group_state_revision_check",
      sql`${table.revision} >= 1`,
    ),
  ],
);

export const memberAccessGroupWriteGuards = sqliteTable(
  "member_access_group_write_guards",
  {
    operationId: text("operation_id").primaryKey(),
    userId: text("user_id").notNull(),
    guardValue: integer("guard_value").notNull(),
    ...createdTimestamp(),
  },
  (table) => [
    check(
      "member_access_group_write_guards_value_check",
      sql`${table.guardValue} = 1`,
    ),
  ],
);

export const communityBoards = sqliteTable(
  "community_boards",
  {
    id: text("id").primaryKey(),
    groupId: text("group_id")
      .notNull()
      .references(() => communityGroups.id, {
        onDelete: "restrict",
        onUpdate: "restrict",
      }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    readLevel: integer("read_level").notNull().default(0),
    writeLevel: integer("write_level").notNull().default(1),
    commentEnabled: integer("comment_enabled", { mode: "boolean" })
      .notNull()
      .default(true),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("community_boards_slug_uq").on(table.slug),
    index("community_boards_group_idx").on(table.groupId, table.sortOrder),
  ],
);

export const communityPosts = sqliteTable(
  "community_posts",
  {
    id: text("id").primaryKey(),
    boardId: text("board_id")
      .notNull()
      .references(() => communityBoards.id, {
        onDelete: "restrict",
        onUpdate: "restrict",
      }),
    userId: text("user_id").notNull().default(""),
    authorName: text("author_name").notNull(),
    title: text("title").notNull(),
    content: text("content").notNull(),
    status: text("status").notNull().default("published"),
    pinned: integer("pinned", { mode: "boolean" }).notNull().default(false),
    hitCount: integer("hit_count").notNull().default(0),
    ...timestamps(),
  },
  (table) => [
    index("community_posts_board_idx").on(
      table.boardId,
      table.pinned,
      table.createdAt,
    ),
    check(
      "community_posts_status_check",
      sql`${table.status} IN ('draft', 'published', 'hidden')`,
    ),
  ],
);

export const communityComments = sqliteTable(
  "community_comments",
  {
    id: text("id").primaryKey(),
    postId: text("post_id")
      .notNull()
      .references(() => communityPosts.id, {
        onDelete: "cascade",
        onUpdate: "restrict",
      }),
    userId: text("user_id").notNull().default(""),
    authorName: text("author_name").notNull(),
    content: text("content").notNull(),
    visible: integer("visible", { mode: "boolean" }).notNull().default(true),
    ...timestamps(),
  },
  (table) => [
    index("community_comments_post_idx").on(table.postId, table.createdAt),
  ],
);

export const inquirySettings = sqliteTable("inquiry_settings", {
  id: text("id").primaryKey(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  title: text("title").notNull().default("1:1 문의"),
  description: text("description").notNull().default(""),
  allowGuest: integer("allow_guest", { mode: "boolean" })
    .notNull()
    .default(true),
  requireEmail: integer("require_email", { mode: "boolean" })
    .notNull()
    .default(true),
  categoriesJson: text("categories_json").notNull().default('["기타"]'),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const oneToOneInquiries = sqliteTable(
  "one_to_one_inquiries",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().default(""),
    authorName: text("author_name").notNull(),
    email: text("email").notNull().default(""),
    phone: text("phone").notNull().default(""),
    category: text("category").notNull().default("기타"),
    title: text("title").notNull(),
    content: text("content").notNull(),
    status: text("status").notNull().default("pending"),
    answer: text("answer").notNull().default(""),
    answeredAt: text("answered_at"),
    lookupTokenHash: text("lookup_token_hash").notNull().default(""),
    ...timestamps(),
  },
  (table) => [
    index("one_to_one_inquiries_status_idx").on(
      table.status,
      table.createdAt,
    ),
    uniqueIndex("one_to_one_inquiries_lookup_token_uq")
      .on(table.lookupTokenHash)
      .where(sql`${table.lookupTokenHash} <> ''`),
    check(
      "one_to_one_inquiries_status_check",
      sql`${table.status} IN ('pending', 'in_progress', 'answered', 'closed')`,
    ),
  ],
);

export const inquiryRateLimits = sqliteTable(
  "inquiry_rate_limits",
  {
    clientKey: text("client_key").notNull(),
    windowStart: integer("window_start").notNull(),
    attempts: integer("attempts").notNull().default(0),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    primaryKey({ columns: [table.clientKey, table.windowStart] }),
  ],
);

export const clubs = sqliteTable(
  "clubs",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    contact: text("contact").notNull().default(""),
    ownerUserId: text("owner_user_id").notNull().default(""),
    ownerName: text("owner_name").notNull().default(""),
    source: text("source").notNull().default("application"),
    status: text("status").notNull().default("pending"),
    adminMemo: text("admin_memo").notNull().default(""),
    revision: integer("revision").notNull().default(1),
    approvedAt: text("approved_at"),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("clubs_slug_uq").on(table.slug),
    index("clubs_status_created_idx").on(table.status, table.createdAt),
    index("clubs_owner_idx").on(table.ownerUserId, table.createdAt),
    check(
      "clubs_source_check",
      sql`${table.source} IN ('application', 'admin')`,
    ),
    check(
      "clubs_status_check",
      sql`${table.status} IN ('pending', 'approved', 'rejected')`,
    ),
    check("clubs_revision_check", sql`${table.revision} >= 1`),
  ],
);

export const adminMailTestRuns = sqliteTable(
  "admin_mail_test_runs",
  {
    id: text("id").primaryKey(),
    recipient: text("recipient").notNull(),
    subject: text("subject").notNull(),
    provider: text("provider").notNull(),
    status: text("status").notNull(),
    providerMessageId: text("provider_message_id").notNull().default(""),
    errorMessage: text("error_message").notNull().default(""),
    createdBy: text("created_by").notNull().default(""),
    ...createdTimestamp(),
  },
  (table) => [
    index("admin_mail_test_runs_created_idx").on(table.createdAt),
    check(
      "admin_mail_test_runs_status_check",
      sql`${table.status} IN ('sent', 'failed')`,
    ),
  ],
);
