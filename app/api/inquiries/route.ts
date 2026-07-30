import {
  AdminApiError,
  adminApiErrorResponse,
  adminJson,
  assertSameOrigin,
} from "@/lib/admin-api";
import {
  createPublicInquiry,
  getCustomerInquiry,
  getPublicInquirySettings,
  listCustomerInquiries,
} from "@/lib/admin-community";
import { getCustomerSession } from "@/lib/customer-auth";
import { readBoundedJson } from "@/lib/http-boundary";

export async function GET(request: Request): Promise<Response> {
  try {
    const [settings, session] = await Promise.all([
      getPublicInquirySettings(),
      getCustomerSession(request),
    ]);
    const url = new URL(request.url);
    const inquiryId = (url.searchParams.get("id") ?? "").trim();
    if (inquiryId) {
      if (!session) {
        throw new AdminApiError(401, "회원 로그인이 필요합니다.");
      }
      const inquiry = await getCustomerInquiry(session.userId, inquiryId);
      if (!inquiry) {
        throw new AdminApiError(404, "문의를 찾을 수 없습니다.");
      }
      return adminJson({ ok: true, viewer: "member", inquiry });
    }
    const inquiries = session
      ? await listCustomerInquiries(session.userId, {
          page: positiveInteger(url.searchParams.get("page")),
          pageSize: positiveInteger(url.searchParams.get("pageSize")),
          query: url.searchParams.get("q") ?? "",
        })
      : {
          items: [],
          page: 1,
          pageSize: 10,
          pageCount: 1,
          total: 0,
        };
    return adminJson({
      ok: true,
      settings,
      viewer: session ? "member" : "guest",
      inquiries,
    });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    let input: unknown;
    try {
      input = await readBoundedJson<unknown>(request, 80_000);
    } catch {
      throw new AdminApiError(400, "문의 내용을 확인해 주세요.");
    }
    const session = await getCustomerSession(request);
    const created = await createPublicInquiry(input, {
      userId: session?.userId,
      clientKey: await inquiryClientKey(request),
    });
    return adminJson(
      {
        ok: true,
        inquiry: {
          id: created.inquiry.id,
          status: created.inquiry.status,
          createdAt: created.inquiry.createdAt,
        },
        ...(created.lookupToken
          ? { lookupToken: created.lookupToken }
          : {}),
      },
      201,
    );
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

function positiveInteger(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0
    ? Math.trunc(parsed)
    : undefined;
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
