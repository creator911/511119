import {
  AdminApiError,
  adminApiErrorResponse,
  adminJson,
  assertSameOrigin,
  readAdminJson,
  requireAdminApiSession,
} from "@/lib/admin-api";
import {
  MAX_LEGACY_MEDIA_CHUNK_BYTES,
  MAX_LEGACY_PRODUCT_IMAGE_BYTES,
  MAX_PRODUCT_IMAGE_BYTES,
  completeLegacyProductImageChunks,
  storeLegacyProductImageChunk,
  storeLegacyProductImage,
  storeProductImage,
} from "@/lib/admin-media";

const MAX_MULTIPART_REQUEST_BYTES =
  Math.max(MAX_PRODUCT_IMAGE_BYTES, MAX_LEGACY_PRODUCT_IMAGE_BYTES) +
  512 * 1024;

export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    await requireAdminApiSession(request);

    const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return adminJson(
        { ok: false, message: "이미지 파일을 선택해 주세요." },
        415,
      );
    }

    // Keep an edge/WAF request-body limit at or below this ceiling too:
    // formData() buffers chunked multipart bodies before this route can inspect
    // the decoded File size.
    const contentLength = Number(request.headers.get("content-length"));
    if (
      Number.isFinite(contentLength) &&
      contentLength > MAX_MULTIPART_REQUEST_BYTES
    ) {
      return adminJson(
        {
          ok: false,
          message: "업로드 허용 크기를 초과했습니다.",
          fieldErrors: { file: "허용 크기 이하의 이미지를 선택해 주세요." },
        },
        413,
      );
    }

    const form = await request.formData();
    const candidate = form.get("file");
    if (!(candidate instanceof File)) {
      return adminJson(
        {
          ok: false,
          message: "이미지 파일을 선택해 주세요.",
          fieldErrors: { file: "이미지 파일을 선택해 주세요." },
        },
        400,
      );
    }

    const legacyPathEntry = form.get("legacyPath");
    if (
      legacyPathEntry !== null &&
      typeof legacyPathEntry !== "string"
    ) {
      return adminJson(
        { ok: false, message: "기존 상품 상세 이미지 주소가 올바르지 않습니다." },
        400,
      );
    }

    const legacyPath = legacyPathEntry?.trim() ?? "";
    const image = legacyPath
      ? await storeLegacyProductImage(candidate, legacyPath)
      : await storeProductImage(candidate);
    return adminJson({ ok: true, url: image.url }, 201);
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export async function PUT(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    await requireAdminApiSession(request);
    const contentType =
      request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() ??
      "";
    if (contentType !== "application/octet-stream") {
      throw new AdminApiError(415, "이미지 조각 형식이 올바르지 않습니다.");
    }

    const url = new URL(request.url);
    const bytes = await readBoundedImageChunk(request);
    const result = await storeLegacyProductImageChunk(bytes, {
      path: url.searchParams.get("legacyPath") ?? "",
      uploadId: url.searchParams.get("uploadId") ?? "",
      chunkIndex: requiredInteger(url.searchParams.get("chunkIndex")),
      chunkCount: requiredInteger(url.searchParams.get("chunkCount")),
      totalSize: requiredInteger(url.searchParams.get("totalSize")),
      chunkSha256: request.headers.get("x-chunk-sha256") ?? "",
    });
    return adminJson({ ok: true, ...result }, 201);
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export async function PATCH(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    await requireAdminApiSession(request);
    const payload = await readAdminJson(request, 8_192);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new AdminApiError(400, "상세 이미지 완료 정보가 올바르지 않습니다.");
    }
    const input = payload as Record<string, unknown>;
    if (
      typeof input.legacyPath !== "string" ||
      typeof input.uploadId !== "string" ||
      typeof input.chunkCount !== "number" ||
      typeof input.totalSize !== "number"
    ) {
      throw new AdminApiError(400, "상세 이미지 완료 정보가 올바르지 않습니다.");
    }
    const image = await completeLegacyProductImageChunks({
      path: input.legacyPath,
      uploadId: input.uploadId,
      chunkCount: input.chunkCount,
      totalSize: input.totalSize,
    });
    return adminJson({ ok: true, url: image.url }, 201);
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

async function readBoundedImageChunk(request: Request): Promise<Uint8Array> {
  const declaredLength = request.headers.get("content-length");
  if (
    declaredLength &&
    /^\d+$/u.test(declaredLength) &&
    Number(declaredLength) > MAX_LEGACY_MEDIA_CHUNK_BYTES
  ) {
    throw new AdminApiError(413, "이미지 조각 크기를 초과했습니다.");
  }

  const reader = request.body?.getReader();
  if (!reader) {
    throw new AdminApiError(400, "이미지 조각이 필요합니다.");
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value?.byteLength) continue;
    total += value.byteLength;
    if (total > MAX_LEGACY_MEDIA_CHUNK_BYTES) {
      await reader.cancel();
      throw new AdminApiError(413, "이미지 조각 크기를 초과했습니다.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function requiredInteger(value: string | null): number {
  if (!value || !/^\d+$/u.test(value)) {
    throw new AdminApiError(400, "이미지 조각 숫자 정보가 올바르지 않습니다.");
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new AdminApiError(400, "이미지 조각 숫자 정보가 올바르지 않습니다.");
  }
  return parsed;
}
