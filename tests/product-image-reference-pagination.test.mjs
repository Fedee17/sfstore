import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createSupabaseProductImageDeleteGateway,
  deleteProductImageWithCompensation,
  getProductImageStoragePath,
} from "../lib/products/product-image-deletion.ts";

const id = (number) => `00000000-0000-4000-8000-${number.toString(16).padStart(12, "0")}`;
const url = "https://fixture.invalid/storage/v1/object/public/product-images/products/fixture/photo.webp";
const path = getProductImageStoragePath(url);
const image = { id: id(0), product_id: id(9000), url, alt: null, sort_order: 0,
  is_primary: true, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" };

// Exercise the actual gateway against a PostgREST-shaped capped, cursor-based
// response. No Storage API, credentials or live database is involved.
function fixture(rows, { cap = 100, onPage } = {}) {
  const calls = [], writes = [];
  const client = {
    from(table) {
      assert.equal(table, "product_images");
      const request = { cursor: null };
      return {
        select(columns) { assert.equal(columns, "id, url"); return this; },
        neq(column, value) { assert.equal(column, "id"); request.excluded = value; return this; },
        order(column, options) { assert.equal(column, "id"); assert.deepEqual(options, { ascending: true }); return this; },
        limit(value) { request.limit = value; return this; },
        gt(column, value) { assert.equal(column, "id"); request.cursor = value; return this; },
        then(resolve, reject) {
          return Promise.resolve().then(() => {
            calls.push({ ...request });
            const data = rows.filter(row => row.id !== request.excluded &&
              (request.cursor === null || row.id > request.cursor))
              .sort((a, b) => a.id.localeCompare(b.id)).slice(0, Math.min(cap, request.limit));
            return onPage?.(data, calls.length, request) ?? { data, error: null };
          }).then(resolve, reject);
        },
      };
    },
    async rpc(name) {
      writes.push(name);
      return { data: { ...image, remaining_images: 0, remaining_url_references: 0 }, error: null };
    },
  };
  const gateway = createSupabaseProductImageDeleteGateway(client);
  gateway.readImage = async () => image;
  return { gateway, calls, writes };
}

test("shared encoded path after more than 1000 unrelated images is found despite short server pages", async () => {
  const rows = Array.from({ length: 1100 }, (_, n) => ({ id: id(n + 1), url: url + `-${n}` }));
  const shared = { id: id(1101), url: url.replace("photo.webp", "%70hoto.webp") };
  rows.push(shared, image);
  assert.equal(rows.slice(0, 1000).some(row => getProductImageStoragePath(row.url) === path), false);
  const f = fixture(rows);
  assert.deepEqual(await f.gateway.findOtherReferences(image.id, url, path), [shared.id]);
  assert.equal(f.calls.length, 13); // 11 full pages, one short page and one empty page.
  assert.equal(f.calls.at(-1).cursor, shared.id);
  assert.deepEqual(f.writes, []);
});

for (const cap of [1000, 100]) {
  test(`all 1105 shared references are returned with a server cap of ${cap}`, async () => {
    const shared = Array.from({ length: 1105 }, (_, n) => ({ id: id(n + 1),
      url: n % 2 ? url : url.replace("photo.webp", "%70hoto.webp") }));
    const f = fixture([image, ...shared], { cap });
    assert.deepEqual(await f.gateway.findOtherReferences(image.id, url, path), shared.map(row => row.id));
    assert.ok(f.calls.every(call => call.limit === 250 && call.excluded === image.id));
    assert.equal(f.calls.at(-1).cursor, shared.at(-1).id);
    assert.deepEqual(f.writes, []);
  });
}

test("empty scan and external URLs preserve exact-match semantics and exclude the image itself", async () => {
  const empty = fixture([image]);
  assert.deepEqual(await empty.gateway.findOtherReferences(image.id, url, path), []);
  const external = "https://fixture.invalid/external.webp";
  const f = fixture([{ id: id(1), url: external }, { id: id(2), url: external + "?other" }]);
  assert.deepEqual(await f.gateway.findOtherReferences(image.id, external, null), [id(1)]);
});

test("an intermediate page error rejects instead of returning partial references", async () => {
  const rows = Array.from({ length: 1105 }, (_, n) => ({ id: id(n + 1), url }));
  const f = fixture(rows, { onPage: (_, call) => call === 2 ? { data: null, error: { message: "synthetic page failure" } } : undefined });
  await assert.rejects(f.gateway.findOtherReferences(image.id, url, path), /synthetic page failure/);
  assert.equal(f.calls.length, 2);
  assert.deepEqual(f.writes, []);
});

test("a repeated page is rejected without looping or accepting duplicate results", async () => {
  const rows = Array.from({ length: 1105 }, (_, n) => ({ id: id(n + 1), url }));
  const f = fixture(rows, { onPage: (_, call) => call === 2 ? { data: rows.slice(0, 100), error: null } : undefined });
  await assert.rejects(f.gateway.findOtherReferences(image.id, url, path), /No se pudo avanzar/);
  assert.equal(f.calls.length, 2);
});

test("an unordered page is rejected rather than skipping references behind its cursor", async () => {
  const f = fixture([{ id: id(1), url }, { id: id(2), url }], {
    onPage: data => ({ data: data.reverse(), error: null }),
  });
  await assert.rejects(f.gateway.findOtherReferences(image.id, url, path), /No se pudo avanzar/);
});

test("a paginated pre-delete failure prevents every metadata and Storage mutation", async () => {
  const rows = Array.from({ length: 1105 }, (_, n) => ({ id: id(n + 1), url }));
  const f = fixture(rows, { onPage: (_, call) => call === 2 ? { data: null, error: { message: "synthetic page failure" } } : undefined });
  await assert.rejects(deleteProductImageWithCompensation(f.gateway, { productId: image.product_id, imageId: image.id }), /synthetic page failure/);
  assert.deepEqual(f.writes, []);
});

test("a paginated post-delete failure restores metadata and never deletes the Storage object", async () => {
  const rows = Array.from({ length: 1105 }, (_, n) => ({ id: id(n + 1), url }));
  const f = fixture(rows, { onPage: (_, call) => call === 15 ? { data: null, error: { message: "synthetic page failure" } } : undefined });
  await assert.rejects(deleteProductImageWithCompensation(f.gateway, { productId: image.product_id, imageId: image.id }), /La imagen fue restaurada/);
  assert.deepEqual(f.writes, ["delete_product_image_metadata_and_queue", "restore_product_image_metadata"]);
  await assert.rejects(f.gateway.removeStorageObject(path), /STORAGE_CONDITIONAL_DELETE_UNAVAILABLE/);
});
