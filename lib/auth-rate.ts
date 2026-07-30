import { commerceDb, ensureCommerceSchema } from "@/lib/commerce-db";

export type AuthRateScope =
  | "admin-login"
  | "admin-reauth"
  | "customer-login"
  | "customer-register"
  | "customer-profile-reauth";

export async function checkAuthRateLimit(
  request: Request,
  scope: AuthRateScope,
  windowMs: number,
  maxAttempts: number,
  database = commerceDb(),
): Promise<{ limited: boolean; retryAfterSeconds: number }> {
  await ensureCommerceSchema();
  const windowStart = Math.floor(Date.now() / windowMs);
  const clientKey = await authRateClientKey(request);
  const result = await database
    .prepare(
      `INSERT INTO auth_rate_limits (
         scope, client_key, window_start, attempts, updated_at
       ) VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP)
       ON CONFLICT(scope, client_key, window_start) DO UPDATE SET
         attempts = auth_rate_limits.attempts + 1,
         updated_at = CURRENT_TIMESTAMP
       RETURNING attempts`,
    )
    .bind(scope, clientKey, windowStart)
    .first<{ attempts: number }>();

  if (Math.random() < 0.02) {
    await database
      .prepare(
        "DELETE FROM auth_rate_limits WHERE scope = ? AND window_start < ?",
      )
      .bind(scope, windowStart - 168)
      .run()
      .catch(() => undefined);
  }

  const elapsed = Date.now() - windowStart * windowMs;
  return {
    limited: Number(result?.attempts ?? 1) > maxAttempts,
    retryAfterSeconds: Math.max(1, Math.ceil((windowMs - elapsed) / 1_000)),
  };
}

export async function clearAuthRateLimit(
  request: Request,
  scope: AuthRateScope,
  database = commerceDb(),
): Promise<void> {
  await ensureCommerceSchema();
  const clientKey = await authRateClientKey(request);
  await database
    .prepare("DELETE FROM auth_rate_limits WHERE scope = ? AND client_key = ?")
    .bind(scope, clientKey)
    .run();
}

async function authRateClientKey(request: Request): Promise<string> {
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
