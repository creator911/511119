import { AdminApiError } from "@/lib/admin-api";
import {
  HttpBoundaryError,
  noStoreJson,
  readBoundedJson,
} from "@/lib/http-boundary";
import { createRestockRequest } from "@/lib/restock-notifications";

const MAX_BODY_BYTES = 8_192;

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (!isSameOrigin(request)) {
    return noStoreJson(
      { ok: false, error: "요청 출처를 확인해 주세요." },
      { status: 403 },
    );
  }
  try {
    const { id } = await context.params;
    const input = await readBoundedJson<unknown>(request, MAX_BODY_BYTES);
    const created = await createRestockRequest(request, id, input);
    return noStoreJson({ ok: true, ...created }, { status: 201 });
  } catch (error) {
    if (error instanceof AdminApiError) {
      return noStoreJson(
        { ok: false, error: error.message },
        { status: error.status },
      );
    }
    if (error instanceof HttpBoundaryError) {
      return noStoreJson(
        { ok: false, error: "신청 정보를 확인해 주세요." },
        { status: error.status },
      );
    }
    return noStoreJson(
      { ok: false, error: "재입고 알림 신청을 처리하지 못했습니다." },
      { status: 503 },
    );
  }
}

function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}
