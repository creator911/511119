/** Cloudflare Worker entry point for the vinext-starter template. */
import {
  DEFAULT_DEVICE_SIZES,
  DEFAULT_IMAGE_SIZES,
  handleImageOptimization,
} from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: {
          format: string;
          quality: number;
        }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      const response = await handleImageOptimization(
        request,
        {
          fetchAsset: (path) =>
            env.ASSETS.fetch(new Request(new URL(path, request.url))),
          transformImage: async (body, { width, format, quality }) => {
            const result = await env.IMAGES.input(body)
              .transform(width > 0 ? { width } : {})
              .output({ format, quality });
            return result.response();
          },
        },
        allowedWidths,
      );
      return withSecurityHeaders(request, response);
    }

    const response = await handler.fetch(request, env, ctx);
    return withSecurityHeaders(request, response);
  },
};

const SENSITIVE_PAGE_PATHS = new Set([
  "/bbs/login.php",
  "/bbs/password_lost.php",
  "/bbs/register.php",
  "/bbs/writecz.php",
  "/bbs/cashtx.php",
  "/bbs/withdrawal_list.php",
  "/shop/mypage.php",
  "/shop/orderform.php",
  "/shop/orderinquiry.php",
  "/shop/profile.php",
]);

function withSecurityHeaders(request: Request, response: Response): Response {
  // A WebSocket response cannot be reconstructed with the standard Response
  // constructor. This is only relevant to local development/HMR.
  if (response.status === 101) return response;

  const url = new URL(request.url);
  const secured = new Response(response.body, response);
  secured.headers.set("Content-Security-Policy", contentSecurityPolicy(url));
  secured.headers.set("X-Content-Type-Options", "nosniff");
  secured.headers.set("X-Frame-Options", "DENY");
  secured.headers.set("Referrer-Policy", "same-origin");
  secured.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
  );

  if (shouldDisableCaching(url.pathname)) {
    secured.headers.set("Cache-Control", "no-store, max-age=0");
    secured.headers.set("Pragma", "no-cache");
    secured.headers.set("Expires", "0");
  }

  if (url.protocol === "https:" && !isLocalHostname(url.hostname)) {
    // Do not include subdomains/preload: those policies require ownership and
    // operational guarantees beyond this application host.
    secured.headers.set("Strict-Transport-Security", "max-age=31536000");
  } else {
    secured.headers.delete("Strict-Transport-Security");
  }

  return secured;
}

function contentSecurityPolicy(url: URL): string {
  const localDevelopment = isLocalHostname(url.hostname);
  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    `frame-src 'self' about: https://postcode.map.kakao.com${localDevelopment ? " http://postcode.map.kakao.com" : ""}`,
    `script-src 'self' 'unsafe-inline' https://t1.kakaocdn.net${localDevelopment ? " 'unsafe-eval'" : ""}`,
    "script-src-attr 'none'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self'${localDevelopment ? " ws: wss:" : ""}`,
    "media-src 'self'",
    "manifest-src 'self'",
    "worker-src 'self' blob:",
    "form-action 'self'",
  ];
  if (url.protocol === "https:") directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}

function shouldDisableCaching(pathname: string): boolean {
  if (
    pathname.startsWith("/api/customer/") ||
    pathname.startsWith("/api/products/") ||
    pathname === "/api/orders" ||
    pathname.startsWith("/api/orders/") ||
    pathname.startsWith("/api/admin/") ||
    pathname === "/adm" ||
    pathname.startsWith("/adm/")
  ) {
    return true;
  }

  return SENSITIVE_PAGE_PATHS.has(pathname.replace(/\/+$/, ""));
}

function isLocalHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[(.*)\]$/, "$1");
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1"
  );
}

export default worker;
