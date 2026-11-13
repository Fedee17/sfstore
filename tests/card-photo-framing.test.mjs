import assert from "node:assert/strict";
import { test } from "node:test";
import { cardPhotoFraming } from "../lib/catalog/card-photo-framing.ts";

const base = "https://example.supabase.co/storage/v1/object/public/product-images/products/id/";

test("owner-reviewed framings apply only to the exact stored photo", () => {
  assert.deepEqual(cardPhotoFraming(`${base}14ab2d31a1b440e0316cb6cdfe220583.webp`), { focusY: 0, width: 0.8 });
  assert.deepEqual(cardPhotoFraming(`${base}1780979018845-img-4921-optimizada.webp?v=2`), { focusY: 25 });
  assert.equal(cardPhotoFraming(`${base}replaced-photo.webp`), null);
  assert.equal(cardPhotoFraming(null), null);
  assert.equal(cardPhotoFraming(""), null);
});
