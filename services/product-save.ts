import "server-only";
import { createHash } from "node:crypto";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { PRODUCT_IMAGES_BUCKET } from "@/lib/products/product-image-deletion";
import { findMatchingStoredProductImage, type ProductImageOutputMimeType } from "@/lib/products/product-image-files";
import {
  saveProductWithRecovery,
  type AtomicProductImage,
  type AtomicProductPayload,
  type ProductSaveOperation,
  type ProductSavePlan,
  type ProductSaveRequest,
  type ProductUpload,
} from "@/lib/products/atomic-save";

export async function fingerprintProductSubmission(formData: FormData, files: File[]) {
  const hashes = await Promise.all(files.map(async (file) => ({
    hash: createHash("md5").update(Buffer.from(await file.arrayBuffer())).digest("hex"),
    size: file.size, mime: file.type, name: file.name,
  })));
  const fields = [...formData.entries()]
    .filter(([name, value]) => typeof value === "string" && !name.startsWith("$ACTION_") && name !== "operationKey")
    .sort(([a, av], [b, bv]) => a.localeCompare(b) || String(av).localeCompare(String(bv)));
  return createHash("sha256").update(JSON.stringify({ fields, hashes })).digest("hex");
}

function imageId(productId: string, hash: string) {
  const bytes = createHash("sha256").update(`${productId}:${hash}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function createProductSaveService(request: ProductSaveRequest, files: File[]) {
  const supabase = getSupabaseAdminClient();
  const bucket = supabase.storage.from(PRODUCT_IMAGES_BUCKET);
  const folder = `products/${request.productId}`;

  async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await supabase.rpc(name, args);
    if (error) throw new Error(error.message);
    return data as T;
  }

  async function objects() {
    const result = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await bucket.list(folder, { limit: 1000, offset, sortBy: { column: "name", order: "asc" } });
      if (error) throw new Error(error.message);
      result.push(...(data ?? []));
      if ((data?.length ?? 0) < 1000) return result;
    }
  }

  async function upload(upload: ProductUpload) {
    const file = files[upload.fileIndex];
    if (!file || file.size !== upload.size || file.type !== upload.mime ||
      createHash("md5").update(Buffer.from(await file.arrayBuffer())).digest("hex") !== upload.contentHash) {
      throw new Error("PRODUCT_UPLOAD_RETRY_CONTENT_CHANGED");
    }
    const name = upload.path.slice(folder.length + 1);
    async function alreadyStored() {
      const existing = (await objects()).find((item) => item.name === name);
      if (!existing) return false;
      if (!findMatchingStoredProductImage([existing], {
        contentHash: upload.contentHash, size: upload.size, mimeType: upload.mime as ProductImageOutputMimeType,
      })) throw new Error("PRODUCT_STORAGE_CONTENT_CONFLICT");
      return true;
    }
    if (await alreadyStored()) return;
    const { error } = await bucket.upload(upload.path, file, {
      cacheControl: "3600", upsert: false, contentType: upload.mime,
    });
    // Includes duplicate responses and an upload whose acknowledgement was lost.
    if (error && !(await alreadyStored())) throw new Error(error.message);
    if (!(await alreadyStored())) throw new Error("No se pudo verificar la imagen subida.");
  }

  async function buildImages(productName: string) {
    if (!files.length) return { images: null, uploads: [] };
    const { data, error } = await supabase.from("product_images")
      .select("id, url, alt, is_primary, sort_order, created_at").eq("product_id", request.productId)
      .order("sort_order").order("created_at").order("id");
    if (error) throw new Error(error.message);
    const images: AtomicProductImage[] = (data ?? []).map(({ id, url, alt, is_primary }) => ({ id, url, alt, is_primary }));
    const stored = await objects();
    const seen = new Set<string>();
    const uploads: ProductUpload[] = [];
    for (const [fileIndex, file] of files.entries()) {
      const contentHash = createHash("md5").update(Buffer.from(await file.arrayBuffer())).digest("hex");
      if (seen.has(contentHash)) continue;
      seen.add(contentHash);
      const existing = findMatchingStoredProductImage(stored, {
        contentHash, size: file.size, mimeType: file.type as ProductImageOutputMimeType,
      });
      const extension = file.type === "image/jpeg" ? "jpg" : file.type === "image/png" ? "png" : "webp";
      const path = `${folder}/${existing?.name ?? `${contentHash}.${extension}`}`;
      const { data: { publicUrl: url } } = bucket.getPublicUrl(path);
      if (images.some((image) => image.url === url)) continue;
      images.push({
        id: imageId(request.productId, contentHash), url, alt: productName,
        is_primary: images.length === 0, path, content_hash: contentHash, size: file.size, mime: file.type,
      });
      uploads.push({ path, contentHash, size: file.size, mime: file.type, fileIndex });
    }
    return { images, uploads };
  }

  const operationArgs = { p_operation_key: request.operationKey };
  return {
    buildImages,
    version: () => rpc<string | null>("get_product_save_version", { p_product_id: request.productId }),
    save: (buildPlan: () => Promise<ProductSavePlan>) => saveProductWithRecovery(request, {
      resolve: () => rpc<ProductSaveOperation>("resolve_product_save_operation", operationArgs),
      prepare: (plan) => rpc<ProductSaveOperation>("prepare_product_save_operation", {
        ...operationArgs, p_operation_type: request.operationType, p_product_id: request.productId,
        p_payload: plan.payload, p_expected_version: request.expectedVersion,
      }),
      persistPlan: async (plan) => {
        const { data, error } = await supabase.from("product_save_operations")
          .update({ recovery_metadata: plan }).eq("operation_key", request.operationKey)
          .eq("status", "prepared").eq("recovery_metadata", "{}")
          .select("recovery_metadata").maybeSingle();
        if (error) throw new Error(error.message);
        if (data) return data.recovery_metadata as ProductSavePlan;
        const existing = await rpc<ProductSaveOperation>("resolve_product_save_operation", operationArgs);
        if (!existing.recovery_metadata?.requestHash) throw new Error("No se pudo preservar la operacion para reintento.");
        return existing.recovery_metadata;
      },
      queueReconciliation: async (image) => {
        await rpc("enqueue_product_storage_task", {
          ...operationArgs, p_product_id: request.productId, p_action: "reconcile", p_storage_path: image.path,
          p_expected_metadata: { path: image.path, content_hash: image.contentHash, size: image.size, mime: image.mime },
        });
      },
      upload,
      commit: (plan) => rpc(request.operationType === "create_product" ? "create_product_atomic" : "update_product_atomic", {
        ...operationArgs, p_product_id: request.productId, p_payload: plan.payload as AtomicProductPayload,
        ...(request.operationType === "update_product" ? { p_expected_version: request.expectedVersion } : {}),
      }),
      abort: async () => { await rpc("abort_product_save_operation", operationArgs); },
    }, buildPlan),
  };
}
