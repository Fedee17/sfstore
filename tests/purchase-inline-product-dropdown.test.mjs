import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const form = readFileSync(
  join(
    testDirectory,
    "..",
    "components",
    "admin",
    "purchases",
    "purchase-draft-form.tsx",
  ),
  "utf8",
);

test("product search owns an explicit dropdown state", () => {
  assert.match(form, /openProductDropdownForLine/);
  assert.match(form, /onFocus=\{\(\) => \{[\s\S]+setOpenProductDropdownForLine\(line\.key\)/);
  assert.match(form, /onChange=\{\(event\) => \{[\s\S]+setOpenProductDropdownForLine\(line\.key\)/);
});

test("opening inline creation closes results and keeps the searched name", () => {
  const block = form.slice(
    form.indexOf("function openProductCreate"),
    form.indexOf("function cancelProductCreate"),
  );
  assert.match(block, /setOpenProductDropdownForLine\(null\)/);
  assert.match(block, /setCreateForLine\(line\.key\)/);
  assert.match(block, /setNewProductName\(line\.productQuery\.trim\(\)\)/);
  assert.match(form, /createForLine !== line\.key[\s\S]+line\.productQuery\.trim\(\)/);
  assert.match(form, /autoFocus/);
});

test("cancelling inline creation closes both creation and dropdown", () => {
  const block = form.slice(
    form.indexOf("function cancelProductCreate"),
    form.indexOf("function submitProductCreate"),
  );
  assert.match(block, /setCreateForLine\(null\)/);
  assert.match(block, /setOpenProductDropdownForLine\(null\)/);
  assert.match(form, /onClick=\{cancelProductCreate\}/);
});

test("selecting an existing product closes the dropdown", () => {
  const block = form.slice(
    form.indexOf("function selectProduct"),
    form.indexOf("function openProductCreate"),
  );
  assert.match(block, /setOpenProductDropdownForLine\(null\)/);
  assert.match(block, /productId: product\.id/);
});

test("successful creation closes all overlays and focuses quantity", () => {
  const block = form.slice(
    form.indexOf("function submitProductCreate"),
    form.indexOf("return ("),
  );
  assert.match(block, /selectProduct\(lineKey, product\)/);
  assert.match(block, /setCreateForLine\(null\)/);
  assert.match(block, /setOpenProductDropdownForLine\(null\)/);
  assert.match(block, /quantityInputRefs\.current\[lineKey\]\?\.focus\(\)/);
});

test("inline form focus cannot reopen its product dropdown", () => {
  assert.match(
    form,
    /onFocus=\{\(\) => \{\s*if \(createForLine !== line\.key\) \{\s*setOpenProductDropdownForLine\(line\.key\)/,
  );
  assert.match(
    form,
    /openProductDropdownForLine === line\.key &&\s*createForLine !== line\.key/,
  );
});
