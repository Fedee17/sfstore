"use server";

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
import { getSupabaseAdminClient } from "@/lib/supabase/server";

const PRODUCT_STATUSES = ["draft", "active", "archived"] as const;
const PRODUCT_IMAGES_BUCKET = "product-images";

type ProductCategoryInfo = {
  name: string;
  slug: string;
};

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
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
  const number = Number(String(value ?? "").trim());

  if (!Number.isInteger(number) || number < 0) {
    throw new Error("Stock debe ser un numero entero mayor o igual a 0.");
  }

  return number;
}

function readProductForm(formData: FormData) {
  const productId = String(formData.get("productId") ?? "");
  const categoryId = String(formData.get("categoryId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const slugInput = String(formData.get("slug") ?? "").trim();
  const slug = slugInput ? slugify(slugInput) : slugify(name);
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
      stock: parseStock(formData.get("stock")),
      sku: sku || null,
      featured: formData.get("featured") === "on",
      status,
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

function withBrand(name: string, brand: string) {
  return brand ? `${name} de ${brand}` : name;
}

function getAutoDescriptions({
  name,
  category,
  brand,
}: {
  name: string;
  category: ProductCategoryInfo | null;
  brand: string;
  type: string;
  price: number;
  transferPrice: number | null;
}) {
  const displayName = withBrand(name, brand);
  const categorySlug = category?.slug ?? "";
  const categoryName = category?.name.toLowerCase() ?? "";
  const isPerfume =
    categorySlug === "perfumes" || categoryName.includes("perfume");
  const isMate = categorySlug === "mates" || categoryName.includes("mate");
  const isTermo = categorySlug === "termos" || categoryName.includes("termo");

  if (isPerfume) {
    return {
      shortDescription: `${displayName} es una opcion ideal para quienes buscan un aroma con presencia, pensado para uso diario, salida o regalo.`,
      description: `${displayName} combina estilo, presencia y una sensaciÃ³n de calidad desde el primer uso. Es una alternativa ideal si buscÃ¡s un perfume para regalar bien, probar algo distinto o sumar a tu rutina un aroma que acompaÃ±e tu estilo. En SFSTORE te ayudamos a elegir segÃºn tus gustos, ocasiÃ³n y presupuesto.`,
    };
  }

  if (isMate) {
    return {
      shortDescription: `${displayName} es una opcion ideal para quienes buscan un mate vistoso, comodo y con identidad argentina.`,
      description: `${displayName} esta pensado para quienes disfrutan el ritual del mate y quieren una pieza que se vea bien, se sienta comoda y tambien funcione como regalo. En SFSTORE podes combinarlo con termo, yerba, bombilla o accesorios para armar una compra mas completa.`,
    };
  }

  if (isTermo) {
    return {
      shortDescription: `${displayName} es una opcion practica para acompanar tu mate, tu dia y tus salidas.`,
      description: `${displayName} es una alternativa practica y funcional para mantener tu rutina siempre lista. Ideal para combinar con mate, bombilla, yerba o accesorios y armar un regalo util, vistoso y con identidad.`,
    };
  }

  return {
    shortDescription: `${displayName} es una opcion practica para resolver una compra util o un regalo.`,
    description: `${displayName} es una alternativa practica para sumar a tu dia a dia o resolver un regalo simple y util. En SFSTORE buscamos opciones funcionales, faciles de elegir y con buena presentacion.`,
  };
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
  return {
    ...payload.product,
    short_description:
      payload.product.short_description || autoDescriptions.shortDescription,
    description: payload.product.description || autoDescriptions.description,
  };
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
function revalidateProductPaths(slug: string) {
  revalidatePath("/admin/productos");
  revalidatePath("/admin/consulta");
  revalidatePath("/perfumes");
  revalidatePath("/mates");
  revalidatePath(`/producto/${slug}`);
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

function getProductImageFiles(formData: FormData) {
  const files = [
    ...formData.getAll("productImages"),
    formData.get("primaryImage"),
  ];

  return files.filter((file): file is File => {
    if (!(file instanceof File) || file.size === 0) {
      return false;
    }

    if (!file.type.startsWith("image/")) {
      throw new Error("Las imágenes deben ser JPG, PNG o WebP.");
    }

    return true;
  });
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

  await ensureProductImagesBucket();

  const supabase = getSupabaseAdminClient();
  const { data: currentImages, error: readError } = await supabase
    .from("product_images")
    .select("id, sort_order, is_primary")
    .eq("product_id", productId)
    .order("sort_order", { ascending: true });

  if (readError) {
    throw new Error(readError.message);
  }

  const existingImages = currentImages ?? [];
  const hasPrimary = existingImages.some((image) => image.is_primary);
  const lastSortOrder = existingImages.reduce(
    (max, image) => Math.max(max, Number(image.sort_order ?? 0)),
    -1,
  );

  const imageRows = [];

  for (const [index, file] of files.entries()) {
    const filePath = `products/${productId}/${Date.now()}-${index}-${sanitizeFileName(file.name)}`;
    const { error: uploadError } = await supabase.storage
      .from(PRODUCT_IMAGES_BUCKET)
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type,
      });

    if (uploadError) {
      throw new Error(uploadError.message);
    }

    const { data } = supabase.storage
      .from(PRODUCT_IMAGES_BUCKET)
      .getPublicUrl(filePath);

    imageRows.push({
      id: crypto.randomUUID(),
      product_id: productId,
      url: data.publicUrl,
      alt: productName,
      sort_order: lastSortOrder + index + 1,
      is_primary: !hasPrimary && index === 0,
    });
  }

  const { error: imageError } = await supabase
    .from("product_images")
    .insert(imageRows);

  if (imageError) {
    throw new Error(imageError.message);
  }
}

export async function createProduct(formData: FormData) {
  await requireAdminActionSession();
  const payload = readProductForm(formData);
  const productId = crypto.randomUUID();
  const supabase = getSupabaseAdminClient();
  const product = await applyDescriptionFallbacks(payload);

  const { error } = await supabase.from("products").insert({
    id: productId,
    ...product,
  });

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

  revalidateProductPaths(product.slug);
  redirect("/admin/productos");
}

export async function updateProduct(formData: FormData) {
  await requireAdminActionSession();
  const payload = readProductForm(formData);

  if (!payload.productId) {
    throw new Error("Falta el ID del producto.");
  }

  const supabase = getSupabaseAdminClient();
  const product = await applyDescriptionFallbacks(payload);
  const { error } = await supabase
    .from("products")
    .update(product)
    .eq("id", payload.productId);

  if (error) {
    throw new Error(error.message);
  }

  await replaceSimpleAttributes(payload.productId, {
    brand: payload.brand,
    type: payload.type,
  });
  const category = await getProductCategoryInfo(payload.product.category_id);
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

  revalidateProductPaths(product.slug);
  redirect("/admin/productos");
}

export async function archiveProduct(formData: FormData) {
  await requireAdminActionSession();

  const productId = String(formData.get("productId") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const returnTo = String(formData.get("returnTo") ?? "/admin/productos");

  if (!productId) {
    throw new Error("Falta el ID del producto.");
  }

  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from("products")
    .update({ status: "archived" })
    .eq("id", productId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateProductPaths(slug);
  redirect(returnTo);
}

export async function toggleProductFeatured(formData: FormData) {
  await requireAdminActionSession();

  const productId = String(formData.get("productId") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const featured = String(formData.get("featured") ?? "") === "true";
  const returnTo = String(formData.get("returnTo") ?? "/admin/productos");

  if (!productId) {
    throw new Error("Falta el ID del producto.");
  }

  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from("products")
    .update({ featured })
    .eq("id", productId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateProductPaths(slug);
  redirect(returnTo);
}

export async function updateProductStock(formData: FormData) {
  await requireAdminActionSession();

  const productId = String(formData.get("productId") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const returnTo = String(formData.get("returnTo") ?? "/admin/productos");

  if (!productId) {
    throw new Error("Falta el ID del producto.");
  }

  const stock = parseStock(formData.get("stock"));
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from("products")
    .update({ stock })
    .eq("id", productId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateProductPaths(slug);
  redirect(returnTo);
}


export async function setPrimaryProductImage(formData: FormData) {
  await requireAdminActionSession();

  const productId = String(formData.get("productId") ?? "");
  const imageId = String(formData.get("imageId") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const returnTo = String(formData.get("returnTo") ?? "/admin/productos");

  if (!productId || !imageId) {
    throw new Error("Faltan datos para marcar la imagen principal.");
  }

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

  revalidateProductPaths(slug);
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
  const slug = String(formData.get("slug") ?? "");
  const returnTo = String(formData.get("returnTo") ?? "/admin/productos");

  if (!productId || !imageId) {
    throw new Error("Faltan datos para eliminar la imagen.");
  }

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

  revalidateProductPaths(slug);
  redirect(returnTo);
}

