import {
  adminApiErrorResponse,
  adminJson,
  assertSameOrigin,
  readAdminJson,
  requireAdminApiSession,
} from "@/lib/admin-api";
import {
  deleteLegacyAdminToolRecord,
  updateLegacyAdminToolRecord,
} from "@/lib/admin-tools";
import { isSmsAdminTool } from "@/lib/admin-sms";

interface RouteContext {
  params: Promise<{ tool: string; recordId: string }>;
}

export async function PATCH(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    assertSameOrigin(request);
    const session = await requireAdminApiSession(request);
    const { tool, recordId } = await context.params;
    if (isDedicatedOperationalTool(tool)) {
      return dedicatedToolResponse();
    }
    const input = await readAdminJson(request, 30_000);
    const record = await updateLegacyAdminToolRecord(
      tool,
      recordId,
      input,
      session.username,
    );
    return adminJson({ ok: true, record });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export async function DELETE(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    assertSameOrigin(request);
    const session = await requireAdminApiSession(request);
    const { tool, recordId } = await context.params;
    if (isDedicatedOperationalTool(tool)) {
      return dedicatedToolResponse();
    }
    await deleteLegacyAdminToolRecord(tool, recordId, session.username);
    return adminJson({ ok: true });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

function dedicatedToolResponse(): Response {
  return adminJson(
    {
      ok: false,
      message: "이 관리 도구는 실제 운영 데이터 전용 화면에서 처리해 주세요.",
    },
    409,
  );
}

function isDedicatedOperationalTool(tool: string): boolean {
  return (
    tool === "events" ||
    tool === "event-bulk" ||
    tool === "saved-items" ||
    tool === "visitor-search" ||
    tool === "personal-payments" ||
    tool === "product-stock" ||
    tool === "product-types" ||
    tool === "product-option-stock" ||
    tool === "restock-sms" ||
    tool === "coupons" ||
    tool === "coupon-zone" ||
    tool === "additional-shipping" ||
    tool === "approved-clubs" ||
    tool === "club-applications" ||
    tool === "club-settings" ||
    tool === "additional-services" ||
    tool === "price-comparison" ||
    tool === "mail-test" ||
    tool === "m3cron-settings" ||
    tool === "m3cron-logs" ||
    isSmsAdminTool(tool)
  );
}
