import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { ProductSaveError, readVersionedProduct, saveProductWithRecovery } from "../lib/products/atomic-save.ts";

const request = { operationKey: "op", productId: "product", operationType: "update_product", expectedVersion: "old", requestHash: "hash" };
const plan = { requestHash: "hash", payload: { product: {}, attributes: [], images: null }, uploads: [
  { path: "products/product/hash.webp", contentHash: "hash", size: 20, mime: "image/webp", fileIndex: 0 },
] };
const result = { product_id: "product", version: "new", product: { id: "product", slug: "product", status: "active", category_id: "category", updated_at: "now" } };
function fixture(options = {}) {
  let operation = { status: "not_found" };
  const events = [];
  const gateway = {
    resolve: async () => { events.push("resolve"); if (options.resolveFailure) throw Error("network"); return operation; },
    prepare: async () => { events.push("prepare"); operation = { ...request, product_id: request.productId, operation_type: request.operationType, status: "prepared" }; return operation; },
    persistPlan: async () => { events.push("persist"); operation.recovery_metadata = plan; return plan; },
    queueReconciliation: async () => { events.push("queue"); if (options.queueFailure) throw Error("network"); },
    upload: async () => { events.push("upload"); if (options.uploadFailure) throw Error("Storage unavailable"); },
    commit: async () => {
      events.push("commit");
      if (options.dbFailure) throw Error(options.dbFailure);
      operation.status = "committed"; operation.result = result;
      if (options.lostResponse) throw Error("timeout");
      return result;
    },
    abort: async () => { events.push("abort"); if (options.abortFailure) throw Error("network"); operation.status = "aborted"; },
  };
  return { gateway, events, options, setOperation: (value) => { operation = value; } };
}

test("prepare and persist recovery precede uploads; metadata commits once", async () => {
  const f = fixture();
  const saved = await saveProductWithRecovery(request, f.gateway, async () => plan);
  assert.deepEqual(saved.result, result);
  assert.deepEqual(f.events, ["resolve", "prepare", "persist", "queue", "upload", "commit"]);
});

test("lost commit acknowledgement resolves success without compensating Storage", async () => {
  const f = fixture({ lostResponse: true });
  assert.deepEqual((await saveProductWithRecovery(request, f.gateway, async () => plan)).result, result);
  assert.equal(f.events.includes("abort"), false);
});

test("committed retry reuses original result and cannot upload or commit again", async () => {
  const f = fixture();
  await saveProductWithRecovery(request, f.gateway, async () => plan);
  f.events.length = 0;
  const saved = await saveProductWithRecovery(request, f.gateway, () => { throw Error("must not rebuild"); });
  assert.deepEqual(saved.result, result);
  assert.deepEqual(f.events, ["resolve"]);
});

test("changed payload with the same operation is rejected before uploads", async () => {
  const f = fixture();
  f.setOperation({ status: "prepared", product_id: request.productId, operation_type: request.operationType, recovery_metadata: plan });
  await assert.rejects(saveProductWithRecovery({ ...request, requestHash: "changed" }, f.gateway, async () => plan), (e) => e.retryMode === "reload");
  assert.deepEqual(f.events, ["resolve"]);
});

for (const key of ["uploadFailure", "queueFailure"]) {
  test(`${key} preserves a prepared operation and releases pending with a retry error`, async () => {
    const f = fixture({ [key]: true });
    await assert.rejects(saveProductWithRecovery(request, f.gateway, async () => plan), (e) => e instanceof ProductSaveError && e.retryMode === "retry");
    assert.equal(f.events.includes("commit"), false);
    assert.equal(f.events.includes("abort"), false);
    if (key === "queueFailure") assert.equal(f.events.includes("upload"), false);
  });
}

test("retry uses the persisted gallery instead of rebuilding it from a newer DB state", async () => {
  const f = fixture({ uploadFailure: true });
  await assert.rejects(saveProductWithRecovery(request, f.gateway, async () => plan));
  f.options.uploadFailure = false;
  assert.deepEqual((await saveProductWithRecovery(request, f.gateway, () => { throw Error("must not rebuild"); })).result, result);
});

test("stale version after uploading aborts under the operation lock, never deletes Storage", async () => {
  const f = fixture({ dbFailure: "PRODUCT_STALE_VERSION" });
  await assert.rejects(saveProductWithRecovery(request, f.gateway, async () => plan), (e) => e.retryMode === "reload");
  assert.equal(f.events.at(-1), "abort");
  assert.equal(f.events.filter((event) => event === "queue").length, 1);
});

test("constraint failure rolls back through RPC and returns a fresh-operation error", async () => {
  const f = fixture({ dbFailure: "duplicate key violates constraint" });
  await assert.rejects(saveProductWithRecovery(request, f.gateway, async () => plan), (e) => e.retryMode === "new");
  assert.equal(f.events.at(-1), "abort");
});

test("failed abort fencing must retain the same key, not authorize cleanup", async () => {
  const f = fixture({ dbFailure: "PRODUCT_STALE_VERSION", abortFailure: true });
  await assert.rejects(saveProductWithRecovery(request, f.gateway, async () => plan), (e) => e.retryMode === "retry");
});

test("resolve unavailable fails closed without any upload", async () => {
  const f = fixture({ resolveFailure: true });
  await assert.rejects(saveProductWithRecovery(request, f.gateway, async () => plan), (e) => e.retryMode === "retry");
  assert.deepEqual(f.events, ["resolve"]);
});

test("aborted operation does not upload or commit again", async () => {
  const f = fixture();
  f.setOperation({ status: "aborted", product_id: request.productId, operation_type: request.operationType });
  await assert.rejects(saveProductWithRecovery(request, f.gateway, async () => plan), (e) => e.retryMode === "new");
  assert.deepEqual(f.events, ["resolve"]);
});

test("validation failure before prepare stays editable without writes", async () => {
  const f = fixture();
  await assert.rejects(saveProductWithRecovery(request, f.gateway, async () => { throw Error("Invalid attribute"); }), (e) => e.retryMode === "new");
  assert.deepEqual(f.events, ["resolve"]);
});

test("versioned read retries a racing snapshot instead of attaching the wrong fingerprint", async () => {
  const versions = ["a", "b", "b", "b"];
  let reads = 0;
  const value = await readVersionedProduct(async () => versions.shift(), async () => ++reads);
  assert.deepEqual(value, { product: 2, version: "b" });
});

test("continuously changing product fails the edit read safely", async () => {
  let version = 0;
  await assert.rejects(readVersionedProduct(async () => String(version++), async () => ({})), /cambiando/);
});

test("create/update actions delegate to one atomic coordinator without direct metadata writes", () => {
  const actions = readFileSync(new URL("../app/admin/productos/actions.ts", import.meta.url), "utf8");
  const block = actions.slice(actions.indexOf("async function saveProductForm"), actions.indexOf("export async function archiveProduct"));
  assert.match(block, /requireAdminActionSession/);
  assert.match(block, /service\.save/);
  assert.doesNotMatch(block, /\.insert\(|\.update\(|\.delete\(|\.upsert\(|cost_source_purchase_item_id:/);
  assert.match(block, /assertOperationalProduct/);
  assert.match(block, /expectedVersion/);
});

test("form freezes ambiguous retries, preserves HEIC and files, and has a synchronous double-submit lock", () => {
  const form = readFileSync(new URL("../components/admin/products/product-form.tsx", import.meta.url), "utf8");
  assert.match(form, /requestRef\.current = data/);
  assert.match(form, /data\.set\("operationKey", crypto\.randomUUID\(\)\)/);
  assert.match(form, /submitLockRef\.current = true/);
  assert.match(form, /finally \{\s*submitLockRef\.current = false/);
  assert.match(form, /fieldset disabled=\{isSubmitting \|\| actionState\.retryMode === "retry"/);
  assert.match(form, /normalizeHeicFile\(file, "image\/jpeg"\)/);
  assert.match(form, /versionRef\.current = result\.version/);
});
