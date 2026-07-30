import assert from "node:assert/strict";
import { access, readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);
const catalog = JSON.parse(
  await readFile(new URL("../data/catalog.json", import.meta.url), "utf8"),
);

test("keeps local detail media complete and deployment externalization atomic", async () => {
  const detailPaths = new Set();
  for (const product of catalog.products) {
    for (const match of String(product.detailHtml ?? "").matchAll(
      /\bsrc=["'](\/legacy\/products\/[^"']+\/detail-[1-9][0-9]*\.jpg)["']/giu,
    )) {
      detailPaths.add(match[1]);
    }
  }

  assert.equal(detailPaths.size, 282);
  let sourceFiles = 0;
  let builtFiles = 0;
  for (const path of detailPaths) {
    const source = new URL(`../public${path}`, import.meta.url);
    try {
      const info = await stat(source);
      assert.ok(info.isFile());
      assert.ok(info.size > 0);
      assert.ok(info.size <= 12 * 1024 * 1024);
      sourceFiles += 1;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    try {
      await access(new URL(`../dist/client${path}`, import.meta.url));
      builtFiles += 1;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }

  assert.ok(
    sourceFiles === 0 || sourceFiles === detailPaths.size,
    "detail media must be entirely local or entirely externalized",
  );
  assert.equal(builtFiles, sourceFiles);
  const galleryPath = catalog.products[0].images[0];
  await access(new URL(`../dist/client${galleryPath}`, import.meta.url));
  await access(projectRoot);
});

test("serves and uploads legacy detail media through guarded application routes", async () => {
  const [library, uploadRoute, mediaRoute] = await Promise.all([
    readFile(new URL("../lib/admin-media.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/media/route.ts", import.meta.url), "utf8"),
    readFile(
      new URL(
        "../app/legacy/products/[productId]/[fileName]/route.ts",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);

  assert.match(library, /MAX_LEGACY_PRODUCT_IMAGE_BYTES = 12 \* 1024 \* 1024/);
  assert.match(library, /MAX_LEGACY_MEDIA_CHUNK_BYTES = 512 \* 1024/);
  assert.match(library, /validLegacyProductMediaPath/);
  assert.match(library, /storeLegacyProductImage/);
  assert.match(library, /storeLegacyProductImageChunk/);
  assert.match(library, /completeLegacyProductImageChunks/);
  assert.match(library, /legacyChunked: "1"/);
  assert.match(library, /ON CONFLICT\(id\) DO UPDATE/);
  assert.match(uploadRoute, /requireAdminApiSession/);
  assert.match(uploadRoute, /assertSameOrigin/);
  assert.match(uploadRoute, /form\.get\("legacyPath"\)/);
  assert.match(uploadRoute, /storeLegacyProductImage/);
  assert.match(uploadRoute, /export async function PUT/);
  assert.match(uploadRoute, /export async function PATCH/);
  assert.match(uploadRoute, /readBoundedImageChunk/);
  assert.match(mediaRoute, /validLegacyProductMediaPath/);
  assert.match(mediaRoute, /const bucket = productMediaBucket\(\)/);
  assert.match(mediaRoute, /bucket\.get/);
  assert.match(mediaRoute, /bucket\.head/);
  assert.match(mediaRoute, /readChunkManifest/);
  assert.match(mediaRoute, /readChunkedImage/);
  assert.match(mediaRoute, /must-revalidate/);
  assert.match(mediaRoute, /Content-Security-Policy/);
});

test("contains no unexpected detail image filenames", async () => {
  const productsRoot = new URL("../public/legacy/products/", import.meta.url);
  const productDirectories = await readdir(productsRoot, {
    withFileTypes: true,
  });
  const unexpected = [];

  for (const productDirectory of productDirectories) {
    if (!productDirectory.isDirectory()) continue;
    const entries = await readdir(
      join(productDirectory.parentPath, productDirectory.name),
      { withFileTypes: true },
    );
    for (const entry of entries) {
      if (
        entry.isFile() &&
        entry.name.startsWith("detail-") &&
        !/^detail-[1-9][0-9]*\.jpg$/u.test(entry.name)
      ) {
        unexpected.push(`${productDirectory.name}/${entry.name}`);
      }
    }
  }

  assert.deepEqual(unexpected, []);
});
