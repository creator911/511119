import {
  PRODUCT_MEDIA_CACHE_CONTROL,
  productMediaBucket,
  productMediaObjectKey,
  validProductMediaKey,
} from "@/lib/admin-media";

interface MediaRouteContext {
  params: Promise<{ key: string }>;
}

export async function GET(
  request: Request,
  context: MediaRouteContext,
): Promise<Response> {
  const { key } = await context.params;
  if (!validProductMediaKey(key)) return notFound();

  const object = await productMediaBucket().get(productMediaObjectKey(key));
  if (!object) return notFound();

  if (request.headers.get("if-none-match") === object.httpEtag) {
    return new Response(null, {
      status: 304,
      headers: immutableImageHeaders(object),
    });
  }

  return new Response(object.body, {
    status: 200,
    headers: immutableImageHeaders(object),
  });
}

export async function HEAD(
  request: Request,
  context: MediaRouteContext,
): Promise<Response> {
  const { key } = await context.params;
  if (!validProductMediaKey(key)) return notFound();

  const object = await productMediaBucket().head(productMediaObjectKey(key));
  if (!object) return notFound();
  return new Response(null, {
    status: request.headers.get("if-none-match") === object.httpEtag ? 304 : 200,
    headers: immutableImageHeaders(object),
  });
}

function immutableImageHeaders(object: R2Object): Headers {
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Cache-Control", PRODUCT_MEDIA_CACHE_CONTROL);
  headers.set("ETag", object.httpEtag);
  headers.set("Content-Length", object.size.toString());
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Content-Security-Policy", "default-src 'none'; sandbox");
  return headers;
}

function notFound(): Response {
  return new Response("Not found", {
    status: 404,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
