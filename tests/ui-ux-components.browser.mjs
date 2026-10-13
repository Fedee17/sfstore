// Temporary local route: no database, no real product data and no production fixture.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, writeFile, unlink, rmdir, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");
const base = process.env.UI_BASE_URL || "http://127.0.0.1:3105";
assert.ok(/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base), "Fixtures must run locally");
const fixtureDir = new URL("../app/ui-ux-component-fixture/", import.meta.url);
const fixtureFile = new URL("page.tsx", fixtureDir);
await assert.rejects(access(fixtureDir), { code: "ENOENT" });
await mkdir(fixtureDir);
let browser;
try {
  await writeFile(fixtureFile, `import { ProductGrid } from "@/components/product-grid";
import { ProductImageGallery } from "@/components/product-image-gallery";
const product = { id: "synthetic-photo", name: "Producto sintético", slug: "synthetic-photo", category: "mates" as const, price: 100, transferPrice: 80, stock: 2, featured: false, shortDescription: "Fixture local sin base de datos", imagePlaceholder: "TEST", primaryImageUrl: "/__ui-fixture/tall.svg" };
const images = [{ url: "/__ui-fixture/tall.svg", alt: "Foto vertical sintética", sort_order: 0, is_primary: true }, { url: "/__ui-fixture/wide.svg", alt: "Foto horizontal sintética", sort_order: 1, is_primary: false }];
export default function FixturePage() { return <main className="min-h-screen bg-white p-5 text-[#102033]"><div className="mx-auto max-w-6xl"><h1>Fixture local de imágenes y precios</h1><ProductGrid products={[product]} label="Prueba" priceMode="compact" /><div className="mt-8 max-w-lg"><ProductImageGallery images={images} placeholder="TEST" productName="Producto sintético" /></div></div></main>; }
`);
  browser = await chromium.launch({ headless: true, ...(process.env.UI_BROWSER_EXECUTABLE ? { executablePath: process.env.UI_BROWSER_EXECUTABLE } : {}) });
  const results = [];
  for (const width of [320, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.route("**/__ui-fixture/*.svg", (route) => {
      const tall = route.request().url().endsWith("tall.svg");
      return route.fulfill({ contentType: "image/svg+xml", body: `<svg xmlns="http://www.w3.org/2000/svg" width="${tall ? 100 : 400}" height="${tall ? 400 : 100}"><rect width="100%" height="100%" fill="#0072ce"/><rect x="5" y="5" width="90%" height="90%" fill="#dce3ea"/></svg>` });
    });
    await page.goto(`${base}/ui-ux-component-fixture`);
    await page.getByRole("heading", { name: "Fixture local de imágenes y precios" }).waitFor();
    const cardImage = page.locator("article img");
    await cardImage.evaluate((image) => image.decode());
    assert.equal(await cardImage.evaluate((image) => getComputedStyle(image).objectFit), "contain");
    assert.equal(await page.getByText("Efectivo / transferencia", { exact: true }).count(), 1);
    assert.equal(await page.getByText("Lista: $ 100", { exact: true }).count(), 1);
    const secondPhoto = page.getByRole("button", { name: "Ver imagen 2 de Producto sintético" });
    assert.equal(await secondPhoto.getAttribute("aria-pressed"), "false");
    await secondPhoto.click();
    assert.equal(await secondPhoto.getAttribute("aria-pressed"), "true");
    const selectedPhoto = page.getByRole("img", { name: "Foto horizontal sintética" }).first();
    await selectedPhoto.evaluate((image) => image.decode());
    assert.equal(await selectedPhoto.evaluate((image) => getComputedStyle(image).objectFit), "contain");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: fileURLToPath(new URL(`../reports/ui-ux-stabilization/${width}-synthetic-images.png`, import.meta.url)), fullPage: true });
    results.push({ width, photosLoaded: true, fitting: "contain", selectedThumbnail: 2, paymentLabelsVisible: true, horizontalOverflow: false });
    await page.close();
  }
  await writeFile(new URL("../reports/ui-ux-stabilization/component-results.json", import.meta.url), JSON.stringify(results, null, 2));
  console.log("PASS synthetic photo gallery and price labels at 320px and 1440px");
} finally {
  if (browser) await browser.close();
  await unlink(fixtureFile).catch((error) => { if (error.code !== "ENOENT") throw error; });
  await rmdir(fixtureDir);
}
