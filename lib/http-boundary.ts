const JSON_CONTENT_TYPE = "application/json";
const NO_STORE = "no-store, max-age=0";

export class HttpBoundaryError extends Error {
  constructor(
    public readonly status: 400 | 413 | 415,
    message: string,
  ) {
    super(message);
    this.name = "HttpBoundaryError";
  }
}

/**
 * Reads a JSON request without trusting Content-Length.
 *
 * The stream is stopped as soon as the configured number of raw UTF-8 bytes is
 * exceeded. This keeps chunked requests from bypassing a Content-Length-only
 * guard and rejects non-UTF-8 JSON instead of silently replacing invalid bytes.
 */
export async function readBoundedJson<T = unknown>(
  request: Request,
  maximumBytes: number,
): Promise<T> {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1) {
    throw new RangeError("maximumBytes must be a positive safe integer");
  }

  assertJsonContentType(request.headers.get("content-type"));

  const declaredLength = parseDeclaredLength(
    request.headers.get("content-length"),
  );
  if (declaredLength !== null && declaredLength > maximumBytes) {
    throw new HttpBoundaryError(413, "Request body is too large.");
  }

  const reader = request.body?.getReader();
  if (!reader) {
    throw new HttpBoundaryError(400, "A JSON request body is required.");
  }

  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value?.byteLength) continue;

      byteLength += value.byteLength;
      if (byteLength > maximumBytes) {
        await reader.cancel();
        throw new HttpBoundaryError(413, "Request body is too large.");
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof HttpBoundaryError) throw error;
    throw new HttpBoundaryError(400, "The request body could not be read.");
  }

  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new HttpBoundaryError(400, "The JSON body must use UTF-8.");
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HttpBoundaryError(400, "The request body is not valid JSON.");
  }
}

export function noStoreJson(
  body: unknown,
  init: ResponseInit = {},
): Response {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", NO_STORE);
  headers.set("Pragma", "no-cache");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(JSON.stringify(body), { ...init, headers });
}

export function isJsonObject(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertJsonContentType(contentType: string | null): void {
  if (!contentType) {
    throw new HttpBoundaryError(
      415,
      "Content-Type must be application/json.",
    );
  }

  const [mediaType, ...parameters] = contentType.split(";");
  if (mediaType.trim().toLowerCase() !== JSON_CONTENT_TYPE) {
    throw new HttpBoundaryError(
      415,
      "Content-Type must be application/json.",
    );
  }

  for (const parameter of parameters) {
    const separator = parameter.indexOf("=");
    if (separator < 0) continue;
    const name = parameter.slice(0, separator).trim().toLowerCase();
    if (name !== "charset") continue;
    const charset = parameter
      .slice(separator + 1)
      .trim()
      .replace(/^"(.*)"$/, "$1")
      .toLowerCase();
    if (charset !== "utf-8" && charset !== "utf8") {
      throw new HttpBoundaryError(415, "JSON must use the UTF-8 charset.");
    }
  }
}

function parseDeclaredLength(value: string | null): number | null {
  if (!value || !/^\d+$/.test(value.trim())) return null;
  const length = Number(value);
  return Number.isSafeInteger(length) ? length : null;
}
