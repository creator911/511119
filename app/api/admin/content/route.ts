import {
  AdminApiError,
  adminApiErrorResponse,
  adminJson,
  assertSameOrigin,
  readAdminJson,
  requireAdminApiSession,
} from "@/lib/admin-api";
import {
  createContentEntry,
  listContentEntries,
  type ContentEntryType,
} from "@/lib/site-content";

function readEntryType(url: string): ContentEntryType {
  const value = new URL(url).searchParams.get("type") ?? "page";
  if (value !== "page" && value !== "faq") {
    throw new AdminApiError(400, "콘텐츠 종류가 올바르지 않습니다.");
  }
  return value;
}

export async function GET(request: Request) {
  try {
    await requireAdminApiSession(request);
    assertSameOrigin(request);
    const entryType = readEntryType(request.url);
    const entries = await listContentEntries(entryType, { strict: true });
    return adminJson({ ok: true, entries });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireAdminApiSession(request);
    assertSameOrigin(request);
    const input = await readAdminJson(request, 80_000);
    const entry = await createContentEntry(input, {
      adminUsername: session.username,
    });
    return adminJson({ ok: true, entry }, 201);
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}
