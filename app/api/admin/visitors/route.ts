import {
  adminApiErrorResponse,
  adminJson,
  requireAdminApiSession,
} from "@/lib/admin-api";
import { getAdminVisitReport } from "@/lib/admin-operational-reports";

export async function GET(request: Request): Promise<Response> {
  try {
    await requireAdminApiSession(request);
    const params = new URL(request.url).searchParams;
    const report = await getAdminVisitReport({
      from: params.get("from") ?? "",
      to: params.get("to") ?? "",
    });
    return adminJson({ ok: true, report });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}
