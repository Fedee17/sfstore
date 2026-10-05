import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  PRODUCT_IMAGES_BUCKET,
  createSupabaseProductImageDeleteGateway,
  deleteProductImageWithCompensation,
  getProductImageStoragePath,
  type ProductImageMetadata,
} from "../lib/products/product-image-deletion.ts";
import {
  assertProtectedProductImageReviews,
  parseProductImageCleanupPlanCsv,
  summarizeProductImageCleanupPlan,
  type ProductImageCleanupPlanRow,
} from "../lib/products/product-image-cleanup.ts";

type Snapshot = {
  mode: string;
  bucket: string;
  totals: {
    product_images_rows: number;
    storage_objects: number;
    storage_bytes: number;
  };
  product_images: Array<{
    id: string;
    product_id: string;
    url: string;
    storage_path: string;
    sort_order: number;
    is_primary: boolean;
    created_at: string;
  }>;
  storage_objects: Array<{
    path: string;
    size: number;
    mime: string;
    etag: string;
  }>;
  cleanup_plan: ComparablePlanInput[];
};

type ComparablePlanInput = Omit<
  ProductImageCleanupPlanRow,
  "size" | "sort_order" | "is_primary"
> & {
  size: number | string | null;
  sort_order: number | string | null;
  is_primary: boolean | string | null;
};

type StorageObject = {
  path: string;
  size: number;
  mime: string;
  etag: string;
};

const PLAN_PATH = resolve("reports/product-images-cleanup-plan.csv");
const SNAPSHOT_PATH = resolve("reports/product-images-storage-snapshot.json");

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Falta ${name}.`);
  return value;
}

function normalizeEtag(value: unknown) {
  return String(value ?? "").replaceAll('"', "").trim().toLowerCase();
}

function storageMetadata(file: Record<string, unknown>, path: string): StorageObject {
  const metadata = (file.metadata ?? {}) as Record<string, unknown>;
  return {
    path,
    size: Number(metadata.size ?? 0),
    mime: String(metadata.mimetype ?? metadata.contentType ?? ""),
    etag: normalizeEtag(metadata.eTag ?? metadata.etag),
  };
}

async function listStorageObjects(client: SupabaseClient) {
  const objects: StorageObject[] = [];
  const { data: folders, error: folderError } = await client.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .list("products", { limit: 1000, sortBy: { column: "name", order: "asc" } });

  if (folderError) throw new Error(`No se pudo listar Storage: ${folderError.message}`);

  for (const folder of folders ?? []) {
    if (folder.id) {
      objects.push(storageMetadata(folder as unknown as Record<string, unknown>, `products/${folder.name}`));
      continue;
    }

    const prefix = `products/${folder.name}`;
    const { data: files, error } = await client.storage
      .from(PRODUCT_IMAGES_BUCKET)
      .list(prefix, { limit: 1000, sortBy: { column: "name", order: "asc" } });
    if (error) throw new Error(`No se pudo listar ${prefix}: ${error.message}`);

    for (const file of files ?? []) {
      if (!file.id) throw new Error(`Se encontro una carpeta inesperada dentro de ${prefix}.`);
      objects.push(
        storageMetadata(file as unknown as Record<string, unknown>, `${prefix}/${file.name}`),
      );
    }
  }

  return objects.sort((left, right) => left.path.localeCompare(right.path));
}

async function listProductImages(client: SupabaseClient) {
  const { data, error } = await client
    .from("product_images")
    .select("id,product_id,url,alt,sort_order,is_primary,created_at,updated_at")
    .order("product_id")
    .order("sort_order")
    .order("id");
  if (error) throw new Error(`No se pudieron leer product_images: ${error.message}`);
  return (data ?? []) as ProductImageMetadata[];
}

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: esperado ${String(expected)}, actual ${String(actual)}.`);
  }
}

function normalizedNullableNumber(value: number | string | null, label: string) {
  if (value === null || value === "") return null;
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) {
    throw new Error(`${label}: valor numerico invalido ${String(value)}.`);
  }
  return normalized;
}

function normalizedNullableBoolean(value: boolean | string | null, label: string) {
  if (value === null || value === "") return null;
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  throw new Error(`${label}: valor booleano invalido ${String(value)}.`);
}

function comparablePlanRow(row: ComparablePlanInput) {
  return {
    action: row.action,
    entity_type: row.entity_type,
    product_id: row.product_id,
    row_id: row.row_id,
    path: row.path,
    url: row.url,
    content_hash: row.content_hash,
    size: normalizedNullableNumber(row.size, `${row.path || row.row_id} size`),
    mime: row.mime,
    sort_order: normalizedNullableNumber(
      row.sort_order,
      `${row.path || row.row_id} sort_order`,
    ),
    is_primary: normalizedNullableBoolean(
      row.is_primary,
      `${row.path || row.row_id} is_primary`,
    ),
    keeper_row_id: row.keeper_row_id,
    keeper_path: row.keeper_path,
  };
}

function comparablePlan(plan: ComparablePlanInput[]) {
  return plan
    .map(comparablePlanRow)
    .sort((left, right) =>
      `${left.entity_type}|${left.row_id}|${left.path}`.localeCompare(
        `${right.entity_type}|${right.row_id}|${right.path}`,
      ),
    );
}

function validateCurrentState(
  snapshot: Snapshot,
  plan: ProductImageCleanupPlanRow[],
  images: ProductImageMetadata[],
  objects: StorageObject[],
) {
  assertEqual(snapshot.mode, "READ_ONLY", "Modo del snapshot");
  assertEqual(snapshot.bucket, PRODUCT_IMAGES_BUCKET, "Bucket del snapshot");
  assertProtectedProductImageReviews(plan);
  if (plan.some((row) => row.action === "DELETE_DB")) {
    throw new Error("El plan contiene DELETE_DB, una accion no autorizada para esta fase.");
  }
  assertEqual(
    JSON.stringify(comparablePlan(plan)),
    JSON.stringify(comparablePlan(snapshot.cleanup_plan)),
    "Plan CSV contra cleanup_plan del snapshot",
  );

  assertEqual(images.length, snapshot.totals.product_images_rows, "Cantidad de filas DB");
  assertEqual(objects.length, snapshot.totals.storage_objects, "Cantidad de objetos Storage");
  assertEqual(
    objects.reduce((total, object) => total + object.size, 0),
    snapshot.totals.storage_bytes,
    "Bytes en Storage",
  );

  const currentImages = new Map(images.map((image) => [image.id, image]));
  const currentObjects = new Map(objects.map((object) => [object.path, object]));
  const snapshotImageIds = new Set(snapshot.product_images.map((image) => image.id));
  const snapshotPaths = new Set(snapshot.storage_objects.map((object) => object.path));

  for (const image of images) {
    if (!snapshotImageIds.has(image.id)) throw new Error(`Fila DB nueva fuera del snapshot: ${image.id}.`);
  }
  for (const object of objects) {
    if (!snapshotPaths.has(object.path)) throw new Error(`Objeto nuevo fuera del snapshot: ${object.path}.`);
  }

  for (const expected of snapshot.product_images) {
    const current = currentImages.get(expected.id);
    if (!current) throw new Error(`Falta la fila DB del snapshot: ${expected.id}.`);
    assertEqual(current.product_id, expected.product_id, `${expected.id} product_id`);
    assertEqual(current.url, expected.url, `${expected.id} url`);
    assertEqual(current.sort_order, expected.sort_order, `${expected.id} sort_order`);
    assertEqual(current.is_primary, expected.is_primary, `${expected.id} is_primary`);
    assertEqual(current.created_at, expected.created_at, `${expected.id} created_at`);
    assertEqual(getProductImageStoragePath(current.url), expected.storage_path, `${expected.id} path`);
  }

  for (const expected of snapshot.storage_objects) {
    const current = currentObjects.get(expected.path);
    if (!current) throw new Error(`Falta el objeto Storage del snapshot: ${expected.path}.`);
    assertEqual(current.size, Number(expected.size), `${expected.path} size`);
    assertEqual(current.mime, expected.mime, `${expected.path} mime`);
    assertEqual(current.etag, normalizeEtag(expected.etag), `${expected.path} eTag`);
  }

  for (const row of plan) {
    const object = row.path ? currentObjects.get(row.path) : undefined;
    if (row.row_id) {
      const image = currentImages.get(row.row_id);
      if (!image) throw new Error(`Plan desactualizado: no existe row_id ${row.row_id}.`);
      assertEqual(image.product_id, row.product_id, `${row.row_id} product_id del plan`);
      assertEqual(image.url, row.url, `${row.row_id} url del plan`);
      assertEqual(image.sort_order, row.sort_order, `${row.row_id} sort_order del plan`);
      assertEqual(image.is_primary, row.is_primary, `${row.row_id} is_primary del plan`);
    }
    if (row.path) {
      if (!object) throw new Error(`Plan desactualizado: no existe ${row.path} en Storage.`);
      assertEqual(object.size, Number(row.size), `${row.path} size del plan`);
      assertEqual(object.mime, row.mime, `${row.path} mime del plan`);
      assertEqual(object.etag, normalizeEtag(row.content_hash), `${row.path} eTag del plan`);
    }
    if (row.action === "DELETE_BOTH") {
      const keeper = currentImages.get(row.keeper_row_id);
      const keeperObject = currentObjects.get(row.keeper_path);
      if (!keeper || !keeperObject) throw new Error(`Keeper ausente para ${row.row_id}.`);
      assertEqual(keeper.product_id, row.product_id, `${row.row_id} keeper product_id`);
      assertEqual(keeperObject.etag, normalizeEtag(row.content_hash), `${row.row_id} keeper eTag`);
      assertEqual(keeperObject.size, Number(row.size), `${row.row_id} keeper size`);
      assertEqual(keeperObject.mime, row.mime, `${row.row_id} keeper mime`);
    }
    if (row.action === "DELETE_STORAGE") {
      const references = images.filter(
        (image) => getProductImageStoragePath(image.url) === row.path || image.url === row.url,
      );
      if (references.length > 0) throw new Error(`${row.path} todavia tiene referencias DB.`);
    }
  }
}

async function validateProductImageCoherence(client: SupabaseClient) {
  const images = await listProductImages(client);
  const byProduct = new Map<string, ProductImageMetadata[]>();
  for (const image of images) {
    const productImages = byProduct.get(image.product_id) ?? [];
    productImages.push(image);
    byProduct.set(image.product_id, productImages);
  }
  for (const [productId, productImages] of byProduct) {
    const ordered = [...productImages].sort(
      (left, right) => left.sort_order - right.sort_order || left.id.localeCompare(right.id),
    );
    assertEqual(
      ordered.filter((image) => image.is_primary).length,
      1,
      `${productId} cantidad de principales`,
    );
    ordered.forEach((image, index) => assertEqual(image.sort_order, index, `${image.id} orden final`));
  }
}

const unknownArguments = process.argv.slice(2).filter((argument) => argument !== "--apply");
if (unknownArguments.length > 0) throw new Error(`Argumento desconocido: ${unknownArguments[0]}.`);
const apply = process.argv.includes("--apply");
const client = createClient(
  requiredEnvironment("NEXT_PUBLIC_SUPABASE_URL"),
  requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const [planCsv, snapshotJson, images, objects] = await Promise.all([
  readFile(PLAN_PATH, "utf8"),
  readFile(SNAPSHOT_PATH, "utf8"),
  listProductImages(client),
  listStorageObjects(client),
]);
const plan = parseProductImageCleanupPlanCsv(planCsv);
const snapshot = JSON.parse(snapshotJson) as Snapshot;
validateCurrentState(snapshot, plan, images, objects);

const summary = summarizeProductImageCleanupPlan(plan);
const expectedSummary = {
  KEEP: 55,
  DELETE_DB: 0,
  DELETE_STORAGE: 1,
  DELETE_BOTH: 27,
  REVIEW: 2,
} as const;
for (const [action, expected] of Object.entries(expectedSummary)) {
  assertEqual(
    summary[action as keyof typeof summary],
    expected,
    `Conteo ${action}`,
  );
}
console.log(apply ? "Modo: APPLY" : "Modo: DRY-RUN (sin escrituras)");
console.log(`KEEP: ${summary.KEEP}`);
console.log(`DELETE_BOTH: ${summary.DELETE_BOTH}`);
console.log(`DELETE_STORAGE: ${summary.DELETE_STORAGE}`);
console.log(`REVIEW protegido/excluido: ${summary.REVIEW}`);
console.log(`Operaciones de escritura propuestas: ${summary.DELETE_BOTH + summary.DELETE_STORAGE}`);

if (!apply) process.exit(0);

const gateway = createSupabaseProductImageDeleteGateway(client);
for (const row of plan) {
  if (row.action === "KEEP") continue;
  if (row.action === "REVIEW") {
    console.log(`REVIEW RECHAZADO/EXCLUIDO: ${row.product_id} / ${row.row_id}`);
    continue;
  }
  if (row.action === "DELETE_BOTH") {
    await deleteProductImageWithCompensation(gateway, {
      productId: row.product_id,
      imageId: row.row_id,
    });
    console.log(`DELETE_BOTH OK: ${row.row_id} / ${row.path}`);
    continue;
  }
  if (row.action === "DELETE_STORAGE") {
    const currentImages = await listProductImages(client);
    if (currentImages.some((image) => getProductImageStoragePath(image.url) === row.path)) {
      throw new Error(`ABORT: ${row.path} adquirio una referencia DB.`);
    }
    const { error } = await client.storage.from(PRODUCT_IMAGES_BUCKET).remove([row.path]);
    if (error) throw new Error(`No se pudo eliminar ${row.path}: ${error.message}`);
    console.log(`DELETE_STORAGE OK: ${row.path}`);
  }
}

await validateProductImageCoherence(client);
console.log("Limpieza aplicada y coherencia final verificada.");
