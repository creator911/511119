import {
  commerceDb,
  commerceEnvironment,
  ensureCommerceSchema,
} from "@/lib/commerce-db";
import { pbkdf2 as nodePbkdf2 } from "node:crypto";

export interface CustomerSession {
  userId: string;
  loginId: string;
  name: string;
  sessionVersion: number;
  remember: boolean;
  expiresAt: number;
}

const COOKIE_NAME = "kg_customer";
const encoder = new TextEncoder();

function bytesToHex(bytes: Uint8Array) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(value: string) {
  if (!/^[a-f0-9]+$/i.test(value) || value.length % 2) return new Uint8Array();
  return Uint8Array.from(value.match(/.{2}/g) ?? [], (pair) => Number.parseInt(pair, 16));
}

function base64UrlEncode(value: Uint8Array | string) {
  const bytes = typeof value === "string" ? encoder.encode(value) : value;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array) {
  const length = Math.max(a.length, b.length);
  let difference = a.length ^ b.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return difference === 0;
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number) {
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(password),
      "PBKDF2",
      false,
      ["deriveBits"],
    );
    const bits = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        hash: "SHA-256",
        salt: new Uint8Array(salt).buffer,
        iterations,
      },
      key,
      256,
    );
    return new Uint8Array(bits);
  } catch (error) {
    if (!hasErrorName(error, "NotSupportedError")) throw error;
    return new Promise<Uint8Array>((resolve, reject) => {
      nodePbkdf2(
        encoder.encode(password),
        Uint8Array.from(salt),
        iterations,
        32,
        "sha256",
        (pbkdf2Error, derivedKey) => {
          if (pbkdf2Error) {
            reject(pbkdf2Error);
            return;
          }
          resolve(Uint8Array.from(derivedKey));
        },
      );
    });
  }
}

function hasErrorName(error: unknown, name: string) {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === name
  );
}

export async function hashCustomerPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  // Cloudflare Workers rejects higher PBKDF2 costs on some isolates.
  // Keep this at the highest value verified consistently in production.
  const iterations = 100_000;
  const digest = await pbkdf2(password, salt, iterations);
  return `pbkdf2$${iterations}$${bytesToHex(salt)}$${bytesToHex(digest)}`;
}

export async function verifyCustomerPassword(password: string, encoded: string) {
  const [algorithm, iterationText, saltText, digestText] = encoded.split("$");
  const iterations = Number(iterationText);
  if (
    algorithm !== "pbkdf2" ||
    !Number.isInteger(iterations) ||
    iterations < 100_000 ||
    iterations > 1_000_000
  ) {
    return false;
  }
  const salt = hexToBytes(saltText);
  const expected = hexToBytes(digestText);
  if (salt.length !== 16 || expected.length !== 32) return false;
  return timingSafeEqual(await pbkdf2(password, salt, iterations), expected);
}

function secretFor(request: Request) {
  const configured = commerceEnvironment().SESSION_SECRET;
  if (configured && configured.length >= 32) return configured;
  const hostname = new URL(request.url).hostname;
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return "local-development-session-secret-change-before-deploy";
  }
  throw new Error("SESSION_SECRET 환경변수가 설정되지 않았습니다.");
}

async function sign(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}

export async function createCustomerSessionCookie(
  request: Request,
  session: Omit<CustomerSession, "expiresAt">,
  options: { remember?: boolean } = {},
) {
  if (
    !Number.isSafeInteger(session.sessionVersion) ||
    session.sessionVersion < 1
  ) {
    throw new Error("유효한 회원 세션 버전이 필요합니다.");
  }
  const remember = options.remember ?? session.remember;
  const maxAgeSeconds = remember ? 60 * 60 * 24 * 14 : 60 * 60 * 12;
  const payload: CustomerSession = {
    ...session,
    expiresAt: Date.now() + maxAgeSeconds * 1_000,
  };
  const body = base64UrlEncode(JSON.stringify(payload));
  const signature = base64UrlEncode(await sign(body, secretFor(request)));
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  const persistence = remember ? `; Max-Age=${maxAgeSeconds}` : "";
  return `${COOKIE_NAME}=${body}.${signature}; Path=/; HttpOnly; SameSite=Lax${persistence}${secure}`;
}

export function clearCustomerSessionCookie(request: Request) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

function cookieValue(request: Request, name: string) {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return "";
}

export async function getCustomerSession(request: Request): Promise<CustomerSession | null> {
  try {
    const token = cookieValue(request, COOKIE_NAME);
    const [body, signature] = token.split(".");
    if (!body || !signature) return null;
    const expected = await sign(body, secretFor(request));
    if (!timingSafeEqual(expected, base64UrlDecode(signature))) return null;
    const session = JSON.parse(
      new TextDecoder().decode(base64UrlDecode(body)),
    ) as CustomerSession;
    if (
      !session.userId ||
      !session.loginId ||
      !session.name ||
      !Number.isSafeInteger(session.sessionVersion) ||
      session.sessionVersion < 1 ||
      typeof session.remember !== "boolean" ||
      session.expiresAt <= Date.now()
    ) {
      return null;
    }
    await ensureCommerceSchema();
    const database = commerceDb();
    const currentUser = await database
      .prepare(
        `SELECT login_id, name, active
         FROM users WHERE id = ? LIMIT 1`,
      )
      .bind(session.userId)
      .first<{ login_id: string; name: string; active: number }>();
    if (!currentUser?.active) return null;
    const state = await database
      .prepare(
        `SELECT session_version
         FROM user_session_state WHERE user_id = ? LIMIT 1`,
      )
      .bind(session.userId)
      .first<{ session_version: number }>();
    if (
      !state ||
      Number(state.session_version) !== session.sessionVersion
    ) {
      return null;
    }
    return {
      ...session,
      loginId: currentUser.login_id,
      name: currentUser.name,
    };
  } catch {
    return null;
  }
}

export async function createOrderLookupToken(
  request: Request,
  orderId: string,
) {
  const body = base64UrlEncode(
    JSON.stringify({ orderId, expiresAt: Date.now() + 86400000 }),
  );
  return `${body}.${base64UrlEncode(await sign(body, secretFor(request)))}`;
}

export async function verifyOrderLookupToken(
  request: Request,
  token: string,
  orderId: string,
) {
  try {
    const [body, signature] = token.split(".");
    if (!body || !signature) return null;
    if (
      !timingSafeEqual(
        await sign(body, secretFor(request)),
        base64UrlDecode(signature),
      )
    ) {
      return null;
    }
    const payload = JSON.parse(
      new TextDecoder().decode(base64UrlDecode(body)),
    ) as { orderId: string; expiresAt: number };
    return payload.orderId === orderId && payload.expiresAt > Date.now()
      ? payload
      : null;
  } catch {
    return null;
  }
}
