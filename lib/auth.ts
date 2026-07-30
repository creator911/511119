import { env as cloudflareEnv } from "cloudflare:workers";
import {
  canAccessAdminRequirement,
  type AdminPermissionRequirement,
} from "@/lib/admin-permissions";
import type {
  AdminGrantedPermission,
} from "@/lib/admin-permissions";
import { verifyPbkdf2Password } from "@/lib/admin-password";

export interface AdminAuthEnv {
  ADMIN_USERNAME?: string;
  ADMIN_PASSWORD_HASH?: string;
  SESSION_SECRET?: string;
}

export interface AdminSession {
  username: string;
  role: "admin";
  accountType: "primary" | "secondary";
  accountId: number | null;
  permissions: AdminGrantedPermission[];
  issuedAt: number;
  expiresAt: number;
}

export interface AuthenticatedAdminIdentity {
  username: string;
  accountType: "primary" | "secondary";
  accountId: number | null;
  permissions: AdminGrantedPermission[];
  sessionVersion: number | null;
}

interface LegacySessionPayload {
  version: 1;
  subject: string;
  role: "admin";
  issuedAt: number;
  expiresAt: number;
  nonce: string;
}

interface CurrentSessionPayload {
  version: 2;
  subject: string;
  role: "admin";
  accountType: "primary" | "secondary";
  adminId?: number;
  sessionVersion?: number;
  issuedAt: number;
  expiresAt: number;
  nonce: string;
}

type SessionPayload = LegacySessionPayload | CurrentSessionPayload;

const SESSION_COOKIE_NAME = "__Host-admin_session";
const DEVELOPMENT_SESSION_COOKIE_NAME = "admin_session";
const SESSION_DURATION_SECONDS = 8 * 60 * 60;
const SESSION_CLOCK_SKEW_SECONDS = 60;
const MAX_USERNAME_LENGTH = 128;
const MAX_PASSWORD_LENGTH = 1_024;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8", { fatal: true });

/**
 * Accepted ADMIN_PASSWORD_HASH formats:
 * - pbkdf2-sha256$<iterations>$<salt-hex>$<digest-hex>
 * - <salt-hex>:<iterations>:<digest-hex>
 *
 * The digest must be a 32-byte PBKDF2-HMAC-SHA-256 result and the salt must be
 * at least 16 bytes. This deployment uses the Workers runtime's verified
 * maximum of 100,000 iterations.
 */
export async function verifyAdminCredentials(
  username: string,
  password: string,
  envOverride?: AdminAuthEnv,
  databaseOverride?: D1Database,
): Promise<boolean> {
  return (
    (await authenticateAdminCredentials(
      username,
      password,
      envOverride,
      databaseOverride,
    )) !== null
  );
}

export async function authenticateAdminCredentials(
  username: string,
  password: string,
  envOverride?: AdminAuthEnv,
  databaseOverride?: D1Database,
): Promise<AuthenticatedAdminIdentity | null> {
  const env = readAuthEnv(envOverride);
  const configuredUsername = env.ADMIN_USERNAME ?? "";
  const usernameWithinLimit =
    username.length > 0 && username.length <= MAX_USERNAME_LENGTH;
  const passwordWithinLimit =
    password.length > 0 && password.length <= MAX_PASSWORD_LENGTH;
  const usernameMatches = timingSafeStringEqual(
    username.slice(0, MAX_USERNAME_LENGTH),
    configuredUsername.slice(0, MAX_USERNAME_LENGTH),
  );
  const primaryPasswordMatches = await verifyPbkdf2Password(
    password,
    env.ADMIN_PASSWORD_HASH,
  );
  const primaryIsValid =
    configuredUsername.length > 0 &&
    configuredUsername.length <= MAX_USERNAME_LENGTH &&
    usernameWithinLimit &&
    passwordWithinLimit &&
    usernameMatches &&
    primaryPasswordMatches;
  if (primaryIsValid) {
    return {
      username: configuredUsername,
      accountType: "primary",
      accountId: null,
      permissions: ["*"],
      sessionVersion: null,
    };
  }

  // The environment username is permanently reserved for the immutable
  // primary account, even if a legacy database row happens to share it.
  if (usernameMatches && configuredUsername.length > 0) return null;
  if (!usernameWithinLimit || !passwordWithinLimit) return null;

  try {
    const { authenticateSecondaryAdmin } =
      await import("@/lib/admin-accounts");
    const secondary = await authenticateSecondaryAdmin(
      username,
      password,
      databaseOverride,
    );
    if (!secondary) return null;
    return {
      username: secondary.username,
      accountType: "secondary",
      accountId: secondary.id,
      permissions: secondary.permissions,
      sessionVersion: secondary.sessionVersion,
    };
  } catch {
    return null;
  }
}

export async function createAdminSessionCookie(
  envOverride?: AdminAuthEnv,
  secure = true,
  authenticatedIdentity?: AuthenticatedAdminIdentity,
): Promise<string> {
  const env = readAuthEnv(envOverride);
  const secret = validSessionSecret(env.SESSION_SECRET);
  const primaryUsername = env.ADMIN_USERNAME ?? "";
  const identity =
    authenticatedIdentity ??
    (primaryUsername.length > 0 &&
    primaryUsername.length <= MAX_USERNAME_LENGTH
      ? {
          username: primaryUsername,
          accountType: "primary" as const,
          accountId: null,
          permissions: ["*" as const],
          sessionVersion: null,
        }
      : null);
  if (!identity || !secret || !isValidSessionIdentity(identity)) {
    throw new Error("Admin authentication is not configured.");
  }
  if (
    identity.accountType === "primary" &&
    !timingSafeStringEqual(identity.username, primaryUsername)
  ) {
    throw new Error("Admin authentication is not configured.");
  }

  const issuedAt = Math.floor(Date.now() / 1_000);
  const payload: CurrentSessionPayload = {
    version: 2,
    subject: identity.username,
    role: "admin",
    accountType: identity.accountType,
    ...(identity.accountType === "secondary"
      ? {
          adminId: identity.accountId!,
          sessionVersion: identity.sessionVersion!,
        }
      : {}),
    issuedAt,
    expiresAt: issuedAt + SESSION_DURATION_SECONDS,
    nonce: randomBase64Url(18),
  };
  const encodedPayload = bytesToBase64Url(
    textEncoder.encode(JSON.stringify(payload)),
  );
  const signature = await signSession(encodedPayload, secret);
  const value = `${encodedPayload}.${bytesToBase64Url(signature)}`;

  return [
    `${secure ? SESSION_COOKIE_NAME : DEVELOPMENT_SESSION_COOKIE_NAME}=${value}`,
    "Path=/",
    "HttpOnly",
    ...(secure ? ["Secure"] : []),
    "SameSite=Strict",
    `Max-Age=${SESSION_DURATION_SECONDS}`,
    `Expires=${new Date(payload.expiresAt * 1_000).toUTCString()}`,
  ].join("; ");
}

export function clearAdminSessionCookie(secure = true): string {
  return [
    `${secure ? SESSION_COOKIE_NAME : DEVELOPMENT_SESSION_COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    ...(secure ? ["Secure"] : []),
    "SameSite=Strict",
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
  ].join("; ");
}

export async function getAdminSession(
  source?: Request | Headers,
  envOverride?: AdminAuthEnv,
  databaseOverride?: D1Database,
): Promise<AdminSession | null> {
  const token = source
    ? readCookieFromHeader(cookieHeaderFrom(source), SESSION_COOKIE_NAME) ??
      readCookieFromHeader(
        cookieHeaderFrom(source),
        DEVELOPMENT_SESSION_COOKIE_NAME,
      )
    : (await (await import("next/headers")).cookies()).get(
        SESSION_COOKIE_NAME,
      )?.value ??
      (await (await import("next/headers")).cookies()).get(
        DEVELOPMENT_SESSION_COOKIE_NAME,
      )?.value;
  if (!token || token.length > 4_096) return null;

  const env = readAuthEnv(envOverride);
  const primaryUsername = env.ADMIN_USERNAME ?? "";
  const secret = validSessionSecret(env.SESSION_SECRET);
  if (!secret) return null;

  const tokenParts = token.split(".");
  if (tokenParts.length !== 2) return null;
  const [encodedPayload, encodedSignature] = tokenParts;
  const signature = base64UrlToBytes(encodedSignature);
  if (!encodedPayload || !signature || signature.length !== 32) return null;

  const signatureIsValid = await verifySessionSignature(
    encodedPayload,
    signature,
    secret,
  );
  if (!signatureIsValid) return null;

  const payloadBytes = base64UrlToBytes(encodedPayload);
  if (!payloadBytes || payloadBytes.length > 2_048) return null;

  let payload: SessionPayload;
  try {
    payload = JSON.parse(textDecoder.decode(payloadBytes)) as SessionPayload;
  } catch {
    return null;
  }

  const now = Math.floor(Date.now() / 1_000);
  if (
    (payload.version !== 1 && payload.version !== 2) ||
    payload.role !== "admin" ||
    typeof payload.subject !== "string" ||
    typeof payload.issuedAt !== "number" ||
    typeof payload.expiresAt !== "number" ||
    typeof payload.nonce !== "string" ||
    payload.nonce.length < 16 ||
    !Number.isSafeInteger(payload.issuedAt) ||
    !Number.isSafeInteger(payload.expiresAt) ||
    payload.issuedAt > now + SESSION_CLOCK_SKEW_SECONDS ||
    payload.expiresAt <= now ||
    payload.expiresAt <= payload.issuedAt ||
    payload.expiresAt - payload.issuedAt > SESSION_DURATION_SECONDS
  ) {
    return null;
  }

  if (
    payload.version === 1 ||
    (payload.version === 2 && payload.accountType === "primary")
  ) {
    if (
      !primaryUsername ||
      primaryUsername.length > MAX_USERNAME_LENGTH ||
      !timingSafeStringEqual(payload.subject, primaryUsername)
    ) {
      return null;
    }
    return sessionFromPayload(payload, {
      username: primaryUsername,
      accountType: "primary",
      accountId: null,
      permissions: ["*"],
    });
  }

  if (
    payload.accountType !== "secondary" ||
    !Number.isSafeInteger(payload.adminId) ||
    (payload.adminId ?? 0) <= 0 ||
    !Number.isSafeInteger(payload.sessionVersion) ||
    (payload.sessionVersion ?? 0) <= 0
  ) {
    return null;
  }
  try {
    const { getSecondaryAdminSessionIdentity } =
      await import("@/lib/admin-accounts");
    const secondary = await getSecondaryAdminSessionIdentity(
      payload.adminId!,
      payload.sessionVersion!,
      databaseOverride,
    );
    if (
      !secondary ||
      !timingSafeStringEqual(payload.subject, secondary.username)
    ) {
      return null;
    }
    return sessionFromPayload(payload, {
      username: secondary.username,
      accountType: "secondary",
      accountId: secondary.id,
      permissions: secondary.permissions,
    });
  } catch {
    return null;
  }
}

export async function requireAdminSession(
  source?: Request | Headers,
  envOverride?: AdminAuthEnv,
): Promise<AdminSession> {
  const session = await getAdminSession(source, envOverride);
  if (session) return session;

  const { redirect } = await import("next/navigation");
  return redirect("/adm/login") as never;
}

export async function requireAdminPagePermission(
  required: AdminPermissionRequirement,
): Promise<AdminSession> {
  const session = await requireAdminSession();
  if (canAccessAdminRequirement(session, required)) return session;

  const { redirect } = await import("next/navigation");
  return redirect("/adm/forbidden") as never;
}

function readAuthEnv(envOverride?: AdminAuthEnv): AdminAuthEnv {
  if (envOverride) return envOverride;

  const workerEnv = cloudflareEnv as unknown as AdminAuthEnv;
  const runtimeEnv =
    typeof process === "undefined" ? undefined : process.env;
  return {
    ADMIN_USERNAME: workerEnv.ADMIN_USERNAME ?? runtimeEnv?.ADMIN_USERNAME,
    ADMIN_PASSWORD_HASH:
      workerEnv.ADMIN_PASSWORD_HASH ?? runtimeEnv?.ADMIN_PASSWORD_HASH,
    SESSION_SECRET: workerEnv.SESSION_SECRET ?? runtimeEnv?.SESSION_SECRET,
  };
}

export function getPrimaryAdminUsername(
  envOverride?: AdminAuthEnv,
): string {
  const username = readAuthEnv(envOverride).ADMIN_USERNAME ?? "";
  return username.length <= MAX_USERNAME_LENGTH ? username : "";
}

function validSessionSecret(value: string | undefined): string | null {
  if (!value || value.length > 4_096) return null;
  return textEncoder.encode(value).length >= 32 ? value : null;
}

async function signSession(
  encodedPayload: string,
  secret: string,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    textEncoder.encode(encodedPayload),
  );
  return new Uint8Array(signature);
}

async function verifySessionSignature(
  encodedPayload: string,
  signature: Uint8Array,
  secret: string,
): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      textEncoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    return await crypto.subtle.verify(
      "HMAC",
      key,
      ownedArrayBuffer(signature),
      textEncoder.encode(encodedPayload),
    );
  } catch {
    return false;
  }
}

function timingSafeStringEqual(left: string, right: string): boolean {
  const leftBytes = textEncoder.encode(left);
  const rightBytes = textEncoder.encode(right);
  const length = Math.max(leftBytes.length, rightBytes.length);
  let difference = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}

function ownedArrayBuffer(value: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy.buffer;
}

function bytesToBase64Url(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/u, "");
}

function base64UrlToBytes(value: string): Uint8Array | null {
  if (!value || !/^[A-Za-z0-9_-]+$/u.test(value)) return null;

  const paddingLength = (4 - (value.length % 4)) % 4;
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/") +
    "=".repeat(paddingLength);
  try {
    const binary = atob(base64);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

function randomBase64Url(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

function cookieHeaderFrom(source: Request | Headers): string | null {
  return "headers" in source
    ? source.headers.get("cookie")
    : source.get("cookie");
}

function readCookieFromHeader(
  cookieHeader: string | null,
  name: string,
): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() === name) {
      return part.slice(separator + 1).trim();
    }
  }
  return undefined;
}

function isValidSessionIdentity(
  identity: AuthenticatedAdminIdentity,
): boolean {
  if (
    !identity.username ||
    identity.username.length > MAX_USERNAME_LENGTH
  ) {
    return false;
  }
  if (identity.accountType === "primary") {
    return identity.accountId === null && identity.sessionVersion === null;
  }
  return (
    Number.isSafeInteger(identity.accountId) &&
    (identity.accountId ?? 0) > 0 &&
    Number.isSafeInteger(identity.sessionVersion) &&
    (identity.sessionVersion ?? 0) > 0
  );
}

function sessionFromPayload(
  payload: SessionPayload,
  identity: {
    username: string;
    accountType: "primary" | "secondary";
    accountId: number | null;
    permissions: AdminGrantedPermission[];
  },
): AdminSession {
  return {
    username: identity.username,
    role: "admin",
    accountType: identity.accountType,
    accountId: identity.accountId,
    permissions: [...identity.permissions],
    issuedAt: payload.issuedAt,
    expiresAt: payload.expiresAt,
  };
}
