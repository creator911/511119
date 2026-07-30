import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import http from "node:http";
import https from "node:https";

const sourceOrigin = new URL(process.argv[2] ?? "");
if (!/^https?:$/.test(sourceOrigin.protocol)) {
  throw new Error(
    "Usage: node scripts/import-legacy-policies.mjs https://source.example",
  );
}

const pages = [
  { slug: "provision", className: "provision-page" },
  { slug: "privacy", className: "privacy-page" },
  { slug: "noemail", className: "contents-box-inner" },
];

function requestBuffer(url, { insecure = false, redirects = 0 } = {}) {
  if (redirects > 5) throw new Error(`Too many redirects for ${url}`);
  const parsed = new URL(url);
  const transport = parsed.protocol === "http:" ? http : https;
  return new Promise((resolve, reject) => {
    const request = transport.get(
      parsed,
      {
        headers: {
          "user-agent":
            "Mozilla/5.0 (compatible; public policy preservation for site owner)",
          accept: "text/html,application/xhtml+xml",
        },
        rejectUnauthorized: !insecure,
      },
      async (response) => {
        const status = response.statusCode ?? 0;
        if (
          status >= 300 &&
          status < 400 &&
          response.headers.location
        ) {
          response.resume();
          try {
            resolve(
              await requestBuffer(
                new URL(response.headers.location, parsed).href,
                { insecure, redirects: redirects + 1 },
              ),
            );
          } catch (error) {
            reject(error);
          }
          return;
        }
        if (status < 200 || status >= 300) {
          response.resume();
          reject(new Error(`HTTP ${status} for ${url}`));
          return;
        }
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => resolve(Buffer.concat(chunks)));
        response.on("error", reject);
      },
    );
    request.setTimeout(30_000, () => {
      request.destroy(new Error(`Timeout fetching ${url}`));
    });
    request.on("error", reject);
  });
}

async function fetchText(path) {
  const url = new URL(path, sourceOrigin).href;
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return (await requestBuffer(url, { insecure: attempt > 0 })).toString(
        "utf8",
      );
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

function decodeEntities(value) {
  return value
    .replace(/&#x([0-9a-f]+);/giu, (_, code) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&#(\d+);/gu, (_, code) =>
      String.fromCodePoint(Number.parseInt(code, 10)),
    )
    .replace(/&nbsp;|&#160;/giu, " ")
    .replace(/&amp;/giu, "&")
    .replace(/&quot;/giu, '"')
    .replace(/&#0?39;|&apos;/giu, "'")
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">");
}

function extractClassInnerHtml(html, className) {
  const opening = new RegExp(
    `<div\\b[^>]*class=(?:"[^"]*\\b${className}\\b[^"]*"|'[^']*\\b${className}\\b[^']*')[^>]*>`,
    "iu",
  ).exec(html);
  if (!opening) {
    throw new Error(`Could not find .${className}`);
  }
  const start = opening.index + opening[0].length;
  const tagMatcher = /<\/?div\b[^>]*>/giu;
  tagMatcher.lastIndex = start;
  let depth = 1;
  let tag;
  while ((tag = tagMatcher.exec(html))) {
    depth += /^<\//u.test(tag[0]) ? -1 : 1;
    if (depth === 0) return html.slice(start, tag.index);
  }
  throw new Error(`Could not close .${className}`);
}

function extractIdInnerHtml(html, id) {
  const opening = new RegExp(
    `<(?<tag>[a-z0-9]+)\\b[^>]*id=(?:"${id}"|'${id}')[^>]*>`,
    "iu",
  ).exec(html);
  if (!opening?.groups?.tag) {
    throw new Error(`Could not find #${id}`);
  }
  const tagName = opening.groups.tag;
  const start = opening.index + opening[0].length;
  const tagMatcher = new RegExp(`</?${tagName}\\b[^>]*>`, "giu");
  tagMatcher.lastIndex = start;
  let depth = 1;
  let tag;
  while ((tag = tagMatcher.exec(html))) {
    depth += /^<\//u.test(tag[0]) ? -1 : 1;
    if (depth === 0) return html.slice(start, tag.index);
  }
  throw new Error(`Could not close #${id}`);
}

function policyPlainText(html) {
  const normalized = html
    .replace(/<script\b[\s\S]*?<\/script>/giu, "")
    .replace(/<style\b[\s\S]*?<\/style>/giu, "")
    .replace(
      /<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/giu,
      (_, heading) => `\n\n## ${heading.replace(/<[^>]*>/gu, " ")}\n\n`,
    )
    .replace(/<br\s*\/?>/giu, "\n")
    .replace(/<\/(?:p|div|section|article|ul|ol|li|tr)>/giu, "\n")
    .replace(/<li\b[^>]*>/giu, "• ")
    .replace(/<[^>]*>/gu, " ");
  return decodeEntities(normalized)
    .replace(/\r/gu, "")
    .replace(/[ \t]+\n/gu, "\n")
    .replace(/\n[ \t]+/gu, "\n")
    .replace(/[ \t]{2,}/gu, " ")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

const output = {};
for (const page of pages) {
  const html = await fetchText(`/page/?pid=${page.slug}`);
  const body = policyPlainText(extractClassInnerHtml(html, page.className));
  if (body.length < 20) {
    throw new Error(`${page.slug} policy was unexpectedly short`);
  }
  output[page.slug] = body;
  console.log(`[policy] ${page.slug}: ${body.length} characters`);
}

const sampleProductHtml = await fetchText(
  "/shop/item.php?it_id=1762011941",
);
for (const [key, id] of [
  ["shipping", "sit_dvr"],
  ["exchange", "sit_ex"],
]) {
  const section = extractIdInnerHtml(sampleProductHtml, id)
    .replace(
      /<div\b[^>]*class=(?:"[^"]*\bpg-anchor-in\b[^"]*"|'[^']*\bpg-anchor-in\b[^']*')[^>]*>[\s\S]*?<div\b[^>]*class=(?:"[^"]*\btab-bottom-line\b[^"]*"|'[^']*\btab-bottom-line\b[^']*')[^>]*><\/div>\s*<\/div>/iu,
      "",
    )
    .replace(/<h2\b[\s\S]*?<\/h2>/iu, "");
  output[key] = policyPlainText(section);
  console.log(`[product copy] ${key}: ${output[key].length} characters`);
}

await writeFile(
  join(process.cwd(), "data", "legacy-policies.json"),
  `${JSON.stringify(output, null, 2)}\n`,
  "utf8",
);
