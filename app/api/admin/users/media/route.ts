import {
  AdminApiError,
  adminApiErrorResponse,
  adminJson,
  assertSameOrigin,
  readAdminJson,
  requireAdminApiSession,
} from "@/lib/admin-api";
import {
  deleteMemberImage,
  MAX_PRODUCT_IMAGE_BYTES,
  storeProductImage,
} from "@/lib/admin-media";

const MAX_MEMBER_MEDIA_REQUEST_BYTES =
  MAX_PRODUCT_IMAGE_BYTES + 512 * 1024;

export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    await requireAdminApiSession(request);
    const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.includes("multipart/form-data")) {
      throw new AdminApiError(415, "회원 이미지 파일을 선택해 주세요.");
    }
    const contentLength = Number(request.headers.get("content-length"));
    if (
      Number.isFinite(contentLength) &&
      contentLength > MAX_MEMBER_MEDIA_REQUEST_BYTES
    ) {
      throw new AdminApiError(413, "회원 이미지는 5MB 이하로 올려 주세요.");
    }
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new AdminApiError(400, "회원 이미지 파일을 선택해 주세요.", {
        file: "JPEG, PNG, WebP 또는 GIF 파일을 선택해 주세요.",
      });
    }
    const image = await storeProductImage(file, { purpose: "member" });
    return adminJson(
      {
        ok: true,
        url: image.url,
        contentType: image.contentType,
        size: image.size,
      },
      201,
    );
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export async function DELETE(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    await requireAdminApiSession(request);
    const payload = await readAdminJson(request, 2_000);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new AdminApiError(400, "회원 이미지 삭제 요청을 확인해 주세요.");
    }
    const url = (payload as Record<string, unknown>).url;
    if (typeof url !== "string") {
      throw new AdminApiError(400, "삭제할 회원 이미지 주소를 확인해 주세요.");
    }
    await deleteMemberImage(url);
    return adminJson({ ok: true, url });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}
