import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  detectProductImageOutputMimeType,
  findMatchingStoredProductImage,
  isSupportedProductImageSourceMimeType,
} from "../lib/products/product-image-files.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const form = readFileSync(join(root, "components", "admin", "products", "product-form.tsx"), "utf8");
const actions = readFileSync(join(root, "app", "admin", "productos", "actions.ts"), "utf8");
const imageFiles = readFileSync(join(root, "lib", "products", "product-image-files.ts"), "utf8");

test("the file input supports one or several images", () => {
  assert.match(form, /name="productImages"[\s\S]*?multiple/);
  assert.match(actions, /formData\.getAll\("productImages"\)/);
});

test("new images have immediate previews and can be removed before saving", () => {
  assert.match(form, /URL\.createObjectURL\(file\)/);
  assert.match(form, /Nuevas imagenes/);
  assert.match(form, /imagen\{pendingImages\.length === 1 \? "" : "es"\} seleccionada/);
  assert.match(form, /removePendingImage\(image\.id\)/);
  assert.match(form, />\s*Quitar\s*</);
});

test("HEIC and HEIF are detected by content and converted before preview or upload", () => {
  assert.match(form, /isHeicFile\(file\)/);
  assert.match(form, /normalizeHeicFile\(file, "image\/jpeg"\)/);
  assert.match(form, /accept=\{PRODUCT_IMAGE_ACCEPT\}/);
  assert.match(imageFiles, /image\/heic/);
  assert.match(imageFiles, /image\/heif/);
  assert.match(imageFiles, /\.heic,\.heif/);
  assert.match(form, /Preparando \$\{files\.length\} imagen/);
});

test("failed conversion keeps broken files out of the submitted batch", () => {
  assert.match(form, /optimizedFiles\.push\(await prepareProductImage\(file\)\)/);
  assert.doesNotMatch(form, /catch \{\s*optimizedFiles\.push\(file\)/);
  assert.match(form, /replaceSelectedFiles\([\s\S]*pendingImages\.map\(\(image\) => image\.file\)/);
});

test("the server accepts only optimized formats with matching file signatures", () => {
  assert.match(actions, /PRODUCT_IMAGE_OUTPUT_MIME_TYPES\.includes/);
  assert.match(actions, /MAX_PRODUCT_IMAGE_UPLOAD_BYTES/);
  assert.match(actions, /validateProductImageContents\(files\)/);
  assert.match(actions, /detectProductImageOutputMimeType\(header\)/);
  assert.match(actions, /detectedType !== file\.type/);
  assert.match(imageFiles, /bytes\[0\] === 0xff[\s\S]+bytes\[1\] === 0xd8/);
  assert.match(imageFiles, /"RIFF"[\s\S]+"WEBP"/);
});

test("binary signature validation recognizes only JPEG, PNG and WebP output", () => {
  assert.equal(
    detectProductImageOutputMimeType(new Uint8Array([0xff, 0xd8, 0xff, 0x00])),
    "image/jpeg",
  );
  assert.equal(
    detectProductImageOutputMimeType(
      new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    ),
    "image/png",
  );
  assert.equal(
    detectProductImageOutputMimeType(
      new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]),
    ),
    "image/webp",
  );
  assert.equal(detectProductImageOutputMimeType(new Uint8Array([1, 2, 3])), null);
  assert.equal(isSupportedProductImageSourceMimeType("image/heic"), true);
  assert.equal(isSupportedProductImageSourceMimeType("application/pdf"), false);
});

test("stored and pending images are rendered in separate sections", () => {
  assert.match(form, /Imagenes actuales/);
  assert.match(form, /Nuevas imagenes/);
  assert.match(form, /product \? <ProductImageGalleryAdmin/);
});

test("multiple uploads append without deleting existing image rows", () => {
  const uploadBlock = actions.slice(actions.indexOf("async function uploadProductImages"), actions.indexOf("export async function createProduct"));
  assert.match(uploadBlock, /lastSortOrder \+ imageRows\.length \+ 1/);
  assert.match(uploadBlock, /\.upsert\(imageRows, \{ onConflict: "id", ignoreDuplicates: true \}\)/);
  assert.doesNotMatch(uploadBlock, /\.from\("product_images"\)[\s\S]*?\.delete\(/);
});

test("a partial upload failure triggers compensating storage cleanup", () => {
  assert.match(actions, /const uploadedPaths: string\[\] = \[\]/);
  assert.match(actions, /uploadedPaths\.push\(filePath\)/);
  assert.match(actions, /Fallo la limpieza compensatoria/);
  assert.match(actions, /\.remove\(uploadedPaths\)/);
});

test("pending submit prevents double save and communicates image upload", () => {
  assert.match(form, /useActionState\([\s\S]*action,[\s\S]*INITIAL_ACTION_STATE/);
  assert.match(form, /const \[actionState, formAction, isSubmitting\]/);
  assert.match(form, /disabled=\{isOptimizingImage \|\| isSubmitting\}/);
  assert.match(form, /isSubmitting[\s\S]*"Subiendo imagenes\.\.\."/);
  assert.match(form, /action=\{formAction\}/);
});

test("successful image submission releases pending and refreshes current images", () => {
  assert.match(form, /actionState\.status !== "success"/);
  assert.match(form, /handledSubmissionRef\.current = actionState\.submissionId/);
  assert.match(form, /setPendingImages\(\[\]\)/);
  assert.match(form, /syncPendingFiles\(\[\]\)/);
  assert.match(form, /router\.refresh\(\)/);
  assert.match(actions, /status: "success"[\s\S]*submissionId: crypto\.randomUUID\(\)/);
});

test("upload and database errors return visible state and release pending", () => {
  const createBlock = actions.slice(
    actions.indexOf("export async function createProduct"),
    actions.indexOf("export async function updateProduct"),
  );
  const updateBlock = actions.slice(
    actions.indexOf("export async function updateProduct"),
    actions.indexOf("export async function archiveProduct"),
  );

  assert.match(createBlock, /catch \(error\) \{\s*return productFormErrorState\(error\)/);
  assert.match(updateBlock, /catch \(error\) \{\s*return productFormErrorState\(error\)/);
  assert.match(form, /role=\{actionState\.status === "error" \? "alert" : "status"\}/);
  assert.doesNotMatch(createBlock, /redirect\(/);
  assert.doesNotMatch(updateBlock, /redirect\(/);
});

test("content identity reuses an existing storage object and prevents retry duplicates", () => {
  const stored = [
    {
      name: "old-timestamp-product.webp",
      metadata: {
        eTag: '"b215b4f14e42986a2509c4f8ea775139"',
        size: 53564,
        mimetype: "image/webp",
      },
    },
  ];

  assert.equal(
    findMatchingStoredProductImage(stored, {
      contentHash: "b215b4f14e42986a2509c4f8ea775139",
      mimeType: "image/webp",
      size: 53564,
    })?.name,
    "old-timestamp-product.webp",
  );
  assert.equal(
    findMatchingStoredProductImage(stored, {
      contentHash: "different",
      mimeType: "image/webp",
      size: 53564,
    }),
    undefined,
  );
  assert.match(actions, /existingImageUrls\.has\(data\.publicUrl\)/);
  assert.match(actions, /getProductImageId\(productId, contentHash\)/);
  assert.match(actions, /ignoreDuplicates: true/);
});

test("saved images support explicit primary, ordering and deletion", () => {
  assert.match(form, /Principal/);
  assert.match(form, /setPrimaryProductImage/);
  assert.match(form, /moveProductImage/);
  assert.match(form, /direction" value="previous"/);
  assert.match(form, /direction" value="next"/);
  assert.match(form, /deleteProductImage/);
});

test("products without stored or pending images have explicit empty states", () => {
  assert.match(form, /todavia no tiene imagenes cargadas/);
  assert.match(form, /pendingImages\.length > 0/);
});
