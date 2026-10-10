import type { SupabaseClient } from "@supabase/supabase-js";

export const PRODUCT_IMAGES_BUCKET = "product-images";

export type ProductImageMetadata = {
  id: string;
  product_id: string;
  url: string;
  alt: string | null;
  sort_order: number;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
};

type DeletedProductImageMetadata = ProductImageMetadata & {
  remaining_images: number;
  remaining_url_references: number;
};

export type ProductImageDeleteGateway = {
  readImage(productId: string, imageId: string): Promise<ProductImageMetadata | null>;
  findOtherReferences(imageId: string, url: string, storagePath: string | null): Promise<string[]>;
  deleteMetadata(productId: string, imageId: string, image: ProductImageMetadata): Promise<DeletedProductImageMetadata>;
  restoreMetadata(image: ProductImageMetadata): Promise<void>;
  removeStorageObject(storagePath: string): Promise<void>;
};

export type ProductImageDeleteResult = {
  imageId: string;
  productId: string;
  storagePath: string | null;
  storageDeleted: boolean;
  storagePreservedForSharedReference: boolean;
  storageRetainedForDeferredCleanup: boolean;
  remainingImages: number;
};

export function getProductImageStoragePath(url: string) {
  const marker = `/${PRODUCT_IMAGES_BUCKET}/`;
  const markerIndex = url.indexOf(marker);

  if (markerIndex === -1) {
    return null;
  }

  const path = decodeURIComponent(url.slice(markerIndex + marker.length).split(/[?#]/)[0]);
  if (!path || /(^\/|(^|\/)\.\.?(\/|$)|[?#\\])/.test(path)) throw new Error("Ruta Storage invalida.");
  return path;
}

function asDeletedMetadata(value: unknown): DeletedProductImageMetadata {
  if (!value || typeof value !== "object") {
    throw new Error("Supabase no devolvio los metadatos de la imagen eliminada.");
  }

  return value as DeletedProductImageMetadata;
}

export async function deleteProductImageWithCompensation(
  gateway: ProductImageDeleteGateway,
  input: { productId: string; imageId: string },
): Promise<ProductImageDeleteResult> {
  const image = await gateway.readImage(input.productId, input.imageId);

  if (!image) {
    throw new Error("La imagen no pertenece a este producto.");
  }

  const storagePath = getProductImageStoragePath(image.url);
  const referencesBeforeDelete = await gateway.findOtherReferences(
    image.id,
    image.url,
    storagePath,
  );
  const deleted = await gateway.deleteMetadata(input.productId, input.imageId, image);

  if (
    deleted.id !== image.id ||
    deleted.product_id !== image.product_id ||
    deleted.url !== image.url
  ) {
    try {
      await gateway.restoreMetadata(image);
    } catch (restoreError) {
      console.error("[product-images] Metadata inconsistente y restauracion fallida", {
        productId: input.productId,
        imageId: input.imageId,
        storagePath,
        restoreError,
      });
    }
    throw new Error("La eliminacion devolvio metadatos inconsistentes y fue abortada.");
  }

  let referencesAfterDelete: string[];
  try {
    referencesAfterDelete = await gateway.findOtherReferences(
      image.id,
      image.url,
      storagePath,
    );
  } catch (referenceError) {
    try {
      await gateway.restoreMetadata(image);
    } catch (restoreError) {
      console.error("[product-images] Reconciliacion manual requerida", {
        productId: input.productId,
        imageId: input.imageId,
        storagePath,
        referenceError,
        restoreError,
      });
      throw new Error(
        "No se pudieron verificar las referencias ni restaurar la imagen. Se requiere reconciliacion manual.",
      );
    }

    throw new Error(
      "No se pudieron verificar las referencias compartidas. La imagen fue restaurada y no se completo la eliminacion.",
    );
  }
  const hasSharedReference =
    referencesBeforeDelete.length > 0 ||
    referencesAfterDelete.length > 0 ||
    Number(deleted.remaining_url_references) > 0;

  if (!storagePath || hasSharedReference) {
    return {
      imageId: image.id,
      productId: image.product_id,
      storagePath,
      storageDeleted: false,
      storagePreservedForSharedReference: hasSharedReference,
      storageRetainedForDeferredCleanup: Boolean(storagePath),
      remainingImages: Number(deleted.remaining_images),
    };
  }

  // The durable metadata RPC queued reconciliation in the same transaction.
  // Retain the object: reference checks cannot make a later Storage DELETE atomic.
  return {
    imageId: image.id,
    productId: image.product_id,
    storagePath,
    storageDeleted: false,
    storagePreservedForSharedReference: false,
    storageRetainedForDeferredCleanup: true,
    remainingImages: Number(deleted.remaining_images),
  };
}

export function createSupabaseProductImageDeleteGateway(
  supabase: SupabaseClient,
): ProductImageDeleteGateway {
  return {
    async readImage(productId, imageId) {
      const { data, error } = await supabase
        .from("product_images")
        .select(
          "id, product_id, url, alt, sort_order, is_primary, created_at, updated_at",
        )
        .eq("id", imageId)
        .eq("product_id", productId)
        .maybeSingle();

      if (error) throw new Error(error.message);
      return data as ProductImageMetadata | null;
    },

    async findOtherReferences(imageId, url, storagePath) {
      const { data, error } = await supabase
        .from("product_images")
        .select("id, url")
        .neq("id", imageId);

      if (error) throw new Error(error.message);

      return (data ?? [])
        .filter((row) => {
          if (row.url === url) return true;
          return Boolean(
            storagePath && getProductImageStoragePath(String(row.url ?? "")) === storagePath,
          );
        })
        .map((row) => String(row.id));
    },

    async deleteMetadata(productId, imageId, image) {
      const { data, error } = await supabase.rpc("delete_product_image_metadata_and_queue", {
        p_product_id: productId,
        p_image_id: imageId,
        p_expected_url: image.url,
        p_storage_path: getProductImageStoragePath(image.url),
      });

      if (error) throw new Error(error.message);
      return asDeletedMetadata(Array.isArray(data) ? data[0] : data);
    },

    async restoreMetadata(image) {
      const { error } = await supabase.rpc("restore_product_image_metadata", {
        p_id: image.id,
        p_product_id: image.product_id,
        p_url: image.url,
        p_alt: image.alt,
        p_sort_order: image.sort_order,
        p_is_primary: image.is_primary,
        p_created_at: image.created_at,
        p_updated_at: image.updated_at,
      });

      if (error) throw new Error(error.message);
    },

    async removeStorageObject() {
      // Also protects legacy cleanup callers of this shared gateway.
      throw new Error("STORAGE_CONDITIONAL_DELETE_UNAVAILABLE");
    },
  };
}
