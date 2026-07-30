import {
  adminApiErrorResponse,
  adminJson,
  assertSameOrigin,
  readAdminJson,
  requireAdminApiSession,
} from "@/lib/admin-api";
import { runM3CronJob } from "@/lib/admin-m3cron";

interface RouteContext {
  params: Promise<{ jobId: string }>;
}

export async function POST(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    assertSameOrigin(request);
    const session = await requireAdminApiSession(request);
    const { jobId } = await context.params;
    const input = await readAdminJson(request, 10_000);
    const sourceIp =
      request.headers.get("cf-connecting-ip") ??
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      "";
    const result = await runM3CronJob(
      jobId,
      input,
      session.username,
      sourceIp,
    );
    return adminJson({ ok: result.run.status === "completed", ...result });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}
