import { env } from "cloudflare:workers";

type CommerceEnvironment = {
  DB?: D1Database;
  SESSION_SECRET?: string;
};

let initialization: Promise<void> | null = null;

const orderColumnMigrations = [
  {
    name: "orderer_postcode",
    sql: "ALTER TABLE orders ADD COLUMN orderer_postcode TEXT NOT NULL DEFAULT ''",
  },
  {
    name: "orderer_address1",
    sql: "ALTER TABLE orders ADD COLUMN orderer_address1 TEXT NOT NULL DEFAULT ''",
  },
  {
    name: "orderer_address2",
    sql: "ALTER TABLE orders ADD COLUMN orderer_address2 TEXT NOT NULL DEFAULT ''",
  },
  {
    name: "shipping_carrier",
    sql: "ALTER TABLE orders ADD COLUMN shipping_carrier TEXT NOT NULL DEFAULT ''",
  },
  {
    name: "refund_amount",
    sql: "ALTER TABLE orders ADD COLUMN refund_amount INTEGER NOT NULL DEFAULT 0",
  },
  {
    name: "admin_memo",
    sql: "ALTER TABLE orders ADD COLUMN admin_memo TEXT NOT NULL DEFAULT ''",
  },
] as const;

const userColumnMigrations = [
  {
    name: "public_profile",
    sql: "ALTER TABLE users ADD COLUMN public_profile INTEGER NOT NULL DEFAULT 0",
  },
  {
    name: "extra1",
    sql: "ALTER TABLE users ADD COLUMN extra1 TEXT NOT NULL DEFAULT ''",
  },
] as const;

export function commerceEnvironment(): CommerceEnvironment {
  const workerEnvironment = env as unknown as CommerceEnvironment;
  const runtimeEnvironment =
    typeof process === "undefined" ? undefined : process.env;
  return {
    DB: workerEnvironment.DB,
    SESSION_SECRET:
      workerEnvironment.SESSION_SECRET ?? runtimeEnvironment?.SESSION_SECRET,
  };
}

export function commerceDb(): D1Database {
  const database = commerceEnvironment().DB;
  if (!database) throw new Error("쇼핑몰 데이터베이스 연결이 준비되지 않았습니다.");
  return database;
}

export async function ensureCommerceSchema() {
  if (!initialization) {
    const database = commerceDb();
    initialization = database
      .batch([
        database.prepare(`CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          login_id TEXT NOT NULL UNIQUE,
          email TEXT NOT NULL,
          password_hash TEXT NOT NULL,
          name TEXT NOT NULL,
          nickname TEXT NOT NULL DEFAULT '',
          phone TEXT NOT NULL DEFAULT '',
          postcode TEXT NOT NULL DEFAULT '',
          address1 TEXT NOT NULL DEFAULT '',
          address2 TEXT NOT NULL DEFAULT '',
          public_profile INTEGER NOT NULL DEFAULT 0,
          extra1 TEXT NOT NULL DEFAULT '',
          points INTEGER NOT NULL DEFAULT 0,
          level INTEGER NOT NULL DEFAULT 1,
          email_opt_in INTEGER NOT NULL DEFAULT 0,
          sms_opt_in INTEGER NOT NULL DEFAULT 0,
          active INTEGER NOT NULL DEFAULT 1,
          last_login_at TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        database.prepare(`CREATE TABLE IF NOT EXISTS user_session_state (
          user_id TEXT PRIMARY KEY,
          session_version INTEGER NOT NULL DEFAULT 1,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        database.prepare(`CREATE TRIGGER IF NOT EXISTS users_password_session_invalidate
          AFTER UPDATE OF password_hash ON users
          WHEN OLD.password_hash <> NEW.password_hash
          BEGIN
            INSERT INTO user_session_state (
              user_id, session_version, updated_at
            ) VALUES (NEW.id, 2, CURRENT_TIMESTAMP)
            ON CONFLICT(user_id) DO UPDATE SET
              session_version = user_session_state.session_version + 1,
              updated_at = CURRENT_TIMESTAMP;
          END`),
        database.prepare(`CREATE TRIGGER IF NOT EXISTS users_deactivate_session_invalidate
          AFTER UPDATE OF active ON users
          WHEN OLD.active <> NEW.active AND NEW.active = 0
          BEGIN
            INSERT INTO user_session_state (
              user_id, session_version, updated_at
            ) VALUES (NEW.id, 2, CURRENT_TIMESTAMP)
            ON CONFLICT(user_id) DO UPDATE SET
              session_version = user_session_state.session_version + 1,
              updated_at = CURRENT_TIMESTAMP;
          END`),
        database.prepare(`CREATE TABLE IF NOT EXISTS orders (
          id TEXT PRIMARY KEY,
          user_id TEXT,
          email TEXT NOT NULL,
          orderer_name TEXT NOT NULL,
          orderer_phone TEXT NOT NULL,
          orderer_postcode TEXT NOT NULL DEFAULT '',
          orderer_address1 TEXT NOT NULL DEFAULT '',
          orderer_address2 TEXT NOT NULL DEFAULT '',
          recipient_name TEXT NOT NULL,
          recipient_phone TEXT NOT NULL,
          postcode TEXT NOT NULL DEFAULT '',
          address1 TEXT NOT NULL,
          address2 TEXT NOT NULL DEFAULT '',
          memo TEXT NOT NULL DEFAULT '',
          subtotal INTEGER NOT NULL DEFAULT 0,
          shipping_fee INTEGER NOT NULL DEFAULT 0,
          discount INTEGER NOT NULL DEFAULT 0,
          total INTEGER NOT NULL DEFAULT 0,
          payment_method TEXT NOT NULL DEFAULT 'bank',
          payment_status TEXT NOT NULL DEFAULT 'pending',
          status TEXT NOT NULL DEFAULT 'ordered',
          shipping_carrier TEXT NOT NULL DEFAULT '',
          tracking_number TEXT NOT NULL DEFAULT '',
          refund_amount INTEGER NOT NULL DEFAULT 0,
          admin_memo TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        database.prepare(
          "CREATE INDEX IF NOT EXISTS orders_user_idx ON orders(user_id)",
        ),
        database.prepare(
          "CREATE INDEX IF NOT EXISTS orders_email_idx ON orders(email)",
        ),
        database.prepare(
          "CREATE INDEX IF NOT EXISTS orders_created_idx ON orders(created_at)",
        ),
        database.prepare(`CREATE TABLE IF NOT EXISTS order_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          order_id TEXT NOT NULL,
          product_id TEXT NOT NULL,
          product_name TEXT NOT NULL,
          product_image TEXT NOT NULL DEFAULT '',
          unit_price INTEGER NOT NULL,
          quantity INTEGER NOT NULL,
          line_total INTEGER NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        database.prepare(
          "CREATE INDEX IF NOT EXISTS order_items_order_idx ON order_items(order_id)",
        ),
        database.prepare(`CREATE TABLE IF NOT EXISTS order_payment_details (
          order_id TEXT PRIMARY KEY,
          bank_code TEXT NOT NULL DEFAULT '',
          depositor TEXT NOT NULL DEFAULT '',
          cash_receipt_number TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        database.prepare(`CREATE TABLE IF NOT EXISTS product_stock (
          product_id TEXT PRIMARY KEY,
          stock INTEGER NOT NULL DEFAULT 0 CHECK(stock >= 0),
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        database.prepare(`CREATE TABLE IF NOT EXISTS product_options (
          id TEXT PRIMARY KEY,
          product_id TEXT NOT NULL,
          option_name TEXT NOT NULL,
          option_value TEXT NOT NULL,
          price_delta INTEGER NOT NULL DEFAULT 0,
          stock INTEGER NOT NULL DEFAULT 0 CHECK(stock >= 0),
          sale_enabled INTEGER NOT NULL DEFAULT 1
            CHECK(sale_enabled IN (0, 1)),
          sold_out INTEGER NOT NULL DEFAULT 0
            CHECK(sold_out IN (0, 1)),
          sort_order INTEGER NOT NULL DEFAULT 0,
          deleted INTEGER NOT NULL DEFAULT 0 CHECK(deleted IN (0, 1)),
          revision INTEGER NOT NULL DEFAULT 1 CHECK(revision >= 1),
          updated_by TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        database.prepare(
          "CREATE INDEX IF NOT EXISTS product_options_product_idx ON product_options(product_id, deleted, sort_order)",
        ),
        database.prepare(
          `CREATE UNIQUE INDEX IF NOT EXISTS product_options_active_value_uq
           ON product_options(product_id, option_name, option_value)
           WHERE deleted = 0`,
        ),
        database.prepare(`CREATE TABLE IF NOT EXISTS product_option_sets (
          product_id TEXT PRIMARY KEY,
          revision INTEGER NOT NULL DEFAULT 1 CHECK(revision >= 1),
          updated_by TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        database.prepare(`CREATE TABLE IF NOT EXISTS product_option_write_guards (
          operation_id TEXT PRIMARY KEY,
          option_id TEXT NOT NULL,
          guard_value INTEGER NOT NULL CHECK(guard_value = 1),
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        database.prepare(
          "CREATE INDEX IF NOT EXISTS product_option_write_guards_option_idx ON product_option_write_guards(option_id)",
        ),
        database.prepare(`CREATE TABLE IF NOT EXISTS order_option_items (
          order_id TEXT NOT NULL,
          option_id TEXT NOT NULL,
          product_id TEXT NOT NULL,
          quantity INTEGER NOT NULL CHECK(quantity > 0),
          option_name TEXT NOT NULL,
          option_value TEXT NOT NULL,
          price_delta INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (order_id, option_id)
        )`),
        database.prepare(
          "CREATE INDEX IF NOT EXISTS order_option_items_product_idx ON order_option_items(product_id)",
        ),
        database.prepare(`CREATE TABLE IF NOT EXISTS order_option_guards (
          order_id TEXT NOT NULL,
          option_id TEXT NOT NULL,
          guard_value INTEGER NOT NULL CHECK(guard_value = 1),
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (order_id, option_id)
        )`),
        database.prepare(`CREATE TABLE IF NOT EXISTS order_catalog_guards (
          order_id TEXT NOT NULL,
          product_id TEXT NOT NULL,
          catalog_guard INTEGER NOT NULL CHECK(catalog_guard = 1),
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (order_id, product_id)
        )`),
        database.prepare(`CREATE TABLE IF NOT EXISTS order_inventory_adjustments (
          order_id TEXT NOT NULL,
          adjustment_type TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (order_id, adjustment_type)
        )`),
        database.prepare(`CREATE TABLE IF NOT EXISTS order_point_debits (
          order_id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          points_used INTEGER NOT NULL CHECK(points_used > 0),
          guard_value INTEGER NOT NULL CHECK(guard_value = 1),
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        database.prepare(
          "CREATE INDEX IF NOT EXISTS order_point_debits_user_idx ON order_point_debits(user_id)",
        ),
        database.prepare(`CREATE TABLE IF NOT EXISTS order_point_credits (
          order_id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          points_earned INTEGER NOT NULL CHECK(points_earned > 0),
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        database.prepare(
          "CREATE INDEX IF NOT EXISTS order_point_credits_user_idx ON order_point_credits(user_id)",
        ),
        database.prepare(`CREATE TABLE IF NOT EXISTS order_point_reversals (
          order_id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          points_reversed INTEGER NOT NULL CHECK(points_reversed > 0),
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        database.prepare(
          "CREATE INDEX IF NOT EXISTS order_point_reversals_user_idx ON order_point_reversals(user_id)",
        ),
        database.prepare(`CREATE TABLE IF NOT EXISTS order_requests (
          request_key TEXT PRIMARY KEY,
          order_id TEXT NOT NULL UNIQUE,
          email TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        database.prepare(`CREATE TABLE IF NOT EXISTS order_rate_limits (
          client_key TEXT NOT NULL,
          window_start INTEGER NOT NULL,
          attempts INTEGER NOT NULL DEFAULT 0,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (client_key, window_start)
        )`),
        database.prepare(`CREATE TABLE IF NOT EXISTS auth_rate_limits (
          scope TEXT NOT NULL,
          client_key TEXT NOT NULL,
          window_start INTEGER NOT NULL,
          attempts INTEGER NOT NULL DEFAULT 0,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (scope, client_key, window_start)
        )`),
        database.prepare(`CREATE TABLE IF NOT EXISTS charge_requests (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          amount INTEGER NOT NULL,
          depositor_name TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'requested',
          admin_memo TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        database.prepare(
          "CREATE INDEX IF NOT EXISTS charge_requests_user_idx ON charge_requests(user_id)",
        ),
        database.prepare(
          "CREATE INDEX IF NOT EXISTS charge_requests_status_idx ON charge_requests(status)",
        ),
        database.prepare(`CREATE TABLE IF NOT EXISTS withdrawal_requests (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          amount INTEGER NOT NULL,
          bank_name TEXT NOT NULL,
          account_number TEXT NOT NULL,
          account_holder TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'requested',
          admin_memo TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        database.prepare(
          "CREATE INDEX IF NOT EXISTS withdrawal_requests_user_idx ON withdrawal_requests(user_id)",
        ),
        database.prepare(
          "CREATE INDEX IF NOT EXISTS withdrawal_requests_status_idx ON withdrawal_requests(status)",
        ),
        database.prepare(`CREATE TABLE IF NOT EXISTS wallet_request_rate_limits (
          user_id TEXT NOT NULL,
          request_type TEXT NOT NULL,
          window_start INTEGER NOT NULL,
          attempts INTEGER NOT NULL DEFAULT 0,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (user_id, request_type, window_start)
        )`),
        database.prepare(`CREATE TABLE IF NOT EXISTS wallet_processing_guards (
          request_type TEXT NOT NULL CHECK(request_type IN ('charge', 'withdrawal')),
          request_id TEXT NOT NULL,
          transition_guard INTEGER NOT NULL CHECK(transition_guard = 1),
          balance_guard INTEGER NOT NULL CHECK(balance_guard = 1),
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (request_type, request_id)
        )`),
        database.prepare(`CREATE TABLE IF NOT EXISTS wallet_ledger (
          id TEXT PRIMARY KEY,
          request_type TEXT NOT NULL CHECK(request_type IN ('charge', 'withdrawal')),
          request_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          delta INTEGER NOT NULL CHECK(delta <> 0),
          balance_after INTEGER NOT NULL CHECK(balance_after >= 0),
          admin_username TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(request_type, request_id)
        )`),
        database.prepare(
          "CREATE INDEX IF NOT EXISTS wallet_ledger_user_idx ON wallet_ledger(user_id, created_at)",
        ),
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
        database.prepare(`CREATE TABLE IF NOT EXISTS product_interactions (
          id TEXT PRIMARY KEY,
          product_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          kind TEXT NOT NULL CHECK (kind IN ('review', 'question')),
          author_name TEXT NOT NULL,
          title TEXT NOT NULL,
          body TEXT NOT NULL,
          rating INTEGER NOT NULL DEFAULT 0 CHECK (rating BETWEEN 0 AND 5),
          answer TEXT NOT NULL DEFAULT '',
          active INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        database.prepare(
          "CREATE INDEX IF NOT EXISTS product_interactions_product_idx ON product_interactions(product_id, kind, created_at)",
        ),
        database.prepare(
          `CREATE UNIQUE INDEX IF NOT EXISTS product_interactions_review_user_product_uq
           ON product_interactions(user_id, product_id)
           WHERE kind = 'review'`,
        ),
        database.prepare(`CREATE TABLE IF NOT EXISTS wishlist_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          owner_key TEXT NOT NULL,
          product_id TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        database.prepare(
          `CREATE UNIQUE INDEX IF NOT EXISTS wishlist_owner_product_uq
           ON wishlist_items(owner_key, product_id)`,
        ),
        database.prepare(
          "CREATE INDEX IF NOT EXISTS wishlist_owner_idx ON wishlist_items(owner_key)",
        ),
        database.prepare(`CREATE TABLE IF NOT EXISTS member_memos (
          id TEXT PRIMARY KEY,
          sender_user_id TEXT NOT NULL,
          recipient_user_id TEXT NOT NULL,
          body TEXT NOT NULL,
          read_at TEXT,
          sender_deleted INTEGER NOT NULL DEFAULT 0,
          recipient_deleted INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        database.prepare(
          `CREATE INDEX IF NOT EXISTS member_memos_recipient_idx
           ON member_memos(recipient_user_id, recipient_deleted, created_at)`,
        ),
        database.prepare(
          `CREATE INDEX IF NOT EXISTS member_memos_sender_idx
           ON member_memos(sender_user_id, sender_deleted, created_at)`,
        ),
        database.prepare(`CREATE TABLE IF NOT EXISTS product_interaction_rate_limits (
          user_id TEXT NOT NULL,
          window_start INTEGER NOT NULL,
          attempts INTEGER NOT NULL DEFAULT 0,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (user_id, window_start)
        )`),
        database.prepare(`CREATE TABLE IF NOT EXISTS restock_requests (
          id TEXT PRIMARY KEY,
          product_id TEXT NOT NULL,
          phone TEXT NOT NULL,
          phone_hash TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'waiting_provider'
            CHECK(status IN (
              'waiting_provider', 'queued', 'sent', 'failed', 'cancelled'
            )),
          revision INTEGER NOT NULL DEFAULT 1 CHECK(revision >= 1),
          admin_memo TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        database.prepare(
          "CREATE INDEX IF NOT EXISTS restock_requests_product_idx ON restock_requests(product_id, created_at)",
        ),
        database.prepare(
          "CREATE INDEX IF NOT EXISTS restock_requests_status_idx ON restock_requests(status, created_at)",
        ),
        database.prepare(
          `CREATE UNIQUE INDEX IF NOT EXISTS restock_requests_active_uq
           ON restock_requests(product_id, phone_hash)
           WHERE status IN ('waiting_provider', 'queued')`,
        ),
        database.prepare(`CREATE TABLE IF NOT EXISTS restock_sms_queue (
          id TEXT PRIMARY KEY,
          request_id TEXT NOT NULL UNIQUE,
          status TEXT NOT NULL DEFAULT 'waiting_provider'
            CHECK(status IN (
              'waiting_provider', 'queued', 'sent', 'failed', 'cancelled'
            )),
          attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts >= 0),
          last_error TEXT NOT NULL DEFAULT '',
          revision INTEGER NOT NULL DEFAULT 1 CHECK(revision >= 1),
          queued_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          sent_at TEXT,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        database.prepare(
          "CREATE INDEX IF NOT EXISTS restock_sms_queue_status_idx ON restock_sms_queue(status, queued_at)",
        ),
        database.prepare(`CREATE TABLE IF NOT EXISTS restock_request_rate_limits (
          client_key TEXT NOT NULL,
          window_start INTEGER NOT NULL,
          attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts >= 0),
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (client_key, window_start)
        )`),
        database.prepare(`CREATE TABLE IF NOT EXISTS restock_write_guards (
          operation_id TEXT PRIMARY KEY,
          request_id TEXT NOT NULL,
          guard_value INTEGER NOT NULL CHECK(guard_value = 1),
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        database.prepare(
          "CREATE INDEX IF NOT EXISTS restock_write_guards_request_idx ON restock_write_guards(request_id)",
        ),
      ])
      .then(() => ensureMissingCommerceColumns(database))
      .catch((error) => {
        initialization = null;
        throw error;
      });
  }
  await initialization;
}

async function ensureMissingCommerceColumns(database: D1Database): Promise<void> {
  const [orderResult, userResult] = await Promise.all([
    database.prepare("PRAGMA table_info(orders)").all<{ name: string }>(),
    database.prepare("PRAGMA table_info(users)").all<{ name: string }>(),
  ]);
  const existingOrderColumns = new Set(
    (orderResult.results ?? []).map((column) => column.name),
  );
  const existingUserColumns = new Set(
    (userResult.results ?? []).map((column) => column.name),
  );
  const statements = [
    ...orderColumnMigrations.filter(
      (migration) => !existingOrderColumns.has(migration.name),
    ),
    ...userColumnMigrations.filter(
      (migration) => !existingUserColumns.has(migration.name),
    ),
  ].map((migration) => database.prepare(migration.sql));
  if (statements.length > 0) {
    await database.batch(statements);
  }
}
