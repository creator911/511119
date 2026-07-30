import {
  adminApiErrorResponse,
  adminJson,
  assertSameOrigin,
  readAdminJson,
  requireAdminApiSession,
} from "@/lib/admin-api";
import {
  listM3CronJobs,
  updateM3CronJobOrders,
} from "@/lib/admin-m3cron";

export async function GET(request: Request): Promise<Response> {
  try {
    await requireAdminApiSession(request);
    return adminJson({ ok: true, ...(await listM3CronJobs()) });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}

export async function PATCH(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    const session = await requireAdminApiSession(request);
    const input = await readAdminJson(request, 10_000);
    const jobs = await updateM3CronJobOrders(input, session.username);
    return adminJson({ ok: true, jobs });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}
