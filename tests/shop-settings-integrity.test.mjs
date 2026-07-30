import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  defaultShopOperationSettings,
  enabledPaymentMethods,
  maximumSelectablePoints,
  validatePointUse,
} from "../lib/shop-settings.ts";

test("matches the original payment, point, and free-shipping defaults", () => {
  assert.deepEqual(enabledPaymentMethods(defaultShopOperationSettings), [
    "bank",
  ]);
  assert.equal(defaultShopOperationSettings.paymentCardEnabled, false);
  assert.equal(defaultShopOperationSettings.paymentTransferEnabled, false);
  assert.equal(defaultShopOperationSettings.paymentVirtualEnabled, false);
  assert.equal(defaultShopOperationSettings.paymentMobileEnabled, false);
  assert.equal(defaultShopOperationSettings.pointUseEnabled, true);
  assert.equal(defaultShopOperationSettings.pointUseMinimum, 1_000);
  assert.equal(defaultShopOperationSettings.pointUseMaximum, 100_000_000);
  assert.equal(defaultShopOperationSettings.pointUseUnit, 100);
  assert.equal(defaultShopOperationSettings.defaultShippingFee, 0);
});

test("fails closed when stale PG flags are enabled without a gateway", () => {
  assert.deepEqual(
    enabledPaymentMethods({
      ...defaultShopOperationSettings,
      paymentCardEnabled: true,
      paymentTransferEnabled: true,
      paymentVirtualEnabled: true,
      paymentMobileEnabled: true,
    }),
    ["bank"],
  );
});

test("enforces point minimum, maximum, unit, total, balance, and login boundaries", () => {
  const settings = defaultShopOperationSettings;
  const validate = (
    pointsUsed,
    {
      orderTotal = 200_000_000,
      availablePoints = 200_000_000,
      authenticated = true,
    } = {},
  ) =>
    validatePointUse({
      pointsUsed,
      orderTotal,
      availablePoints,
      authenticated,
      settings,
    });

  assert.deepEqual(validate(0), { ok: true });
  assert.equal(validate(999).failure, "minimum");
  assert.deepEqual(validate(1_000), { ok: true });
  assert.equal(validate(1_050).failure, "unit");
  assert.deepEqual(validate(100_000_000), { ok: true });
  assert.equal(validate(100_000_100).failure, "maximum");
  assert.equal(validate(10_000, { orderTotal: 9_000 }).failure, "order-total");
  assert.equal(
    validate(10_000, { availablePoints: 9_000 }).failure,
    "balance",
  );
  assert.equal(
    validate(1_000, { authenticated: false }).failure,
    "authentication",
  );
  assert.equal(
    validatePointUse({
      pointsUsed: 1_000,
      orderTotal: 1_000,
      availablePoints: 1_000,
      authenticated: true,
      settings: { ...settings, pointUseEnabled: false },
    }).failure,
    "disabled",
  );
  assert.deepEqual(
    validate(20_000, { orderTotal: 20_000, availablePoints: 20_000 }),
    { ok: true },
  );
});

test("rounds the selectable point ceiling down to the configured unit", () => {
  assert.equal(
    maximumSelectablePoints({
      orderTotal: 15_050,
      availablePoints: 20_000,
      settings: defaultShopOperationSettings,
    }),
    15_000,
  );
  assert.equal(
    maximumSelectablePoints({
      orderTotal: 200_000_000,
      availablePoints: 200_000_000,
      settings: defaultShopOperationSettings,
    }),
    100_000_000,
  );
});

test("migrates missing D1 settings without overwriting existing choices", async () => {
  const migration = await readFile(
    new URL("../drizzle/0005_shop_operation_defaults.sql", import.meta.url),
    "utf8",
  );
  const database = new DatabaseSync(":memory:");
  database.exec(`
    CREATE TABLE site_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO site_settings (key, value)
    VALUES ('pointUseMinimum', '5000');
  `);
  for (const statement of migration.split("--> statement-breakpoint")) {
    if (statement.trim()) database.exec(statement);
  }
  assert.equal(
    database
      .prepare("SELECT value FROM site_settings WHERE key = ?")
      .get("pointUseMinimum").value,
    "5000",
  );
  assert.equal(
    database
      .prepare("SELECT value FROM site_settings WHERE key = ?")
      .get("paymentBankEnabled").value,
    "1",
  );
  assert.equal(
    database
      .prepare("SELECT value FROM site_settings WHERE key = ?")
      .get("defaultShippingFee").value,
    "0",
  );
  assert.equal(
    database.prepare("SELECT COUNT(*) AS total FROM site_settings").get()
      .total,
    10,
  );
  database.close();
});

test("keeps the order server authoritative and the checkout policy-visible", async () => {
  const [route, orderForm, checkout, settingsEditor] = await Promise.all([
    readFile(new URL("../app/api/orders/route.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../app/shop/orderform.php/page.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(
        "../app/components/storefront/CartCheckoutPanels.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../app/adm/(protected)/settings/SettingsEditor.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);
  assert.match(route, /getEffectiveSiteSettings\(\{ strict: true \}\)/);
  assert.match(route, /validatePointUse/);
  assert.match(route, /enabledPaymentMethods/);
  assert.match(route, /points >= \?/);
  assert.match(route, /guard_value/);
  assert.match(orderForm, /paymentMethods=\{enabledPaymentMethods\(settings\)\}/);
  assert.match(orderForm, /shippingFee=\{settings\.defaultShippingFee\}/);
  assert.match(checkout, /pointUseMinimum/);
  assert.match(checkout, /pointUseMaximum/);
  assert.match(checkout, /pointUseUnit/);
  assert.match(settingsEditor, /paymentMobileEnabled/);
  assert.match(settingsEditor, /disabled=\{field !== "paymentBankEnabled"\}/);
  assert.match(settingsEditor, /settings-point-minimum/);
  assert.match(settingsEditor, /settings-shipping-fee/);
});

test("keeps the full legacy shop configuration local, revisioned, and fail-closed", async () => {
  const [
    schemaSource,
    contract,
    service,
    route,
    editor,
    migration,
  ] = await Promise.all([
    readFile(
      new URL("../data/legacy-shop-config-schema.json", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../lib/legacy-shop-config-contract.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../lib/legacy-shop-settings.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(
        "../app/api/admin/shop-settings/route.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../app/adm/(protected)/settings/LegacyShopSettingsEditor.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../drizzle/0013_legacy_shop_settings.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);
  const schema = JSON.parse(schemaSource);
  assert.equal(schema.sections.length, 8);
  assert.equal(schema.namedControlCount, 187);
  assert.equal(
    schema.sections.reduce(
      (total, section) =>
        total +
        section.rows.reduce(
          (rowTotal, row) =>
            rowTotal +
            row.cells.reduce(
              (cellTotal, cell) => cellTotal + cell.controls.length,
              0,
            ),
          0,
        ),
      0,
    ),
    187,
  );
  assert.match(contract, /legacyShopSmsPresets/);
  assert.match(contract, /de_sms_cont\$\{index\}/);
  assert.match(service, /expectedRevision/);
  assert.match(service, /legacy_shop_write_guards/);
  assert.match(service, /control\.secret/);
  assert.match(service, /applyLegacyShopFailClosed/);
  assert.match(service, /const pgConfigured = false/);
  assert.match(route, /requireAdminApiSession/);
  assert.match(route, /assertSameOrigin/);
  assert.match(route, /readAdminJson\(request, 512_000\)/);
  assert.match(editor, /name="fconfig"/);
  assert.match(editor, /name="token"/);
  assert.match(editor, /사전에 정의된 SMS프리셋/);
  assert.match(editor, /테스트결제 팁 더보기/);
  assert.match(editor, /환경변수로 관리/);

  const database = new DatabaseSync(":memory:");
  for (const statement of migration.split("--> statement-breakpoint")) {
    if (statement.trim()) database.exec(statement);
  }
  assert.equal(
    database
      .prepare(
        "SELECT COUNT(*) AS total FROM sqlite_master WHERE type = 'table' AND name IN ('legacy_shop_settings', 'legacy_shop_write_guards')",
      )
      .get().total,
    2,
  );
  assert.throws(() =>
    database.exec(
      "INSERT INTO legacy_shop_settings(id, values_json) VALUES (2, '{}')",
    ),
  );
  assert.throws(() =>
    database.exec(
      "INSERT INTO legacy_shop_write_guards(operation_id, guard_value) VALUES ('bad', 0)",
    ),
  );
  database.close();
});
