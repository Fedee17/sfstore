import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Home publishes a sanitized Store JSON-LD built from the single brand address", async () => {
  const brand = await import("../lib/brand.ts");
  assert.equal(brand.brand.address, "Juan de Garay 2090, San Francisco, Córdoba, Argentina");
  assert.match(brand.brandLinks.maps, /query=Juan%20de%20Garay%202090%2C%20San%20Francisco%2C%20C%C3%B3rdoba%2C%20Argentina$/);
  const seo = source("lib/seo/local-business.ts");
  assert.match(seo, /"@type": "Store"/);
  assert.match(seo, /\.\.\.brand\.location/);
  assert.match(seo, /priceRange: brand\.priceRange/);
  assert.equal(brand.brand.location.postalCode, "2400");
  const backslash = String.fromCharCode(92);
  assert.ok(seo.includes(`.replace(/</g, "${backslash}${backslash}u003c")`));
  assert.match(source("app/page.tsx"), /application\/ld\+json[^\n]*serializeJsonLd\(buildLocalBusinessJsonLd\(\)\)/);
});
