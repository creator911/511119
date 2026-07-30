import { assertSameOrigin } from "@/lib/admin-api";
import { HttpBoundaryError, readBoundedJson } from "@/lib/http-boundary";
import { recordSiteVisit } from "@/lib/site-visits";

interface VisitBody {
  visitorId?: unknown;
  pathname?: unknown;
}

export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    const body = await readBoundedJson<VisitBody>(request, 2_000);
    if (
      !body ||
      typeof body !== "object" ||
      typeof body.visitorId !== "string" ||
      typeof body.pathname !== "string"
    ) {
      return visitResponse(400);
    }
    await recordSiteVisit(
      body.visitorId,
      body.pathname,
      await visitClientKey(request),
    );
    return visitResponse(204);
  } catch (error) {
    if (error instanceof HttpBoundaryError) {
      return visitResponse(error.status);
    }
    return visitResponse(400);
  }
}

async function visitClientKey(request: Request): Promise<string> {
  const source =
    request.headers.get("cf-connecting-ip")?.trim().slice(0, 128) ||
    "anonymous";
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(source),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function visitResponse(status: number): Response {
  return new Response(null, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
