import {
  adminApiErrorResponse,
  adminJson,
  assertSameOrigin,
  readAdminJson,
  requireAdminApiSession,
} from "@/lib/admin-api";
import {
  deleteManagedBanner,
  getAdminBannerById,
  updateManagedBanner,
} from "@/lib/admin-banners";

interface BannerRouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(
  request: Request,
  context: BannerRouteContext,
): Promise<Response> {
  try {
    await requireAdminApiSession(request);
    const { id } = await context.params;
    const record = await getAdminBannerById(id, {
      strict: true,
      includeDeleted: false,
    });
    if (!record) {
      return adminJson(
        { ok: false, message: "배너를 찾을 수 없습니다." },
        404,
      );
    }
    return adminJson({ ok: true, banner: record });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  context: BannerRouteContext,
): Promise<Response> {
  try {
    assertSameOrigin(request);
    const session = await requireAdminApiSession(request);
    const { id } = await context.params;
    const input = await readAdminJson(request, 25_000);
    const record = await updateManagedBanner(id, input, {
      adminUsername: session.username,
    });
    return adminJson({ ok: true, banner: record });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export const PUT = PATCH;

export async function DELETE(
  request: Request,
  context: BannerRouteContext,
): Promise<Response> {
  try {
    assertSameOrigin(request);
    const session = await requireAdminApiSession(request);
    const { id } = await context.params;
    const rawRevision = new URL(request.url).searchParams.get("revision");
    const expectedRevision = Number(rawRevision);
    if (
      !rawRevision ||
      !Number.isSafeInteger(expectedRevision) ||
      expectedRevision < 0 ||
      expectedRevision > 2_147_483_647
    ) {
      return adminJson(
        { ok: false, message: "배너 변경 기준값을 확인해 주세요." },
        400,
      );
    }
    const record = await deleteManagedBanner(id, {
      adminUsername: session.username,
      expectedRevision,
    });
    return adminJson({
      ok: true,
      deletedId: id,
      revision: record.revision,
    });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}
