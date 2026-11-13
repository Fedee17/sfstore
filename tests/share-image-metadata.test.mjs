import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync, readFileSync } from "node:fs";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("P12: routes that override openGraph keep the shared current-brand share image", () => {
  for (const page of ["app/layout.tsx", "app/page.tsx", "app/perfumes/page.tsx", "app/mates/page.tsx"]) {
    const code = source(page);
    assert.match(code, /openGraph: \{[\s\S]*?images: \[shareImage\]/, page);
    assert.match(code, /twitter: \{[\s\S]*?images: \[shareImage\.url\]/, page);
  }
  assert.match(source("lib/seo/share-image.ts"), /brandLogoPath = "\/logo-sfstore\.png"/);
  assert.ok(existsSync(new URL("../public/logo-sfstore.png", import.meta.url)));
  assert.match(source("components/site-header.tsx"), /src="\/logo-sfstore\.png"/);
  assert.match(source("lib/seo/local-business.ts"), /logo: new URL\(brandLogoPath, url\)/);
});
