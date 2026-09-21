import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(testDirectory, "..");

function source(...segments) {
  return readFileSync(join(projectRoot, ...segments), "utf8");
}

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return [".ts", ".tsx"].includes(extname(entry.name)) ? [path] : [];
  });
}

test("admin internal navigation uses Next Link instead of raw anchors", () => {
  const files = [
    ...sourceFiles(join(projectRoot, "app", "admin")),
    ...sourceFiles(join(projectRoot, "components", "admin")),
  ];

  for (const file of files) {
    assert.doesNotMatch(
      readFileSync(file, "utf8"),
      /<a(?:\s|>)/,
      `${file} still contains a raw anchor`,
    );
  }

  assert.match(source("components", "admin", "admin-nav.tsx"), /from "next\/link"/);
});

test("GET navigation forms preserve query params and expose pending feedback", () => {
  const navigationForm = source(
    "components",
    "admin",
    "get-navigation-form.tsx",
  );
  const recommendationForm = source(
    "components",
    "admin",
    "consulta",
    "perfume-recommendation-form.tsx",
  );
  const quickCatalog = source(
    "components",
    "admin",
    "consulta",
    "quick-catalog-view.tsx",
  );

  assert.match(navigationForm, /new URLSearchParams\(\)/);
  assert.match(navigationForm, /query\.append\(key, value\)/);
  assert.match(navigationForm, /router\.push\(/);
  assert.match(navigationForm, /submissionInProgress\.current/);
  assert.match(navigationForm, /disabled=\{disabled \|\| isPending\}/);
  assert.match(recommendationForm, /name="mode" value="recommend"/);
  assert.match(recommendationForm, /pendingLabel="Recomendando\.\.\."/);
  assert.match(quickCatalog, /pendingLabel="Buscando\.\.\."/);
});

test("server action submits use one reusable pending button", () => {
  const pendingButton = source(
    "components",
    "admin",
    "pending-submit-button.tsx",
  );
  const productPage = source("app", "admin", "productos", "page.tsx");
  const inventoryAdjustmentForm = source(
    "components",
    "admin",
    "products",
    "inventory-adjustment-form.tsx",
  );
  const orderActions = source(
    "components",
    "admin",
    "orders",
    "customer-order-actions.tsx",
  );
  const loginPage = source("app", "admin", "login", "page.tsx");

  assert.match(pendingButton, /useFormStatus\(\)/);
  assert.match(pendingButton, /disabled=\{disabled \|\| pending\}/);
  assert.match(productPage, /InventoryAdjustmentForm/);
  assert.match(inventoryAdjustmentForm, /Ajustando\.\.\./);
  assert.match(productPage, /pendingLabel="Archivando\.\.\."/);
  assert.match(orderActions, /pendingLabel="Registrando\.\.\."/);
  assert.match(orderActions, /pendingLabel="Entregando\.\.\."/);
  assert.match(loginPage, /pendingLabel="Ingresando\.\.\."/);
});

test("admin route exposes a lightweight accessible loading state", () => {
  const loading = source("app", "admin", "loading.tsx");

  assert.match(loading, /role="status"/);
  assert.match(loading, /aria-live="polite"/);
  assert.match(loading, /Cargando panel\.\.\./);
});
