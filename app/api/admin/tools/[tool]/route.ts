import {
  adminApiErrorResponse,
  adminJson,
  assertSameOrigin,
  readAdminJson,
  requireAdminApiSession,
} from "@/lib/admin-api";
import { getLegacyAdminToolDefinition } from "@/lib/admin-tool-catalog";
import { isSmsAdminTool } from "@/lib/admin-sms";
import {
  createLegacyAdminToolRecord,
  getLegacyAdminToolState,
  runLegacyAdminToolAction,
  saveLegacyAdminToolSettings,
} from "@/lib/admin-tools";

interface RouteContext {
  params: Promise<{ tool: string }>;
}

export async function GET(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    await requireAdminApiSession(request);
    const { tool } = await context.params;
    if (
      isDedicatedOperationalTool(tool) ||
      isGenericRecordMutationBlocked(tool)
    ) {
      return dedicatedToolResponse();
    }
    const state = await getLegacyAdminToolState(tool);
    return adminJson({ ok: true, state });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    assertSameOrigin(request);
    const session = await requireAdminApiSession(request);
    const { tool } = await context.params;
    if (isDedicatedOperationalTool(tool)) {
      return dedicatedToolResponse();
    }
    const definition = getLegacyAdminToolDefinition(tool);
    const input = await readAdminJson(request, 30_000);
    const settings = await saveLegacyAdminToolSettings(
      tool,
      input,
      session.username,
    );
    return adminJson({ ok: true, definition, settings });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export async function POST(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    assertSameOrigin(request);
    const session = await requireAdminApiSession(request);
    const { tool } = await context.params;
    if (
      isDedicatedOperationalTool(tool) ||
      isGenericRecordMutationBlocked(tool)
    ) {
      return dedicatedToolResponse();
    }
    const definition = getLegacyAdminToolDefinition(tool);
    if (!definition) {
      return adminJson(
        { ok: false, message: "관리 도구를 찾지 못했습니다." },
        404,
      );
    }
    if (definition.kind === "action") {
      const run = await runLegacyAdminToolAction(tool, session.username);
      return adminJson({ ok: true, run }, 201);
    }
    const input = await readAdminJson(request, 30_000);
    const record = await createLegacyAdminToolRecord(
      tool,
      input,
      session.username,
    );
    return adminJson({ ok: true, record }, 201);
  } catch (error) {
    return adminApiErrorResponse(error);
  }
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
    tool === "mail-test" ||
    tool === "m3cron-settings" ||
    tool === "m3cron-logs" ||
    isSmsAdminTool(tool)
  );
}

function isGenericRecordMutationBlocked(tool: string): boolean {
  return (
    tool === "additional-services" ||
    tool === "club-settings" ||
    tool === "price-comparison"
  );
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
