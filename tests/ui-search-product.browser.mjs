import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { writeFile } from "node:fs/promises";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");
const base = process.env.UI_BASE_URL || "http://127.0.0.1:3105";
assert.ok(/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base));
const browser = await chromium.launch({ headless: true, ...(process.env.UI_BROWSER_EXECUTABLE ? { executablePath: process.env.UI_BROWSER_EXECUTABLE } : {}) });
const results = [];
try {
  for (const width of [320, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    await context.route("**/*", (route) => route.request().url().startsWith(base) ? route.continue() : route.abort());
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${base}/buscar?buscar=Asad`);
    await page.getByRole("heading", { name: "Lattafa Asad", exact: true }).waitFor();
    const search = page.getByRole("searchbox");
    assert.equal(await search.inputValue(), "Asad");
    await search.fill("Khamrah");
    await search.press("Enter");
    await page.waitForURL("**/buscar?buscar=Khamrah");
    await page.getByRole("heading", { name: "Lattafa Khamrah", exact: true }).waitFor();
    assert.equal(await search.inputValue(), "Khamrah");
    await search.fill("zzzz_synthetic_missing");
    await search.press("Enter");
    await page.waitForURL("**/buscar?buscar=zzzz_synthetic_missing");
    await page.getByRole("heading", { name: "No encontramos productos con esa búsqueda." }).waitFor();
    assert.equal(await search.inputValue(), "zzzz_synthetic_missing");
    await search.fill("texto editado sin enviar");
    await page.getByRole("link", { name: "Ver todos los productos", exact: true }).click();
    await page.waitForURL("**/buscar");
    assert.equal(await search.inputValue(), "");
    await search.fill("Asad");
    await search.press("Enter");
    await page.waitForURL("**/buscar?buscar=Asad");
    await page.getByRole("heading", { name: "Lattafa Asad", exact: true }).waitFor();
    await search.fill("");
    await search.press("Enter");
    await page.waitForURL("**/buscar?buscar=");
    await page.getByRole("heading", { name: "Todos los productos", exact: true }).waitFor();
    assert.equal(await search.inputValue(), "");
    assert.ok(await page.locator("article").count() > 1);

    // Only localhost browser storage is seeded: no database or commercial data mutation.
    await page.evaluate(() => localStorage.setItem("sfstore-cart", JSON.stringify({ state: {
      items: [{ productId: "perfume-lattafa-asad", name: "Producto sintético", slug: "lattafa-asad", category: "perfumes", price: 100, quantity: 1, stock: 1 }],
      totalItems: 1, subtotal: 100,
    }, version: 0 })));
    await page.goto(`${base}/producto/lattafa-asad`);
    const capped = page.getByRole("button", { name: "Stock máximo en carrito", exact: true });
    await capped.waitFor();
    assert.equal(await capped.isDisabled(), true);
    assert.equal(await page.getByRole("status").textContent(), "");
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("sfstore-cart")).state.items[0].quantity), 1);
    await page.evaluate(() => localStorage.removeItem("sfstore-cart"));
    await page.reload();
    const add = page.getByRole("button", { name: "Agregar al carrito", exact: true });
    await add.click();
    await page.getByRole("status").filter({ hasText: "Producto agregado al carrito." }).waitFor();
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("sfstore-cart")).state.items[0].quantity), 1);
    for (let quantity = 2; quantity <= 4; quantity++) await add.click();
    assert.equal(await capped.isDisabled(), true);
    await page.reload();
    await capped.waitFor();
    assert.equal(await capped.isDisabled(), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(errors, []);
    results.push({ width, searchQueryPreserved: true, refineSearch: true, emptySearchRecovery: true, resetLinkClearsEditedQuery: true, persistedCartLimitReflected: true, realAddFeedback: true, quantityPersistence: true, pageErrors: errors });
    console.log(`PASS focused search/product regressions at ${width}px`);
    await context.close();
  }
} finally {
  await browser.close();
  await writeFile(new URL("../reports/ui-ux-stabilization/search-product-results.json", import.meta.url), JSON.stringify(results, null, 2) + "\n");
}
