import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  deleteProductImageWithCompensation,
  getProductImageStoragePath,
} from "../lib/products/product-image-deletion.ts";
import {
  assertProtectedProductImageReviews,
  parseProductImageCleanupPlanCsv,
  summarizeProductImageCleanupPlan,
} from "../lib/products/product-image-cleanup.ts";
import {
  runProductImageCleanup,
  validateCurrentState,
} from "../scripts/cleanup-product-images.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = (...parts) => readFileSync(join(root, ...parts), "utf8");
const migration = source(
  "supabase",
  "migrations",
  "202610040001_safe_product_image_delete.sql",
);
const actions = source("app", "admin", "productos", "actions.ts");
const form = source("components", "admin", "products", "product-form.tsx");
const cleanupScript = source("scripts", "cleanup-product-images.ts");

const image = {
  id: "image-1",
  product_id: "product-1",
  url: "https://example.test/storage/v1/object/public/product-images/products/product-1/photo.webp",
  alt: "Photo",
  sort_order: 1,
  is_primary: false,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

function gateway(overrides = {}) {
  const calls = [];
  return {
    calls,
    value: {
      async readImage() {
        calls.push("read");
        return image;
      },
      async findOtherReferences() {
        calls.push("references");
        return [];
      },
      async deleteMetadata() {
        calls.push("delete-metadata");
        return { ...image, remaining_images: 1, remaining_url_references: 0 };
      },
      async restoreMetadata() {
        calls.push("restore-metadata");
      },
      async removeStorageObject() {
        calls.push("delete-storage");
      },
      ...overrides,
    },
  };
}

test("deleting a secondary image removes metadata before its unshared object", async () => {
  const fake = gateway();
  const result = await deleteProductImageWithCompensation(fake.value, {
    productId: image.product_id,
    imageId: image.id,
  });

  assert.equal(result.storageDeleted, true);
  assert.deepEqual(fake.calls, [
    "read",
    "references",
    "delete-metadata",
    "references",
    "delete-storage",
  ]);
});

test("a shared object is retained after its product image row is deleted", async () => {
  const fake = gateway({
    async findOtherReferences() {
      fake.calls.push("references");
      return ["other-image"];
    },
  });
  const result = await deleteProductImageWithCompensation(fake.value, {
    productId: image.product_id,
    imageId: image.id,
  });

  assert.equal(result.storageDeleted, false);
  assert.equal(result.storagePreservedForSharedReference, true);
  assert.equal(fake.calls.includes("delete-storage"), false);
});

test("a database failure prevents any Storage deletion", async () => {
  const fake = gateway({
    async deleteMetadata() {
      fake.calls.push("delete-metadata");
      throw new Error("database unavailable");
    },
  });

  await assert.rejects(
    deleteProductImageWithCompensation(fake.value, {
      productId: image.product_id,
      imageId: image.id,
    }),
    /database unavailable/,
  );
  assert.equal(fake.calls.includes("delete-storage"), false);
});

test("a retry after a completed delete performs no second write", async () => {
  let storedImage = image;
  let storageDeletes = 0;
  const fake = gateway({
    async readImage() {
      fake.calls.push("read");
      return storedImage;
    },
    async deleteMetadata() {
      fake.calls.push("delete-metadata");
      const deleted = storedImage;
      storedImage = null;
      return { ...deleted, remaining_images: 0, remaining_url_references: 0 };
    },
    async removeStorageObject() {
      fake.calls.push("delete-storage");
      storageDeletes += 1;
    },
  });

  await deleteProductImageWithCompensation(fake.value, {
    productId: image.product_id,
    imageId: image.id,
  });
  await assert.rejects(
    deleteProductImageWithCompensation(fake.value, {
      productId: image.product_id,
      imageId: image.id,
    }),
    /no pertenece/,
  );
  assert.equal(storageDeletes, 1);
});

test("a Storage failure restores metadata and returns a visible failure", async () => {
  const fake = gateway({
    async removeStorageObject() {
      fake.calls.push("delete-storage");
      throw new Error("storage unavailable");
    },
  });

  await assert.rejects(
    deleteProductImageWithCompensation(fake.value, {
      productId: image.product_id,
      imageId: image.id,
    }),
    /referencia fue restaurada/,
  );
  assert.equal(fake.calls.at(-1), "restore-metadata");
});

test("a post-delete reference check failure restores metadata", async () => {
  let checks = 0;
  const fake = gateway({
    async findOtherReferences() {
      fake.calls.push("references");
      checks += 1;
      if (checks === 2) throw new Error("reference lookup unavailable");
      return [];
    },
  });

  await assert.rejects(
    deleteProductImageWithCompensation(fake.value, {
      productId: image.product_id,
      imageId: image.id,
    }),
    /imagen fue restaurada/,
  );
  assert.equal(fake.calls.at(-1), "restore-metadata");
  assert.equal(fake.calls.includes("delete-storage"), false);
});

test("Storage paths are parsed only from the managed public bucket", () => {
  assert.equal(
    getProductImageStoragePath(image.url),
    "products/product-1/photo.webp",
  );
  assert.equal(getProductImageStoragePath("https://example.test/external.webp"), null);
});

test("metadata deletion is atomic, deterministic and protects historical identities", () => {
  assert.match(migration, /create or replace function delete_product_image_metadata/i);
  assert.match(migration, /^begin;[\s\S]+commit;\s*$/i);
  assert.match(migration, /security invoker/i);
  assert.match(migration, /historical_identity = false/i);
  assert.match(migration, /for update/i);
  assert.match(migration, /row_number\(\) over \(order by sort_order, created_at, id\)/i);
  assert.match(migration, /set is_primary = \(id = v_next_primary_id\)/i);
  assert.match(migration, /grant execute[\s\S]+service_role/i);
  assert.match(migration, /revoke all[\s\S]+public, anon, authenticated/i);
});

test("deleting the last image leaves no fabricated primary row", () => {
  const deleteFunction = migration.slice(
    migration.indexOf("create or replace function delete_product_image_metadata"),
    migration.indexOf("create or replace function restore_product_image_metadata"),
  );
  assert.match(deleteFunction, /if v_next_primary_id is not null then[\s\S]+set is_primary/i);
  assert.doesNotMatch(deleteFunction, /insert into product_images/i);
});

test("the admin action exposes pending, success and failure without redirecting", () => {
  const deleteBlock = actions.slice(actions.indexOf("export async function deleteProductImage"));
  assert.match(deleteBlock, /deleteProductImageWithCompensation/);
  assert.match(deleteBlock, /status: "success"/);
  assert.match(deleteBlock, /status: "error"/);
  assert.doesNotMatch(deleteBlock, /redirect\(/);
  assert.match(form, /useActionState\([\s\S]*deleteProductImage/);
  assert.match(form, /pendingLabel="Eliminando\.\.\."/);
  assert.match(form, /disabled=\{isPending \|\| state\.status === "success"\}/);
  assert.match(form, /role=\{state\.status === "error" \? "alert" : "status"\}/);
});

test("cleanup plans preserve both protected Yara Rosa identities for review", () => {
  const csv = [
    "action,entity_type,product_id,product_name,row_id,path,url,content_hash,size,mime,sort_order,is_primary,created_at,reason,keeper_row_id,keeper_path,confidence",
    "REVIEW,DB_ROW_AND_STORAGE_OBJECT,f1cb2323-0e7f-49d6-a26f-110595c90e55,Yara A,row-a,path-a,url-a,hash-a,1,image/webp,0,true,date,identity conflict,,,HIGH",
    "REVIEW,DB_ROW_AND_STORAGE_OBJECT,05b34469-3eb8-4148-8e97-9a19f1c2df6e,Yara B,row-b,path-b,url-b,hash-b,1,image/webp,0,true,date,identity conflict,,,HIGH",
  ].join("\n");
  const plan = parseProductImageCleanupPlanCsv(csv);
  assert.doesNotThrow(() => assertProtectedProductImageReviews(plan));
  assert.equal(summarizeProductImageCleanupPlan(plan).REVIEW, 2);
  assert.throws(
    () => assertProtectedProductImageReviews([{ ...plan[0], action: "DELETE_BOTH" }, plan[1]]),
    /protegido|protegidas/i,
  );
});

test("cleanup remains dry-run by default and validates snapshot identity before apply", () => {
  assert.match(cleanupScript, /const apply = process\.argv\.includes\("--apply"\)/);
  assert.match(cleanupScript, /Modo: DRY-RUN \(sin escrituras\)/);
  assert.match(cleanupScript, /validateCurrentState\(snapshot, plan, images, objects\)/);
  assert.match(cleanupScript, /assertProtectedProductImageReviews\(plan\)/);
  assert.match(cleanupScript, /Plan CSV contra cleanup_plan del snapshot/);
  assert.match(cleanupScript, /value === null \|\| value === ""/);
  assert.match(cleanupScript, /normalizedNullableNumber\(\s*row\.sort_order/);
  assert.match(cleanupScript, /normalizedNullableBoolean\([\s\S]*row\.is_primary/);
  assert.match(cleanupScript, /REVIEW RECHAZADO\/EXCLUIDO/);
  assert.match(cleanupScript, /KEEP: 55/);
  assert.match(cleanupScript, /if \(!apply \|\| result\.phase === "POST-CLEANUP"\)/);
  assert.match(cleanupScript, /DELETE_BOTH/);
  assert.match(cleanupScript, /DELETE_STORAGE/);
});

const approvedSnapshot = JSON.parse(source("reports", "product-images-storage-snapshot.json"));
const approvedPlan = parseProductImageCleanupPlanCsv(source("reports", "product-images-cleanup-plan.csv"));
const destructiveRows = approvedPlan.filter((row) => row.action === "DELETE_BOTH");

function cleanupFixture({ post = false, beforeRead = () => {} } = {}) {
  const snapshot = structuredClone(approvedSnapshot);
  const plan = structuredClone(approvedPlan);
  const state = {
    images: snapshot.product_images.map((row) => ({
      id: row.id, product_id: row.product_id, url: row.url, alt: row.alt,
      sort_order: row.sort_order, is_primary: row.is_primary,
      created_at: row.created_at, updated_at: row.updated_at,
    })),
    objects: snapshot.storage_objects.map((row) => ({
      path: row.path, size: row.size, mime: row.mime, etag: row.etag.replaceAll('"', ""),
    })),
  };
  const writes = [];
  const logs = [];
  let reads = 0;
  const normalize = (productId) => {
    const ordered = state.images.filter((row) => row.product_id === productId).sort((a, b) =>
      a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
    );
    for (let index = 0; index < ordered.length; index += 1) {
      const row = ordered[index];
      if (row.sort_order !== index || row.is_primary !== (index === 0)) row.updated_at = "2026-10-05T00:00:00Z";
      row.sort_order = index;
      row.is_primary = index === 0;
    }
  };
  const removeRow = (rowId) => {
    const removed = state.images.find((row) => row.id === rowId);
    state.images = state.images.filter((row) => row.id !== rowId);
    normalize(removed.product_id);
    return removed;
  };
  if (post) {
    for (const row of destructiveRows) removeRow(row.row_id);
    const paths = new Set(plan.filter((row) => row.action.startsWith("DELETE_")).map((row) => row.path));
    state.objects = state.objects.filter((row) => !paths.has(row.path));
  }
  const gateway = {
    async readImage(productId, rowId) {
      const row = state.images.find((row) => row.id === rowId && row.product_id === productId);
      return row ? structuredClone(row) : null;
    },
    async findOtherReferences(rowId, url, path) {
      return state.images.filter((row) => row.id !== rowId &&
        (row.url === url || getProductImageStoragePath(row.url) === path)).map((row) => row.id);
    },
    async deleteMetadata(productId, rowId) {
      writes.push({ action: "DB", productId, rowId });
      const removed = removeRow(rowId);
      return { ...removed, remaining_images: state.images.filter((row) => row.product_id === productId).length,
        remaining_url_references: state.images.filter((row) => row.url === removed.url).length };
    },
    async restoreMetadata(row) {
      writes.push({ action: "RESTORE", rowId: row.id });
      state.images.push(structuredClone(row));
      normalize(row.product_id);
    },
    async removeStorageObject(path) {
      writes.push({ action: "STORAGE", path });
      state.objects = state.objects.filter((row) => row.path !== path);
    },
  };
  return {
    state, plan, snapshot, writes, logs, gateway,
    async run(apply = false) {
      return runProductImageCleanup({
        snapshot, plan, apply, gateway,
        async readState() {
          reads += 1;
          beforeRead(state, reads);
          return structuredClone(state);
        },
        log: (message) => logs.push(message),
      });
    },
  };
}

test("approved PRE dry-run proposes exactly 55/27/1/2 without any writes", async () => {
  const fixture = cleanupFixture();
  const result = await fixture.run();
  assert.equal(result.phase, "PRE-CLEANUP");
  assert.deepEqual(result.summary, { KEEP: 55, DELETE_DB: 0, DELETE_BOTH: 27, DELETE_STORAGE: 1, REVIEW: 2 });
  assert.equal(result.writesProposed, 28);
  assert.deepEqual(fixture.writes, []);
});

test("completed POST dry-run accepts missing deleted objects and proposes 55/0/0/2", async () => {
  const fixture = cleanupFixture({ post: true });
  const result = await fixture.run();
  assert.equal(result.phase, "POST-CLEANUP");
  assert.deepEqual(result.summary, { KEEP: 55, DELETE_DB: 0, DELETE_BOTH: 0, DELETE_STORAGE: 0, REVIEW: 2 });
  assert.equal(result.writesProposed, 0);
  assert.equal(fixture.state.images.length, 57);
  assert.equal(fixture.state.objects.length, 57);
  assert.deepEqual(fixture.writes, []);
});

for (const [label, mutate, reason] of [
  ["candidate URL", (state) => { state.images.find((row) => row.id === destructiveRows[0].row_id).url += "-changed"; }, /url/],
  ["candidate product_id", (state) => { state.images.find((row) => row.id === destructiveRows[0].row_id).product_id = "changed"; }, /product_id/],
  ["candidate metadata", (state) => { state.images.find((row) => row.id === destructiveRows[0].row_id).alt = "changed"; }, /alt/],
  ["keeper URL", (state) => { state.images.find((row) => row.id === destructiveRows[0].keeper_row_id).url += "-changed"; }, /url/],
  ["keeper content", (state) => { state.objects.find((row) => row.path === destructiveRows[0].keeper_path).etag = "changed"; }, /eTag/],
  ["candidate eTag", (state) => { state.objects.find((row) => row.path === destructiveRows[0].path).etag = "changed"; }, /eTag/],
  ["candidate size", (state) => { state.objects.find((row) => row.path === destructiveRows[0].path).size += 1; }, /size/],
  ["candidate MIME", (state) => { state.objects.find((row) => row.path === destructiveRows[0].path).mime = "image/png"; }, /MIME/],
  ["missing candidate row", (state) => { state.images = state.images.filter((row) => row.id !== destructiveRows[0].row_id); }, /Falta la fila DB/],
  ["missing candidate object", (state) => { state.objects = state.objects.filter((row) => row.path !== destructiveRows[0].path); }, /Falta el objeto Storage/],
]) {
  test(`fresh ${label} mismatch aborts before that operation and stops subsequent writes`, async () => {
    const fixture = cleanupFixture({ beforeRead(state, reads) { if (reads === 2) mutate(state); } });
    await assert.rejects(fixture.run(true), reason);
    assert.deepEqual(fixture.writes, []);
    assert.ok(fixture.logs.some((message) => message.includes("ABORT antes de DELETE_BOTH") && reason.test(message)));
  });
}

test("candidate is checked again immediately before metadata RPC, not just before helper reads", async () => {
  const fixture = cleanupFixture({ beforeRead(state, reads) {
    if (reads === 3) state.objects.find((row) => row.path === destructiveRows[0].path).etag = "changed";
  } });
  await assert.rejects(fixture.run(true), /eTag/);
  assert.deepEqual(fixture.writes, []);
});

test("Storage drift after metadata deletion stops Storage writes and compensates metadata", async () => {
  const fixture = cleanupFixture({ beforeRead(state, reads) {
    if (reads === 4) state.objects.find((row) => row.path === destructiveRows[0].path).etag = "changed";
  } });
  await assert.rejects(fixture.run(true), /referencia fue restaurada/);
  assert.deepEqual(fixture.writes.map((write) => write.action), ["DB", "RESTORE"]);
  assert.ok(fixture.state.images.some((row) => row.id === destructiveRows[0].row_id));
  assert.ok(fixture.logs.some((message) => /ABORT.*eTag/.test(message)));
});

test("a newly shared reference during deletion restores metadata and stops further operations", async () => {
  const fixture = cleanupFixture();
  const original = fixture.gateway.findOtherReferences;
  let checks = 0;
  fixture.gateway.findOtherReferences = async (...args) => {
    checks += 1;
    return checks === 2 ? ["concurrent-reference"] : original(...args);
  };
  await assert.rejects(fixture.run(true), /referencia compartida.*metadata restaurada/);
  assert.deepEqual(fixture.writes.map((write) => write.action), ["DB", "RESTORE"]);
  assert.ok(fixture.state.images.some((row) => row.id === destructiveRows[0].row_id));
});

test("a mismatch at the next operation aborts without deleting that candidate or later ones", async () => {
  const fixture = cleanupFixture({ beforeRead(state) {
    if (fixture.writes.some((write) => write.action === "STORAGE")) {
      state.objects.find((row) => row.path === destructiveRows[1].path).mime = "image/png";
    }
  } });
  await assert.rejects(fixture.run(true), /MIME/);
  assert.deepEqual(fixture.writes.map((write) => write.action), ["DB", "STORAGE"]);
  assert.ok(fixture.state.images.some((row) => row.id === destructiveRows[1].row_id));
});

test("DELETE_STORAGE orphan is freshly checked against its keeper before removal", async () => {
  const fixture = cleanupFixture({ beforeRead(state) {
    if (fixture.writes.filter((write) => write.action === "STORAGE").length === 27) {
      const orphan = fixture.plan.find((row) => row.action === "DELETE_STORAGE");
      state.objects.find((row) => row.path === orphan.path).etag = "changed";
    }
  } });
  await assert.rejects(fixture.run(true), /eTag/);
  const orphan = fixture.plan.find((row) => row.action === "DELETE_STORAGE");
  assert.equal(fixture.writes.some((write) => write.path === orphan.path), false);
  assert.ok(fixture.logs.some((message) => /ABORT antes de DELETE_STORAGE/.test(message)));
});

test("mock apply deletes only approved candidates; subsequent dry-run and apply perform zero writes", async () => {
  const fixture = cleanupFixture();
  const reviewRows = fixture.state.images.filter((row) => approvedPlan.some((item) => item.action === "REVIEW" && item.row_id === row.id));
  const reviewObjects = fixture.state.objects.filter((row) => approvedPlan.some((item) => item.action === "REVIEW" && item.path === row.path));
  const first = await fixture.run(true);
  assert.equal(first.phase, "POST-CLEANUP");
  assert.equal(fixture.writes.filter((write) => write.action === "DB").length, 27);
  assert.equal(fixture.writes.filter((write) => write.action === "STORAGE").length, 28);
  assert.equal(fixture.writes.some((write) => write.action === "RESTORE"), false);
  const count = fixture.writes.length;
  assert.equal((await fixture.run()).writesProposed, 0);
  assert.equal((await fixture.run(true)).writesProposed, 0);
  assert.equal(fixture.writes.length, count);
  for (const row of reviewRows) assert.deepEqual(fixture.state.images.find((item) => item.id === row.id), row);
  for (const row of reviewObjects) assert.deepEqual(fixture.state.objects.find((item) => item.path === row.path), row);
});

test("partial cleanup is not mistaken for POST and cannot start another apply", async () => {
  const fixture = cleanupFixture();
  fixture.state.images = fixture.state.images.filter((row) => row.id !== destructiveRows[0].row_id);
  fixture.state.objects = fixture.state.objects.filter((row) => row.path !== destructiveRows[0].path);
  await assert.rejects(fixture.run(true), /Estado parcial/);
  assert.deepEqual(fixture.writes, []);
});

for (const post of [false, true]) {
  test(`REVIEW remains protected in ${post ? "POST" : "PRE"}, including tampered decisions`, async () => {
    const fixture = cleanupFixture({ post });
    const review = fixture.plan.find((row) => row.action === "REVIEW");
    fixture.state.images.find((row) => row.id === review.row_id).url += "-changed";
    await assert.rejects(fixture.run(true), /url/);
    assert.deepEqual(fixture.writes, []);
    review.action = "DELETE_BOTH";
    assert.throws(() => validateCurrentState(fixture.snapshot, fixture.plan, fixture.state.images, fixture.state.objects), /protegido|protegidas/i);
  });
}

test("POST rejects missing KEEP, changed REVIEW content, or reintroduced deleted candidates", async () => {
  for (const mutate of [
    (fixture) => { const keep = fixture.plan.find((row) => row.action === "KEEP"); fixture.state.images = fixture.state.images.filter((row) => row.id !== keep.row_id); },
    (fixture) => { const review = fixture.plan.find((row) => row.action === "REVIEW"); fixture.state.objects.find((row) => row.path === review.path).etag = "changed"; },
    (fixture) => { fixture.state.objects.push(structuredClone(fixture.snapshot.storage_objects.find((row) => row.path === destructiveRows[0].path))); },
  ]) {
    const fixture = cleanupFixture({ post: true });
    mutate(fixture);
    await assert.rejects(fixture.run(true));
    assert.deepEqual(fixture.writes, []);
  }
});
