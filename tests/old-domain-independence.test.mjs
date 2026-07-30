import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import test from "node:test";

const root = new URL("..", import.meta.url);
const runtimeDirectories = ["app", "lib", "worker", "public", "data"];
const textExtensions = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".mjs",
  ".svg",
  ".ts",
  ".tsx",
  ".txt",
  ".xml",
]);

test("runtime and catalog contain no dependency on the retired domain", async () => {
  const matches = [];
  for (const directory of runtimeDirectories) {
    await inspectDirectory(new URL(`${directory}/`, root), matches);
  }
  assert.deepEqual(matches, []);
});

test("legacy detail import requires an explicit source origin", async () => {
  const importer = await readFile(
    new URL("../scripts/import-legacy-details.mjs", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(importer, /https:\/\/(?:www\.)?kiel-gold\.com/iu);
  assert.match(importer, /--source-origin/);
  assert.match(importer, /기본 외부 주소는 사용하지 않습니다/);
});

async function inspectDirectory(directoryUrl, matches) {
  const entries = await readdir(directoryUrl, { withFileTypes: true });
  for (const entry of entries) {
    const target = new URL(entry.name, directoryUrl);
    if (entry.isDirectory()) {
      await inspectDirectory(new URL(`${entry.name}/`, directoryUrl), matches);
      continue;
    }
    if (!entry.isFile() || !textExtensions.has(extname(entry.name))) continue;
    const content = await readFile(target, "utf8");
    if (/kiel-gold\.com/iu.test(content)) {
      matches.push(join(target.pathname, entry.name));
    }
  }
}
