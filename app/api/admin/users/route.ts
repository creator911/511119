import {
  adminApiErrorResponse,
  adminJson,
  assertSameOrigin,
  readAdminJson,
  requireAdminApiSession,
} from "@/lib/admin-api";
import { getAdminMembersPage } from "@/lib/admin-data";
import { createAdminMember } from "@/lib/admin-operations";

export async function GET(request: Request): Promise<Response> {
  try {
    await requireAdminApiSession(request);
    const params = new URL(request.url).searchParams;
    const result = await getAdminMembersPage({
      page: readNumber(params.get("page")),
      pageSize: readNumber(params.get("pageSize")),
      q: params.get("q") ?? "",
      status: params.get("status") ?? "",
      dateStart: params.get("dateStart") ?? "",
      dateEnd: params.get("dateEnd") ?? "",
      sortBy: params.get("sortBy") ?? "",
      sortDirection: params.get("sortDirection") ?? "",
    });
    return adminJson({ ok: true, ...result });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    const session = await requireAdminApiSession(request);
    const input = await readAdminJson(request, 20_000);
    const member = await createAdminMember(input, session.username);
    return adminJson(
      {
        ok: true,
        member,
        message: "회원을 등록했습니다.",
      },
      201,
    );
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

function readNumber(value: string | null): number | undefined {
  if (!value || !/^\d+$/u.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}
