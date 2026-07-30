import {
  AdminApiError,
  adminApiErrorResponse,
  adminJson,
  assertSameOrigin,
} from "@/lib/admin-api";
import {
  createClubApplication,
  getClubSettings,
  listApprovedClubs,
  listMemberClubApplications,
} from "@/lib/clubs";
import { getCustomerSession } from "@/lib/customer-auth";
import { readBoundedJson } from "@/lib/http-boundary";

export async function GET(request: Request): Promise<Response> {
  try {
    const session = await getCustomerSession(request);
    const [settings, clubs, applications] = await Promise.all([
      getClubSettings(),
      listApprovedClubs(),
      session
        ? listMemberClubApplications(session.userId)
        : Promise.resolve([]),
    ]);
    return adminJson({
      ok: true,
      settings,
      clubs,
      viewer: session
        ? { authenticated: true, name: session.name }
        : { authenticated: false },
      applications,
    });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    const session = await getCustomerSession(request);
    if (!session) {
      throw new AdminApiError(401, "동호회 개설 신청은 회원 로그인 후 이용해 주세요.");
    }
    let input: unknown;
    try {
      input = await readBoundedJson<unknown>(request, 12_000);
    } catch {
      throw new AdminApiError(400, "동호회 신청 내용을 확인해 주세요.");
    }
    const club = await createClubApplication(input, {
      userId: session.userId,
      name: session.name,
    });
    return adminJson({ ok: true, club }, 201);
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}
