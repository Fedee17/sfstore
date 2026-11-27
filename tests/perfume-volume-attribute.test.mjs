// I5: perfume volume ("Contenido") as one managed catalog attribute, reusing the existing attribute model.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { after, before, describe, test } from "node:test";
import ts from "typescript";

const root = resolve(import.meta.dirname, "..");
const read = (file) => readFileSync(join(root, file), "utf8");
const require = createRequire(import.meta.url);
function load(file, stubs = {}, cache = new Map()) {
  if (cache.has(file)) return cache.get(file);
  const out = {};
  cache.set(file, out);
  const compiled = ts.transpileModule(read(file), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  new Function("require", "exports", compiled)((name) => {
    if (Object.hasOwn(stubs, name)) return stubs[name];
    const candidate = name.startsWith("@/") ? name.slice(2) : name.startsWith(".") ? resolve(root, dirname(file), name) : null;
    if (candidate?.endsWith(".json")) return require(resolve(root, candidate));
    if (candidate) for (const ext of ["", ".ts", ".tsx"]) {
      const full = resolve(root, candidate + ext);
      if (existsSync(full) && !full.endsWith("\\") && /\.(ts|tsx)$/.test(full)) return load(full.slice(root.length + 1).replaceAll("\\", "/"), stubs, cache);
    }
    return require(name);
  }, out);
  return out;
}

const config = load("lib/catalog/attribute-config.ts");
const { CATALOG_ATTRIBUTE_KEYS: KEYS } = config;
const attr = (name, value) => ({ name, value });

test("perfumes have one managed, single-value volume field stored under the public 'contenido' name", () => {
  assert.equal(KEYS.volume, "contenido");
  const field = config.getAttributeFieldsForCategory("perfumes").find((item) => item.key === KEYS.volume);
  assert.ok(field, "volume field");
  assert.equal(field.label, "Contenido");
  assert.equal(field.multiple, false);
  assert.equal(field.input, "select");
  assert.deepEqual(field.options.find((option) => option.value === "100-ml"), { value: "100-ml", label: "100 ml" });
  assert.ok(field.options.some((option) => option.value === "5-ml"));
  // Mates keep their own fields: no perfume volume there.
  assert.ok(!config.getAttributeFieldsForCategory("mates").some((item) => item.key === KEYS.volume));
  // Legacy free-text names are read as the same attribute, never as a second structure.
  for (const name of ["contenido", "Contenido", "Volumen", "Capacidad"]) {
    assert.ok(config.getCatalogAttributeNameAliases(KEYS.volume).includes(name), name);
  }
});

test("volume values written as 100ml, 100 ML or 100 ml are the same value", () => {
  for (const raw of ["100ml", "100 ML", " 100 ml ", "100 mL"]) {
    assert.equal(config.normalizeCatalogAttributeValue(raw), "100-ml", raw);
  }
  assert.deepEqual(config.getCatalogAttributeValues([attr("Volumen", "100ML"), attr("contenido", "100-ml")], KEYS.volume), ["100-ml"]);
  // Other attributes are not affected.
  assert.equal(config.normalizeCatalogAttributeValue("Ámbar"), "ambar");
});

const information = load("lib/products/commercial-information.ts");
const perfume = (attributes, extra = {}) => ({ category: "perfumes", slug: "synthetic-perfume", shortDescription: "", description: "", attributes, ...extra });
const contenido = (product) => information.getProductCommercialInformation(product).fields.find((field) => field.label === "Contenido");

test("the product page shows the managed volume with its label, and legacy rows keep showing", () => {
  assert.deepEqual(contenido(perfume([attr("contenido", "100-ml")])), { label: "Contenido", values: ["100 ml"] });
  assert.deepEqual(contenido(perfume([attr("Volumen", "100ML")])), { label: "Contenido", values: ["100 ml"] });
  // A registered value outside the managed list is shown as written, never dropped.
  assert.deepEqual(contenido(perfume([attr("Contenido", "100 ml + 20 ml")])), { label: "Contenido", values: ["100 ml + 20 ml"] });
  // Without data nothing is shown or assumed (decants included).
  assert.equal(contenido(perfume([], { slug: "decant-synthetic" })), undefined);
});

const filters = load("lib/catalog/perfume-filters.ts");
const sku = (id, volume, extra = {}) => ({ id, name: id, slug: id, attributes: volume ? [attr("contenido", volume)] : [], ...extra });

test("the volume filter lists only the volumes loaded in the catalog, in numeric order", () => {
  const groups = filters.perfumeFiltersByCategory([sku("a", "100-ml"), sku("b", "30-ml"), sku("c", null), sku("d", "100-ml")]).arabe;
  const volume = groups.find((group) => group.param === "contenido");
  assert.deepEqual(volume, { label: "Contenido", param: "contenido", options: [{ value: "30-ml", label: "30 ml" }, { value: "100-ml", label: "100 ml" }] });
  // Existing groups are kept as they are.
  assert.deepEqual(groups.filter((group) => group !== volume), filters.PERFUME_FILTERS_BY_CATEGORY.arabe);
  // No loaded volume: no empty filter.
  assert.ok(!filters.perfumeFiltersByCategory([sku("c", null)]).arabe.some((group) => group.param === "contenido"));
});

test("a family publication matches the volume of any of its SKUs", () => {
  const family = sku("family", "50-ml", { kind: "family", variants: [sku("v50", "50-ml"), sku("v100", "100-ml")] });
  assert.equal(filters.publicationHasCatalogAttribute(family, KEYS.volume, "100-ml"), true);
  assert.equal(filters.publicationHasCatalogAttribute(family, KEYS.volume, "30-ml"), false);
  assert.equal(filters.publicationHasCatalogAttribute(sku("x", "100-ml"), KEYS.volume, "100-ml"), true);
  const groups = filters.perfumeFiltersByCategory([family]).arabe;
  assert.deepEqual(groups.find((group) => group.param === "contenido").options.map((option) => option.value), ["50-ml", "100-ml"]);
});

test("the perfumes page filters by ?contenido and builds its filters from the loaded catalog", () => {
  const page = read("app/perfumes/page.tsx");
  assert.match(page, /\[CATALOG_ATTRIBUTE_KEYS\.volume, params\.contenido\]/);
  assert.match(page, /publicationHasCatalogAttribute\(product, key, value\)/);
  assert.match(page, /perfumeFiltersByCategory\(products\)/);
  assert.doesNotMatch(page, /filtersByCategory=\{PERFUME_FILTERS_BY_CATEGORY\}/);
});

const importCore = load("lib/product-import/core.ts", {
  "@/lib/product-import/price-import": { isRestrictedPriceImportProduct: () => false },
});

test("perfume imports read the volume column into the managed attribute", () => {
  const row = { Producto: "Synthetic Perfume", "Precio de venta": 1000, Contenido: "100ML" };
  const parsed = importCore.normalizeProductImportRow("Producto Perfumes", row, 2);
  assert.deepEqual(parsed.catalogAttributeUpdates.find((update) => update.key === KEYS.volume), { key: "contenido", label: "Contenido", values: ["100-ml"] });
  assert.ok(importCore.isRelevantEditedColumn("Producto Perfumes", "Contenido"));
  const unknown = importCore.normalizeProductImportRow("Producto Perfumes", { ...row, Contenido: "un frasco" }, 3);
  assert.equal(unknown.catalogAttributeUpdates.some((update) => update.key === KEYS.volume), false);
  assert.ok(unknown.warnings.some((warning) => warning.startsWith("Contenido")));
});

// Source of truth: the managed "contenido" row wins; contradictory legacy rows never produce a volume.
test("a managed volume takes precedence over legacy rows, which never contradict it", () => {
  const rows = [attr("contenido", "100-ml"), attr("Volumen", "50 ml"), attr("Capacidad", "100 ml + 20 ml")];
  assert.deepEqual(config.getCatalogAttributeValues(rows, KEYS.volume), ["100-ml"]);
  assert.deepEqual(contenido(perfume(rows)), { label: "Contenido", values: ["100 ml"] });
  assert.equal(filters.publicationHasCatalogAttribute(sku("x", null, { attributes: rows }), KEYS.volume, "50-ml"), false);
  assert.deepEqual(filters.perfumeFiltersByCategory([sku("x", null, { attributes: rows })]).arabe.find((g) => g.param === "contenido").options.map((o) => o.value), ["100-ml"]);
});

test("contradictory legacy volumes without a managed value show and filter nothing (fail-closed)", () => {
  const rows = [attr("Volumen", "100 ml"), attr("Capacidad", "50ml")];
  assert.deepEqual(config.getCatalogAttributeValues(rows, KEYS.volume), []);
  assert.equal(contenido(perfume(rows)), undefined);
  assert.equal(contenido(perfume([attr("Volumen", "100 ml + 20 ml"), attr("Contenido", "120 ml")])), undefined);
  assert.equal(filters.publicationHasCatalogAttribute(sku("x", null, { attributes: rows }), KEYS.volume, "100-ml"), false);
  assert.ok(!filters.perfumeFiltersByCategory([sku("x", null, { attributes: rows })]).arabe.some((g) => g.param === "contenido"));
  // Same value written twice is not a contradiction.
  assert.deepEqual(config.getCatalogAttributeValues([attr("Volumen", "100ML"), attr("Contenido", "100 ml")], KEYS.volume), ["100-ml"]);
});

test("variants with different volumes are filtered by their own SKU", () => {
  const family = sku("family", null, { kind: "family", variants: [sku("v50", "50-ml"), sku("v100", null, { attributes: [attr("contenido", "100-ml"), attr("Volumen", "50 ml")] })] });
  assert.equal(filters.publicationHasCatalogAttribute(family, KEYS.volume, "50-ml"), true);
  assert.equal(filters.publicationHasCatalogAttribute(family, KEYS.volume, "100-ml"), true);
  assert.equal(filters.publicationHasCatalogAttribute(family.variants[1], KEYS.volume, "50-ml"), false);
});

const perfumeImport = load("lib/product-import/perfume-import.ts");
test("imports keep an existing volume unless the row brings a valid, different one", () => {
  const existing = { id: "p", name: "Synthetic Perfume", slug: "synthetic-perfume", price: 1000, transfer_price: null, cost: null,
    categories: { slug: "perfumes" }, product_attributes: [attr("contenido", "100-ml")] };
  const row = (extra) => importCore.normalizeProductImportRow("Producto Perfumes", { Producto: "Synthetic Perfume", "Precio de venta": 2000, ...extra }, 2);
  const volumeDiff = (r) => perfumeImport.buildPerfumeImportDecision(r, existing).diffs.find((diff) => diff.field === `attribute:${KEYS.volume}`);
  // No volume column, or only a price change: the volume is not touched.
  assert.equal(volumeDiff(row({})), undefined);
  assert.equal(row({}).catalogAttributeUpdates.some((update) => update.key === KEYS.volume), false);
  // An invalid value never replaces a valid one.
  assert.equal(volumeDiff(row({ Contenido: "frasco grande" })), undefined);
  // The same value written differently is unchanged; a valid different one is an explicit diff.
  assert.equal(volumeDiff(row({ Contenido: "100ML" })), undefined);
  assert.deepEqual(volumeDiff(row({ Volumen: "50 ml" })).nextValue, ["50-ml"]);
});

test("the import writer only replaces the attributes present in the row", () => {
  const service = read("services/product-import.ts");
  const writer = service.slice(service.indexOf("async function replaceCatalogAttributes"), service.indexOf("async function replaceNamedAttributes"));
  assert.match(writer, /sanitizeAttributeUpdates\(categorySlug, updates\)\.entries\(\)/);
  assert.match(writer, /\.in\("name", names\)/);
  // Stock and price paths never delete attributes: only these two writers do, and only the save RPC in SQL.
  assert.equal([...service.matchAll(/from\("product_attributes"\)\.delete\(\)/g)].length, 2);
});

// Admin save: the atomic RPC is the only admin writer. An older admin build (no volume field) must keep the volume.
test("the editor declares the volume field it renders and the action forwards that declaration only", () => {
  const form = read("components/admin/products/product-form.tsx");
  assert.match(form, /name=\{getCatalogAttributeFieldMarker\(field\.key\)\}/);
  const actions = read("app/admin/productos/actions.ts");
  assert.match(actions, /formData\.has\(getCatalogAttributeFieldMarker\(CATALOG_ATTRIBUTE_KEYS\.volume\)\)/);
  assert.match(actions, /volume_managed: true/);
  assert.equal(config.getCatalogAttributeFieldMarker(KEYS.volume), "catalog_attribute_contenido_field");
});

const migrationFile = "supabase/migrations/202611280001_perfume_volume_attribute.sql";
const rollbackFile = "reports/perfume-volume-attribute-rollback.sql";
const runtimePath = process.env.SFSTORE_TEST_PGLITE_MODULE;

test("the migration only patches the save function and writes no product data", () => {
  const sql = read(migrationFile);
  assert.doesNotMatch(sql, /^\s*(insert into|update public\.)/im);
  const values = config.getAttributeFieldsForCategory("perfumes").find((field) => field.key === KEYS.volume).options.map((option) => option.value);
  for (const value of values) assert.match(sql, new RegExp(`"${value}"`));
  // "contenido" is never an unconditional managed name: only a request that declares the field replaces it.
  assert.doesNotMatch(sql, /'use_case', 'contenido'\]/);
  assert.doesNotMatch(sql, /'Volumen'|'Capacidad'|'Contenido'/);
});

describe("perfume volume save / isolated PostgreSQL WASM", { skip: !runtimePath, concurrency: false }, () => {
  let db;
  const q = async (sql, args = []) => (await db.query(sql, args)).rows;
  const one = async (sql, args = []) => (await q(sql, args))[0];
  const perfumes = "11111111-1111-4111-8111-111111111111";
  const saveDefinition = async () => (await one("select md5(pg_get_functiondef('public.save_product_atomic_internal(uuid,text,uuid,text,jsonb)'::regprocedure)) h")).h;
  let previousDefinition;
  before(async () => {
    const runtime = createRequire(join(runtimePath, "package.json"));
    const { PGlite } = runtime("@electric-sql/pglite");
    const { pgcrypto } = runtime("@electric-sql/pglite/contrib/pgcrypto");
    db = new PGlite({ extensions: { pgcrypto } });
    await db.exec("create role anon; create role authenticated; create role service_role bypassrls;");
    await db.exec(read("tests/fixtures/storage-permissions.sql"));
    const manifest = JSON.parse(read("staging/migration-manifest.json"));
    for (const entry of manifest.applicationOrder) {
      if (entry.source === migrationFile) continue;
      try { await db.exec(read(entry.source)); } catch (error) { throw new Error(entry.source + ": " + error.message); }
    }
    await db.exec(read("staging/supabase/seed.sql"));
    previousDefinition = await saveDefinition();
    await db.exec(read(migrationFile));
  });
  after(async () => { await db?.close(); });

  async function product(category = perfumes) {
    const id = randomUUID();
    await q("insert into products(id,category_id,name,slug,short_description,price,stock,status) values($1::uuid,$2,'SYNTHETIC',$1::text,'Synthetic only',1000,1,'active')", [id, category]);
    return id;
  }
  // managed=true is what the current editor sends; an older admin build sends neither the declaration nor the row.
  const payload = (id, category, extra = {}) => ({ category_id: category, name: "SYNTHETIC", slug: id, short_description: "Synthetic only", description: null,
    price: 1000, transfer_price: null, compare_at_price: null, cost: null, sku: null, featured: false, status: "active", ...extra });
  const save = async (id, attributes, { managed = true, category = perfumes } = {}) => {
    const version = (await one("select get_product_save_version($1) v", [id])).v;
    const productPayload = payload(id, category, managed ? { volume_managed: true } : {});
    return one("select update_product_atomic($1,$2,$3,$4) result", [randomUUID(), id, version, JSON.stringify({ product: productPayload, attributes, images: [] })]);
  };
  const names = async (id) => (await q("select name,value from product_attributes where product_id=$1 order by name,value", [id])).map((row) => `${row.name}=${row.value}`);

  test("the current editor stores, replaces and clears the managed volume", async () => {
    const id = await product();
    await save(id, [{ name: "contenido", value: "100-ml", sort_order: 150 }]);
    assert.deepEqual(await names(id), ["contenido=100-ml"]);
    await save(id, [{ name: "contenido", value: "30-ml", sort_order: 150 }]);
    assert.deepEqual(await names(id), ["contenido=30-ml"]);
    await save(id, []);
    assert.deepEqual(await names(id), []);
  });

  test("an older admin build saving without the volume field keeps the existing volume", async () => {
    const id = await product();
    await save(id, [{ name: "contenido", value: "100-ml" }]);
    await save(id, [{ name: "gender", value: "unisex" }], { managed: false });
    assert.deepEqual(await names(id), ["contenido=100-ml", "gender=unisex"]);
  });

  test("a volume row needs the field declaration, and the declaration is only true", async () => {
    const id = await product();
    await assert.rejects(save(id, [{ name: "contenido", value: "100-ml" }], { managed: false }), /PRODUCT_INVALID_ATTRIBUTE/);
    const version = (await one("select get_product_save_version($1) v", [id])).v;
    const bad = payload(id, perfumes, { volume_managed: false });
    await assert.rejects(one("select update_product_atomic($1,$2,$3,$4) r", [randomUUID(), id, version, JSON.stringify({ product: bad, attributes: [], images: [] })]), /PRODUCT_INVALID_FIELDS/);
  });

  test("an unknown volume, two volumes or a volume outside perfumes are rejected", async () => {
    const id = await product();
    await assert.rejects(save(id, [{ name: "contenido", value: "un-frasco" }]), /PRODUCT_INVALID_ATTRIBUTE/);
    await assert.rejects(save(id, [{ name: "contenido", value: "30-ml" }, { name: "contenido", value: "100-ml" }]), /PRODUCT_DUPLICATE_ATTRIBUTE/);
    const mates = randomUUID();
    await q("insert into categories(id,name,slug) values($1,'Mates','mates')", [mates]);
    const mate = await product(mates);
    await assert.rejects(save(mate, [{ name: "contenido", value: "100-ml" }], { category: mates }), /PRODUCT_INVALID_ATTRIBUTE/);
  });

  test("legacy free-text volume rows are kept by every save", async () => {
    const id = await product();
    await q("insert into product_attributes(product_id,name,value,sort_order) values($1,'Volumen','100 ml + 20 ml',300)", [id]);
    await save(id, [{ name: "contenido", value: "100-ml" }]);
    await save(id, [], { managed: false });
    assert.deepEqual(await names(id), ["Volumen=100 ml + 20 ml", "contenido=100-ml"]);
  });

  test("the rollback restores the previous save function and keeps loaded volumes", async () => {
    const id = await product();
    await save(id, [{ name: "contenido", value: "105-ml" }]);
    await db.exec(read(rollbackFile));
    assert.equal(await saveDefinition(), previousDefinition);
    // The previous editor keeps working and does not delete the loaded volume.
    await save(id, [{ name: "gender", value: "unisex" }], { managed: false });
    assert.deepEqual(await names(id), ["contenido=105-ml", "gender=unisex"]);
    // The current editor must be rolled back first: the previous function rejects its declaration.
    await assert.rejects(save(id, []), /PRODUCT_INVALID_FIELDS/);
    // The migration can be applied again after a rollback.
    await db.exec(read(migrationFile));
    await save(id, [{ name: "contenido", value: "100-ml" }]);
    assert.deepEqual(await names(id), ["contenido=100-ml"]);
  });
});
