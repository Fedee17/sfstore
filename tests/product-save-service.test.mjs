import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import ts from "typescript";
import * as coordinator from "../lib/products/atomic-save.ts";
import * as imageFiles from "../lib/products/product-image-files.ts";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../services/product-save.ts", import.meta.url), "utf8");
function loadService(client) {
  const compiled = { exports: {} };
  const mocks = {
    "server-only": {}, "@/lib/supabase/server": { getSupabaseAdminClient: () => client },
    "@/lib/products/atomic-save": coordinator, "@/lib/products/product-image-files": imageFiles,
    "@/lib/products/product-image-deletion": { PRODUCT_IMAGES_BUCKET: "product-images" },
  };
  new Function("exports", "require", "module", ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText)(compiled.exports, (name) => name in mocks ? mocks[name] : require(name), compiled);
  return compiled.exports;
}
const id = "00000000-0000-4000-8000-000000000001";
const base = { operationKey: "00000000-0000-4000-8000-000000000002", productId: id, operationType: "update_product", expectedVersion: "old", requestHash: "hash" };
function fixture(gallery = [], initialObjects = []) {
  const objects = new Map(initialObjects.map((object) => [object.name, object]));
  const events = [];
  let operation;
  let payload;
  let uploadFailure = false;
  let loseCommitResponse = false;
  const client = {
    from(table) {
      let update;
      const chain = {
        select() { return chain; }, eq() { return chain; }, order() { return chain; },
        update(value) { assert.equal(table, "product_save_operations"); update = value; return chain; },
        async maybeSingle() {
          events.push("persist");
          if (Object.keys(operation.recovery_metadata).length) return { data: null, error: null };
          operation.recovery_metadata = update.recovery_metadata;
          return { data: update, error: null };
        },
        then(resolve) { assert.equal(table, "product_images"); resolve({ data: gallery, error: null }); },
      };
      return chain;
    },
    async rpc(name, args) {
      events.push(name);
      if (name === "resolve_product_save_operation") return { data: operation ?? { status: "not_found" }, error: null };
      if (name === "prepare_product_save_operation") {
        assert.equal(args.p_expected_version, "old");
        operation ??= { product_id: id, operation_type: base.operationType, status: "prepared", recovery_metadata: {} };
        return { data: operation, error: null };
      }
      if (name === "enqueue_product_storage_task") {
        assert.equal(args.p_action, "reconcile");
        assert.equal(args.p_expected_metadata.path, args.p_storage_path);
        return { data: "task", error: null };
      }
      if (name === "update_product_atomic") {
        assert.equal(args.p_expected_version, "old");
        payload = args.p_payload;
        operation.status = "committed";
        operation.result = { product_id: id, version: "new", product: { id, slug: "new", status: "active", category_id: "category", updated_at: "now" } };
        if (loseCommitResponse) return { data: null, error: { message: "network timeout" } };
        return { data: operation.result, error: null };
      }
      if (name === "abort_product_save_operation") { operation.status = "aborted"; return { data: operation, error: null }; }
      throw Error(`Unexpected RPC: ${name}`);
    },
    storage: { from: () => ({
      list: async () => ({ data: [...objects.values()], error: null }),
      getPublicUrl: (path) => ({ data: { publicUrl: `https://storage.test/storage/v1/object/public/product-images/${path}` } }),
      upload: async (path, file, options) => {
        events.push("upload");
        assert.equal(options.upsert, false);
        if (uploadFailure) return { error: { message: "network timeout" } };
        const hash = createHash("md5").update(Buffer.from(await file.arrayBuffer())).digest("hex");
        objects.set(path.split("/").at(-1), { name: path.split("/").at(-1), metadata: { eTag: hash, size: file.size, mimetype: file.type } });
        return { error: null };
      },
    }) },
  };
  return { service: loadService(client), events, objects, getPayload: () => payload,
    setUploadFailure: (value) => { uploadFailure = value; }, setLostResponse: () => { loseCommitResponse = true; } };
}
const file = (name = "converted.webp", mime = "image/webp") => new File([new Uint8Array([1, 2, 3])], name, { type: mime });
async function save(f, files, product = { name: "Producto", cost: 100 }) {
  const service = f.service.createProductSaveService(base, files);
  return service.save(async () => {
    const images = await service.buildImages(product.name);
    return { requestHash: base.requestHash, payload: { product, attributes: [{ name: "Marca", value: "Stanley", sort_order: 10 }], images: images.images }, uploads: images.uploads, categorySlugs: ["mates"] };
  });
}

for (const mime of ["image/jpeg", "image/png", "image/webp"]) {
  test(`${mime} uploads only after prepare; new image manifest and attributes use the atomic RPC`, async () => {
    const f = fixture();
    const result = await save(f, [file("converted", mime)]);
    assert.equal(result.result.version, "new");
    assert.ok(f.events.indexOf("persist") < f.events.indexOf("upload"));
    assert.ok(f.events.indexOf("enqueue_product_storage_task") < f.events.indexOf("upload"));
    assert.equal(f.getPayload().images.length, 1);
    assert.equal(f.getPayload().images[0].mime, mime);
    assert.equal(f.getPayload().images[0].is_primary, true);
    assert.deepEqual(f.getPayload().attributes, [{ name: "Marca", value: "Stanley", sort_order: 10 }]);
    assert.equal("stock" in f.getPayload().product, false);
    assert.equal("cost_source_purchase_item_id" in f.getPayload().product, false);
  });
}

test("two filenames containing identical bytes produce one object and one new image", async () => {
  const f = fixture();
  await save(f, [file("first.webp"), file("second.webp")]);
  assert.equal(f.events.filter((event) => event === "upload").length, 1);
  assert.equal(f.getPayload().images.length, 1);
});

test("existing legacy object and DB URL are reused without upload or duplication", async () => {
  const bytes = file();
  const hash = createHash("md5").update(Buffer.from(await bytes.arrayBuffer())).digest("hex");
  const url = `https://storage.test/storage/v1/object/public/product-images/products/${id}/legacy.webp`;
  const gallery = [{ id: "image", url, alt: "Original", is_primary: true, sort_order: 0, created_at: "then" }];
  const f = fixture(gallery, [{ name: "legacy.webp", metadata: { eTag: hash, size: bytes.size, mimetype: bytes.type } }]);
  await save(f, [bytes]);
  assert.equal(f.events.includes("upload"), false);
  assert.deepEqual(f.getPayload().images, [{ id: "image", url, alt: "Original", is_primary: true }]);
});

test("no new files preserves the entire gallery without even reading Storage", async () => {
  const f = fixture();
  await save(f, []);
  assert.equal(f.getPayload().images, null);
  assert.equal(f.events.includes("upload"), false);
});

test("Storage failure keeps the operation retryable, then uploads exactly once", async () => {
  const f = fixture();
  f.setUploadFailure(true);
  const files = [file()];
  await assert.rejects(save(f, files), (e) => e.retryMode === "retry");
  assert.equal(f.events.includes("update_product_atomic"), false);
  f.setUploadFailure(false);
  await save(f, files);
  assert.equal(f.objects.size, 1);
  assert.equal(f.getPayload().images.length, 1);
});

test("lost RPC acknowledgement returns committed state, retry performs no upload or metadata writes", async () => {
  const f = fixture();
  f.setLostResponse();
  await save(f, [file()]);
  f.events.length = 0;
  await save(f, [file()]);
  assert.deepEqual(f.events, ["resolve_product_save_operation"]);
});

for (const [field, value] of [["eTag", "wrong"], ["size", 999], ["mimetype", "image/png"]]) {
  test(`existing deterministic path with changed ${field} fails closed, never overwrites`, async () => {
    const bytes = file();
    const hash = createHash("md5").update(Buffer.from(await bytes.arrayBuffer())).digest("hex");
    const f = fixture([], [{ name: `${hash}.webp`, metadata: { eTag: hash, size: bytes.size, mimetype: bytes.type, [field]: value } }]);
    await assert.rejects(save(f, [bytes]), (e) => e.retryMode === "new");
    assert.equal(f.events.includes("upload"), false);
    assert.equal(f.events.includes("update_product_atomic"), false);
    assert.ok(f.events.includes("abort_product_save_operation"));
  });
}

test("request fingerprint is stable across transport order but changes with business data or image bytes", async () => {
  const f = fixture();
  const a = new FormData(); a.set("name", "Producto"); a.set("operationKey", "one"); a.set("cost", "100");
  const b = new FormData(); b.set("cost", "100"); b.set("operationKey", "two"); b.set("name", "Producto");
  const hash = await f.service.fingerprintProductSubmission(a, [file()]);
  assert.equal(await f.service.fingerprintProductSubmission(b, [file()]), hash);
  b.set("cost", "101");
  assert.notEqual(await f.service.fingerprintProductSubmission(b, [file()]), hash);
  assert.notEqual(await f.service.fingerprintProductSubmission(a, [new File(["different"], "converted.webp", { type: "image/webp" })]), hash);
});
