import {
  AdminApiError,
  adminApiErrorResponse,
  adminJson,
  assertSameOrigin,
} from "@/lib/admin-api";
import { getGuestInquiryByToken } from "@/lib/admin-community";
import { readBoundedJson } from "@/lib/http-boundary";

export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    let input: unknown;
    try {
      input = await readBoundedJson<unknown>(request, 4_096);
    } catch {
      throw new AdminApiError(400, "조회 토큰을 확인해 주세요.");
    }
    if (
      !input ||
      typeof input !== "object" ||
      Array.isArray(input) ||
      typeof (input as Record<string, unknown>).token !== "string"
    ) {
      throw new AdminApiError(400, "조회 토큰을 확인해 주세요.");
    }
    const token = (input as { token: string }).token.trim();
    const inquiry = await getGuestInquiryByToken(
      token,
      await inquiryClientKey(request),
    );
    if (!inquiry) {
      throw new AdminApiError(404, "조회할 수 있는 문의가 없습니다.");
    }
    return adminJson({ ok: true, inquiry });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

async function inquiryClientKey(request: Request): Promise<string> {
  // Cloudflare overwrites this header at the edge. Do not mix in
  // caller-controlled User-Agent/X-Forwarded-For values: changing either must
  // not create a fresh rate-limit bucket. Direct/local traffic deliberately
  // shares one conservative anonymous bucket.
  const source =
    request.headers.get("cf-connecting-ip")?.trim().slice(0, 128) ||
    "anonymous";
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(source || "anonymous"),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
