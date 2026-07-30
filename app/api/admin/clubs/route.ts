import {
  adminApiErrorResponse,
  adminJson,
  assertSameOrigin,
  readAdminJson,
  requireAdminApiSession,
} from "@/lib/admin-api";
import {
  createAdminClub,
  listAdminClubs,
  type ClubStatus,
} from "@/lib/clubs";

export async function GET(request: Request): Promise<Response> {
  try {
    await requireAdminApiSession(request);
    const status = clubStatus(new URL(request.url).searchParams.get("status"));
    const clubs = await listAdminClubs({ status });
    return adminJson({ ok: true, clubs });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    const session = await requireAdminApiSession(request);
    const input = await readAdminJson(request, 20_000);
    const club = await createAdminClub(input, session.username);
    return adminJson({ ok: true, club }, 201);
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

function clubStatus(value: string | null): ClubStatus | undefined {
  return value === "pending" || value === "approved" || value === "rejected"
    ? value
    : undefined;
}
