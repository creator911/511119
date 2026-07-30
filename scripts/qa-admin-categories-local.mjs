import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const base = new URL(process.env.QA_BASE_URL || "http://localhost:4173");
const env = Object.fromEntries(
  (await readFile(resolve(process.cwd(), ".env.local"), "utf8"))
    .split(/\r?\n/u)
    .filter((line) => line && !line.trimStart().startsWith("#"))
    .map((line) => {
      const separator = line.indexOf("=");
      return separator < 0
        ? ["", ""]
        : [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
    })
    .filter(([key]) => key),
);
assert.ok(env.ADMIN_USERNAME);
assert.ok(env.SESSION_SECRET?.length >= 32);

const cookie = await createAdminCookie(
  env.ADMIN_USERNAME,
  env.SESSION_SECRET,
);
const headers = {
  Accept: "application/json",
  Cookie: cookie,
  Origin: base.origin,
  "Content-Type": "application/json",
};

const initial = await readCategories();
assert.equal(initial.length, 44);
assert.deepEqual(
  initial.map((record) => record.category.id),
  [
    "10", "20", "30", "40", "50", "60", "70", "80", "90", "91",
    "2010", "2020", "2030", "2040", "3020", "3030", "3040", "4010",
    "4020", "5010", "5020", "5030", "5040", "6010", "6020", "6030",
    "6040", "6050", "6060", "6070", "7010", "7020", "7030", "7040",
    "8010", "8020", "8030", "9010", "9020", "9030", "9110", "9120",
    "9130", "9140",
  ],
);

const target = initial.find((record) => record.category.id === "30");
assert.ok(target);
const changed = await patchCategory(target, {
  ...categoryPayload(target.category),
  active: !target.category.active,
  expectedRevision: target.revision,
});
assert.equal(changed.category.active, !target.category.active);
const restored = await patchCategory(changed, {
  ...categoryPayload(target.category),
  expectedRevision: changed.revision,
});
assert.equal(restored.category.active, target.category.active);
assert.equal(restored.category.imageWidth, 600);
assert.equal(restored.category.skinDirectory, "basic");
assert.equal(restored.category.skin, "list.10.skin.php");
assert.equal(restored.category.mobileSkinDirectory, "basic");

const childId = `30qa${Date.now().toString(36)}`;
let createdChild;
try {
  createdChild = await createCategory({
    ...categoryPayload(target.category),
    id: childId,
    name: "하위분류 기능검증",
    parentId: target.category.id,
    sortOrder: 999_999,
    active: false,
  });
  assert.equal(createdChild.category.parentId, target.category.id);
  assert.equal(createdChild.category.skinDirectory, "basic");
  const withChild = await readCategories();
  assert.equal(withChild.length, 45);
  assert.equal(
    withChild.find((record) => record.category.id === childId)?.category.parentId,
    target.category.id,
  );
} finally {
  if (createdChild) {
    await deleteCategory(childId, createdChild.revision);
  }
}

const final = await readCategories();
assert.equal(final.length, 44);
assert.equal(
  final.find((record) => record.category.id === "30")?.category.active,
  target.category.active,
);

console.log(
  JSON.stringify({
    ok: true,
    categories: final.length,
    inlineFieldsPersisted: true,
    childCategoryCreateDelete: true,
    reversibleUpdateRestored: true,
  }),
);

async function readCategories() {
  const response = await fetch(new URL("/api/admin/categories", base), {
    headers: { Accept: "application/json", Cookie: cookie },
  });
  const payload = await response.json();
  assert.equal(response.status, 200, payload.message);
  assert.ok(Array.isArray(payload.categories));
  return payload.categories;
}

async function patchCategory(record, body) {
  const response = await fetch(
    new URL(`/api/admin/categories/${encodeURIComponent(record.category.id)}`, base),
    {
      method: "PATCH",
      headers,
      body: JSON.stringify(body),
    },
  );
  const payload = await response.json();
  assert.equal(response.status, 200, payload.message);
  assert.ok(payload.category);
  return payload.category;
}

async function createCategory(body) {
  const response = await fetch(new URL("/api/admin/categories", base), {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  assert.equal(response.status, 201, payload.message);
  assert.ok(payload.category);
  return payload.category;
}

async function deleteCategory(id, revision) {
  const url = new URL(
    `/api/admin/categories/${encodeURIComponent(id)}`,
    base,
  );
  url.searchParams.set("revision", String(revision));
  const response = await fetch(url, {
    method: "DELETE",
    headers,
  });
  const payload = await response.json();
  assert.equal(response.status, 200, payload.message);
  assert.equal(payload.deletedId, id);
}

function categoryPayload(category) {
  return {
    id: category.id,
    name: category.name,
    parentId: category.parentId,
    sortOrder: category.sortOrder,
    active: category.active,
    manager: category.manager ?? "",
    identityRequired: category.identityRequired ?? false,
    adultOnly: category.adultOnly ?? false,
    imageWidth: category.imageWidth ?? 600,
    imageHeight: category.imageHeight ?? 0,
    desktopColumns: category.desktopColumns ?? 3,
    desktopRows: category.desktopRows ?? 5,
    mobileColumns: category.mobileColumns ?? 3,
    mobileRows: category.mobileRows ?? 5,
    skinDirectory: category.skinDirectory ?? "basic",
    skin: category.skin ?? "list.10.skin.php",
    mobileSkinDirectory: category.mobileSkinDirectory ?? "basic",
    mobileSkin: category.mobileSkin ?? "list.10.skin.php",
  };
}

async function createAdminCookie(username, secret) {
  const now = Math.floor(Date.now() / 1_000);
  const payload = {
    version: 1,
    subject: username,
    role: "admin",
    issuedAt: now,
    expiresAt: now + 60 * 60,
    nonce: crypto.randomUUID().replace(/-/gu, ""),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(encoded),
  );
  return `admin_session=${encoded}.${Buffer.from(signature).toString(
    "base64url",
  )}`;
}
