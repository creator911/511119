import { commerceDb, ensureCommerceSchema } from "@/lib/commerce-db";
import { MAX_POINTS } from "@/lib/commerce-limits";

const ORDER_RATE_WINDOW_MS = 60 * 60 * 1_000;
const MAX_ORDER_ATTEMPTS_PER_WINDOW = 6;
const MAX_EMAIL_LOOKUP_ATTEMPTS_PER_WINDOW = 12;
const EXPIRATION_CLEANUP_INTERVAL_MS = 60_000;
let cleanupPromise: Promise<number> | null = null;
let lastCleanupAt = 0;

export async function releaseExpiredOrderReservations(
  database = commerceDb(),
): Promise<number> {
  const now = Date.now();
  if (cleanupPromise) return cleanupPromise;
  if (now - lastCleanupAt < EXPIRATION_CLEANUP_INTERVAL_MS) return 0;

  cleanupPromise = performExpirationCleanup(database)
    .then((count) => {
      lastCleanupAt = Date.now();
      return count;
    })
    .finally(() => {
      cleanupPromise = null;
    });
  return cleanupPromise;
}

async function performExpirationCleanup(
  database: D1Database,
): Promise<number> {
  await ensureCommerceSchema();
  await settlePendingPointRestores(database);
  const expired = await database
    .prepare(
      `SELECT id
       FROM orders
       WHERE status = 'ordered'
         AND payment_status = 'pending'
         AND created_at <= datetime('now', '-24 hours')
       ORDER BY created_at ASC
       LIMIT 100`,
    )
    .all<{ id: string }>();
  const ids = (expired.results ?? []).map((row) => row.id);
  if (!ids.length) return 0;

  let released = 0;
  for (const orderId of ids) {
    try {
      const results = await database.batch(
        expiredOrderReleaseStatements(database, orderId),
      );
      const orderUpdate = results[results.length - 1];
      released += Number(orderUpdate?.meta.changes ?? 0);
    } catch {
      // One malformed legacy row must not block later expired orders.
    }
  }
  return released;
}

function expiredOrderReleaseStatements(
  database: D1Database,
  orderId: string,
): D1PreparedStatement[] {
  const isExpiredPendingOrder = `
    o.status = 'ordered'
    AND o.payment_status = 'pending'
    AND o.created_at <= datetime('now', '-24 hours')
  `;
  return [
    database
      .prepare(
        `INSERT OR IGNORE INTO order_inventory_adjustments (
           order_id, adjustment_type
         )
         SELECT id, 'stock_restore'
         FROM orders
         WHERE id = ?
           AND status = 'ordered'
           AND payment_status = 'pending'
           AND created_at <= datetime('now', '-24 hours')`,
      )
      .bind(orderId),
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
      .bind(orderId),
    database
      .prepare(
        `INSERT OR IGNORE INTO order_inventory_adjustments (
           order_id, adjustment_type
         )
         SELECT id, 'option_stock_restore'
         FROM orders
         WHERE id = ?
           AND status = 'ordered'
           AND payment_status = 'pending'
           AND created_at <= datetime('now', '-24 hours')
           AND EXISTS (
             SELECT 1 FROM order_option_items
             WHERE order_id = orders.id
           )`,
      )
      .bind(orderId),
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
      .bind(orderId, orderId),
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
           AND ${isExpiredPendingOrder}
           AND u.points <= ? - opd.points_used`,
      )
      .bind(orderId, MAX_POINTS),
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
      .bind(orderId, orderId),
    database
      .prepare(
        `INSERT OR IGNORE INTO order_inventory_adjustments (
           order_id, adjustment_type
         )
         SELECT opd.order_id, 'points_restore_pending'
         FROM order_point_debits opd
         JOIN orders o ON o.id = opd.order_id
         WHERE opd.order_id = ?
           AND ${isExpiredPendingOrder}
           AND NOT EXISTS (
             SELECT 1
             FROM order_inventory_adjustments completed
             WHERE completed.order_id = opd.order_id
               AND completed.adjustment_type = 'points_restore'
           )`,
      )
      .bind(orderId),
    database
      .prepare(
        `DELETE FROM order_inventory_adjustments
         WHERE order_id = ?
           AND adjustment_type = 'points_restore_pending'
           AND EXISTS (
             SELECT 1
             FROM order_inventory_adjustments completed
             WHERE completed.order_id = ?
               AND completed.adjustment_type = 'points_restore'
           )`,
      )
      .bind(orderId, orderId),
    database
      .prepare(
        `UPDATE orders
         SET status = 'cancelled',
             payment_status = 'cancelled',
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?
           AND status = 'ordered'
           AND payment_status = 'pending'
           AND created_at <= datetime('now', '-24 hours')`,
      )
      .bind(orderId),
  ];
}

async function settlePendingPointRestores(
  database: D1Database,
): Promise<void> {
  const pending = await database
    .prepare(
      `SELECT pending.order_id
       FROM order_inventory_adjustments pending
       JOIN order_point_debits opd ON opd.order_id = pending.order_id
       JOIN users u ON u.id = opd.user_id
       WHERE pending.adjustment_type = 'points_restore_pending'
         AND u.points <= ? - opd.points_used
         AND NOT EXISTS (
           SELECT 1
           FROM order_inventory_adjustments completed
           WHERE completed.order_id = pending.order_id
             AND completed.adjustment_type = 'points_restore'
         )
       ORDER BY pending.created_at ASC
       LIMIT 100`,
    )
    .bind(MAX_POINTS)
    .all<{ order_id: string }>();

  for (const row of pending.results ?? []) {
    try {
      await database.batch([
        database
          .prepare(
            `INSERT OR IGNORE INTO order_inventory_adjustments (
               order_id, adjustment_type
             )
             SELECT pending.order_id, 'points_restore'
             FROM order_inventory_adjustments pending
             JOIN order_point_debits opd ON opd.order_id = pending.order_id
             JOIN users u ON u.id = opd.user_id
             WHERE pending.order_id = ?
               AND pending.adjustment_type = 'points_restore_pending'
               AND u.points <= ? - opd.points_used`,
          )
          .bind(row.order_id, MAX_POINTS),
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
          .bind(row.order_id, row.order_id),
        database
          .prepare(
            `DELETE FROM order_inventory_adjustments
             WHERE order_id = ?
               AND adjustment_type = 'points_restore_pending'
               AND EXISTS (
                 SELECT 1
                 FROM order_inventory_adjustments completed
                 WHERE completed.order_id = ?
                   AND completed.adjustment_type = 'points_restore'
               )`,
          )
          .bind(row.order_id, row.order_id),
      ]);
    } catch {
      // Keep the pending marker for the next reconciliation pass.
    }
  }
}

export async function checkOrderRateLimit(
  request: Request,
  database = commerceDb(),
): Promise<{ limited: boolean; retryAfterSeconds: number }> {
  return checkNamespacedOrderRateLimit(
    request,
    database,
    "order-create",
    MAX_ORDER_ATTEMPTS_PER_WINDOW,
  );
}

export async function checkOrderEmailLookupRateLimit(
  request: Request,
  database = commerceDb(),
): Promise<{ limited: boolean; retryAfterSeconds: number }> {
  return checkNamespacedOrderRateLimit(
    request,
    database,
    "order-email-lookup",
    MAX_EMAIL_LOOKUP_ATTEMPTS_PER_WINDOW,
  );
}

async function checkNamespacedOrderRateLimit(
  request: Request,
  database: D1Database,
  namespace: string,
  maxAttempts: number,
): Promise<{ limited: boolean; retryAfterSeconds: number }> {
  await ensureCommerceSchema();
  const windowStart = Math.floor(Date.now() / ORDER_RATE_WINDOW_MS);
  const clientKey = `${namespace}:${await hashedClientKey(request)}`;
  const result = await database
    .prepare(
      `INSERT INTO order_rate_limits (
         client_key, window_start, attempts, updated_at
       ) VALUES (?, ?, 1, CURRENT_TIMESTAMP)
       ON CONFLICT(client_key, window_start) DO UPDATE SET
         attempts = order_rate_limits.attempts + 1,
         updated_at = CURRENT_TIMESTAMP
       RETURNING attempts`,
    )
    .bind(clientKey, windowStart)
    .first<{ attempts: number }>();

  if (Math.random() < 0.02) {
    await database
      .prepare("DELETE FROM order_rate_limits WHERE window_start < ?")
      .bind(windowStart - 48)
      .run()
      .catch(() => undefined);
  }
  const elapsed = Date.now() - windowStart * ORDER_RATE_WINDOW_MS;
  return {
    limited: Number(result?.attempts ?? 1) > maxAttempts,
    retryAfterSeconds: Math.max(
      1,
      Math.ceil((ORDER_RATE_WINDOW_MS - elapsed) / 1_000),
    ),
  };
}

export function readOrderRequestKey(request: Request): string | null {
  const value = request.headers.get("idempotency-key")?.trim();
  if (!value) return crypto.randomUUID();
  return /^[A-Za-z0-9][A-Za-z0-9._-]{15,99}$/u.test(value) ? value : null;
}

export async function findExistingOrderRequest(
  requestKey: string,
  email: string,
  database = commerceDb(),
): Promise<string | null> {
  await ensureCommerceSchema();
  const row = await database
    .prepare(
      `SELECT order_id
       FROM order_requests
       WHERE request_key = ? AND email = ?
       LIMIT 1`,
    )
    .bind(requestKey, email)
    .first<{ order_id: string }>();
  return row?.order_id ?? null;
}

async function hashedClientKey(request: Request): Promise<string> {
  const address =
    request.headers.get("cf-connecting-ip")?.trim().slice(0, 128) ||
    "anonymous";
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(address),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
