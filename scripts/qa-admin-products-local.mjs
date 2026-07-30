import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const workspace = process.cwd();
const baseUrl =
  process.env.QA_BASE_URL?.replace(/\/+$/u, "") ??
  "http://localhost:4173";
const baseline = JSON.parse(
  readFileSync(
    resolve(workspace, "data/legacy-product-admin-baseline.json"),
    "utf8",
  ),
);
const adminCookie = await createLocalAdminCookie();
const sourceId = "1770618887";
const cloneId = `QA-${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
let sourceBefore;
let sourceAfterWrite;
let cloneCreated = false;

try {
  const listResponse = await adminFetch("/api/admin/products");
  assert.equal(listResponse.status, 200);
  const list = await listResponse.json();
  assert.equal(list.ok, true);
  assert.equal(list.products.length, 274);
  assert.equal(new Set(list.products.map((product) => product.id)).size, 274);
  const listedById = new Map(list.products.map((product) => [product.id, product]));
  for (const expected of baseline) {
    const product = listedById.get(expected.id);
    assert.ok(product, `상품 ${expected.id}이 목록에 있어야 합니다.`);
    assert.equal(product.primaryCategoryId, expected.primaryCategoryId);
    assert.equal(product.secondaryCategoryId, expected.secondaryCategoryId);
    assert.equal(product.tertiaryCategoryId, expected.tertiaryCategoryId);
    assert.equal(product.sortOrder, expected.sortOrder);
    assert.equal(product.viewCount, expected.viewCount);
    assert.equal(product.rewardPoints, expected.rewardPoints);
    assert.equal(product.desktopSkin, expected.desktopSkin);
    assert.equal(product.mobileSkin, expected.mobileSkin);
    assert.equal(typeof product.revision, "number");
    assert.equal(typeof product.stockControlRevision, "number");
  }

  sourceBefore = structuredClone(listedById.get(sourceId));
  assert.ok(sourceBefore);
  const crossOrigin = await fetch(`${baseUrl}/api/admin/products/list`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Cookie: adminCookie,
      Origin: "https://example.invalid",
    },
    body: JSON.stringify({
      rows: [listRow(sourceBefore, { sortOrder: sourceBefore.sortOrder + 1 })],
    }),
  });
  assert.equal(crossOrigin.status, 403);

  const updateResponse = await adminFetch("/api/admin/products/list", {
    method: "PATCH",
    body: JSON.stringify({
      rows: [
        listRow(sourceBefore, {
          sortOrder: sourceBefore.sortOrder + 1,
          name: `${sourceBefore.name} QA`,
        }),
      ],
    }),
  });
  assert.equal(updateResponse.status, 200);
  const update = await updateResponse.json();
  assert.equal(update.ok, true);
  assert.equal(update.products.length, 1);
  sourceAfterWrite = update.products[0];
  assert.equal(sourceAfterWrite.id, sourceId);
  assert.equal(sourceAfterWrite.sortOrder, sourceBefore.sortOrder + 1);
  assert.equal(sourceAfterWrite.name, `${sourceBefore.name} QA`);
  assert.equal(sourceAfterWrite.revision, sourceBefore.revision + 1);
  assert.equal(
    sourceAfterWrite.stockControlRevision,
    sourceBefore.stockControlRevision + 1,
  );

  const staleResponse = await adminFetch("/api/admin/products/list", {
    method: "PATCH",
    body: JSON.stringify({
      rows: [listRow(sourceBefore, { sortOrder: sourceBefore.sortOrder + 2 })],
    }),
  });
  assert.equal(staleResponse.status, 409);

  const restoreResponse = await adminFetch("/api/admin/products/list", {
    method: "PATCH",
    body: JSON.stringify({
      rows: [
        listRow(sourceAfterWrite, {
          primaryCategoryId: sourceBefore.primaryCategoryId,
          secondaryCategoryId: sourceBefore.secondaryCategoryId,
          tertiaryCategoryId: sourceBefore.tertiaryCategoryId,
          sortOrder: sourceBefore.sortOrder,
          active: sourceBefore.active,
          soldOut: sourceBefore.soldOut,
          name: sourceBefore.name,
          price: sourceBefore.price,
          originalPrice: sourceBefore.originalPrice,
          stock: sourceBefore.stock,
          desktopSkin: sourceBefore.desktopSkin,
          mobileSkin: sourceBefore.mobileSkin,
        }),
      ],
    }),
  });
  assert.equal(restoreResponse.status, 200);
  const restored = (await restoreResponse.json()).products[0];
  assert.equal(restored.name, sourceBefore.name);
  assert.equal(restored.sortOrder, sourceBefore.sortOrder);
  assert.equal(restored.stock, sourceBefore.stock);
  assert.equal(restored.price, sourceBefore.price);

  const cloneResponse = await adminFetch("/api/admin/products/clone", {
    method: "POST",
    body: JSON.stringify({
      sourceId,
      newId: cloneId,
      expectedRevision: restored.revision,
      expectedStock: restored.stock,
      expectedStockControlRevision: restored.stockControlRevision,
    }),
  });
  assert.equal(cloneResponse.status, 201);
  const clone = (await cloneResponse.json()).product;
  cloneCreated = true;
  assert.equal(clone.id, cloneId);
  assert.equal(clone.name, sourceBefore.name);
  assert.equal(clone.stock, sourceBefore.stock);
  assert.equal(clone.viewCount, 0);
  assert.equal(clone.revision, 1);
  assert.equal(clone.stockControlRevision, 1);

  const afterCloneResponse = await adminFetch("/api/admin/products");
  assert.equal(afterCloneResponse.status, 200);
  const afterClone = await afterCloneResponse.json();
  assert.equal(afterClone.products.length, 275);
  assert.ok(afterClone.products.some((product) => product.id === cloneId));

  const deleteCloneResponse = await adminFetch(
    `/api/admin/products/${encodeURIComponent(cloneId)}`,
    { method: "DELETE" },
  );
  assert.equal(deleteCloneResponse.status, 200);
  cloneCreated = false;
  const finalListResponse = await adminFetch("/api/admin/products");
  assert.equal(finalListResponse.status, 200);
  const finalList = await finalListResponse.json();
  assert.equal(finalList.products.length, 274);
  assert.equal(
    finalList.products.find((product) => product.id === sourceId).name,
    sourceBefore.name,
  );
  assert.equal(
    finalList.products.find((product) => product.id === sourceId).stock,
    sourceBefore.stock,
  );

  const pageResponse = await adminFetch("/adm/products");
  assert.equal(pageResponse.status, 200);
  const pageHtml = await pageResponse.text();
  for (const expectedText of [
    "상품관리 목록",
    "상품코드",
    "분류",
    "판매가격",
    "시중가격",
    "PC스킨",
    "포인트",
    "재고",
    "모바일스킨",
    "선택수정",
    "선택삭제",
  ]) {
    assert.match(pageHtml, new RegExp(expectedText, "u"));
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        checks: [
          "legacyAdminBaseline274",
          "crossOriginBlocked",
          "atomicInlineUpdate",
          "staleInlineWriteBlocked",
          "inlineUpdateRestored",
          "cloneCreatedAndDeleted",
          "productCountRestored274",
          "legacyThreeRowMarkupRendered",
        ],
      },
      null,
      2,
    ),
  );
} finally {
  if (cloneCreated) {
    try {
      await adminFetch(`/api/admin/products/${encodeURIComponent(cloneId)}`, {
        method: "DELETE",
      });
    } catch {
      // Best-effort cleanup; the failed assertion is preserved.
    }
  }
  if (sourceBefore && sourceAfterWrite) {
    try {
      const currentResponse = await adminFetch(
        `/api/admin/products/${encodeURIComponent(sourceId)}`,
      );
      if (currentResponse.ok) {
        const current = await currentResponse.json();
        if (
          current.product.name !== sourceBefore.name ||
          current.product.sortOrder !== sourceBefore.sortOrder ||
          current.product.stock !== sourceBefore.stock
        ) {
          await adminFetch("/api/admin/products/list", {
            method: "PATCH",
            body: JSON.stringify({
              rows: [listRow(current.product, sourceBefore)],
            }),
          });
        }
      }
    } catch {
      // Best-effort restoration; the failed assertion is preserved.
    }
  }
}

function listRow(product, overrides = {}) {
  return {
    id: product.id,
    expectedRevision: product.revision,
    expectedStock: product.stock,
    expectedStockControlRevision: product.stockControlRevision,
    primaryCategoryId: product.primaryCategoryId,
    secondaryCategoryId: product.secondaryCategoryId,
    tertiaryCategoryId: product.tertiaryCategoryId,
    sortOrder: product.sortOrder,
    active: product.active,
    soldOut: product.soldOut,
    name: product.name,
    price: product.price,
    originalPrice: product.originalPrice,
    stock: product.stock,
    desktopSkin: product.desktopSkin,
    mobileSkin: product.mobileSkin,
    ...overrides,
  };
}

function adminFetch(pathname, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  headers.set("Cookie", adminCookie);
  headers.set("Origin", baseUrl);
  if (init.body) headers.set("Content-Type", "application/json");
  return fetch(`${baseUrl}${pathname}`, { ...init, headers });
}

async function createLocalAdminCookie() {
  const values = Object.fromEntries(
    readFileSync(resolve(workspace, ".env.local"), "utf8")
      .split(/\r?\n/u)
      .filter((line) => line && !line.trimStart().startsWith("#"))
      .map((line) => {
        const separator = line.indexOf("=");
        return separator < 0
          ? ["", ""]
          : [
              line.slice(0, separator).trim(),
              line.slice(separator + 1).trim(),
            ];
      })
      .filter(([key]) => key),
  );
  assert.ok(values.ADMIN_USERNAME);
  assert.ok(values.SESSION_SECRET?.length >= 32);
  const now = Math.floor(Date.now() / 1_000);
  const payload = {
    version: 1,
    subject: values.ADMIN_USERNAME,
    role: "admin",
    issuedAt: now,
    expiresAt: now + 60 * 60,
    nonce: crypto.randomUUID().replaceAll("-", ""),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(values.SESSION_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(encoded),
  );
  return `admin_session=${encoded}.${Buffer.from(signature).toString("base64url")}`;
}
