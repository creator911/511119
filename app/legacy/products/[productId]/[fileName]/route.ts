import {
  MAX_LEGACY_MEDIA_CHUNK_BYTES,
  MAX_LEGACY_MEDIA_CHUNKS,
  MAX_LEGACY_PRODUCT_IMAGE_BYTES,
  type LegacyProductChunkManifest,
  legacyProductMediaChunkObjectKey,
  legacyProductMediaObjectKey,
  productMediaBucket,
  validLegacyMediaUploadId,
  validLegacyProductMediaContentType,
  validLegacyProductMediaPath,
} from "@/lib/admin-media";

interface LegacyProductMediaRouteContext {
  params: Promise<{ productId: string; fileName: string }>;
}

const LEGACY_MEDIA_CACHE_CONTROL = "public, max-age=0, must-revalidate";

export async function GET(
  request: Request,
  context: LegacyProductMediaRouteContext,
): Promise<Response> {
  const path = await legacyMediaPath(context);
  if (!path) return notFound();

  const bucket = productMediaBucket();
  const object = await bucket.get(legacyProductMediaObjectKey(path));
  if (!object) return notFound();

  if (object.customMetadata?.legacyChunked === "1") {
    const manifest = await readChunkManifest(object, path);
    if (!manifest) return notFound();
    const headers = chunkedImageHeaders(manifest);
    if (ifNoneMatchMatches(request, headers.get("ETag") ?? "")) {
      return new Response(null, { status: 304, headers });
    }
    const image = await readChunkedImage(bucket, manifest);
    if (!image) return notFound();
    return new Response(image, {
      status: 200,
      headers,
    });
  }

  if (ifNoneMatchMatches(request, object.httpEtag)) {
    return new Response(null, {
      status: 304,
      headers: immutableImageHeaders(object),
    });
  }

  return new Response(object.body, {
    status: 200,
    headers: immutableImageHeaders(object),
  });
}

export async function HEAD(
  request: Request,
  context: LegacyProductMediaRouteContext,
): Promise<Response> {
  const path = await legacyMediaPath(context);
  if (!path) return notFound();

  const bucket = productMediaBucket();
  const object = await bucket.head(legacyProductMediaObjectKey(path));
  if (!object) return notFound();
  if (object.customMetadata?.legacyChunked === "1") {
    const metadata = chunkedMetadata(object, path);
    if (!metadata || !(await validateChunkHeads(bucket, path, metadata))) {
      return notFound();
    }
    const headers = chunkedImageHeaders(metadata);
    return new Response(null, {
      status: ifNoneMatchMatches(request, headers.get("ETag") ?? "")
        ? 304
        : 200,
      headers,
    });
  }
  return new Response(null, {
    status: ifNoneMatchMatches(request, object.httpEtag) ? 304 : 200,
    headers: immutableImageHeaders(object),
  });
}

async function legacyMediaPath(
  context: LegacyProductMediaRouteContext,
): Promise<string | null> {
  const { productId, fileName } = await context.params;
  const path = `/legacy/products/${productId}/${fileName}`;
  return validLegacyProductMediaPath(path) ? path : null;
}

function immutableImageHeaders(object: R2Object): Headers {
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Cache-Control", LEGACY_MEDIA_CACHE_CONTROL);
  headers.set("ETag", object.httpEtag);
  headers.set("Content-Length", object.size.toString());
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Content-Security-Policy", "default-src 'none'; sandbox");
  return headers;
}

async function readChunkManifest(
  object: R2ObjectBody,
  path: string,
): Promise<LegacyProductChunkManifest | null> {
  const metadata = chunkedMetadata(object, path);
  if (!metadata || object.size > 256 * 1024) return null;

  let candidate: unknown;
  try {
    candidate = await object.json();
  } catch {
    return null;
  }
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return null;
  }
  const manifest = candidate as Partial<LegacyProductChunkManifest>;
  if (
    manifest.version !== 1 ||
    manifest.path !== path ||
    manifest.contentType !== metadata.contentType ||
    manifest.size !== metadata.size ||
    manifest.sha256 !== metadata.sha256 ||
    !Array.isArray(manifest.chunks) ||
    manifest.chunks.length !== metadata.chunkCount
  ) {
    return null;
  }

  let total = 0;
  for (let index = 0; index < manifest.chunks.length; index += 1) {
    const chunk = manifest.chunks[index];
    const expectedSize =
      index === manifest.chunks.length - 1
        ? manifest.size -
          MAX_LEGACY_MEDIA_CHUNK_BYTES * (manifest.chunks.length - 1)
        : MAX_LEGACY_MEDIA_CHUNK_BYTES;
    if (
      !chunk ||
      chunk.key !==
        legacyProductMediaChunkObjectKey(path, manifest.sha256, index) ||
      chunk.size !== expectedSize ||
      !validLegacyMediaUploadId(chunk.sha256)
    ) {
      return null;
    }
    total += chunk.size;
  }
  return total === manifest.size
    ? (manifest as LegacyProductChunkManifest)
    : null;
}

function chunkedMetadata(
  object: R2Object,
  path: string,
): {
  size: number;
  sha256: string;
  chunkCount: number;
  contentType: LegacyProductChunkManifest["contentType"];
} | null {
  const sizeText = object.customMetadata?.legacySize ?? "";
  const chunkCountText = object.customMetadata?.legacyChunkCount ?? "";
  const size = /^\d+$/u.test(sizeText) ? Number(sizeText) : 0;
  const chunkCount = /^\d+$/u.test(chunkCountText)
    ? Number(chunkCountText)
    : 0;
  const sha256 = object.customMetadata?.legacySha256 ?? "";
  const contentType = object.customMetadata?.legacyContentType ?? "";
  if (
    object.customMetadata?.legacyPath !== path ||
    !validLegacyProductMediaContentType(contentType) ||
    !Number.isSafeInteger(size) ||
    size < 1 ||
    size > MAX_LEGACY_PRODUCT_IMAGE_BYTES ||
    !validLegacyMediaUploadId(sha256) ||
    !Number.isSafeInteger(chunkCount) ||
    chunkCount < 1 ||
    chunkCount > MAX_LEGACY_MEDIA_CHUNKS ||
    chunkCount !== Math.ceil(size / MAX_LEGACY_MEDIA_CHUNK_BYTES)
  ) {
    return null;
  }
  return { size, sha256, chunkCount, contentType };
}

function chunkedImageHeaders(metadata: {
  size: number;
  sha256: string;
  contentType: LegacyProductChunkManifest["contentType"];
}): Headers {
  const headers = new Headers();
  headers.set("Content-Type", metadata.contentType);
  headers.set("Cache-Control", LEGACY_MEDIA_CACHE_CONTROL);
  headers.set("ETag", `"${metadata.sha256}"`);
  headers.set("Content-Length", String(metadata.size));
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Content-Security-Policy", "default-src 'none'; sandbox");
  return headers;
}

async function readChunkedImage(
  bucket: R2Bucket,
  manifest: LegacyProductChunkManifest,
): Promise<ArrayBuffer | null> {
  const assembled = new Uint8Array(manifest.size);
  let offset = 0;
  for (const chunk of manifest.chunks) {
    const object = await bucket.get(chunk.key);
    if (
      !object ||
      object.size !== chunk.size ||
      object.customMetadata?.sha256 !== chunk.sha256
    ) {
      return null;
    }
    const bytes = new Uint8Array(await object.arrayBuffer());
    if (
      bytes.byteLength !== chunk.size ||
      (await sha256Hex(bytes)) !== chunk.sha256
    ) {
      return null;
    }
    assembled.set(bytes, offset);
    offset += bytes.byteLength;
  }
  if (
    offset !== manifest.size ||
    (await sha256Hex(assembled)) !== manifest.sha256
  ) {
    return null;
  }
  return assembled.buffer;
}

async function validateChunkHeads(
  bucket: R2Bucket,
  path: string,
  metadata: { size: number; sha256: string; chunkCount: number },
): Promise<boolean> {
  for (let index = 0; index < metadata.chunkCount; index += 1) {
    const object = await bucket.head(
      legacyProductMediaChunkObjectKey(path, metadata.sha256, index),
    );
    const expectedSize =
      index === metadata.chunkCount - 1
        ? metadata.size -
          MAX_LEGACY_MEDIA_CHUNK_BYTES * (metadata.chunkCount - 1)
        : MAX_LEGACY_MEDIA_CHUNK_BYTES;
    if (
      !object ||
      object.size !== expectedSize ||
      object.customMetadata?.legacyPath !== path ||
      object.customMetadata?.uploadId !== metadata.sha256 ||
      object.customMetadata?.chunkIndex !== String(index) ||
      object.customMetadata?.chunkCount !== String(metadata.chunkCount) ||
      object.customMetadata?.totalSize !== String(metadata.size) ||
      !validLegacyMediaUploadId(object.customMetadata?.sha256 ?? "")
    ) {
      return false;
    }
  }
  return true;
}

function ifNoneMatchMatches(request: Request, etag: string): boolean {
  const value = request.headers.get("if-none-match");
  if (!value || !etag) return false;
  return value.split(",").some((candidate) => {
    const normalized = candidate.trim().replace(/^W\//iu, "");
    return normalized === "*" || normalized === etag;
  });
}

async function sha256Hex(value: Uint8Array): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new Uint8Array(value).buffer),
  );
  return [...digest]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function notFound(): Response {
  return new Response("Not found", {
    status: 404,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
