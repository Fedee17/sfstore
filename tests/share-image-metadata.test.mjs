import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync, readFileSync, statSync } from "node:fs";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("P12: routes that override openGraph keep the shared share image", () => {
  for (const page of ["app/layout.tsx", "app/page.tsx", "app/perfumes/page.tsx", "app/mates/page.tsx"]) {
    const code = source(page);
    assert.match(code, /openGraph: \{[\s\S]*?images: \[shareImage\]/, page);
    assert.match(code, /twitter: \{[\s\S]*?images: \[shareImage\.url\]/, page);
  }
  assert.match(source("lib/seo/local-business.ts"), /logo: new URL\(brandLogoPath, url\)/);
  assert.match(source("lib/seo/local-business.ts"), /image: new URL\(brandLogoPath, url\)/);
});

test("P12 (owner, 27/11): shared links and the Store JSON-LD use the official olive/brown logo, light enough for WhatsApp", () => {
  assert.match(source("lib/seo/share-image.ts"), /brandLogoPath = "\/logo-sfstore-compartir\.jpg"/);
  assert.match(source("lib/seo/share-image.ts"), /width: 1200, height: 800/);
  const file = new URL("../public/logo-sfstore-compartir.jpg", import.meta.url);
  assert.ok(existsSync(file));
  const bytes = readFileSync(file);
  assert.equal(bytes.readUInt16BE(0), 0xffd8, "JPEG");
  // SOF0/SOF2 frame header carries height then width.
  const sof = bytes.findIndex((value, index) => value === 0xff && (bytes[index + 1] === 0xc0 || bytes[index + 1] === 0xc2));
  assert.equal(bytes.readUInt16BE(sof + 5), 800);
  assert.equal(bytes.readUInt16BE(sof + 7), 1200);
  assert.ok(statSync(file).size < 300 * 1024, "WhatsApp drops link previews with heavy images");
  // The header keeps its approved circular mark.
  assert.match(source("components/site-header.tsx"), /src="\/logo-sfstore\.png"/);
  assert.ok(existsSync(new URL("../public/logo-sfstore.png", import.meta.url)));
});
