import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const workspace = process.cwd();
const baseUrl = (
  process.env.QA_BASE_URL || "http://localhost:4173"
).replace(/\/+$/u, "");
const env = parseEnv(
  readFileSync(resolve(workspace, ".env.local"), "utf8"),
);
assert.ok(env.ADMIN_USERNAME, "ADMIN_USERNAME is required.");
assert.ok(
  env.SESSION_SECRET?.length >= 32,
  "SESSION_SECRET must contain at least 32 characters.",
);

const databaseDirectory = resolve(
  workspace,
  ".wrangler/state/v3/d1/miniflare-D1DatabaseObject",
);
const databaseFile = readdirSync(databaseDirectory)
  .filter((name) => name.endsWith(".sqlite") && name !== "metadata.sqlite")
  .map((name) => join(databaseDirectory, name))
  .find(Boolean);
assert.ok(databaseFile, "Local D1 database was not found.");
assert.ok(
  resolve(databaseFile).startsWith(databaseDirectory),
  "Resolved D1 database escaped the local workspace state directory.",
);

const catalog = JSON.parse(
  readFileSync(resolve(workspace, "data/catalog.json"), "utf8"),
);
const productId = String(catalog.products?.[0]?.id ?? "");
assert.ok(productId, "A catalog product is required for operational QA.");

const cookie = await createAdminCookie(
  env.ADMIN_USERNAME,
  env.SESSION_SECRET,
);
const runId = `QAOPS-${Date.now().toString(36).toUpperCase()}`;
const interactionId = `qa-int-${Date.now().toString(36)}`;
const reviewId = `qa-review-${Date.now().toString(36)}`;
const restockId = crypto.randomUUID();
const restockQueueId = crypto.randomUUID();
const wishlistOwner = `qa-owner-${Date.now().toString(36)}`;
const visitDate = "2099-12-31";
const couponCode = `QA${Date.now().toString(36).toUpperCase()}`.slice(0, 20);
const database = new DatabaseSync(databaseFile);
const cleanup = {
  couponIds: new Set(),
  shippingIds: new Set(),
  eventIds: new Set(),
  paymentIds: new Set(),
  auditEntityIds: new Set([
    interactionId,
    reviewId,
    restockId,
  ]),
  toolRunIds: new Set(),
};
let additionalServicesSnapshot;
let cronSnapshot = [];
let auditFloor = 0;

try {
  const unauthorized = await api("/api/admin/interactions?kind=question", {
    authenticated: false,
  });
  assert.equal(unauthorized.status, 401);

  // Initialize every schema before direct, QA-prefixed fixtures are inserted.
  for (const path of [
    "/api/admin/interactions?kind=question",
    "/api/admin/coupons",
    "/api/admin/shipping-rules",
    "/api/admin/events",
    "/api/admin/personal-payments",
    "/api/admin/products/restock",
    "/api/admin/saved-items",
    `/api/admin/visitors?from=${visitDate}&to=${visitDate}`,
    "/api/admin/m3cron/jobs",
    "/api/admin/m3cron/logs",
    "/api/admin/mail-test",
    "/api/admin/products/types",
    "/api/admin/products/options",
  ]) {
    const response = await api(path);
    assert.equal(response.status, 200, `${path} did not initialize.`);
  }
  const servicesPage = await html("/adm/tools/additional-services");
  assert.equal(servicesPage.status, 200);

  auditFloor = Number(
    database
      .prepare("SELECT COALESCE(MAX(id), 0) AS id FROM admin_audit_logs")
      .get().id,
  );

  await verifyOriginGuards();
  await verifyInteractions();
  await verifyCatalogOperations();
  await verifyPromotions();
  await verifyEvents();
  await verifyPersonalPayments();
  await verifyRestockQueue();
  await verifyOperationalReports();
  await verifyM3Cron();
  await verifyExternalFailClosed();
  await verifyAdditionalServices();

  console.log(
    JSON.stringify({
      ok: true,
      runId,
      checks: {
        unauthorizedRejected: true,
        crossOriginMutationsRejected: true,
        inquiryAndReviewSearchUpdateDelete: true,
        interactionUpdatesAudited: true,
        productTypesAndOptionsStaleWritesRejected: true,
        couponCreateUpdateZoneConflictDelete: true,
        shippingCreateUpdateDelete: true,
        eventCreatePublishUpdateBulkExpireDelete: true,
        personalPaymentCreateSearchUpdateStaleBulkDelete: true,
        restockQueueSearchAndCas: true,
        savedItemSearch: true,
        visitorDateAggregation: true,
        m3cronAtomicReorderAndStaleRollback: true,
        m3cronLogsReadable: true,
        mailProviderFailsClosed: true,
        additionalServicesPersistAndRestore: true,
      },
    }),
  );
} finally {
  restoreLocalState();
  database.close();
}

async function verifyOriginGuards() {
  const targets = [
    ["/api/admin/interactions/not-present", "PATCH", { answer: "", active: true }],
    ["/api/admin/coupons", "POST", {}],
    ["/api/admin/shipping-rules", "POST", {}],
    ["/api/admin/events", "POST", {}],
    ["/api/admin/personal-payments", "POST", {}],
    ["/api/admin/products/restock", "PATCH", {}],
    ["/api/admin/m3cron/jobs", "PATCH", { orders: [] }],
    ["/api/admin/tools/additional-services", "PATCH", {}],
  ];
  for (const [path, method, body] of targets) {
    const response = await api(path, {
      method,
      body,
      origin: "https://cross-origin.invalid",
    });
    assert.equal(response.status, 403, `${path} accepted a cross-origin write.`);
  }
}

async function verifyInteractions() {
  const insert = database.prepare(
    `INSERT INTO product_interactions (
       id, product_id, user_id, kind, author_name, title, body,
       rating, answer, active
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', 1)`,
  );
  insert.run(
    interactionId,
    productId,
    wishlistOwner,
    "question",
    "QA operator",
    `${runId} inquiry`,
    `${runId} inquiry body`,
    0,
  );
  insert.run(
    reviewId,
    productId,
    `${wishlistOwner}-review`,
    "review",
    "QA reviewer",
    `${runId} review`,
    `${runId} review body`,
    5,
  );

  const questionList = await okJson(
    `/api/admin/interactions?kind=question&q=${encodeURIComponent(runId)}`,
  );
  assert.ok(
    questionList.interactions.some((item) => item.id === interactionId),
  );
  const reviewList = await okJson(
    `/api/admin/interactions?kind=review&q=${encodeURIComponent(runId)}`,
  );
  assert.ok(reviewList.interactions.some((item) => item.id === reviewId));

  const updated = await okJson(
    `/api/admin/interactions/${encodeURIComponent(interactionId)}`,
    {
      method: "PATCH",
      body: { answer: `${runId} answer`, active: false },
    },
  );
  assert.equal(updated.interaction.answer, `${runId} answer`);
  assert.equal(updated.interaction.active, false);
  const updateAudit = database
    .prepare(
      `SELECT action FROM admin_audit_logs
       WHERE entity_id = ? AND action = 'interaction.update'
       ORDER BY id DESC LIMIT 1`,
    )
    .get(interactionId);
  assert.equal(updateAudit?.action, "interaction.update");

  for (const id of [interactionId, reviewId]) {
    const deleted = await api(
      `/api/admin/interactions/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
    assert.equal(deleted.status, 200);
  }
  const remaining = database
    .prepare(
      "SELECT COUNT(*) AS count FROM product_interactions WHERE id IN (?, ?)",
    )
    .get(interactionId, reviewId);
  assert.equal(Number(remaining.count), 0);
}

async function verifyCatalogOperations() {
  const types = await okJson("/api/admin/products/types");
  assert.ok(Array.isArray(types.rows) && types.rows.length >= 1);
  const typeRow = types.rows[0];
  const staleType = await api("/api/admin/products/types", {
    method: "PUT",
    body: {
      rows: [
        {
          id: typeRow.id,
          expectedRevision: typeRow.revision + 1,
          flags: typeRow.flags,
        },
      ],
    },
  });
  assert.equal(staleType.status, 409);

  const options = await okJson("/api/admin/products/options");
  assert.ok(Array.isArray(options.products) && options.products.length >= 1);
  const optionProduct = options.products[0];
  const staleOptions = await api("/api/admin/products/options", {
    method: "PUT",
    body: {
      productId: optionProduct.id,
      expectedSetRevision: optionProduct.setRevision + 1,
      rows: optionProduct.options.map((option) => ({
        id: option.id,
        expectedRevision: option.revision,
        expectedStock: option.stock,
        optionName: option.optionName,
        optionValue: option.optionValue,
        priceDelta: option.priceDelta,
        stock: option.stock,
        saleEnabled: option.saleEnabled,
        soldOut: option.soldOut,
        sortOrder: option.sortOrder,
      })),
    },
  });
  assert.equal(staleOptions.status, 409);
}

async function verifyPromotions() {
  const couponInput = {
    code: couponCode,
    name: `${runId} coupon`,
    type: "fixed",
    amount: 1000,
    minimumOrder: 5000,
    startsAt: "",
    endsAt: "",
    active: true,
    zoneEnabled: true,
  };
  const createdCoupon = await okJson("/api/admin/coupons", {
    method: "POST",
    body: couponInput,
    expectedStatus: 201,
  });
  const couponId = createdCoupon.coupon.id;
  cleanup.couponIds.add(couponId);
  cleanup.auditEntityIds.add(couponId);

  const zone = await okJson("/api/admin/coupons?zone=1");
  assert.ok(zone.coupons.some((coupon) => coupon.id === couponId));
  const duplicate = await api("/api/admin/coupons", {
    method: "POST",
    body: couponInput,
  });
  assert.equal(duplicate.status, 409);
  const updatedCoupon = await okJson(
    `/api/admin/coupons/${encodeURIComponent(couponId)}`,
    {
      method: "PATCH",
      body: { ...couponInput, amount: 1500 },
    },
  );
  assert.equal(updatedCoupon.coupon.amount, 1500);

  const ruleInput = {
    regionName: `${runId} region`,
    postcodeStart: "98760",
    postcodeEnd: "98761",
    extraFee: 3000,
    active: true,
  };
  const createdRule = await okJson("/api/admin/shipping-rules", {
    method: "POST",
    body: ruleInput,
    expectedStatus: 201,
  });
  const ruleId = createdRule.rule.id;
  cleanup.shippingIds.add(ruleId);
  cleanup.auditEntityIds.add(ruleId);
  const updatedRule = await okJson(
    `/api/admin/shipping-rules/${encodeURIComponent(ruleId)}`,
    {
      method: "PATCH",
      body: { ...ruleInput, extraFee: 3500 },
    },
  );
  assert.equal(updatedRule.rule.extraFee, 3500);

  const deleteRule = await api(
    `/api/admin/shipping-rules/${encodeURIComponent(ruleId)}`,
    { method: "DELETE" },
  );
  assert.equal(deleteRule.status, 200);
  cleanup.shippingIds.delete(ruleId);
  const deleteCoupon = await api(
    `/api/admin/coupons/${encodeURIComponent(couponId)}`,
    { method: "DELETE" },
  );
  assert.equal(deleteCoupon.status, 200);
  cleanup.couponIds.delete(couponId);
}

async function verifyEvents() {
  const runIdsBefore = new Set(
    database
      .prepare("SELECT id FROM admin_tool_runs")
      .all()
      .map((row) => String(row.id)),
  );
  const input = {
    title: `${runId} event`,
    content: `${runId} event content`,
    href: "/shop",
    startsAt: "",
    endsAt: "",
    active: true,
  };
  const created = await okJson("/api/admin/events", {
    method: "POST",
    body: input,
    expectedStatus: 201,
  });
  const eventId = created.event.id;
  cleanup.eventIds.add(eventId);
  cleanup.auditEntityIds.add(eventId);
  const publicEvent = await html(
    `/shop/event.php?ev_id=${encodeURIComponent(eventId)}`,
  );
  assert.equal(publicEvent.status, 200);
  assert.match(publicEvent.body, new RegExp(runId, "u"));

  const updated = await okJson(
    `/api/admin/events/${encodeURIComponent(eventId)}`,
    {
      method: "PATCH",
      body: {
        ...input,
        startsAt: "2000-01-01",
        endsAt: "2000-01-02",
      },
    },
  );
  assert.equal(updated.event.active, true);
  const bulk = await okJson("/api/admin/events/bulk", {
    method: "POST",
    body: {},
  });
  assert.ok(bulk.expiredCount >= 1);
  const eventList = await okJson("/api/admin/events");
  assert.equal(
    eventList.events.find((event) => event.id === eventId)?.active,
    false,
  );
  const deleteEvent = await api(
    `/api/admin/events/${encodeURIComponent(eventId)}`,
    { method: "DELETE" },
  );
  assert.equal(deleteEvent.status, 200);
  cleanup.eventIds.delete(eventId);

  for (const row of database.prepare("SELECT id FROM admin_tool_runs").all()) {
    if (!runIdsBefore.has(String(row.id))) cleanup.toolRunIds.add(String(row.id));
  }
}

async function verifyPersonalPayments() {
  const body = {
    title: `${runId} personal payment`,
    orderId: `${runId}-ORDER`,
    orderAmount: 10000,
    receiptAmount: 1000,
    paymentMethod: "",
    receiptTime: null,
    content: `${runId} customer content`,
    shopMemo: `${runId} admin memo`,
    enabled: true,
  };
  const first = await okJson("/api/admin/personal-payments", {
    method: "POST",
    body,
    expectedStatus: 201,
  });
  const second = await okJson("/api/admin/personal-payments", {
    method: "POST",
    body: { ...body, title: `${runId} personal payment 2` },
    expectedStatus: 201,
  });
  for (const payment of [first.payment, second.payment]) {
    cleanup.paymentIds.add(payment.id);
    cleanup.auditEntityIds.add(payment.id);
  }
  const searched = await okJson(
    `/api/admin/personal-payments?field=title&query=${encodeURIComponent(runId)}`,
  );
  assert.ok(searched.payments.some((item) => item.id === first.payment.id));
  const publicPayment = await html(first.payment.publicHref);
  assert.equal(publicPayment.status, 200);
  assert.match(publicPayment.body, new RegExp(runId, "u"));

  const updated = await okJson(
    `/api/admin/personal-payments/${encodeURIComponent(first.payment.id)}`,
    {
      method: "PATCH",
      body: {
        ...body,
        receiptAmount: 2000,
        revision: first.payment.revision,
      },
    },
  );
  assert.equal(updated.payment.receiptAmount, 2000);
  const stale = await api(
    `/api/admin/personal-payments/${encodeURIComponent(first.payment.id)}`,
    {
      method: "PATCH",
      body: {
        ...body,
        receiptAmount: 3000,
        revision: first.payment.revision,
      },
    },
  );
  assert.equal(stale.status, 409);
  const bulkDelete = await okJson("/api/admin/personal-payments", {
    method: "DELETE",
    body: { ids: [first.payment.id, second.payment.id] },
  });
  assert.equal(bulkDelete.deleted, 2);
  cleanup.paymentIds.clear();
}

async function verifyRestockQueue() {
  database
    .prepare(
      `INSERT INTO restock_requests (
         id, product_id, phone, phone_hash, status, revision, admin_memo
       ) VALUES (?, ?, '01012345678', ?, 'waiting_provider', 1, ?)`,
    )
    .run(restockId, productId, `${runId}-hash`, runId);
  database
    .prepare(
      `INSERT INTO restock_sms_queue (
         id, request_id, status, attempts, last_error, revision
       ) VALUES (?, ?, 'waiting_provider', 0, '', 1)`,
    )
    .run(restockQueueId, restockId);

  const list = await okJson(
    `/api/admin/products/restock?q=${encodeURIComponent("01012345678")}`,
  );
  assert.ok(list.requests.some((request) => request.id === restockId));
  const updated = await okJson("/api/admin/products/restock", {
    method: "PATCH",
    body: {
      id: restockId,
      expectedRevision: 1,
      expectedQueueRevision: 1,
      action: "cancel",
      adminMemo: `${runId} cancelled`,
    },
  });
  assert.equal(updated.request.status, "cancelled");
  const stale = await api("/api/admin/products/restock", {
    method: "PATCH",
    body: {
      id: restockId,
      expectedRevision: 1,
      expectedQueueRevision: 1,
      action: "retry",
      adminMemo: runId,
    },
  });
  assert.equal(stale.status, 409);
}

async function verifyOperationalReports() {
  database
    .prepare(
      `INSERT INTO wishlist_items (owner_key, product_id)
       VALUES (?, ?)`,
    )
    .run(wishlistOwner, productId);
  const saved = await okJson(
    `/api/admin/saved-items?member=${encodeURIComponent(wishlistOwner)}&product=${encodeURIComponent(productId)}`,
  );
  assert.ok(
    saved.report.items.some(
      (item) =>
        item.ownerKey === wishlistOwner && item.productId === productId,
    ),
  );

  database
    .prepare(
      `INSERT INTO site_visit_daily (
         business_date, page_views, unique_visitors
       ) VALUES (?, 7, 3)`,
    )
    .run(visitDate);
  const visits = await okJson(
    `/api/admin/visitors?from=${visitDate}&to=${visitDate}`,
  );
  assert.equal(visits.report.totalPageViews, 7);
  assert.equal(visits.report.totalUniqueVisitors, 3);
  assert.equal(visits.report.days[0].repeatViews, 4);
}

async function verifyM3Cron() {
  const state = await okJson("/api/admin/m3cron/jobs");
  assert.ok(Array.isArray(state.jobs) && state.jobs.length >= 2);
  cronSnapshot = state.jobs.map((job) =>
    database
      .prepare(
        `SELECT id, sort_order, revision, updated_by, updated_at
         FROM m3cron_jobs WHERE id = ?`,
      )
      .get(job.id),
  );
  const orders = state.jobs.slice(0, 2).map((job) => ({
    id: job.id,
    sortOrder: job.sortOrder,
    revision: job.revision,
  }));
  const reordered = await okJson("/api/admin/m3cron/jobs", {
    method: "PATCH",
    body: { orders },
  });
  const firstAfter = reordered.jobs.find((job) => job.id === orders[0].id);
  const secondAfter = reordered.jobs.find((job) => job.id === orders[1].id);
  assert.equal(firstAfter.revision, orders[0].revision + 1);
  assert.equal(secondAfter.revision, orders[1].revision + 1);

  const stale = await api("/api/admin/m3cron/jobs", {
    method: "PATCH",
    body: {
      orders: [
        {
          id: firstAfter.id,
          sortOrder: firstAfter.sortOrder,
          revision: firstAfter.revision,
        },
        {
          id: secondAfter.id,
          sortOrder: secondAfter.sortOrder,
          revision: orders[1].revision,
        },
      ],
    },
  });
  assert.equal(stale.status, 409);
  const afterStale = await okJson("/api/admin/m3cron/jobs");
  assert.equal(
    afterStale.jobs.find((job) => job.id === firstAfter.id).revision,
    firstAfter.revision,
    "A stale bulk reorder partially committed its first row.",
  );
  const logs = await okJson("/api/admin/m3cron/logs");
  assert.ok(Array.isArray(logs.runs));
}

async function verifyExternalFailClosed() {
  const mail = await okJson("/api/admin/mail-test");
  if (!mail.state.providerConfigured) {
    const runCount = Number(
      database
        .prepare("SELECT COUNT(*) AS count FROM admin_mail_test_runs")
        .get().count,
    );
    const send = await api("/api/admin/mail-test", {
      method: "POST",
      body: {
        recipient: "qa@example.invalid",
        subject: `${runId} mail`,
        message: `${runId} provider fail-closed check`,
      },
    });
    assert.equal(send.status, 503);
    const after = Number(
      database
        .prepare("SELECT COUNT(*) AS count FROM admin_mail_test_runs")
        .get().count,
    );
    assert.equal(after, runCount);
  }
}

async function verifyAdditionalServices() {
  additionalServicesSnapshot = database
    .prepare(
      `SELECT settings_json, updated_by, updated_at
       FROM admin_tool_settings WHERE tool_key = 'additional-services'`,
    )
    .get();
  const saved = await okJson("/api/admin/tools/additional-services", {
    method: "PATCH",
    body: { enabled: false, memo: runId },
  });
  assert.equal(saved.settings.enabled, false);
  assert.equal(saved.settings.memo, runId);
  const stored = database
    .prepare(
      `SELECT settings_json FROM admin_tool_settings
       WHERE tool_key = 'additional-services'`,
    )
    .get();
  assert.equal(JSON.parse(stored.settings_json).memo, runId);
}

function restoreLocalState() {
  try {
    database
      .prepare("DELETE FROM product_interactions WHERE id IN (?, ?)")
      .run(interactionId, reviewId);
    database
      .prepare("DELETE FROM restock_sms_queue WHERE request_id = ?")
      .run(restockId);
    database
      .prepare("DELETE FROM restock_write_guards WHERE request_id = ?")
      .run(restockId);
    database
      .prepare("DELETE FROM restock_requests WHERE id = ?")
      .run(restockId);
    database
      .prepare("DELETE FROM wishlist_items WHERE owner_key = ?")
      .run(wishlistOwner);
    database
      .prepare("DELETE FROM site_visit_daily WHERE business_date = ?")
      .run(visitDate);
    for (const id of cleanup.couponIds) {
      database.prepare("DELETE FROM coupon_claims WHERE coupon_id = ?").run(id);
      database
        .prepare("DELETE FROM coupon_redemptions WHERE coupon_id = ?")
        .run(id);
      database.prepare("DELETE FROM coupons WHERE id = ?").run(id);
    }
    for (const id of cleanup.shippingIds) {
      database
        .prepare("DELETE FROM additional_shipping_rules WHERE id = ?")
        .run(id);
    }
    for (const id of cleanup.eventIds) {
      database
        .prepare(
          "DELETE FROM admin_tool_records WHERE tool_key = 'events' AND id = ?",
        )
        .run(id);
    }
    for (const id of cleanup.paymentIds) {
      database
        .prepare("DELETE FROM personal_payment_notices WHERE payment_id = ?")
        .run(id);
      database.prepare("DELETE FROM personal_payments WHERE id = ?").run(id);
    }
    for (const id of cleanup.toolRunIds) {
      database.prepare("DELETE FROM admin_tool_runs WHERE id = ?").run(id);
    }
    for (const row of cronSnapshot) {
      if (!row) continue;
      database
        .prepare(
          `UPDATE m3cron_jobs
           SET sort_order = ?, revision = ?, updated_by = ?, updated_at = ?
           WHERE id = ?`,
        )
        .run(
          row.sort_order,
          row.revision,
          row.updated_by,
          row.updated_at,
          row.id,
        );
      cleanup.auditEntityIds.add(String(row.id));
    }
    if (additionalServicesSnapshot) {
      database
        .prepare(
          `INSERT INTO admin_tool_settings (
             tool_key, settings_json, updated_by, updated_at
           ) VALUES ('additional-services', ?, ?, ?)
           ON CONFLICT(tool_key) DO UPDATE SET
             settings_json = excluded.settings_json,
             updated_by = excluded.updated_by,
             updated_at = excluded.updated_at`,
        )
        .run(
          additionalServicesSnapshot.settings_json,
          additionalServicesSnapshot.updated_by,
          additionalServicesSnapshot.updated_at,
        );
    } else {
      database
        .prepare(
          "DELETE FROM admin_tool_settings WHERE tool_key = 'additional-services'",
        )
        .run();
    }
    cleanup.auditEntityIds.add("additional-services");
    const ids = [...cleanup.auditEntityIds];
    for (const id of ids) {
      database
        .prepare(
          "DELETE FROM admin_audit_logs WHERE id > ? AND entity_id = ?",
        )
        .run(auditFloor, id);
    }
  } catch (error) {
    console.error(
      JSON.stringify({
        ok: false,
        cleanupError:
          error instanceof Error ? error.message : String(error),
      }),
    );
    process.exitCode = 1;
  }
}

async function okJson(path, options = {}) {
  const expectedStatus = options.expectedStatus ?? 200;
  const response = await api(path, options);
  assert.equal(
    response.status,
    expectedStatus,
    `${options.method ?? "GET"} ${path}: ${JSON.stringify(response.json)}`,
  );
  assert.equal(response.json?.ok, true, `${path} did not return ok=true.`);
  return response.json;
}

async function api(
  path,
  {
    method = "GET",
    body,
    authenticated = true,
    origin = method === "GET" ? undefined : baseUrl,
  } = {},
) {
  const headers = { Accept: "application/json" };
  if (authenticated) headers.Cookie = cookie;
  if (origin) headers.Origin = origin;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 500) };
  }
  return { status: response.status, json };
}

async function html(path) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { Accept: "text/html", Cookie: cookie },
    redirect: "follow",
  });
  return { status: response.status, body: await response.text() };
}

function parseEnv(source) {
  return Object.fromEntries(
    source
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
}

async function createAdminCookie(username, secret) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    version: 1,
    subject: username,
    role: "admin",
    issuedAt: now,
    expiresAt: now + 3600,
    nonce: crypto.randomUUID().replaceAll("-", ""),
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
