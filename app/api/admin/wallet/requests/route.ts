import {
  adminApiErrorResponse,
  adminJson,
  requireAdminApiSession,
} from "@/lib/admin-api";
import { listAdminWalletRequests } from "@/lib/wallet";

export async function GET(request: Request) {
  try {
    await requireAdminApiSession(request);
    const userId = new URL(request.url).searchParams.get("userId") ?? undefined;
    const requests = await listAdminWalletRequests(userId);
    return adminJson({ ok: true, requests });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}
