// Start the local app without real Supabase credentials, then run with an existing
// Playwright installation: PLAYWRIGHT_MODULE_PATH and UI_BROWSER_EXECUTABLE.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");
const base = process.env.UI_BASE_URL || "http://127.0.0.1:3105";
assert.ok(/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base), "Browser tests must run locally");
const output = new URL("../reports/ui-ux-stabilization/", import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.UI_BROWSER_EXECUTABLE ? { executablePath: process.env.UI_BROWSER_EXECUTABLE } : {}) });
const results = [];

try {
  for (const width of [320, 390, 430, 768, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width <= 430 });
    // Prevent browser requests to real services. The server must also use a fictitious Supabase URL.
    await context.route("**/*", (route) => route.request().url().startsWith(base) ? route.continue() : route.abort());
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const checks = [];
    async function noOverflow(route) {
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${route}: horizontal overflow at ${width}`);
      checks.push(`${route}: no horizontal overflow`);
    }

    await page.goto(base);
    await page.getByRole("searchbox").waitFor();
    await noOverflow("home");
    const headerHeight = await page.locator("header").evaluate((e) => e.getBoundingClientRect().height);
    if (width === 320) assert.ok(headerHeight < 230, `Mobile header is too tall: ${headerHeight}`);
    const hero = page.locator('a[aria-label="Ver perfumes"]');
    const heroBefore = await hero.boundingBox();
    const secondSlide = page.getByRole("button", { name: /^Ver banner 2:/ });
    await secondSlide.click();
    const heroAfter = await page.locator('a[aria-label="Ver mates"]').boundingBox();
    assert.ok(Math.abs(heroBefore.height - heroAfter.height) < 1, "Changing slides moves the layout");
    assert.ok((await secondSlide.boundingBox()).height >= 44);
    checks.push("banner dimensions stable; controls >= 44px");

    const menu = page.getByRole("button", { name: "Categorías de Perfumes" });
    if (width <= 430) await menu.tap(); else { await menu.focus(); await page.keyboard.press("Enter"); }
    assert.equal(await menu.getAttribute("aria-expanded"), "true");
    const menuBox = await page.locator("#perfumes-categories").boundingBox();
    assert.ok(menuBox.x >= 0 && menuBox.x + menuBox.width <= width, "Menu goes outside the viewport");
    await page.keyboard.press("Escape");
    assert.equal(await menu.getAttribute("aria-expanded"), "false");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Tab");
    const categoryLinks = await page.locator("#perfumes-categories a").evaluateAll((links) => links.map((link) => link.getAttribute("href")));
    assert.deepEqual(categoryLinks, ["/perfumes", "/perfumes?categoria=arabe", "/perfumes?categoria=disenador", "/perfumes?categoria=nicho", "/perfumes?categoria=inspirado", "/perfumes?categoria=otro"]);
    await page.getByRole("searchbox").focus();
    assert.equal(await menu.getAttribute("aria-expanded"), "false");
    checks.push("categories: touch/keyboard, Escape and focus exit");

    await page.getByRole("searchbox").fill("  LATTAFA ASAD  ");
    await page.getByRole("searchbox").press("Enter");
    await page.waitForURL("**/buscar?**");
    await page.getByRole("heading", { name: "Lattafa Asad", exact: true }).waitFor();
    assert.equal(await page.locator("article").count(), 1);
    await noOverflow("search");
    const add = page.getByRole("button", { name: "Agregar Lattafa Asad al carrito", exact: true });
    await add.click();
    await page.getByRole("status").filter({ hasText: "agregado al carrito (1)" }).waitFor();
    for (let quantity = 2; quantity <= 4; quantity++) await add.click();
    assert.equal(await add.isDisabled(), true);
    await page.reload();
    assert.equal(await add.isDisabled(), true);
    checks.push("search matches; cart feedback, stock limit and persistence");
    await page.getByRole("link", { name: "Ir al carrito con 4 productos" }).click();
    await page.waitForURL("**/carrito");
    await page.getByRole("button", { name: "-", exact: true }).click();
    await page.getByRole("link", { name: "Ir al carrito con 3 productos" }).waitFor();
    await noOverflow("cart");
    await page.getByRole("button", { name: "Eliminar", exact: true }).click();
    await page.getByRole("heading", { name: /Tu carrito está vacío/ }).waitFor();
    await page.reload();
    await page.getByRole("heading", { name: /Tu carrito está vacío/ }).waitFor();
    checks.push("cart decrease, remove and empty-state persistence");

    await page.goto(`${base}/buscar?buscar=zzzz_inexistente`);
    await page.getByRole("heading", { name: "No encontramos productos con esa búsqueda." }).waitFor();
    await page.getByRole("link", { name: "Ver todos los productos", exact: true }).click();
    await page.waitForURL("**/buscar");
    assert.ok(await page.locator("article").count() > 1);
    await page.getByRole("link", { name: "Preguntas frecuentes", exact: true }).click();
    await page.waitForURL("**/ayuda");
    await page.locator("summary").first().click();
    assert.equal(await page.locator("details").first().getAttribute("open"), "");
    checks.push("empty search recovery and FAQ destination");

    for (const route of ["/perfumes", "/mates", "/producto/lattafa-asad", "/admin/login"]) {
      await page.goto(`${base}${route}`);
      await page.locator("h1").waitFor();
      await noOverflow(route);
      if (route === "/producto/lattafa-asad") {
        await page.getByRole("button", { name: "Agregar al carrito", exact: true }).click();
        await page.getByRole("status").filter({ hasText: "Producto agregado al carrito." }).waitFor();
      }
      if (route === "/perfumes" && width < 1024) {
        await page.getByText("Categorías y filtros", { exact: true }).click();
        const sidebar = page.locator("details[open]");
        assert.ok(await sidebar.getByRole("button", { name: /Árabe/ }).isVisible());
      }
      if ([320, 1440].includes(width)) await page.screenshot({ path: fileURLToPath(new URL(`${width}-${route.replaceAll("/", "_")}.png`, output)), fullPage: false });
    }
    await page.goto(`${base}/checkout?payment=transfer`);
    await page.locator("h1").waitFor();
    await noOverflow("checkout presentation (no submission)");
    assert.deepEqual(errors, [], `Browser exceptions at ${width}`);
    results.push({ width, headerHeight, checks, pageErrors: errors });
    console.log(`PASS ${width}px: ${checks.length} checks`);
    await context.close();
  }
} finally {
  await browser.close();
  await writeFile(new URL("browser-results.json", output), JSON.stringify(results, null, 2));
}
