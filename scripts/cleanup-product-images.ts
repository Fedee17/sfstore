import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  PRODUCT_IMAGES_BUCKET,
  createSupabaseProductImageDeleteGateway,
  getProductImageStoragePath,
  type ProductImageMetadata,
  type ProductImageDeleteGateway,
} from "../lib/products/product-image-deletion.ts";
import {
  assertProtectedProductImageReviews,
  PROTECTED_YARA_ROSA_PRODUCT_IDS,
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
    alt: string | null;
    updated_at: string;
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

function validateApprovedPlan(snapshot: Snapshot, plan: ProductImageCleanupPlanRow[]) {
  assertEqual(snapshot.mode, "READ_ONLY", "Modo del snapshot");
  assertEqual(snapshot.bucket, PRODUCT_IMAGES_BUCKET, "Bucket del snapshot");
  assertProtectedProductImageReviews(plan);
  assertEqual(
    JSON.stringify(comparablePlan(plan)),
    JSON.stringify(comparablePlan(snapshot.cleanup_plan)),
    "Plan CSV contra cleanup_plan del snapshot",
  );
  const summary = summarizeProductImageCleanupPlan(plan);
  const expectedSummary = { KEEP: 55, DELETE_DB: 0, DELETE_STORAGE: 1, DELETE_BOTH: 27, REVIEW: 2 };
  for (const [action, expected] of Object.entries(expectedSummary)) {
    assertEqual(summary[action as keyof typeof summary], expected, `Conteo aprobado ${action}`);
  }
  for (const row of plan.filter(isDestructive)) {
    const keeper = plan.find((item) => item.row_id === row.keeper_row_id);
    if (
      PROTECTED_YARA_ROSA_PRODUCT_IDS.has(row.product_id) ||
      !keeper || keeper.action !== "KEEP" ||
      PROTECTED_YARA_ROSA_PRODUCT_IDS.has(keeper.product_id) ||
      keeper.product_id !== row.product_id || keeper.path !== row.keeper_path ||
      row.path === row.keeper_path || !row.path.startsWith(`products/${row.product_id}/`)
    ) {
      throw new Error(`Accion destructiva no autorizada o REVIEW involucrado: ${row.row_id || row.path}.`);
    }
  }
}

function isDestructive(row: ProductImageCleanupPlanRow) {
  return row.action === "DELETE_BOTH" || row.action === "DELETE_STORAGE";
}

type CleanupProgress = { rowIds: Set<string>; paths: Set<string> };
type CleanupState = { images: ProductImageMetadata[]; objects: StorageObject[] };

function expectedState(snapshot: Snapshot, progress: CleanupProgress) {
  let images = snapshot.product_images.map((image) => ({ ...image }));
  const normalizedIds = new Set<string>();
  // Model only the ordering/primary changes performed by the existing metadata RPC.
  for (const rowId of progress.rowIds) {
    const deleted = images.find((image) => image.id === rowId);
    if (!deleted) throw new Error(`Progreso no autorizado: ${rowId}.`);
    images = images.filter((image) => image.id !== rowId);
    const remaining = images.filter((image) => image.product_id === deleted.product_id).sort(
      (left, right) => left.sort_order - right.sort_order ||
        left.created_at.localeCompare(right.created_at) || left.id.localeCompare(right.id),
    );
    remaining.forEach((image, index) => {
      if (image.sort_order !== index || image.is_primary !== (index === 0)) normalizedIds.add(image.id);
      image.sort_order = index;
      image.is_primary = index === 0;
    });
  }
  return {
    images,
    normalizedIds,
    objects: snapshot.storage_objects.filter((object) => !progress.paths.has(object.path)),
  };
}

function validateProgress(
  snapshot: Snapshot,
  plan: ProductImageCleanupPlanRow[],
  images: ProductImageMetadata[],
  objects: StorageObject[],
  progress: CleanupProgress,
) {
  validateApprovedPlan(snapshot, plan);
  const expected = expectedState(snapshot, progress);
  const currentImages = new Map(images.map((image) => [image.id, image]));
  const currentObjects = new Map(objects.map((object) => [object.path, object]));
  const snapshotImageIds = new Set(expected.images.map((image) => image.id));
  const snapshotPaths = new Set(expected.objects.map((object) => object.path));

  for (const image of images) {
    if (!snapshotImageIds.has(image.id)) throw new Error(`Fila DB inesperada: ${image.id}.`);
  }
  for (const object of objects) {
    if (!snapshotPaths.has(object.path)) throw new Error(`Objeto Storage inesperado: ${object.path}.`);
  }

  for (const image of expected.images) {
    const current = currentImages.get(image.id);
    if (!current) throw new Error(`Falta la fila DB esperada: ${image.id}.`);
    for (const field of ["product_id", "url", "alt", "sort_order", "is_primary", "created_at"] as const) {
      assertEqual(current[field], image[field], `${image.id} ${field}`);
    }
    if (!expected.normalizedIds.has(image.id)) {
      assertEqual(current.updated_at, image.updated_at, `${image.id} updated_at`);
    }
    assertEqual(getProductImageStoragePath(current.url), image.storage_path, `${image.id} path`);
  }

  for (const object of expected.objects) {
    const current = currentObjects.get(object.path);
    if (!current) throw new Error(`Falta el objeto Storage esperado: ${object.path}.`);
    assertEqual(current.size, Number(object.size), `${object.path} size`);
    assertEqual(current.mime, object.mime, `${object.path} MIME`);
    assertEqual(normalizeEtag(current.etag), normalizeEtag(object.etag), `${object.path} eTag`);
  }
  assertEqual(images.length, expected.images.length, "Cantidad de filas DB");
  assertEqual(objects.length, expected.objects.length, "Cantidad de objetos Storage");
  assertEqual(currentImages.size, images.length, "IDs DB unicos");
  assertEqual(currentObjects.size, objects.length, "Paths Storage unicos");
}

function validateOperation(row: ProductImageCleanupPlanRow, state: CleanupState, metadataDeleted = false) {
  const image = state.images.find((item) => item.id === row.row_id);
  const object = state.objects.find((item) => item.path === row.path);
  const keeper = state.images.find((item) => item.id === row.keeper_row_id);
  const keeperObject = state.objects.find((item) => item.path === row.keeper_path);
  if (!isDestructive(row) || PROTECTED_YARA_ROSA_PRODUCT_IDS.has(row.product_id)) {
    throw new Error(`REVIEW/accion no autorizada: ${row.product_id}.`);
  }
  if (row.action === "DELETE_BOTH" && !metadataDeleted) {
    if (!image) throw new Error(`Candidato DB ausente: ${row.row_id}.`);
    assertEqual(image.product_id, row.product_id, `${row.row_id} product_id del plan`);
    assertEqual(image.url, row.url, `${row.row_id} URL del plan`);
    assertEqual(getProductImageStoragePath(image.url), row.path, `${row.row_id} path del plan`);
  } else if (image) {
    throw new Error(`Candidato DB inesperado despues del borrado: ${row.row_id}.`);
  }
  if (!object || !keeper || !keeperObject) {
    throw new Error(`Candidato/keeper Storage o DB ausente: ${row.row_id || row.path}.`);
  }
  if (PROTECTED_YARA_ROSA_PRODUCT_IDS.has(keeper.product_id)) throw new Error("Keeper REVIEW protegido.");
  assertEqual(keeper.product_id, row.product_id, `${row.row_id || row.path} keeper product_id`);
  assertEqual(getProductImageStoragePath(keeper.url), row.keeper_path, `${row.row_id || row.path} keeper path`);
  for (const [label, item] of [["candidato", object], ["keeper", keeperObject]] as const) {
    assertEqual(normalizeEtag(item.etag), normalizeEtag(row.content_hash), `${row.path} ${label} eTag`);
    assertEqual(item.size, Number(row.size), `${row.path} ${label} size`);
    assertEqual(item.mime, row.mime, `${row.path} ${label} MIME`);
  }
  const references = state.images.filter((item) =>
    (getProductImageStoragePath(item.url) === row.path || (row.url && item.url === row.url)) &&
    (metadataDeleted || row.action === "DELETE_STORAGE" || item.id !== row.row_id),
  );
  if (references.length) throw new Error(`${row.path} tiene referencias DB no autorizadas.`);
}

export function validateCurrentState(
  snapshot: Snapshot,
  plan: ProductImageCleanupPlanRow[],
  images: ProductImageMetadata[],
  objects: StorageObject[],
) {
  validateApprovedPlan(snapshot, plan);
  const destructive = plan.filter(isDestructive);
  const present = destructive.map((row) => objects.some((object) => object.path === row.path) &&
    (row.action === "DELETE_STORAGE" || images.some((image) => image.id === row.row_id)));
  const absent = destructive.map((row) => !objects.some((object) => object.path === row.path) &&
    (row.action === "DELETE_STORAGE" || !images.some((image) => image.id === row.row_id)));
  const phase = present.every(Boolean) ? "PRE-CLEANUP" : absent.every(Boolean) ? "POST-CLEANUP" : null;
  if (!phase) throw new Error("Estado parcial/inconsistente: no es PRE-CLEANUP ni POST-CLEANUP. ABORT.");
  const progress: CleanupProgress = {
    rowIds: new Set(phase === "POST-CLEANUP" ? destructive.filter((row) => row.row_id).map((row) => row.row_id) : []),
    paths: new Set(phase === "POST-CLEANUP" ? destructive.map((row) => row.path) : []),
  };
  validateProgress(snapshot, plan, images, objects, progress);
  if (phase === "PRE-CLEANUP") {
    for (const row of destructive) validateOperation(row, { images, objects });
  }
  const summary = summarizeProductImageCleanupPlan(plan);
  if (phase === "POST-CLEANUP") { summary.DELETE_BOTH = 0; summary.DELETE_STORAGE = 0; }
  return { phase, summary, writesProposed: summary.DELETE_BOTH + summary.DELETE_STORAGE };
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

export async function runProductImageCleanup(input: {
  snapshot: Snapshot;
  plan: ProductImageCleanupPlanRow[];
  apply: boolean;
  readState(): Promise<CleanupState>;
  gateway: ProductImageDeleteGateway;
  log(message: string): void;
}) {
  const { snapshot, plan, apply, readState, log } = input;
  const { images, objects } = await readState();
  const result = validateCurrentState(snapshot, plan, images, objects);
  const { summary } = result;
  log(apply ? "Modo: APPLY" : "Modo: DRY-RUN (sin escrituras)");
  log(`Estado: ${result.phase}`);
  log(`KEEP: ${summary.KEEP}`);
  log(`DELETE_BOTH: ${summary.DELETE_BOTH}`);
  log(`DELETE_STORAGE: ${summary.DELETE_STORAGE}`);
  log(`REVIEW protegido/excluido: ${summary.REVIEW}`);
  log(`writes proposed = ${result.writesProposed}`);
  if (!apply || result.phase === "POST-CLEANUP") {
    if (apply) log("NO-OP seguro: limpieza ya completada. Sin escrituras.");
    return result;
  }
  // Neither a plan approval nor repeated inspection is a conditional DELETE.
  // Fail before metadata writes as well: legacy cleanup must not leave partial work.
  throw new Error("STORAGE_CLEANUP_APPLY_DISABLED: conditional deletion required");

}

async function main() {
  const unknownArguments = process.argv.slice(2).filter((argument) => argument !== "--apply");
  if (unknownArguments.length > 0) throw new Error(`Argumento desconocido: ${unknownArguments[0]}.`);
  const apply = process.argv.includes("--apply");
  if (apply) throw new Error("STORAGE_CLEANUP_APPLY_DISABLED: conditional deletion required");
  const client = createClient(
    requiredEnvironment("NEXT_PUBLIC_SUPABASE_URL"), requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const [planCsv, snapshotJson] = await Promise.all([
    readFile(PLAN_PATH, "utf8"), readFile(SNAPSHOT_PATH, "utf8"),
  ]);
  const result = await runProductImageCleanup({
    snapshot: JSON.parse(snapshotJson) as Snapshot,
    plan: parseProductImageCleanupPlanCsv(planCsv),
    apply,
    async readState() {
      const [images, objects] = await Promise.all([listProductImages(client), listStorageObjects(client)]);
      return { images, objects };
    },
    gateway: createSupabaseProductImageDeleteGateway(client),
    log: console.log,
  });
  if (apply && result.phase === "POST-CLEANUP") await validateProductImageCoherence(client);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await main();
}
