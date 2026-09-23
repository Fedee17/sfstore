import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const form = readFileSync(join(root, "components", "admin", "products", "product-form.tsx"), "utf8");
const actions = readFileSync(join(root, "app", "admin", "productos", "actions.ts"), "utf8");

test("the file input supports one or several images", () => {
  assert.match(form, /name="productImages"[\s\S]*?multiple/);
  assert.match(actions, /formData\.getAll\("productImages"\)/);
});

test("new images have immediate previews and can be removed before saving", () => {
  assert.match(form, /URL\.createObjectURL\(file\)/);
  assert.match(form, /Nuevas imagenes/);
  assert.match(form, /imagen\{pendingImages\.length === 1 \? "" : "es"\} seleccionada/);
  assert.match(form, /removePendingImage\(image\.id\)/);
  assert.match(form, />\s*Quitar\s*</);
});

test("stored and pending images are rendered in separate sections", () => {
  assert.match(form, /Imagenes actuales/);
  assert.match(form, /Nuevas imagenes/);
  assert.match(form, /product \? <ProductImageGalleryAdmin/);
});

test("multiple uploads append without deleting existing image rows", () => {
  const uploadBlock = actions.slice(actions.indexOf("async function uploadProductImages"), actions.indexOf("export async function createProduct"));
  assert.match(uploadBlock, /lastSortOrder \+ index \+ 1/);
  assert.match(uploadBlock, /\.insert\(imageRows\)/);
  assert.doesNotMatch(uploadBlock, /\.from\("product_images"\)[\s\S]*?\.delete\(/);
});

test("a partial upload failure triggers compensating storage cleanup", () => {
  assert.match(actions, /const uploadedPaths: string\[\] = \[\]/);
  assert.match(actions, /uploadedPaths\.push\(filePath\)/);
  assert.match(actions, /Fallo la limpieza compensatoria/);
  assert.match(actions, /\.remove\(uploadedPaths\)/);
});

test("pending submit prevents double save and communicates image upload", () => {
  assert.match(form, /pendingLabel=\{pendingImages\.length > 0 \? "Subiendo imagenes\.\.\."/);
  const pendingButton = readFileSync(join(root, "components", "admin", "pending-submit-button.tsx"), "utf8");
  assert.match(pendingButton, /disabled=\{disabled \|\| pending\}/);
});

test("saved images support explicit primary, ordering and deletion", () => {
  assert.match(form, /Principal/);
  assert.match(form, /setPrimaryProductImage/);
  assert.match(form, /moveProductImage/);
  assert.match(form, /direction" value="previous"/);
  assert.match(form, /direction" value="next"/);
  assert.match(form, /deleteProductImage/);
});

test("products without stored or pending images have explicit empty states", () => {
  assert.match(form, /todavia no tiene imagenes cargadas/);
  assert.match(form, /pendingImages\.length > 0/);
});
