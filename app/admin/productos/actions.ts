"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminActionSession } from "@/lib/admin-session";
import {
  getAllowedValuesForField,
  getAttributeFieldsForCategory,
  getCatalogAttributeInputName,
  LEGACY_COMMERCIAL_CATEGORY_NAME,
  MANAGED_CATALOG_ATTRIBUTE_KEYS,
} from "@/lib/catalog/attribute-config";
import { PRODUCT_ATTRIBUTE_NAMES } from "@/lib/product-taxonomy";
import {
  applyAutoDescriptionFallbacks,
  getAutoDescriptions,
  type ProductCategoryInfo,
} from "@/lib/products/auto-descriptions";
import { slugifyProductValue } from "@/lib/products/slug";
import {
  MAX_PRODUCT_IMAGE_UPLOAD_BYTES,
  PRODUCT_IMAGE_OUTPUT_MIME_TYPES,
  detectProductImageOutputMimeType,
  findMatchingStoredProductImage,
} from "@/lib/products/product-image-files";
import {
  PRODUCT_STATUSES,
  assertProductStatusTransition,
  shouldClearCostSource,
  type ProductStatus,
} from "@/lib/products/admin-product-policy";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { adjustInventoryStock } from "@/services/inventory";

const PRODUCT_IMAGES_BUCKET = "product-images";

type PersistedProductState = {
  id: string;
  status: ProductStatus;
  updatedAt: string;
  slug: string;
  categoryId: string;
};

export type ProductFormActionState = {
  status: "idle" | "success" | "error";
  message: string;
  productId?: string;
  submissionId?: string;
  persistedProduct?: PersistedProductState;
};

function productFormErrorState(error: unknown): ProductFormActionState {
  return {
    status: "error",
    message:
      error instanceof Error
        ? error.message
        : "No se pudieron guardar los cambios del producto.",
  };
}

function parseMoney(value: FormDataEntryValue | null, fieldName: string) {
  const normalized = String(value ?? "").replace(",", ".").trim();
  const number = normalized === "" ? 0 : Number(normalized);

  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`${fieldName} debe ser mayor o igual a 0.`);
  }

  return number;
}

function parseOptionalMoney(value: FormDataEntryValue | null, fieldName: string) {
  const normalized = String(value ?? "").replace(",", ".").trim();

  if (!normalized) {
    return null;
  }

  const number = Number(normalized);

  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`${fieldName} debe ser mayor o igual a 0.`);
  }

  return number;
}

function parseStock(value: FormDataEntryValue | null) {
  const normalized = String(value ?? "").trim();
  const number = Number(normalized);

  if (!normalized || !Number.isInteger(number) || number < 0) {
    throw new Error("Stock debe ser un numero entero mayor o igual a 0.");
  }

  return number;
}

function readProductForm(formData: FormData) {
  const productId = String(formData.get("productId") ?? "");
  const categoryId = String(formData.get("categoryId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const slugInput = String(formData.get("slug") ?? "").trim();
  const slug = slugifyProductValue(slugInput || name);
  const shortDescription = String(formData.get("shortDescription") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const sku = String(formData.get("sku") ?? "").trim();
  const status = String(formData.get("status") ?? "draft");

  if (!categoryId) {
    throw new Error("Categoria es requerida.");
  }

  if (!name) {
    throw new Error("Nombre es requerido.");
  }

  if (!slug) {
    throw new Error("Slug es requerido.");
  }

  if (!PRODUCT_STATUSES.includes(status as (typeof PRODUCT_STATUSES)[number])) {
    throw new Error("Estado de producto invalido.");
  }

  return {
    productId,
    product: {
      category_id: categoryId,
      name,
      slug,
      short_description: shortDescription,
      description: description || null,
      price: parseMoney(formData.get("price"), "Precio"),
      transfer_price: parseOptionalMoney(
        formData.get("transferPrice"),
        "Precio especial transferencia/efectivo",
      ),
      compare_at_price: parseOptionalMoney(
        formData.get("compareAtPrice"),
        "Precio comparativo",
      ),
      cost: parseOptionalMoney(formData.get("cost"), "Costo"),
      sku: sku || null,
      featured: formData.get("featured") === "on",
      status: status as ProductStatus,
    },
    brand: String(formData.get("brand") ?? "").trim(),
    type: String(formData.get("type") ?? "").trim(),
  };
}

async function getProductCategoryInfo(
  categoryId: string,
): Promise<ProductCategoryInfo | null> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("categories")
    .select("name, slug")
    .eq("id", categoryId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as ProductCategoryInfo | null;
}

async function applyDescriptionFallbacks(
  payload: ReturnType<typeof readProductForm>,
) {
  const category = await getProductCategoryInfo(payload.product.category_id);
  const autoDescriptions = getAutoDescriptions({
    name: payload.product.name,
    category,
    brand: payload.brand,
    type: payload.type,
    price: payload.product.price,
    transferPrice: payload.product.transfer_price,
  });

  // La autodescripcion se usa solo como fallback; el admin siempre puede editarla manualmente.
  return applyAutoDescriptionFallbacks(payload.product, autoDescriptions);
}

async function replaceSimpleAttributes(
  productId: string,
  attributes: { brand: string; type: string },
) {
  type AttributeRow = {
    id: string;
    product_id: string;
    name: string;
    value: string;
    sort_order: number;
  };

  const supabase = getSupabaseAdminClient();

  const { error: deleteError } = await supabase
    .from("product_attributes")
    .delete()
    .eq("product_id", productId)
    .in("name", [
      PRODUCT_ATTRIBUTE_NAMES.brand,
      PRODUCT_ATTRIBUTE_NAMES.type,
    ]);

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  const rows: AttributeRow[] = [];

  if (attributes.brand) {
    rows.push({
      id: crypto.randomUUID(),
      product_id: productId,
      name: PRODUCT_ATTRIBUTE_NAMES.brand,
      value: attributes.brand,
      sort_order: 10,
    });
  }

  if (attributes.type) {
    rows.push({
      id: crypto.randomUUID(),
      product_id: productId,
      name: PRODUCT_ATTRIBUTE_NAMES.type,
      value: attributes.type,
      sort_order: 20,
    });
  }

  if (rows.length === 0) {
    return;
  }

  const { error: insertError } = await supabase
    .from("product_attributes")
    .insert(rows);

  if (insertError) {
    throw new Error(insertError.message);
  }
}

async function replaceCatalogAttributes(
  productId: string,
  categorySlug: string,
  formData: FormData,
) {
  const supabase = getSupabaseAdminClient();
  const fields = getAttributeFieldsForCategory(categorySlug);
  const rows: {
    id: string;
    product_id: string;
    name: string;
    value: string;
    sort_order: number;
  }[] = [];

  for (const [fieldIndex, field] of fields.entries()) {
    const inputName = getCatalogAttributeInputName(field.key);
    const submittedValues = field.input === "boolean"
      ? [formData.get(inputName) === "true" ? "true" : "false"]
      : formData
          .getAll(inputName)
          .map((value) => String(value).trim())
          .filter(Boolean);
    const values = [...new Set(submittedValues)];

    if (!field.multiple && values.length > 1) {
      throw new Error(`El atributo ${field.label} admite un solo valor.`);
    }

    if (field.input !== "boolean") {
      const allowedValues = getAllowedValuesForField(field);
      const invalidValue = values.find((value) => !allowedValues.has(value));

      if (invalidValue) {
        throw new Error(`Valor inválido para ${field.label}.`);
      }
    }

    values.forEach((value, valueIndex) => {
      rows.push({
        id: crypto.randomUUID(),
        product_id: productId,
        name: field.key,
        value,
        sort_order: 100 + fieldIndex * 10 + valueIndex,
      });
    });
  }

  const { error: deleteError } = await supabase
    .from("product_attributes")
    .delete()
    .eq("product_id", productId)
    .in("name", [
      ...MANAGED_CATALOG_ATTRIBUTE_KEYS,
      LEGACY_COMMERCIAL_CATEGORY_NAME,
    ]);

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  if (rows.length === 0) {
    return;
  }

  const { error: insertError } = await supabase
    .from("product_attributes")
    .insert(rows);

  if (insertError) {
    throw new Error(insertError.message);
  }
}
function revalidateProductPaths({
  productId,
  slug,
  previousSlug,
  categorySlugs,
}: {
  productId: string;
  slug: string;
  previousSlug?: string;
  categorySlugs: Array<string | null | undefined>;
}) {
  const paths = new Set([
    "/admin/productos",
    `/admin/productos/${productId}/editar`,
    "/admin/consulta",
    "/",
    "/sitemap.xml",
    `/producto/${slug}`,
  ]);

  if (previousSlug && previousSlug !== slug) {
    paths.add(`/producto/${previousSlug}`);
  }

  for (const categorySlug of categorySlugs) {
    if (!categorySlug) {
      continue;
    }

    paths.add(categorySlug === "perfumes" ? "/perfumes" : "/mates");
  }

  for (const path of paths) {
    revalidatePath(path);
  }
}

function sanitizeFileName(fileName: string) {
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "jpg";
  const baseName = fileName
    .replace(/\.[^/.]+$/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `${baseName || "image"}.${extension}`;
}

function getProductImageId(productId: string, contentHash: string) {
  const bytes = createHash("sha256")
    .update(`${productId}:${contentHash}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function getProductImageFiles(formData: FormData) {
  const files = [
    ...formData.getAll("productImages"),
    formData.get("primaryImage"),
  ];

  return files.filter((file): file is File => {
    if (!(file instanceof File) || file.size === 0) {
      return false;
    }

    if (
      !PRODUCT_IMAGE_OUTPUT_MIME_TYPES.includes(
        file.type as (typeof PRODUCT_IMAGE_OUTPUT_MIME_TYPES)[number],
      )
    ) {
      throw new Error("Las imágenes deben llegar convertidas a JPG, PNG o WebP.");
    }

    if (file.size > MAX_PRODUCT_IMAGE_UPLOAD_BYTES) {
      throw new Error("Cada imagen debe pesar como máximo 5 MB después de optimizarse.");
    }

    return true;
  });
}

async function validateProductImageContents(files: File[]) {
  for (const file of files) {
    const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    const detectedType = detectProductImageOutputMimeType(header);

    if (!detectedType || detectedType !== file.type) {
      throw new Error("Una imagen no coincide con su formato JPG, PNG o WebP declarado.");
    }
  }
}

async function ensureProductImagesBucket() {
  const supabase = getSupabaseAdminClient();
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();

  if (listError) {
    throw new Error(listError.message);
  }

  const exists = buckets?.some((bucket) => bucket.name === PRODUCT_IMAGES_BUCKET);

  if (exists) {
    return;
  }

  const { error: createError } = await supabase.storage.createBucket(
    PRODUCT_IMAGES_BUCKET,
    {
      public: true,
      fileSizeLimit: "5MB",
      allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
    },
  );

  if (createError) {
    throw new Error(createError.message);
  }
}

async function uploadProductImages(
  productId: string,
  productName: string,
  files: File[],
) {
  if (files.length === 0) {
    return;
  }

  await validateProductImageContents(files);

  await ensureProductImagesBucket();

  const supabase = getSupabaseAdminClient();
  const { data: currentImages, error: readError } = await supabase
    .from("product_images")
    .select("id, url, sort_order, is_primary")
    .eq("product_id", productId)
    .order("sort_order", { ascending: true });

  if (readError) {
    throw new Error(readError.message);
  }

  const existingImages = currentImages ?? [];
  const existingImageUrls = new Set(existingImages.map((image) => image.url));
  const hasPrimary = existingImages.some((image) => image.is_primary);
  const lastSortOrder = existingImages.reduce(
    (max, image) => Math.max(max, Number(image.sort_order ?? 0)),
    -1,
  );

  const imageRows = [];
  const uploadedPaths: string[] = [];
  const folderPath = `products/${productId}`;

  const { data: storedObjects, error: storageReadError } = await supabase.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .list(folderPath, { limit: 1000 });

  if (storageReadError) {
    throw new Error(storageReadError.message);
  }

  try {
    for (const file of files) {
      const fileBytes = Buffer.from(await file.arrayBuffer());
      const contentHash = createHash("md5").update(fileBytes).digest("hex");
      const matchingObject = findMatchingStoredProductImage(storedObjects ?? [], {
        contentHash,
        mimeType: file.type as (typeof PRODUCT_IMAGE_OUTPUT_MIME_TYPES)[number],
        size: file.size,
      });
      const objectName =
        matchingObject?.name ?? `${contentHash}-${sanitizeFileName(file.name)}`;
      const filePath = `${folderPath}/${objectName}`;

      if (!matchingObject) {
        const { error: uploadError } = await supabase.storage
          .from(PRODUCT_IMAGES_BUCKET)
          .upload(filePath, file, {
            cacheControl: "3600",
            upsert: false,
            contentType: file.type,
          });

        if (uploadError && !/already exists|duplicate/i.test(uploadError.message)) {
          throw new Error(uploadError.message);
        }

        if (!uploadError) {
          uploadedPaths.push(filePath);
        }
      }

      const { data } = supabase.storage
        .from(PRODUCT_IMAGES_BUCKET)
        .getPublicUrl(filePath);

      if (existingImageUrls.has(data.publicUrl)) {
        continue;
      }

      existingImageUrls.add(data.publicUrl);

      imageRows.push({
        id: getProductImageId(productId, contentHash),
        product_id: productId,
        url: data.publicUrl,
        alt: productName,
        sort_order: lastSortOrder + imageRows.length + 1,
        is_primary: !hasPrimary && imageRows.length === 0,
      });
    }

    if (imageRows.length === 0) {
      return;
    }

    const { error: imageError } = await supabase
      .from("product_images")
      .upsert(imageRows, { onConflict: "id", ignoreDuplicates: true });

    if (imageError) {
      throw new Error(imageError.message);
    }
  } catch (error) {
    if (uploadedPaths.length > 0) {
      const { error: cleanupError } = await supabase.storage
        .from(PRODUCT_IMAGES_BUCKET)
        .remove(uploadedPaths);
      if (cleanupError) {
        console.warn("[product-images] Fallo la limpieza compensatoria", {
          productId,
          fileCount: uploadedPaths.length,
          message: cleanupError.message,
        });
      }
    }
    throw new Error(
      error instanceof Error
        ? `No se pudieron guardar todas las imagenes: ${error.message}`
        : "No se pudieron guardar todas las imagenes.",
    );
  }
}

type OperationalProductSnapshot = {
  id: string;
  slug: string;
  status: ProductStatus;
  category_id: string;
  cost: number | null;
  cost_source_purchase_item_id: string | null;
  historical_identity: boolean;
};

async function assertOperationalProduct(productId: string) {
  const { data, error } = await getSupabaseAdminClient()
    .from("products")
    .select(
      "id, slug, status, category_id, cost, cost_source_purchase_item_id, historical_identity",
    )
    .eq("id", productId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("El producto no existe.");
  }

  if (data.historical_identity) {
    throw new Error("Las identidades historicas no admiten modificaciones operativas.");
  }

  return data as OperationalProductSnapshot;
}

function persistedProductState(row: {
  id: string;
  status: string;
  updated_at: string;
  slug: string;
  category_id: string;
}): PersistedProductState {
  return {
    id: row.id,
    status: row.status as ProductStatus,
    updatedAt: row.updated_at,
    slug: row.slug,
    categoryId: row.category_id,
  };
}

async function revalidateOperationalProductPaths(
  product: OperationalProductSnapshot,
) {
  const category = await getProductCategoryInfo(product.category_id);
  revalidateProductPaths({
    productId: product.id,
    slug: product.slug,
    categorySlugs: [category?.slug],
  });
}

export async function createProduct(
  _previousState: ProductFormActionState,
  formData: FormData,
): Promise<ProductFormActionState> {
  try {
    await requireAdminActionSession();
    const payload = readProductForm(formData);
    const productId = crypto.randomUUID();
    const supabase = getSupabaseAdminClient();
    const product = await applyDescriptionFallbacks(payload);

    const { data: persisted, error } = await supabase
      .from("products")
      .insert({
        id: productId,
        ...product,
      })
      .select("id, status, updated_at, slug, category_id")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    await replaceSimpleAttributes(productId, {
      brand: payload.brand,
      type: payload.type,
    });
    const category = await getProductCategoryInfo(payload.product.category_id);
    await replaceCatalogAttributes(productId, category?.slug ?? "", formData);
    await uploadProductImages(
      productId,
      product.name,
      getProductImageFiles(formData),
    );

    revalidateProductPaths({
      productId,
      slug: persisted.slug,
      categorySlugs: [category?.slug],
    });
    return {
      status: "success",
      message: "Producto creado correctamente.",
      productId,
      submissionId: crypto.randomUUID(),
      persistedProduct: persistedProductState(persisted),
    };
  } catch (error) {
    return productFormErrorState(error);
  }
}

export async function updateProduct(
  _previousState: ProductFormActionState,
  formData: FormData,
): Promise<ProductFormActionState> {
  try {
    await requireAdminActionSession();
    const payload = readProductForm(formData);

    if (!payload.productId) {
      throw new Error("Falta el ID del producto.");
    }

    const existingProduct = await assertOperationalProduct(payload.productId);
    assertProductStatusTransition({
      currentStatus: existingProduct.status,
      nextStatus: payload.product.status,
      historicalIdentity: existingProduct.historical_identity,
    });

    const supabase = getSupabaseAdminClient();
    const product = await applyDescriptionFallbacks(payload);
    const productUpdate = shouldClearCostSource(
      existingProduct.cost,
      product.cost,
    )
      ? { ...product, cost_source_purchase_item_id: null }
      : product;
    const { data: persisted, error } = await supabase
      .from("products")
      .update(productUpdate)
      .eq("id", payload.productId)
      .select("id, status, updated_at, slug, category_id")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    await replaceSimpleAttributes(payload.productId, {
      brand: payload.brand,
      type: payload.type,
    });
    const [category, previousCategory] = await Promise.all([
      getProductCategoryInfo(payload.product.category_id),
      existingProduct.category_id === payload.product.category_id
        ? Promise.resolve(null)
        : getProductCategoryInfo(existingProduct.category_id),
    ]);
    await replaceCatalogAttributes(
      payload.productId,
      category?.slug ?? "",
      formData,
    );
    await uploadProductImages(
      payload.productId,
      product.name,
      getProductImageFiles(formData),
    );

    revalidateProductPaths({
      productId: payload.productId,
      slug: persisted.slug,
      previousSlug: existingProduct.slug,
      categorySlugs: [category?.slug, previousCategory?.slug],
    });
    return {
      status: "success",
      message: "Producto actualizado correctamente.",
      productId: payload.productId,
      submissionId: crypto.randomUUID(),
      persistedProduct: persistedProductState(persisted),
    };
  } catch (error) {
    return productFormErrorState(error);
  }
}

export async function archiveProduct(formData: FormData) {
  await requireAdminActionSession();

  const productId = String(formData.get("productId") ?? "");
  const returnTo = String(formData.get("returnTo") ?? "/admin/productos");

  if (!productId) {
    throw new Error("Falta el ID del producto.");
  }

  const existingProduct = await assertOperationalProduct(productId);
  assertProductStatusTransition({
    currentStatus: existingProduct.status,
    nextStatus: "archived",
    historicalIdentity: existingProduct.historical_identity,
  });

  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from("products")
    .update({ status: "archived" })
    .eq("id", productId);

  if (error) {
    throw new Error(error.message);
  }

  await revalidateOperationalProductPaths(existingProduct);
  redirect(returnTo);
}

export async function toggleProductFeatured(formData: FormData) {
  await requireAdminActionSession();

  const productId = String(formData.get("productId") ?? "");
  const featured = String(formData.get("featured") ?? "") === "true";
  const returnTo = String(formData.get("returnTo") ?? "/admin/productos");

  if (!productId) {
    throw new Error("Falta el ID del producto.");
  }

  const existingProduct = await assertOperationalProduct(productId);

  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from("products")
    .update({ featured })
    .eq("id", productId);

  if (error) {
    throw new Error(error.message);
  }

  await revalidateOperationalProductPaths(existingProduct);
  redirect(returnTo);
}

export type InventoryAdjustmentActionState = {
  status: "idle" | "success" | "no_change" | "error";
  message: string;
  newStock?: number;
  movementId?: string;
};

export async function updateProductStock(
  _previousState: InventoryAdjustmentActionState,
  formData: FormData,
): Promise<InventoryAdjustmentActionState> {
  try {
    const user = await requireAdminActionSession();
    const productId = String(formData.get("productId") ?? "").trim();
    const reason = String(formData.get("reason") ?? "").trim();

    if (!productId) {
      throw new Error("Falta el ID del producto.");
    }

    const existingProduct = await assertOperationalProduct(productId);

    if (!reason) {
      throw new Error("El motivo del ajuste es obligatorio.");
    }

    const newStock = parseStock(formData.get("newStock"));
    const result = await adjustInventoryStock({
      productId,
      newStock,
      reason,
      createdBy: user.id,
    });

    await revalidateOperationalProductPaths(existingProduct);
    revalidatePath("/admin/inventario");

    if (result.status === "no_change") {
      return {
        status: "no_change",
        message: "El stock ya tenia ese valor. No se creo ningun movimiento.",
        newStock: result.new_stock,
      };
    }

    return {
      status: "success",
      message: `Stock ajustado de ${result.previous_stock} a ${result.new_stock}.`,
      newStock: result.new_stock,
      movementId: result.movement_id ?? undefined,
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "No se pudo ajustar el stock.",
    };
  }
}


export async function setPrimaryProductImage(formData: FormData) {
  await requireAdminActionSession();

  const productId = String(formData.get("productId") ?? "");
  const imageId = String(formData.get("imageId") ?? "");
  const returnTo = String(formData.get("returnTo") ?? "/admin/productos");

  if (!productId || !imageId) {
    throw new Error("Faltan datos para marcar la imagen principal.");
  }

  const existingProduct = await assertOperationalProduct(productId);

  const supabase = getSupabaseAdminClient();
  const { data: image, error: imageError } = await supabase
    .from("product_images")
    .select("id")
    .eq("id", imageId)
    .eq("product_id", productId)
    .maybeSingle();

  if (imageError) {
    throw new Error(imageError.message);
  }

  if (!image) {
    throw new Error("La imagen no pertenece a este producto.");
  }

  const { error: resetError } = await supabase
    .from("product_images")
    .update({ is_primary: false })
    .eq("product_id", productId);

  if (resetError) {
    throw new Error(resetError.message);
  }

  const { error: updateError } = await supabase
    .from("product_images")
    .update({ is_primary: true })
    .eq("id", imageId)
    .eq("product_id", productId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  await revalidateOperationalProductPaths(existingProduct);
  redirect(returnTo);
}

export async function moveProductImage(formData: FormData) {
  await requireAdminActionSession();

  const productId = String(formData.get("productId") ?? "");
  const imageId = String(formData.get("imageId") ?? "");
  const direction = String(formData.get("direction") ?? "");
  const returnTo = String(formData.get("returnTo") ?? "/admin/productos");

  if (!productId || !imageId || !["previous", "next"].includes(direction)) {
    throw new Error("Faltan datos para reordenar la imagen.");
  }

  const existingProduct = await assertOperationalProduct(productId);

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("product_images")
    .select("id, sort_order")
    .eq("product_id", productId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);
  const images = data ?? [];
  const currentIndex = images.findIndex((image) => image.id === imageId);
  const targetIndex = direction === "previous" ? currentIndex - 1 : currentIndex + 1;

  if (currentIndex === -1) throw new Error("La imagen no pertenece a este producto.");
  if (targetIndex < 0 || targetIndex >= images.length) redirect(returnTo);

  const current = images[currentIndex];
  const target = images[targetIndex];
  const temporaryOrder = Math.min(...images.map((image) => image.sort_order)) - 1;
  const { error: temporaryError } = await supabase
    .from("product_images")
    .update({ sort_order: temporaryOrder })
    .eq("id", current.id)
    .eq("product_id", productId);
  if (temporaryError) throw new Error(temporaryError.message);

  const { error: targetError } = await supabase
    .from("product_images")
    .update({ sort_order: current.sort_order })
    .eq("id", target.id)
    .eq("product_id", productId);
  if (targetError) {
    await supabase
      .from("product_images")
      .update({ sort_order: current.sort_order })
      .eq("id", current.id)
      .eq("product_id", productId);
    throw new Error(targetError.message);
  }

  const { error: currentError } = await supabase
    .from("product_images")
    .update({ sort_order: target.sort_order })
    .eq("id", current.id)
    .eq("product_id", productId);
  if (currentError) {
    await supabase
      .from("product_images")
      .update({ sort_order: target.sort_order })
      .eq("id", target.id)
      .eq("product_id", productId);
    await supabase
      .from("product_images")
      .update({ sort_order: current.sort_order })
      .eq("id", current.id)
      .eq("product_id", productId);
    throw new Error(currentError.message);
  }

  await revalidateOperationalProductPaths(existingProduct);
  redirect(returnTo);
}

function getStoragePathFromPublicUrl(url: string) {
  const marker = `/${PRODUCT_IMAGES_BUCKET}/`;
  const markerIndex = url.indexOf(marker);

  if (markerIndex === -1) {
    return null;
  }

  return decodeURIComponent(url.slice(markerIndex + marker.length));
}

export async function deleteProductImage(formData: FormData) {
  await requireAdminActionSession();

  const productId = String(formData.get("productId") ?? "");
  const imageId = String(formData.get("imageId") ?? "");
  const returnTo = String(formData.get("returnTo") ?? "/admin/productos");

  if (!productId || !imageId) {
    throw new Error("Faltan datos para eliminar la imagen.");
  }

  const existingProduct = await assertOperationalProduct(productId);

  const supabase = getSupabaseAdminClient();
  const { data: image, error: readError } = await supabase
    .from("product_images")
    .select("id, url, is_primary")
    .eq("id", imageId)
    .eq("product_id", productId)
    .maybeSingle();

  if (readError) {
    throw new Error(readError.message);
  }

  if (!image) {
    throw new Error("La imagen no pertenece a este producto.");
  }

  const { error: deleteError } = await supabase
    .from("product_images")
    .delete()
    .eq("id", imageId)
    .eq("product_id", productId);

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  const storagePath = getStoragePathFromPublicUrl(String(image.url ?? ""));

  if (storagePath) {
    const { error: storageError } = await supabase.storage
      .from(PRODUCT_IMAGES_BUCKET)
      .remove([storagePath]);

    if (storageError) {
      console.warn("[product-images] No se pudo eliminar el archivo del bucket", {
        productId,
        imageId,
        message: storageError.message,
      });
    }
  }

  if (image.is_primary) {
    const { data: remainingImages, error: remainingError } = await supabase
      .from("product_images")
      .select("id")
      .eq("product_id", productId)
      .order("sort_order", { ascending: true })
      .limit(1);

    if (remainingError) {
      throw new Error(remainingError.message);
    }

    const nextPrimary = remainingImages?.[0];

    if (nextPrimary) {
      const { error: primaryError } = await supabase
        .from("product_images")
        .update({ is_primary: true })
        .eq("id", nextPrimary.id)
        .eq("product_id", productId);

      if (primaryError) {
        throw new Error(primaryError.message);
      }
    }
  }

  await revalidateOperationalProductPaths(existingProduct);
  redirect(returnTo);
}

