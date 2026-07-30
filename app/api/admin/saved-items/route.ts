import {
  adminApiErrorResponse,
  adminJson,
  requireAdminApiSession,
} from "@/lib/admin-api";
import { getSavedItemReport } from "@/lib/admin-operational-reports";

export async function GET(request: Request): Promise<Response> {
  try {
    await requireAdminApiSession(request);
    const params = new URL(request.url).searchParams;
    const report = await getSavedItemReport({
      member: params.get("member") ?? "",
      product: params.get("product") ?? "",
      categoryId: params.get("categoryId") ?? "",
      dateStart: params.get("dateStart") ?? "",
      dateEnd: params.get("dateEnd") ?? "",
    });
    return adminJson({ ok: true, report });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}
