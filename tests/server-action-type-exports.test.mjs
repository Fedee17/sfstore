import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const testDirectory = dirname(fileURLToPath(import.meta.url));

test("the product importer server action does not re-export imported types", () => {
  const source = readFileSync(
    join(testDirectory, "..", "app", "admin", "productos", "importar", "actions.ts"),
    "utf8",
  );

  assert.match(source, /^"use server";/);
  assert.doesNotMatch(source, /export\s+type\s*\{[^}]+\}/s);
  assert.doesNotMatch(source, /ImportCatalogAttributeUpdate/);
});
