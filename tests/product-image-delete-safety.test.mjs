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
  assert.match(cleanupScript, /if \(!apply\) process\.exit\(0\)/);
  assert.match(cleanupScript, /DELETE_BOTH/);
  assert.match(cleanupScript, /DELETE_STORAGE/);
});
