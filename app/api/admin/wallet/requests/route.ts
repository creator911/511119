import {
  adminApiErrorResponse,
  adminJson,
  requireAdminApiSession,
} from "@/lib/admin-api";
import { listAdminWalletRequests } from "@/lib/wallet";

export async function GET(request: Request) {
  try {
    await requireAdminApiSession(request);
    const requests = await listAdminWalletRequests();
    return adminJson({ ok: true, requests });
  } catch (error) {
    return adminApiErrorResponse(error);
  }
}
