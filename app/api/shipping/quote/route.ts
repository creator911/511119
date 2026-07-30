import { calculateShippingQuote } from "@/lib/commerce-promotions";
import {
  HttpBoundaryError,
  isJsonObject,
  noStoreJson,
  readBoundedJson,
} from "@/lib/http-boundary";
import { getEffectiveSiteSettings } from "@/lib/site-content";

const MAX_BODY_BYTES = 8_192;

export async function POST(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) {
    return noStoreJson({ error: "요청을 확인해 주세요." }, { status: 403 });
  }
  try {
    const input = await readBoundedJson<unknown>(request, MAX_BODY_BYTES);
    if (
      !isJsonObject(input) ||
      typeof input.postcode !== "string" ||
      typeof input.address1 !== "string" ||
      input.postcode.length > 20 ||
      input.address1.length > 200
    ) {
      return noStoreJson(
        { error: "배송지 정보를 확인해 주세요." },
        { status: 400 },
      );
    }
    const settings = await getEffectiveSiteSettings({ strict: true });
    const quote = await calculateShippingQuote({
      baseFee: settings.defaultShippingFee,
      postcode: input.postcode,
      address: input.address1,
    });
    return noStoreJson({ ok: true, quote });
  } catch (error) {
    if (error instanceof HttpBoundaryError) {
      return noStoreJson(
        { error: "배송비 확인 요청을 다시 확인해 주세요." },
        { status: error.status },
      );
    }
    return noStoreJson(
      { error: "추가배송비를 확인하지 못했습니다." },
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
