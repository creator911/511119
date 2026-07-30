import { pbkdf2 as nodePbkdf2 } from "node:crypto";

interface PasswordRecord {
  iterations: number;
  salt: Uint8Array;
  digest: Uint8Array;
}

const MIN_PBKDF2_ITERATIONS = 100_000;
const MAX_PBKDF2_ITERATIONS = 2_000_000;
// The deployed Workers runtime supports PBKDF2 through 100,000 iterations.
// Keep generated records at that verified maximum so administrator accounts
// remain portable between local development and production.
const GENERATED_PBKDF2_ITERATIONS = 100_000;
const MAX_PASSWORD_LENGTH = 1_024;
const textEncoder = new TextEncoder();

// Used only to keep unknown or malformed records on an expensive verify path.
const DUMMY_PASSWORD_RECORD: PasswordRecord = {
  iterations: 120_000,
  salt: hexToBytes("d48cc57ae79e4af182925cc5f2c6729e")!,
  digest: hexToBytes(
    "461ec53d14f497ed3a9f88f6f9fa861b1359394d7d4ff70f47fb403724d5e9fb",
  )!,
};

/**
 * Verifies either supported PBKDF2-HMAC-SHA-256 encoding:
 * pbkdf2-sha256$iterations$salt-hex$digest-hex or
 * salt-hex:iterations:digest-hex.
 */
export async function verifyPbkdf2Password(
  password: string,
  encodedHash: string | undefined,
): Promise<boolean> {
  const parsedRecord = parsePasswordRecord(encodedHash);
  const record = parsedRecord ?? DUMMY_PASSWORD_RECORD;
  const passwordWithinLimit =
    password.length > 0 && password.length <= MAX_PASSWORD_LENGTH;

  let derived: Uint8Array;
  try {
    derived = await derivePasswordDigest(
      password.slice(0, MAX_PASSWORD_LENGTH),
      record,
    );
  } catch {
    return false;
  }

  return (
    parsedRecord !== null &&
    passwordWithinLimit &&
    timingSafeBytesEqual(derived, record.digest)
  );
}

export async function hashAdminPassword(password: string): Promise<string> {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const digest = await derivePasswordDigest(password, {
    iterations: GENERATED_PBKDF2_ITERATIONS,
    salt,
    digest: new Uint8Array(32),
  });
  return `pbkdf2-sha256$${GENERATED_PBKDF2_ITERATIONS}$${bytesToHex(salt)}$${bytesToHex(digest)}`;
}

function parsePasswordRecord(
  value: string | undefined,
): PasswordRecord | null {
  if (!value || value.length > 512) return null;

  let iterationsText: string;
  let saltHex: string;
  let digestHex: string;

  if (value.startsWith("pbkdf2-sha256$")) {
    const parts = value.split("$");
    if (parts.length !== 4) return null;
    [, iterationsText, saltHex, digestHex] = parts;
  } else {
    const parts = value.split(":");
    if (parts.length !== 3) return null;
    [saltHex, iterationsText, digestHex] = parts;
  }

  const iterations = Number(iterationsText);
  const salt = hexToBytes(saltHex);
  const digest = hexToBytes(digestHex);
  if (
    !Number.isSafeInteger(iterations) ||
    iterations < MIN_PBKDF2_ITERATIONS ||
    iterations > MAX_PBKDF2_ITERATIONS ||
    !salt ||
    salt.length < 16 ||
    salt.length > 64 ||
    !digest ||
    digest.length !== 32
  ) {
    return null;
  }

  return { iterations, salt, digest };
}

async function derivePasswordDigest(
  password: string,
  record: PasswordRecord,
): Promise<Uint8Array> {
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      textEncoder.encode(password),
      "PBKDF2",
      false,
      ["deriveBits"],
    );
    const bits = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        hash: "SHA-256",
        salt: ownedArrayBuffer(record.salt),
        iterations: record.iterations,
      },
      key,
      256,
    );
    return new Uint8Array(bits);
  } catch {
    return derivePasswordDigestWithNodeCrypto(password, record);
  }
}

async function derivePasswordDigestWithNodeCrypto(
  password: string,
  record: PasswordRecord,
): Promise<Uint8Array> {
  return new Promise<Uint8Array>((resolve, reject) => {
    nodePbkdf2(
      textEncoder.encode(password),
      Uint8Array.from(record.salt),
      record.iterations,
      32,
      "sha256",
      (error, derivedKey) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(Uint8Array.from(derivedKey));
      },
    );
  });
}

function ownedArrayBuffer(value: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy.buffer;
}

function timingSafeBytesEqual(
  left: Uint8Array,
  right: Uint8Array,
): boolean {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}

function hexToBytes(value: string): Uint8Array | null {
  if (
    value.length === 0 ||
    value.length % 2 !== 0 ||
    !/^[0-9a-f]+$/iu.test(value)
  ) {
    return null;
  }

  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(value: Uint8Array): string {
  return [...value]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
