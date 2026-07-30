import {
  adminApiErrorResponse,
  adminJson,
  assertSameOrigin,
  readAdminJson,
  requireAdminApiSession,
} from "@/lib/admin-api";
import {
  deleteManagedCategory,
  getAdminCategoryRecords,
  updateManagedCategory,
} from "@/lib/admin-categories";

interface CategoryRouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(
  request: Request,
  context: CategoryRouteContext,
): Promise<Response> {
  try {
    await requireAdminApiSession(request);
    const { id } = await context.params;
    const category = (await getAdminCategoryRecords()).find(
      (record) => record.category.id === id,
    );
    if (!category) {
      return adminJson(
        { ok: false, message: "상품분류를 찾을 수 없습니다." },
        404,
      );
    }
    return adminJson({ ok: true, category });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  context: CategoryRouteContext,
): Promise<Response> {
  try {
    const session = await requireAdminApiSession(request);
    assertSameOrigin(request);
    const { id } = await context.params;
    const input = await readAdminJson(request, 32_768);
    const category = await updateManagedCategory(id, input, {
      adminUsername: session.username,
    });
    return adminJson({ ok: true, category });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export const PUT = PATCH;

export async function DELETE(
  request: Request,
  context: CategoryRouteContext,
): Promise<Response> {
  try {
    const session = await requireAdminApiSession(request);
    assertSameOrigin(request);
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
        { ok: false, message: "상품분류 변경 기준값을 확인해 주세요." },
        400,
      );
    }
    await deleteManagedCategory(id, {
      adminUsername: session.username,
      expectedRevision,
    });
    return adminJson({ ok: true, deletedId: id });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}
