const FORWARDED_SEPARATOR = ",";

export function isRequestSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;

  try {
    const originUrl = new URL(origin);
    const requestUrl = new URL(request.url);
    const forwardedProtocol = firstForwardedValue(
      request.headers.get("x-forwarded-proto"),
    );
    const forwardedHost =
      firstForwardedValue(request.headers.get("x-forwarded-host")) ||
      request.headers.get("host")?.trim() ||
      requestUrl.host;
    const protocol =
      forwardedProtocol === "http" || forwardedProtocol === "https"
        ? forwardedProtocol
        : requestUrl.protocol.replace(/:$/u, "");
    const effectiveOrigin = new URL(`${protocol}://${forwardedHost}`).origin;

    return originUrl.origin === effectiveOrigin;
  } catch {
    return false;
  }
}

function firstForwardedValue(value: string | null): string {
  return value?.split(FORWARDED_SEPARATOR, 1)[0]?.trim().toLowerCase() ?? "";
}
