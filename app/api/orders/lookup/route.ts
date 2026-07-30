import {
  HttpBoundaryError,
  isJsonObject,
  noStoreJson,
  readBoundedJson,
} from "@/lib/http-boundary";
import { lookupOrder } from "@/lib/order-lookup";

const MAX_LOOKUP_BODY_BYTES = 8_192;

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return noStoreJson(
      { error: "잘못된 주문 조회 요청입니다." },
      { status: 400 },
    );
  }

  let body: unknown;
  try {
    body = await readBoundedJson<unknown>(request, MAX_LOOKUP_BODY_BYTES);
  } catch (error) {
    const status = error instanceof HttpBoundaryError ? error.status : 400;
    return noStoreJson(
      { error: "주문 조회 요청을 확인해 주세요." },
      { status },
    );
  }

  const input = isJsonObject(body) ? body : {};
  const orderId = typeof input.orderId === "string" ? input.orderId.trim() : "";
  const email = typeof input.email === "string" ? input.email.trim() : "";
  const token = typeof input.token === "string" ? input.token : "";
  return lookupOrder(request, { orderId, email, token });
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
