import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("member management exposes immediate authenticated account cloning", async () => {
  const [route, service, manager, styles] = await Promise.all([
    read("app/api/admin/users/[id]/clone/route.ts"),
    read("lib/admin-member-clone.ts"),
    read("app/adm/(protected)/users/UsersManager.tsx"),
    read("app/adm/legacy-admin.css"),
  ]);

  assert.match(route, /export async function POST/);
  assert.match(route, /assertSameOrigin\(request\)/);
  assert.match(route, /requireAdminApiSession\(request\)/);
  assert.match(route, /cloneAdminMember\(id, session\.username\)/);

  assert.match(service, /const numberedLoginPattern = \/\^\(\.\*\?\)\(\\d\+\)\$\/u/);
  assert.match(service, /padStart\(parts\.width, "0"\)/);
  assert.match(service, /for \(let attempt = 0; attempt < 100/);
  assert.match(service, /await database\.batch\(statements\)/);
  assert.match(service, /session_version, updated_at/);
  assert.match(service, /VALUES \(\?, 1, CURRENT_TIMESTAMP\)/);
  assert.doesNotMatch(service, /table: "admins"/);
  for (const table of [
    "orders",
    "order_items",
    "charge_requests",
    "withdrawal_requests",
    "wallet_ledger",
    "admin_point_ledger",
    "member_access_groups",
    "wishlist_items",
    "questions",
    "reviews",
    "community_posts",
    "one_to_one_inquiries",
  ]) {
    assert.match(service, new RegExp(`"${table}"`, "u"));
  }

  assert.match(manager, /className="legacy-member-clone"/);
  assert.match(manager, /cloningMemberId === String\(record\.id\)/u);
  assert.match(manager, /method: "POST"/);
  assert.doesNotMatch(manager, /confirm\([^)]*복제/u);
  assert.match(styles, /\.legacy-member-clone \{/);
  assert.match(styles, /grid-column:\s*1 \/ -1/);
});

test("clone login-id policy keeps padding and skips occupied numbers", () => {
  const next = (source, existing) => {
    const match = /^(.*?)(\d+)$/u.exec(source);
    assert.ok(match?.[1] && match[2]);
    const width = match[2].length;
    const occupied = new Set(existing);
    for (let number = Number(match[2]) + 1; ; number += 1) {
      const candidate = `${match[1]}${String(number).padStart(width, "0")}`;
      if (!occupied.has(candidate)) return candidate;
    }
  };

  assert.equal(next("na001", []), "na002");
  assert.equal(next("na001", ["na002", "na003", "na010"]), "na004");
  assert.equal(next("na009", ["na010"]), "na011");
  assert.equal(next("na999", []), "na1000");
});
