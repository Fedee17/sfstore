import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import ts from "typescript";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = (...segments) => readFileSync(join(root, ...segments), "utf8");
const auditSource = source("lib", "catalog", "catalog-quality-audit.ts");
const auditCompiled = ts.transpileModule(auditSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const audit = await import(`data:text/javascript;base64,${Buffer.from(auditCompiled).toString("base64")}`);

function product(overrides = {}) {
  return {
    id: "p1",
    name: "Perfume Especifico",
    slug: "perfume-especifico",
    status: "active",
    stock: 2,
    cost: 100,
    price: 160,
    transfer_price: 145,
    short_description: "Resumen breve",
    description: "Perfume Especifico combina una salida citrica con un fondo amaderado claramente identificable para uso diario.",
    category: { name: "Perfumes", slug: "perfumes" },
    attributes: [
      { name: "Marca", value: "Marca" },
      { name: "Tipo", value: "EDP" },
      { name: "gender", value: "unisex" },
      { name: "olfactory_family", value: "fresco" },
      { name: "intensity", value: "media" },
      { name: "occasion", value: "diario" },
    ],
    images: [{ id: "i1", url: "https://example.com/1.jpg", sort_order: 0, is_primary: true }],
    cost_source_purchase_item_id: "pi1",
    ...overrides,
  };
}

test("audits one image and a matching confirmed purchase cost", () => {
  const [row] = audit.buildCatalogAudit(
    [product()],
    [{ id: "pi1", product_id: "p1", effective_unit_cost: 100, confirmed_at: "2026-01-01" }],
    { i1: true },
  );
  assert.equal(row.cost_status, "COST_OK");
  assert.equal(row.images_status, "ONLY_ONE_IMAGE");
  assert.equal(row.margin_price_pct, 60);
});

test("uses the latest confirmed purchase and reports a mismatch", () => {
  const [row] = audit.buildCatalogAudit(
    [product()],
    [
      { id: "old", product_id: "p1", effective_unit_cost: 100, confirmed_at: "2026-01-01" },
      { id: "new", product_id: "p1", effective_unit_cost: 120, confirmed_at: "2026-02-01" },
    ],
    { i1: true },
  );
  assert.equal(row.cost_status, "COST_MISMATCH_LATEST_CONFIRMED_PURCHASE");
  assert.equal(row.priority, "CRITICAL");
});

test("detects generic descriptions and category-specific missing attributes", () => {
  const [row] = audit.buildCatalogAudit(
    [product({ description: "Producto de excelente calidad, ideal para cualquier ocasión y perfecto para regalar a quien quieras.", attributes: [] })],
    [],
    { i1: true },
  );
  assert.equal(row.description_status, "DESCRIPTION_GENERIC");
  assert.equal(row.attributes_status, "ATTRIBUTES_MISSING");
});

test("detects missing, broken, duplicate and disordered images", () => {
  assert.equal(audit.classifyImages(product({ images: [] }), {}), "NO_IMAGES");
  assert.equal(audit.classifyImages(product(), { i1: false }), "BROKEN_IMAGE");
  assert.equal(
    audit.classifyImages(product({ images: [
      { id: "i1", url: "same", sort_order: 0, is_primary: true },
      { id: "i2", url: "same", sort_order: 1, is_primary: false },
    ] }), { i1: true, i2: true }),
    "POSSIBLE_DUPLICATE",
  );
  assert.equal(
    audit.classifyImages(product({ images: [
      { id: "i1", url: "one", sort_order: 0, is_primary: false },
      { id: "i2", url: "two", sort_order: 0, is_primary: false },
    ] }), { i1: true, i2: true }),
    "ORDER_REVIEW",
  );
});

test("serializes every required product field to CSV and Markdown", () => {
  const rows = audit.buildCatalogAudit([product()], [], { i1: true });
  const csv = audit.serializeCatalogAuditCsv(rows);
  const markdown = audit.serializeCatalogAuditMarkdown(rows, "2026-01-01");
  assert.match(csv.split("\n")[0], /id,name,slug,category,status,stock,cost,cost_status/);
  assert.match(csv, /Perfume Especifico/);
  assert.match(markdown, /Resumen ejecutivo/);
  assert.match(markdown, /Perfume Especifico/);
});

test("the production audit script is read-only", () => {
  const script = source("scripts", "audit-catalog-quality.ts");
  assert.match(script, /\.from\(table\)\.select\(select\)/);
  assert.doesNotMatch(script, /\.from\([^)]*\)[\s\S]*?\.(insert|update|upsert|delete)\s*\(/);
});

