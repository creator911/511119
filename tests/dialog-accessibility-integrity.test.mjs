import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("storefront overlays trap focus and restore it to their opener", async () => {
  const header = await source("app/components/storefront/Header.tsx");

  assert.match(header, /FOCUSABLE_SELECTOR/);
  assert.match(header, /event\.key !== "Tab"/);
  assert.match(header, /focusReturnRef\.current\?\.focus\(\)/);
  assert.match(header, /id="storefront-mobile-drawer"/);
  assert.match(header, /role="dialog"/);
  assert.match(header, /aria-modal="true"/);
  assert.match(header, /mobileCloseButtonRef\.current\?\.focus\(\)/);
  assert.match(header, /searchInputRef\.current\?\.focus\(\)/);
});

test("admin operation dialogs keep focus contained without resetting on edits", async () => {
  const dialog = await source(
    "app/adm/(protected)/OperationDialog.tsx",
  );

  assert.match(dialog, /dialogRef/);
  assert.match(dialog, /event\.key !== "Tab"/);
  assert.match(dialog, /previouslyFocused\?\.focus\(\)/);
  assert.match(dialog, /aria-modal="true"/);
  assert.match(dialog, /tabIndex=\{-1\}/);
  assert.match(dialog, /busyRef\.current/);
  assert.match(dialog, /onCloseRef\.current/);
  assert.match(dialog, /\}, \[open\]\);/);
});
