"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminActionSession } from "@/lib/admin-session";
import {
  getAllowedValuesForField,
  getAttributeFieldsForCategory,
  getCatalogAttributeInputName,
} from "@/lib/catalog/attribute-config";
import { PRODUCT_ATTRIBUTE_NAMES } from "@/lib/product-taxonomy";
import {
  applyAutoDescriptionFallbacks,
  getAutoDescriptions,
  type ProductCategoryInfo,
} from "@/lib/products/auto-descriptions";
import { slugifyProductValue } from "@/lib/products/slug";
import { isSupersededYaraRosa } from "@/lib/products/yara-rosa-consolidation";
import {
  MAX_PRODUCT_IMAGE_UPLOAD_BYTES,
  PRODUCT_IMAGE_OUTPUT_MIME_TYPES,
  detectProductImageOutputMimeType,
} from "@/lib/products/product-image-files";
import {
  createSupabaseProductImageDeleteGateway,
  deleteProductImageWithCompensation,
} from "@/lib/products/product-image-deletion";
import {
  PRODUCT_STATUSES,
  assertProductStatusTransition,
  type ProductStatus,
} from "@/lib/products/admin-product-policy";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { adjustInventoryStock } from "@/services/inventory";
import { createProductSaveService, fingerprintProductSubmission } from "@/services/product-save";
import { ProductSaveError } from "@/lib/products/atomic-save";

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
  version?: string;
  retryMode?: "retry" | "new" | "reload";
};

export type ProductImageActionState = {
  status: "idle" | "success" | "error";
  message: string;
  submissionId?: string;
};

function productFormErrorState(error: unknown): ProductFormActionState {
  return {
    status: "error",
    retryMode: error instanceof ProductSaveError ? error.retryMode : "new",
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

function buildProductAttributes(
  attributes: { brand: string; type: string },
  categorySlug: string,
  formData: FormData,
) {
  const rows: { name: string; value: string; sort_order: number }[] = [];
  if (attributes.brand) rows.push({ name: PRODUCT_ATTRIBUTE_NAMES.brand, value: attributes.brand, sort_order: 10 });
  if (attributes.type) rows.push({ name: PRODUCT_ATTRIBUTE_NAMES.type, value: attributes.type, sort_order: 20 });
  for (const [fieldIndex, field] of getAttributeFieldsForCategory(categorySlug).entries()) {
    const inputName = getCatalogAttributeInputName(field.key);
    const values = [...new Set(formData.getAll(inputName).map((value) => String(value).trim()).filter(Boolean))];
    if (!field.multiple && values.length > 1) throw new Error(`El atributo ${field.label} admite un solo valor.`);
    const allowed = getAllowedValuesForField(field);
    if (values.some((value) => !allowed.has(value))) throw new Error(`Valor invalido para ${field.label}.`);
    values.forEach((value, index) => rows.push({ name: field.key, value, sort_order: 100 + fieldIndex * 10 + index }));
  }
  return rows;
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

  if (isSupersededYaraRosa(data)) {
    throw new Error("Esta identidad de Yara Rosa se conserva solo para trazabilidad. Usar lattafa-yara-rosa.");
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

async function saveProductForm(formData: FormData, operationType: "create_product" | "update_product"): Promise<ProductFormActionState> {
  const payload = readProductForm(formData);
  const operationKey = String(formData.get("operationKey") ?? "");
  const productId = payload.productId;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const expectedVersion = operationType === "update_product" ? String(formData.get("expectedVersion") ?? "") : null;
  if (!uuid.test(operationKey) || !uuid.test(productId) ||
    (operationType === "update_product" && !/^[0-9a-f]{64}$/.test(expectedVersion ?? ""))) {
    throw new ProductSaveError("Recarga el formulario antes de guardar.", "reload");
  }
  const files = getProductImageFiles(formData);
  await validateProductImageContents(files);
  const requestHash = await fingerprintProductSubmission(formData, files);
  const service = createProductSaveService({ operationKey, operationType, productId, expectedVersion, requestHash }, files);
  const { result, plan } = await service.save(async () => {
    const existing = operationType === "update_product" ? await assertOperationalProduct(productId) : null;
    if (existing) {
      assertProductStatusTransition({
        currentStatus: existing.status, nextStatus: payload.product.status,
        historicalIdentity: existing.historical_identity,
      });
      if (await service.version() !== expectedVersion) {
        throw new ProductSaveError("El producto cambio desde que lo abriste. Recarga antes de guardar.", "reload");
      }
    }
    const product = await applyDescriptionFallbacks(payload);
    const category = await getProductCategoryInfo(product.category_id);
    const previousCategory = existing && existing.category_id !== product.category_id
      ? await getProductCategoryInfo(existing.category_id) : null;
    const attributes = buildProductAttributes(payload, category?.slug ?? "", formData);
    const { images, uploads } = await service.buildImages(product.name);
    if (existing && await service.version() !== expectedVersion) {
      throw new ProductSaveError("El producto cambio mientras preparabas el guardado. Recarga.", "reload");
    }
    return {
      requestHash, payload: { product, attributes, images }, uploads,
      previousSlug: existing?.slug,
      categorySlugs: [category?.slug, previousCategory?.slug].filter((slug): slug is string => Boolean(slug)),
    };
  });
  const persisted = result.product;
  // Cache invalidation is post-commit: a failure must not turn a committed save into an error.
  try {
    revalidateProductPaths({ productId, slug: persisted.slug, previousSlug: plan.previousSlug, categorySlugs: plan.categorySlugs });
  } catch {
    console.warn("[product-save] Guardado confirmado; no se pudo actualizar la cache", { operationKey, productId });
  }
  return {
    status: "success",
    message: operationType === "create_product" ? "Producto creado correctamente." : "Producto actualizado correctamente.",
    productId, version: result.version, submissionId: crypto.randomUUID(),
    persistedProduct: persistedProductState(persisted),
  };
}

export async function createProduct(
  _previousState: ProductFormActionState,
  formData: FormData,
): Promise<ProductFormActionState> {
  try {
    await requireAdminActionSession();
    return await saveProductForm(formData, "create_product");
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
    return await saveProductForm(formData, "update_product");
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

export async function deleteProductImage(
  _previousState: ProductImageActionState,
  formData: FormData,
): Promise<ProductImageActionState> {
  try {
    await requireAdminActionSession();

    const productId = String(formData.get("productId") ?? "");
    const imageId = String(formData.get("imageId") ?? "");

    if (!productId || !imageId) {
      throw new Error("Faltan datos para eliminar la imagen.");
    }

    const existingProduct = await assertOperationalProduct(productId);
    const supabase = getSupabaseAdminClient();
    const result = await deleteProductImageWithCompensation(
      createSupabaseProductImageDeleteGateway(supabase),
      { productId, imageId },
    );

    await revalidateOperationalProductPaths(existingProduct);

    return {
      status: "success",
      message: result.storagePreservedForSharedReference
        ? "La imagen se quito del producto. El archivo compartido se conservo."
        : "La imagen se elimino correctamente.",
      submissionId: crypto.randomUUID(),
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "No se pudo eliminar la imagen.",
      submissionId: crypto.randomUUID(),
    };
  }
}

