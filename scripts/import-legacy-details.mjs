import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, extname, isAbsolute, join, resolve } from "node:path";

process.stdout.on("error", ignoreClosedOutput);
process.stderr.on("error", ignoreClosedOutput);

const options = await readOptions(process.argv.slice(2));
const sourceOrigin = new URL(options.sourceOrigin);
const allowedImageOrigins = new Set([
  sourceOrigin.origin,
  "https://lclaire.com",
]);
const workspaceRoot = process.cwd();
const catalogPath = join(workspaceRoot, "data", "catalog.json");
const catalog = JSON.parse(await readFile(catalogPath, "utf8"));

if (!Array.isArray(catalog.products)) {
  throw new Error("data/catalog.json의 products 배열을 찾을 수 없습니다.");
}
const imageMap = await readImageMap(options);

let removedLazyAttributes = 0;
for (const product of catalog.products) {
  if (typeof product.detailHtml !== "string") continue;
  const normalized = removeLazyLoading(product.detailHtml);
  if (normalized !== product.detailHtml) {
    removedLazyAttributes += countLazyLoading(product.detailHtml);
    product.detailHtml = normalized;
  }
}

const requestedIds = await readRequestedIds(options, imageMap);
if (requestedIds && requestedIds.size === 0) {
  throw new Error(
    "재시도 상품 ID가 비어 있습니다. 안전을 위해 전체 상품 처리를 시작하지 않습니다.",
  );
}
const productsToProcess = requestedIds
  ? catalog.products.filter((product) => requestedIds.has(String(product.id)))
  : catalog.products;

if (requestedIds) {
  const foundIds = new Set(
    productsToProcess.map((product) => String(product.id)),
  );
  const unknownIds = [...requestedIds].filter((id) => !foundIds.has(id));
  if (unknownIds.length > 0) {
    throw new Error(
      `catalog에서 찾을 수 없는 상품 ID: ${unknownIds.join(", ")}`,
    );
  }
}

let completed = 0;
let importedImages = 0;
let reusedImages = 0;
let recoveredImageUrls = 0;
let mirroredExternalImages = 0;
let succeededProducts = 0;
const failures = [];
const imageFailures = [];

console.log(
  `[detail] selected=${productsToProcess.length}/${catalog.products.length}, attempts=${options.maxAttempts}, timeout=${options.timeoutMs}ms, concurrency=${options.concurrency}`,
);

await mapLimit(productsToProcess, options.concurrency, async (product) => {
  const pageUrl = new URL(
    `/shop/item.php?it_id=${encodeURIComponent(product.id)}`,
    sourceOrigin,
  );
  try {
    const { html, responseUrl } = await fetchText(pageUrl);
    const documentBaseUrl = resolveDocumentBaseUrl(html, responseUrl);
    const detailHtmlRaw = firstMatch(
      html,
      /<div\s+id=(?:"sit_inf_explan"|'sit_inf_explan')[^>]*>([\s\S]*?)<\/div>\s*(?=<h3\b[^>]*class=(?:"[^"]*\bh-hidden\b[^"]*"|'[^']*\bh-hidden\b[^']*'))/i,
    );
    if (!detailHtmlRaw) {
      throw new Error("상세 설명 영역을 찾지 못했습니다.");
    }

    const imageTags = [...detailHtmlRaw.matchAll(/<img\b[^>]*>/gi)];
    const replacements = new Map();
    const productImageFailures = [];
    let imageIndex = 0;
    for (const match of imageTags) {
      const attributes = parseAttributes(match[0]);
      const rawSource =
        attributes["data-lazy"] ??
        attributes["data-lazy-src"] ??
        attributes["data-original"] ??
        attributes["data-src"] ??
        attributes["data-echo"] ??
        attributes.src;
      const remoteUrl = canonicalImageUrl(
        resolveImageUrl(rawSource, documentBaseUrl),
        imageMap.get(String(product.id)),
      );
      if (!remoteUrl || replacements.has(remoteUrl)) continue;

      imageIndex += 1;
      const localPath = `/legacy/products/${product.id}/detail-${imageIndex}${extensionFor(
        remoteUrl,
      )}`;
      const destination = join(workspaceRoot, "public", localPath.slice(1));
      let downloaded;
      let downloadError;
      const downloadCandidates = assetDownloadCandidates(remoteUrl);
      for (const [candidateIndex, candidateUrl] of downloadCandidates.entries()) {
        try {
          downloaded = await downloadAsset(
            candidateUrl,
            destination,
            responseUrl,
            {
              overwrite:
                new URL(remoteUrl).origin === "https://lclaire.com",
            },
          );
          downloadError = null;
          if (new URL(remoteUrl).origin === "https://lclaire.com") {
            mirroredExternalImages += 1;
          } else if (candidateIndex > 0) {
            recoveredImageUrls += 1;
          }
          break;
        } catch (error) {
          downloadError = error;
        }
      }

      if (!downloadError) {
        replacements.set(remoteUrl, localPath);
        if (downloaded) importedImages += 1;
        else reusedImages += 1;
      } else {
        productImageFailures.push({
          id: product.id,
          url: remoteUrl,
          message:
            downloadError instanceof Error
              ? downloadError.message
              : String(downloadError),
        });
      }
    }

    if (imageTags.length > 0 && replacements.size === 0) {
      const firstFailure = productImageFailures[0]?.message;
      throw new Error(
        firstFailure
          ? `상세 이미지를 가져오지 못했습니다: ${firstFailure}`
          : "허용된 상세 이미지 주소를 찾지 못했습니다.",
      );
    }
    imageFailures.push(...productImageFailures);

    let sanitized = detailHtmlRaw
      .replace(/<script\b[\s\S]*?<\/script>/gi, "")
      .replace(/<style\b[\s\S]*?<\/style>/gi, "")
      .replace(/<iframe\b[\s\S]*?<\/iframe>/gi, "")
      .replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*')/gi, "")
      .replace(
        /\s(?:href|src)\s*=\s*(?:"javascript:[^"]*"|'javascript:[^']*')/gi,
        "",
      );

    sanitized = sanitized.replace(/<img\b[^>]*>/gi, (tag) => {
      const attributes = parseAttributes(tag);
      const rawSource =
        attributes["data-lazy"] ??
        attributes["data-lazy-src"] ??
        attributes["data-original"] ??
        attributes["data-src"] ??
        attributes["data-echo"] ??
        attributes.src;
      const remoteUrl = canonicalImageUrl(
        resolveImageUrl(rawSource, documentBaseUrl),
        imageMap.get(String(product.id)),
      );
      const localPath = remoteUrl ? replacements.get(remoteUrl) : undefined;
      if (!localPath) return "";
      const alt = escapeAttribute(attributes.alt || product.name || "상품 상세");
      return `<img src="${localPath}" alt="${alt}">`;
    });

    product.detailHtml = sanitized;
    succeededProducts += 1;
  } catch (error) {
    failures.push({
      id: product.id,
      message: error instanceof Error ? error.message : String(error),
    });
  } finally {
    completed += 1;
    if (completed % 10 === 0 || completed === productsToProcess.length) {
      console.log(
        `[detail] ${completed}/${productsToProcess.length}, succeeded=${succeededProducts}, downloaded=${importedImages}, reused=${reusedImages}, failures=${failures.length}`,
      );
    }
  }
});

await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");

console.log(
  JSON.stringify(
    {
      catalogProducts: catalog.products.length,
      selectedProducts: productsToProcess.length,
      succeededProducts,
      importedImages,
      reusedImages,
      recoveredImageUrls,
      mirroredExternalImages,
      removedLazyAttributes,
      mappedImageProducts: imageMap.size,
      imageFailures,
      failures,
    },
    null,
    2,
  ),
);

if (failures.length > 0) {
  process.exitCode = 1;
}

function firstMatch(value, expression, group = 1) {
  return expression.exec(value)?.[group] ?? "";
}

function parseAttributes(tag) {
  const attributes = {};
  const matcher =
    /([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  let match;
  while ((match = matcher.exec(tag))) {
    attributes[match[1].toLowerCase()] =
      match[2] ?? match[3] ?? match[4] ?? "";
  }
  return attributes;
}

function decodeEntities(value) {
  return String(value || "")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, value) =>
      String.fromCodePoint(Number.parseInt(value, 16)),
    )
    .replace(/&#([0-9]+);/g, (_, value) =>
      String.fromCodePoint(Number.parseInt(value, 10)),
    )
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function resolveImageUrl(value, pageUrl) {
  if (!value || /^(?:data:|javascript:|inline-svg:)/iu.test(value)) {
    return null;
  }
  try {
    const resolved = new URL(decodeEntities(value), pageUrl);
    if (
      !allowedImageOrigins.has(resolved.origin) ||
      !/^https?:$/u.test(resolved.protocol) ||
      resolved.username ||
      resolved.password
    ) {
      return null;
    }
    return resolved.href;
  } catch {
    return null;
  }
}

function canonicalImageUrl(resolvedUrl, mappedExternalUrl) {
  if (
    resolvedUrl &&
    mappedExternalUrl &&
    new URL(resolvedUrl).origin === "https://lclaire.com"
  ) {
    return mappedExternalUrl;
  }
  return resolvedUrl;
}

function assetDownloadCandidates(url) {
  const parsed = new URL(url);
  if (parsed.origin === "https://lclaire.com") {
    const trustedMirror = new URL(sourceOrigin);
    trustedMirror.pathname = parsed.pathname;
    trustedMirror.search = parsed.search;
    trustedMirror.hash = "";
    return [trustedMirror.href];
  }

  const candidates = [url];
  if (
    parsed.origin === sourceOrigin.origin &&
    parsed.pathname.startsWith("/02_moare/")
  ) {
    const corrected = new URL(parsed);
    corrected.pathname = `/shop${parsed.pathname}`;
    candidates.push(corrected.href);
  }
  return candidates;
}

function resolveDocumentBaseUrl(html, responseUrl) {
  const baseTag = firstMatch(html, /<base\b[^>]*>/i, 0);
  const baseHref = baseTag ? parseAttributes(baseTag).href : "";
  if (!baseHref) return responseUrl;
  try {
    const resolved = new URL(decodeEntities(baseHref), responseUrl);
    return /^https?:$/u.test(resolved.protocol) ? resolved : responseUrl;
  } catch {
    return responseUrl;
  }
}

function extensionFor(url) {
  const extension = extname(new URL(url).pathname).toLowerCase();
  if (/^\.(?:avif|gif|jpe?g|png|webp)$/u.test(extension)) {
    return extension === ".jpeg" ? ".jpg" : extension;
  }
  return ".jpg";
}

function escapeAttribute(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function countLazyLoading(value) {
  return (
    String(value).match(
      /\sloading\s*=\s*(?:"lazy"|'lazy'|lazy(?=[\s>]))/giu,
    )?.length ?? 0
  );
}

function removeLazyLoading(value) {
  return String(value).replace(
    /\sloading\s*=\s*(?:"lazy"|'lazy'|lazy(?=[\s>]))/giu,
    "",
  );
}

async function fetchText(url) {
  const response = await fetchWithRetry(url, {
    accept: "text/html,application/xhtml+xml",
  });
  return {
    html: await response.text(),
    responseUrl: new URL(response.url || url),
  };
}

async function downloadAsset(
  url,
  destination,
  referer,
  { overwrite = false } = {},
) {
  if (!overwrite) {
    try {
      const existing = await stat(destination);
      if (existing.isFile() && existing.size > 0) return false;
    } catch {
      // Download missing assets.
    }
  }
  const response = await fetchWithRetry(url, {
    accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    referer: referer.href,
  }, allowedImageOrigins);
  const body = Buffer.from(await response.arrayBuffer());
  if (body.length === 0) {
    throw new Error(`빈 이미지 응답: ${url}`);
  }
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, body);
  return true;
}

async function fetchWithRetry(
  url,
  requestHeaders = {},
  allowedRedirectOrigins = null,
) {
  let lastError;
  for (let attempt = 1; attempt <= options.maxAttempts; attempt += 1) {
    let retryAfterMs = 0;
    let retryable = true;
    try {
      const response = allowedRedirectOrigins
        ? await fetchWithAllowedRedirects(
            url,
            requestHeaders,
            allowedRedirectOrigins,
          )
        : await fetch(url, {
            redirect: "follow",
            signal: AbortSignal.timeout(options.timeoutMs),
            headers: requestHeadersFor(requestHeaders),
          });
      if (!response.ok) {
        retryable = isRetryableStatus(response.status);
        retryAfterMs = readRetryAfterMs(response.headers.get("retry-after"));
        await response.body?.cancel().catch(() => {});
        const error = new Error(`HTTP ${response.status}: ${url}`);
        error.retryable = retryable;
        throw error;
      }
      return response;
    } catch (error) {
      lastError = error;
      if (error && typeof error === "object" && "retryable" in error) {
        retryable = Boolean(error.retryable);
      }
    }

    if (!retryable || attempt >= options.maxAttempts) break;
    const backoffMs = Math.max(
      retryAfterMs,
      options.backoffMs * 2 ** (attempt - 1),
    );
    console.warn(
      `[retry] ${attempt}/${options.maxAttempts - 1} ${url} in ${backoffMs}ms: ${
        lastError instanceof Error ? lastError.message : String(lastError)
      }`,
    );
    await delay(backoffMs);
  }
  throw lastError;
}

async function fetchWithAllowedRedirects(
  initialUrl,
  requestHeaders,
  allowedOrigins,
) {
  let currentUrl = new URL(initialUrl);
  for (let redirectCount = 0; redirectCount <= 5; redirectCount += 1) {
    if (
      !allowedOrigins.has(currentUrl.origin) ||
      !/^https?:$/u.test(currentUrl.protocol) ||
      currentUrl.username ||
      currentUrl.password
    ) {
      const error = new Error(`허용되지 않은 이미지 주소: ${currentUrl}`);
      error.retryable = false;
      throw error;
    }

    const response = await fetch(currentUrl, {
      redirect: "manual",
      signal: AbortSignal.timeout(options.timeoutMs),
      headers: requestHeadersFor(requestHeaders),
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) {
      return response;
    }

    const location = response.headers.get("location");
    await response.body?.cancel().catch(() => {});
    if (!location) {
      const error = new Error(`Location 없는 HTTP ${response.status}: ${currentUrl}`);
      error.retryable = false;
      throw error;
    }
    currentUrl = new URL(location, currentUrl);
  }

  const error = new Error(`이미지 리디렉션 횟수 초과: ${initialUrl}`);
  error.retryable = false;
  throw error;
}

function requestHeadersFor(requestHeaders) {
  return {
    accept: requestHeaders.accept || "*/*",
    ...(requestHeaders.referer
      ? { referer: requestHeaders.referer }
      : {}),
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36",
  };
}

function isRetryableStatus(status) {
  return (
    status === 408 ||
    status === 425 ||
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504
  );
}

function readRetryAfterMs(value) {
  if (!value) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : 0;
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

async function readOptions(args) {
  const parsed = {
    sourceOrigin: "",
    ids: [],
    idsFile: "",
    imageMapFile: "",
    selectionRequested: false,
    concurrency: 3,
    timeoutMs: 45_000,
    maxAttempts: 5,
    backoffMs: 1_000,
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument.startsWith("--")) {
      parsed.sourceOrigin = argument;
      continue;
    }

    const [name, inlineValue] = argument.split("=", 2);
    const readValue = () => {
      if (inlineValue !== undefined) return inlineValue;
      index += 1;
      if (index >= args.length) throw new Error(`${name} 값이 필요합니다.`);
      return args[index];
    };

    if (name === "--source-origin") {
      parsed.sourceOrigin = readValue();
    } else if (name === "--ids" || name === "--id") {
      parsed.selectionRequested = true;
      parsed.ids.push(...readValue().split(/[\s,]+/u).filter(Boolean));
    } else if (name === "--ids-file" || name === "--retry-failures") {
      parsed.selectionRequested = true;
      parsed.idsFile = readValue();
    } else if (name === "--image-map-file") {
      parsed.selectionRequested = true;
      parsed.imageMapFile = readValue();
    } else if (name === "--concurrency") {
      parsed.concurrency = positiveIntegerOption(name, readValue(), 1, 10);
    } else if (name === "--timeout-ms") {
      parsed.timeoutMs = positiveIntegerOption(name, readValue(), 1_000, 300_000);
    } else if (name === "--attempts") {
      parsed.maxAttempts = positiveIntegerOption(name, readValue(), 1, 10);
    } else if (name === "--backoff-ms") {
      parsed.backoffMs = positiveIntegerOption(name, readValue(), 100, 60_000);
    } else {
      throw new Error(`알 수 없는 옵션: ${name}`);
    }
  }

  if (!parsed.sourceOrigin) {
    throw new Error(
      "가져올 원본 주소를 --source-origin으로 명시해야 합니다. 기본 외부 주소는 사용하지 않습니다.",
    );
  }

  return parsed;
}

async function readImageMap(parsedOptions) {
  if (!parsedOptions.imageMapFile) return new Map();
  const filePath = isAbsolute(parsedOptions.imageMapFile)
    ? parsedOptions.imageMapFile
    : resolve(workspaceRoot, parsedOptions.imageMapFile);
  const payload = JSON.parse(await readFile(filePath, "utf8"));
  const entries =
    payload &&
    typeof payload === "object" &&
    payload.externalImages &&
    typeof payload.externalImages === "object"
      ? Object.entries(payload.externalImages)
      : [];
  if (entries.length === 0) {
    throw new Error(
      `${parsedOptions.imageMapFile}에서 externalImages 매핑을 찾지 못했습니다.`,
    );
  }

  const imageMap = new Map();
  for (const [productId, value] of entries) {
    const resolved = resolveImageUrl(value, sourceOrigin);
    if (!resolved || new URL(resolved).origin !== "https://lclaire.com") {
      throw new Error(
        `허용되지 않은 외부 이미지 매핑: ${productId} -> ${String(value)}`,
      );
    }
    imageMap.set(String(productId), resolved);
  }
  return imageMap;
}

async function readRequestedIds(parsedOptions, mappedImages) {
  const hasExplicitIds =
    parsedOptions.ids.length > 0 || Boolean(parsedOptions.idsFile);
  const ids = new Set(
    hasExplicitIds
      ? parsedOptions.ids.map(String)
      : mappedImages.keys(),
  );
  if (parsedOptions.idsFile) {
    const filePath = isAbsolute(parsedOptions.idsFile)
      ? parsedOptions.idsFile
      : resolve(workspaceRoot, parsedOptions.idsFile);
    const contents = await readFile(filePath, "utf8");
    let values;
    try {
      const payload = JSON.parse(contents);
      values = Array.isArray(payload)
        ? payload
        : Array.isArray(payload.failures)
          ? payload.failures.map((failure) =>
              typeof failure === "object" && failure !== null
                ? failure.id
                : failure,
            )
          : [];
    } catch {
      values = contents.split(/[\s,]+/u).filter(Boolean);
    }
    for (const value of values) {
      if (value !== undefined && value !== null && String(value).trim()) {
        ids.add(String(value).trim());
      }
    }
  }
  return parsedOptions.selectionRequested ? ids : null;
}

function positiveIntegerOption(name, value, minimum, maximum) {
  const parsed = Number(value);
  if (
    !Number.isInteger(parsed) ||
    parsed < minimum ||
    parsed > maximum
  ) {
    throw new Error(
      `${name} 값은 ${minimum}~${maximum} 범위의 정수여야 합니다.`,
    );
  }
  return parsed;
}

async function mapLimit(values, limit, worker) {
  let cursor = 0;
  async function runner() {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      await worker(values[index], index);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, values.length) }, () => runner()),
  );
}

function ignoreClosedOutput(error) {
  if (error?.code === "EPIPE") return;
  throw error;
}
