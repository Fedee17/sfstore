import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  adminProductAvailability,
  describeProductAvailability,
} from "../lib/products/product-availability.ts";
import { resolvePublicCatalogSection } from "../lib/catalog/public-product-visibility.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = (...parts) => readFileSync(join(root, ...parts), "utf8");

const sellable = {
  status: "active",
  historicalIdentity: false,
  webVisible: true,
  commercialBlocked: false,
  categorySlug: "mates",
  categoryIsActive: true,
  stock: 3,
};

test("an active, visible, unblocked product with stock is on the web and enabled for a new sale", () => {
  const availability = describeProductAvailability(sellable);
  assert.equal(availability.statusLabel, "Activo");
  assert.deepEqual(availability.web, { visible: true, reasons: [] });
  assert.deepEqual(availability.newSale, { allowed: true, reasons: [] });
});

test("each dimension reports its own reason for not being enabled for a new sale", () => {
  const cases = [
    [{ status: "draft" }, "En borrador"],
    [{ status: "archived" }, "Archivado"],
    [{ commercialBlocked: true }, "Bloqueado para nuevas ventas"],
    [{ historicalIdentity: true }, "Identidad histórica: sólo conserva registros"],
    [{ stock: 0 }, "Sin stock"],
  ];
  for (const [change, reason] of cases) {
    const availability = describeProductAvailability({ ...sellable, ...change });
    assert.equal(availability.newSale.allowed, false, reason);
    assert.ok(availability.newSale.reasons.includes(reason), `${reason}: ${availability.newSale.reasons}`);
  }
});

test("web visibility alone does not block a counter sale, and stock alone does not hide a product", () => {
  const hidden = describeProductAvailability({ ...sellable, webVisible: false });
  assert.deepEqual(hidden.web, { visible: false, reasons: ["Oculto en la web"] });
  assert.equal(hidden.newSale.allowed, true);

  const soldOut = describeProductAvailability({ ...sellable, stock: 0 });
  assert.equal(soldOut.web.visible, true);
  assert.deepEqual(soldOut.newSale.reasons, ["Sin stock"]);
});

test("an inactive or missing category hides the product from the web", () => {
  assert.deepEqual(describeProductAvailability({ ...sellable, categoryIsActive: false }).web.reasons, ["Categoría inactiva"]);
  assert.deepEqual(describeProductAvailability({ ...sellable, categorySlug: null }).web.reasons, ["Sin categoría"]);
});

test("several blockers are all listed, without duplicates", () => {
  const availability = describeProductAvailability({ ...sellable, status: "archived", commercialBlocked: true, stock: 0, webVisible: false });
  assert.deepEqual(availability.newSale.reasons, ["Archivado", "Bloqueado para nuevas ventas", "Sin stock"]);
  assert.deepEqual(availability.web.reasons, ["Archivado", "Bloqueado para nuevas ventas", "Oculto en la web"]);
});

test("web visibility matches the public catalog rule for every combination", () => {
  for (const status of ["draft", "active", "archived"]) {
    for (const historicalIdentity of [false, true]) {
      for (const webVisible of [false, true]) {
        for (const commercialBlocked of [false, true]) {
          for (const categoryIsActive of [false, true]) {
            for (const categorySlug of ["perfumes", "bombillas", "cargadores", null]) {
              const input = { status, historicalIdentity, webVisible, commercialBlocked, categoryIsActive, categorySlug, stock: 1 };
              const expected = webVisible && !commercialBlocked && resolvePublicCatalogSection(input) !== null;
              const { web } = describeProductAvailability(input);
              assert.equal(web.visible, expected, JSON.stringify(input));
              assert.equal(web.reasons.length === 0, expected, JSON.stringify(input));
            }
          }
        }
      }
    }
  }
});

test("an unknown status is reported and never enabled (fail-closed)", () => {
  const availability = describeProductAvailability({ ...sellable, status: "pending" });
  assert.equal(availability.statusLabel, "Estado desconocido");
  assert.equal(availability.newSale.allowed, false);
  assert.equal(availability.web.visible, false);
});

test("admin rows without the commercial columns are treated as blocked and hidden (fail-closed)", () => {
  const availability = adminProductAvailability({ status: "active", stock: 2, categories: { slug: "mates", is_active: true } });
  assert.equal(availability.newSale.allowed, false);
  assert.ok(availability.newSale.reasons.includes("Bloqueado para nuevas ventas"));
  assert.equal(availability.web.visible, false);
});

test("admin rows map their columns onto the shared rule", () => {
  const availability = adminProductAvailability({
    status: "active", stock: 2, web_visible: true, commercial_blocked: false, historical_identity: false,
    categories: { slug: "perfumes", is_active: true },
  });
  assert.deepEqual(availability.newSale, { allowed: true, reasons: [] });
  assert.equal(availability.web.visible, true);
});

test("the sale rule mirrors the products offered by the store sale form", () => {
  const storeSales = source("services", "store-sales.ts");
  const list = storeSales.slice(storeSales.indexOf("export async function listStoreSaleProducts"), storeSales.indexOf("export async function createStoreSale"));
  assert.match(list, /\.eq\("historical_identity", false\)/);
  assert.match(list, /\.eq\("status", "active"\)/);
  assert.match(list, /\.eq\("commercial_blocked", false\)/);
});

test("the admin product list reads the commercial columns and can query historical identities", () => {
  const admin = source("services", "admin.ts");
  const list = admin.slice(admin.indexOf("export async function getAdminProducts"), admin.indexOf("export async function getAdminCategories"));
  for (const column of ["web_visible", "commercial_blocked", "historical_identity", "is_active"]) {
    assert.match(list, new RegExp(`\\b${column}\\b`), column);
  }
  assert.match(list, /\.eq\("historical_identity", filters\.historical === true\)/);
  assert.match(list, /if \(filters\.historical\) return products\.data/);
});

test("the editor reads the commercial columns of the product it shows", () => {
  const admin = source("services", "admin.ts");
  const editor = admin.slice(admin.indexOf("export async function getAdminProductById"), admin.indexOf("export async function getAdminDashboardData"));
  for (const column of ["web_visible", "commercial_blocked", "is_active"]) {
    assert.match(editor, new RegExp(`\\b${column}\\b`), column);
  }
  const page = source("app", "admin", "productos", "[id]", "editar", "page.tsx");
  assert.match(page, /ProductAvailabilitySummary/);
});

test("the admin list shows the reason and filters by availability through the shared rule", () => {
  const page = source("app", "admin", "productos", "page.tsx");
  assert.match(page, /adminProductAvailability\(/);
  assert.match(page, /ProductAvailabilitySummary/);
  for (const value of ["sellable", "unavailable", "hidden", "historical"]) {
    assert.match(page, new RegExp(`"${value}"`), value);
  }
  // Historical identities are read-only: no edit link, stock adjustment, featured toggle or archive.
  assert.match(page, /readOnly/);
});

test("archiving re-checks the historical guard in the write and fails closed when nothing was updated", () => {
  const actions = source("app", "admin", "productos", "actions.ts");
  const archive = actions.slice(actions.indexOf("export async function archiveProduct"), actions.indexOf("export async function toggleProductFeatured"));
  assert.match(archive, /\.update\(\{ status: "archived" \}\)[\s\S]*\.eq\("historical_identity", false\)[\s\S]*\.select\("id"\)/);
  assert.match(archive, /if \(!archived\)/);
});
