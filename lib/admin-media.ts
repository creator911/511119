import { env } from "cloudflare:workers";
import { AdminApiError } from "@/lib/admin-api";
import {
  ensureAdminProductSchema,
  productDatabase,
} from "@/lib/admin-products";

export const MAX_PRODUCT_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_LEGACY_PRODUCT_IMAGE_BYTES = 12 * 1024 * 1024;
export const MAX_LEGACY_MEDIA_CHUNK_BYTES = 512 * 1024;
export const MAX_LEGACY_MEDIA_CHUNKS = Math.ceil(
  MAX_LEGACY_PRODUCT_IMAGE_BYTES / MAX_LEGACY_MEDIA_CHUNK_BYTES,
);
export const PRODUCT_MEDIA_CACHE_CONTROL =
  "public, max-age=31536000, immutable";
export const LEGACY_CHUNKED_MEDIA_CONTENT_TYPE =
  "application/vnd.kiel.legacy-chunked+json";

export interface StoredProductImage {
  key: string;
  objectKey: string;
  url: string;
  contentType: string;
  size: number;
}

export type LegacyProductMediaContentType =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "image/gif";

interface SupportedImage {
  contentType: LegacyProductMediaContentType;
  extension: "jpg" | "png" | "webp" | "gif";
}

export interface LegacyProductChunkManifest {
  version: 1;
  path: string;
  contentType: LegacyProductMediaContentType;
  size: number;
  sha256: string;
  chunks: Array<{
    key: string;
    size: number;
    sha256: string;
  }>;
}

export function productMediaBucket(): R2Bucket {
  const bucket = (env as unknown as { MEDIA?: R2Bucket }).MEDIA;
  if (!bucket) {
    throw new AdminApiError(503, "이미지 저장소가 준비되지 않았습니다.");
  }
  return bucket;
}

export function validProductMediaKey(value: string): boolean {
  return /^[a-f0-9]{32}\.(?:jpg|png|webp|gif)$/u.test(value);
}

export function productMediaObjectKey(key: string): string {
  if (!validProductMediaKey(key)) {
    throw new AdminApiError(400, "이미지 주소가 올바르지 않습니다.");
  }
  return `products/${key}`;
}

export function validLegacyProductMediaPath(value: string): boolean {
  return /^\/legacy\/products\/[A-Za-z0-9][A-Za-z0-9._-]{0,79}\/detail-[1-9][0-9]*\.jpg$/u.test(
    value,
  );
}

export function legacyProductMediaObjectKey(path: string): string {
  if (!validLegacyProductMediaPath(path)) {
    throw new AdminApiError(400, "기존 상품 상세 이미지 주소가 올바르지 않습니다.");
  }
  return path.slice(1);
}

export function validLegacyMediaUploadId(value: string): boolean {
  return /^[a-f0-9]{64}$/u.test(value);
}

export function validLegacyProductMediaContentType(
  value: string,
): value is LegacyProductMediaContentType {
  return (
    value === "image/jpeg" ||
    value === "image/png" ||
    value === "image/webp" ||
    value === "image/gif"
  );
}

export function legacyProductMediaChunkObjectKey(
  path: string,
  uploadId: string,
  chunkIndex: number,
): string {
  if (
    !validLegacyMediaUploadId(uploadId) ||
    !Number.isSafeInteger(chunkIndex) ||
    chunkIndex < 0 ||
    chunkIndex >= MAX_LEGACY_MEDIA_CHUNKS
  ) {
    throw new AdminApiError(400, "상세 이미지 조각 주소가 올바르지 않습니다.");
  }
  return `${legacyProductMediaObjectKey(path)}.chunks/${uploadId}/${String(
    chunkIndex + 1,
  ).padStart(3, "0")}`;
}

export async function storeProductImage(
  file: File,
  options: {
    bucket?: R2Bucket;
    database?: D1Database;
    purpose?: "product" | "member";
  } = {},
): Promise<StoredProductImage> {
  if (file.size <= 0 || file.size > MAX_PRODUCT_IMAGE_BYTES) {
    throw new AdminApiError(400, "이미지는 5MB 이하로 올려 주세요.", {
      file: "5MB 이하의 이미지를 선택해 주세요.",
    });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const image = identifySupportedImage(bytes);
  if (!image || !contentTypeMatches(file.type, image.contentType)) {
    throw new AdminApiError(
      400,
      "JPEG, PNG, WebP, GIF 이미지만 업로드할 수 있습니다.",
      { file: "지원되는 이미지 파일을 선택해 주세요." },
    );
  }

  const key = `${crypto.randomUUID().replace(/-/gu, "")}.${image.extension}`;
  const objectKey = productMediaObjectKey(key);
  const bucket = options.bucket ?? productMediaBucket();
  const database = options.database ?? productDatabase();
  const purpose = options.purpose ?? "product";

  await bucket.put(objectKey, bytes, {
    httpMetadata: {
      contentType: image.contentType,
      cacheControl: PRODUCT_MEDIA_CACHE_CONTROL,
    },
    customMetadata: {
      originalName: safeFileName(file.name),
      purpose,
    },
  });

  try {
    await ensureAdminProductSchema(database);
    await database
      .prepare(
        `INSERT INTO media_assets (
           id, object_key, file_name, content_type, size, alt
         ) VALUES (?, ?, ?, ?, ?, '')`,
      )
      .bind(
        key,
        objectKey,
        safeFileName(file.name),
        image.contentType,
        bytes.byteLength,
      )
      .run();
  } catch (error) {
    await bucket.delete(objectKey).catch(() => undefined);
    throw error;
  }

  return {
    key,
    objectKey,
    url: `/api/media/${key}`,
    contentType: image.contentType,
    size: bytes.byteLength,
  };
}

export async function deleteMemberImage(
  url: string,
  options: {
    bucket?: R2Bucket;
    database?: D1Database;
  } = {},
): Promise<void> {
  const match = /^\/api\/media\/([a-f0-9]{32}\.(?:jpg|png|webp|gif))$/u.exec(
    url.trim(),
  );
  if (!match) {
    throw new AdminApiError(400, "회원 이미지 주소가 올바르지 않습니다.");
  }
  const key = match[1]!;
  const objectKey = productMediaObjectKey(key);
  const bucket = options.bucket ?? productMediaBucket();
  const database = options.database ?? productDatabase();
  await ensureAdminProductSchema(database);

  const object = await bucket.head(objectKey);
  if (!object || object.customMetadata?.purpose !== "member") {
    throw new AdminApiError(404, "삭제할 회원 이미지를 찾을 수 없습니다.");
  }

  const userColumns = await database
    .prepare("PRAGMA table_info(users)")
    .all<{ name: string }>();
  const columnNames = new Set(
    (userColumns.results ?? []).map((column) => column.name),
  );
  if (columnNames.has("member_icon") && columnNames.has("member_image")) {
    const reference = await database
      .prepare(
        `SELECT COUNT(*) AS count
         FROM users
         WHERE member_icon = ? OR member_image = ?`,
      )
      .bind(url, url)
      .first<{ count: number }>();
    if (Number(reference?.count ?? 0) > 0) {
      throw new AdminApiError(
        409,
        "회원 정보에서 이미지를 먼저 삭제한 뒤 파일을 정리해 주세요.",
      );
    }
  }

  await bucket.delete(objectKey);
  await database
    .prepare(
      `DELETE FROM media_assets
       WHERE id = ? AND object_key = ?`,
    )
    .bind(key, objectKey)
    .run();
}

export async function storeLegacyProductImage(
  file: File,
  path: string,
  options: {
    bucket?: R2Bucket;
    database?: D1Database;
  } = {},
): Promise<StoredProductImage> {
  const objectKey = legacyProductMediaObjectKey(path);
  if (file.size <= 0 || file.size > MAX_LEGACY_PRODUCT_IMAGE_BYTES) {
    throw new AdminApiError(
      400,
      "기존 상품 상세 이미지는 12MB 이하로 올려 주세요.",
      { file: "12MB 이하의 JPEG 이미지를 선택해 주세요." },
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const image = identifySupportedImage(bytes);
  if (!image) {
    throw new AdminApiError(
      400,
      "기존 상품 상세 이미지는 JPEG, PNG, WebP, GIF만 업로드할 수 있습니다.",
      { file: "지원되는 이미지 파일을 선택해 주세요." },
    );
  }

  const bucket = options.bucket ?? productMediaBucket();
  const database = options.database ?? productDatabase();
  const mediaId = `legacy:${path.slice("/legacy/products/".length)}`;

  await bucket.put(objectKey, bytes, {
    httpMetadata: {
      contentType: image.contentType,
      cacheControl: PRODUCT_MEDIA_CACHE_CONTROL,
    },
    customMetadata: {
      originalName: safeFileName(file.name),
      legacyPath: path,
    },
  });

  await ensureAdminProductSchema(database);
  await database
    .prepare(
      `INSERT INTO media_assets (
         id, object_key, file_name, content_type, size, alt
       ) VALUES (?, ?, ?, ?, ?, '')
       ON CONFLICT(id) DO UPDATE SET
         object_key = excluded.object_key,
         file_name = excluded.file_name,
         content_type = excluded.content_type,
         size = excluded.size`,
    )
    .bind(
      mediaId,
      objectKey,
      safeFileName(file.name),
      image.contentType,
      bytes.byteLength,
    )
    .run();

  return {
    key: mediaId,
    objectKey,
    url: path,
    contentType: image.contentType,
    size: bytes.byteLength,
  };
}

export async function storeLegacyProductImageChunk(
  bytes: Uint8Array,
  input: {
    path: string;
    uploadId: string;
    chunkIndex: number;
    chunkCount: number;
    totalSize: number;
    chunkSha256: string;
  },
  options: { bucket?: R2Bucket } = {},
): Promise<{ key: string; size: number }> {
  const expectedChunkSize = validateLegacyChunkUpload(input);
  if (
    bytes.byteLength !== expectedChunkSize ||
    bytes.byteLength > MAX_LEGACY_MEDIA_CHUNK_BYTES
  ) {
    throw new AdminApiError(400, "상세 이미지 조각 크기가 올바르지 않습니다.");
  }
  const detectedImage =
    input.chunkIndex === 0 ? identifySupportedImage(bytes) : null;
  if (input.chunkIndex === 0 && !detectedImage) {
    throw new AdminApiError(400, "지원되는 상세 이미지만 업로드할 수 있습니다.");
  }

  const digestBytes = new Uint8Array(
    await crypto.subtle.digest(
      "SHA-256",
      new Uint8Array(bytes).buffer,
    ),
  );
  const digest = bytesToHex(digestBytes);
  if (digest !== input.chunkSha256) {
    throw new AdminApiError(400, "상세 이미지 조각의 무결성 확인에 실패했습니다.");
  }

  const key = legacyProductMediaChunkObjectKey(
    input.path,
    input.uploadId,
    input.chunkIndex,
  );
  await (options.bucket ?? productMediaBucket()).put(key, bytes, {
    sha256: digestBytes,
    httpMetadata: {
      contentType: "application/octet-stream",
      cacheControl: "no-store",
    },
    customMetadata: {
      legacyPath: input.path,
      uploadId: input.uploadId,
      chunkIndex: String(input.chunkIndex),
      chunkCount: String(input.chunkCount),
      totalSize: String(input.totalSize),
      sha256: input.chunkSha256,
      legacyContentType: detectedImage?.contentType ?? "",
    },
  });
  return { key, size: bytes.byteLength };
}

export async function completeLegacyProductImageChunks(
  input: {
    path: string;
    uploadId: string;
    chunkCount: number;
    totalSize: number;
  },
  options: {
    bucket?: R2Bucket;
    database?: D1Database;
  } = {},
): Promise<StoredProductImage> {
  validateLegacyChunkUpload({ ...input, chunkIndex: 0, chunkSha256: input.uploadId });
  const bucket = options.bucket ?? productMediaBucket();
  const database = options.database ?? productDatabase();
  const assembled = new Uint8Array(input.totalSize);
  const chunks: LegacyProductChunkManifest["chunks"] = [];
  let contentType: LegacyProductMediaContentType | null = null;
  let offset = 0;
  for (let chunkIndex = 0; chunkIndex < input.chunkCount; chunkIndex += 1) {
    const key = legacyProductMediaChunkObjectKey(
      input.path,
      input.uploadId,
      chunkIndex,
    );
    const object = await bucket.get(key);
    const expectedSize = expectedLegacyMediaChunkSize(
      input.totalSize,
      input.chunkCount,
      chunkIndex,
    );
    const recordedSha256 = object?.customMetadata?.sha256 ?? "";
    if (
      !object ||
      object.size !== expectedSize ||
      object.customMetadata?.legacyPath !== input.path ||
      object.customMetadata?.uploadId !== input.uploadId ||
      object.customMetadata?.chunkIndex !== String(chunkIndex) ||
      object.customMetadata?.chunkCount !== String(input.chunkCount) ||
      object.customMetadata?.totalSize !== String(input.totalSize) ||
      !validLegacyMediaUploadId(recordedSha256)
    ) {
      throw new AdminApiError(
        409,
        "상세 이미지 조각이 누락되었거나 올바르지 않습니다.",
      );
    }
    const chunkBytes = new Uint8Array(await object.arrayBuffer());
    if (chunkIndex === 0) {
      const detected = identifySupportedImage(chunkBytes)?.contentType;
      if (
        !detected ||
        object.customMetadata?.legacyContentType !== detected
      ) {
        throw new AdminApiError(409, "상세 이미지 형식을 확인할 수 없습니다.");
      }
      contentType = detected;
    }
    if (
      chunkBytes.byteLength !== expectedSize ||
      (await sha256Hex(chunkBytes)) !== recordedSha256
    ) {
      throw new AdminApiError(409, "상세 이미지 조각의 무결성이 올바르지 않습니다.");
    }
    assembled.set(chunkBytes, offset);
    offset += chunkBytes.byteLength;
    chunks.push({ key, size: chunkBytes.byteLength, sha256: recordedSha256 });
  }
  if (
    !contentType ||
    offset !== input.totalSize ||
    (await sha256Hex(assembled)) !== input.uploadId
  ) {
    throw new AdminApiError(409, "상세 이미지 전체 무결성 확인에 실패했습니다.");
  }

  const objectKey = legacyProductMediaObjectKey(input.path);
  const manifest: LegacyProductChunkManifest = {
    version: 1,
    path: input.path,
    contentType,
    size: input.totalSize,
    sha256: input.uploadId,
    chunks,
  };
  const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest));
  await bucket.put(objectKey, manifestBytes, {
    httpMetadata: {
      contentType: LEGACY_CHUNKED_MEDIA_CONTENT_TYPE,
      cacheControl: "no-store",
    },
    customMetadata: {
      legacyChunked: "1",
      legacyPath: input.path,
      legacyContentType: contentType,
      legacySize: String(input.totalSize),
      legacySha256: input.uploadId,
      legacyChunkCount: String(input.chunkCount),
    },
  });

  const mediaId = `legacy:${input.path.slice("/legacy/products/".length)}`;
  await ensureAdminProductSchema(database);
  await database
    .prepare(
      `INSERT INTO media_assets (
         id, object_key, file_name, content_type, size, alt
       ) VALUES (?, ?, ?, ?, ?, '')
       ON CONFLICT(id) DO UPDATE SET
         object_key = excluded.object_key,
         file_name = excluded.file_name,
         content_type = excluded.content_type,
         size = excluded.size`,
    )
    .bind(
      mediaId,
      objectKey,
      input.path.split("/").at(-1) ?? "detail.jpg",
      contentType,
      input.totalSize,
    )
    .run();

  return {
    key: mediaId,
    objectKey,
    url: input.path,
    contentType,
    size: input.totalSize,
  };
}

function validateLegacyChunkUpload(input: {
  path: string;
  uploadId: string;
  chunkIndex: number;
  chunkCount: number;
  totalSize: number;
  chunkSha256: string;
}): number {
  if (
    !validLegacyProductMediaPath(input.path) ||
    !validLegacyMediaUploadId(input.uploadId) ||
    !validLegacyMediaUploadId(input.chunkSha256) ||
    !Number.isSafeInteger(input.totalSize) ||
    input.totalSize < 1 ||
    input.totalSize > MAX_LEGACY_PRODUCT_IMAGE_BYTES ||
    !Number.isSafeInteger(input.chunkCount) ||
    input.chunkCount < 1 ||
    input.chunkCount > MAX_LEGACY_MEDIA_CHUNKS ||
    input.chunkCount !==
      Math.ceil(input.totalSize / MAX_LEGACY_MEDIA_CHUNK_BYTES) ||
    !Number.isSafeInteger(input.chunkIndex) ||
    input.chunkIndex < 0 ||
    input.chunkIndex >= input.chunkCount
  ) {
    throw new AdminApiError(400, "상세 이미지 조각 정보가 올바르지 않습니다.");
  }
  return expectedLegacyMediaChunkSize(
    input.totalSize,
    input.chunkCount,
    input.chunkIndex,
  );
}

function expectedLegacyMediaChunkSize(
  totalSize: number,
  chunkCount: number,
  chunkIndex: number,
): number {
  return chunkIndex === chunkCount - 1
    ? totalSize - MAX_LEGACY_MEDIA_CHUNK_BYTES * (chunkCount - 1)
    : MAX_LEGACY_MEDIA_CHUNK_BYTES;
}

export function identifySupportedImage(
  bytes: Uint8Array,
): SupportedImage | null {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return { contentType: "image/jpeg", extension: "jpg" };
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return { contentType: "image/png", extension: "png" };
  }
  if (
    bytes.length >= 12 &&
    ascii(bytes, 0, 4) === "RIFF" &&
    ascii(bytes, 8, 12) === "WEBP"
  ) {
    return { contentType: "image/webp", extension: "webp" };
  }
  if (
    bytes.length >= 6 &&
    (ascii(bytes, 0, 6) === "GIF87a" ||
      ascii(bytes, 0, 6) === "GIF89a")
  ) {
    return { contentType: "image/gif", extension: "gif" };
  }
  return null;
}

function contentTypeMatches(
  supplied: string,
  identified: SupportedImage["contentType"],
): boolean {
  if (!supplied) return true;
  const normalized =
    supplied.toLowerCase() === "image/jpg"
      ? "image/jpeg"
      : supplied.toLowerCase();
  return normalized === identified;
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  let output = "";
  for (let index = start; index < end; index += 1) {
    output += String.fromCharCode(bytes[index] ?? 0);
  }
  return output;
}

function safeFileName(value: string): string {
  const sanitized = value
    .replace(/[\u0000-\u001f\u007f/\\]/gu, "_")
    .trim()
    .slice(0, 160);
  return sanitized || "image";
}

function bytesToHex(value: Uint8Array): string {
  return [...value]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(value: Uint8Array): Promise<string> {
  return bytesToHex(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new Uint8Array(value).buffer),
    ),
  );
}
