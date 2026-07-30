import {
  adminApiErrorResponse,
  adminJson,
  assertSameOrigin,
  readAdminJson,
  requireAdminApiSession,
} from "@/lib/admin-api";
import { updateM3CronJob } from "@/lib/admin-m3cron";

interface RouteContext {
  params: Promise<{ jobId: string }>;
}

export async function PATCH(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    assertSameOrigin(request);
    const session = await requireAdminApiSession(request);
    const { jobId } = await context.params;
    const input = await readAdminJson(request, 10_000);
    const job = await updateM3CronJob(jobId, input, session.username);
    return adminJson({ ok: true, job });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}
