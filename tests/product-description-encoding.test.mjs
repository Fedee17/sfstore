import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import ts from "typescript";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const helperPath = join(root, "lib", "products", "auto-descriptions.ts");
const helperSource = readFileSync(helperPath, "utf8");
const helperCompiled = ts.transpileModule(helperSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const descriptions = await import(
  `data:text/javascript;base64,${Buffer.from(helperCompiled).toString("base64")}`
);

const perfumeInput = {
  name: "HOMME BLACK - 100ML",
  category: { name: "Perfumes", slug: "perfumes" },
  brand: "",
  type: "",
  price: 0,
  transferPrice: null,
};

test("perfume fallback keeps Spanish UTF-8 characters intact", () => {
  const result = descriptions.getAutoDescriptions(perfumeInput);

  assert.match(result.description, /sensación/);
  assert.match(result.description, /buscás/);
  assert.match(result.description, /acompañe/);
  assert.match(result.description, /según/);
  assert.doesNotMatch(result.description, /Ã|Â|â|�/);
});

test("clearing a description applies the valid fallback without mojibake", () => {
  const auto = descriptions.getAutoDescriptions(perfumeInput);
  const result = descriptions.applyAutoDescriptionFallbacks(
    { short_description: "", description: null },
    auto,
  );

  assert.equal(result.description, auto.description);
  assert.doesNotMatch(result.description, /Ã|Â|â|�/);
});

test("an explicit description is preserved", () => {
  const auto = descriptions.getAutoDescriptions(perfumeInput);
  const explicit = "Descripción escrita por el administrador con tilde y ñ.";
  const result = descriptions.applyAutoDescriptionFallbacks(
    { short_description: "Resumen", description: explicit },
    auto,
  );

  assert.equal(result.description, explicit);
});

test("UTF-8 write and read round-trip preserves accents and enye", () => {
  const original = "sensación, buscás, acompañe, según, ocasión y ñ";
  const decoded = new TextDecoder("utf-8", { fatal: true }).decode(
    new TextEncoder().encode(original),
  );

  assert.equal(decoded, original);
});

test("the product action converts a cleared description to fallback input", () => {
  const actions = readFileSync(
    join(root, "app", "admin", "productos", "actions.ts"),
    "utf8",
  );

  assert.match(actions, /const description = String\([^;]+\)\.trim\(\);/);
  assert.match(actions, /description: description \|\| null/);
  assert.match(actions, /applyAutoDescriptionFallbacks\(payload\.product, autoDescriptions\)/);
});
