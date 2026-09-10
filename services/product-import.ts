import "server-only";

import { revalidatePath } from "next/cache";
import {
  CATALOG_ATTRIBUTE_KEYS,
  getAllowedValuesForField,
  getAttributeFieldsForCategory,
  LEGACY_COMMERCIAL_CATEGORY_NAME,
  type CatalogAttributeKey,
} from "@/lib/catalog/attribute-config";
import {
  getImportCell,
  isRelevantEditedColumn,
  isRestrictedImportedProduct,
  normalizeProductImportRow,
  parseImportNumber,
  slugifyImportedProduct,
} from "@/lib/product-import/core";
import {
  getProductImportLookupSlugs,
  selectExistingProductForImport,
} from "@/lib/product-import/aliases";
import {
  buildSafePriceImportDecision,
  findDuplicateImportSlugs,
  getPriceImportSource,
} from "@/lib/product-import/price-import";
import type {
  ImportCatalogAttributeUpdate,
  NormalizedProductImportRow,
  ProductSyncInputRow,
  ProductSyncRowResult,
  SupportedProductSheet,
} from "@/lib/product-import/types";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

type ExistingProduct = {
  id: string;
  slug: string;
  price: number;
  transfer_price: number | null;
  cost: number | null;
  status: "draft" | "active" | "archived";
};

export type ProductSyncBatchResult = {
  created: number;
  updated: number;
  unchanged: number;
  review: number;
  blocked: number;
  invalid: number;
  errors: number;
  results: ProductSyncRowResult[];
};

export type ConfirmedImportResult = {
  created: number;
  updated: number;
  unchanged: number;
  review: number;
  omittedErrors: number;
  omittedDuplicates: number;
};

async function findExistingProduct(
  sourceSheet: SupportedProductSheet,
  slug: string,
  previousSlug?: string,
) {
  const slugs = getProductImportLookupSlugs(sourceSheet, slug, previousSlug);
  const { data, error } = await getSupabaseAdminClient()
    .from("products")
    .select("id, slug, price, transfer_price, cost, status")
    .in("slug", slugs);
  if (error) throw new Error(error.message);
  const products = (data ?? []) as ExistingProduct[];
  return selectExistingProductForImport(
    products,
    sourceSheet,
    slug,
    previousSlug,
  );
}

async function getOrCreateCategory(name: string, slug: string) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.from("categories").select("id").eq("slug", slug).maybeSingle();
  if (error) throw new Error(error.message);
  if (data) return data.id as string;
  const id = crypto.randomUUID();
  const { error: insertError } = await supabase.from("categories").insert({
    id,
    name,
    slug,
    description: null,
    is_active: true,
    sort_order: 100,
  });
  if (insertError) throw new Error(insertError.message);
  return id;
}

function sanitizeAttributeUpdates(categorySlug: string, updates: ImportCatalogAttributeUpdate[]) {
  const fields = getAttributeFieldsForCategory(categorySlug);
  return updates.flatMap((update) => {
    const key = update.key as CatalogAttributeKey;
    const field = fields.find((item) => item.key === key);
    if (!field) return [];
    const allowed = getAllowedValuesForField(field);
    const values = [...new Set(update.values.filter((value) => field.input === "boolean" ? value === "true" || value === "false" : allowed.has(value)))];
    return values.length > 0 ? [{ ...update, key, values: field.multiple ? values : values.slice(0, 1) }] : [];
  });
}

async function replaceCatalogAttributes(productId: string, categorySlug: string, updates: ImportCatalogAttributeUpdate[]) {
  const supabase = getSupabaseAdminClient();
  for (const [index, update] of sanitizeAttributeUpdates(categorySlug, updates).entries()) {
    const names = update.key === CATALOG_ATTRIBUTE_KEYS.commercialCategory
      ? [update.key, LEGACY_COMMERCIAL_CATEGORY_NAME]
      : [update.key];
    const { error: deleteError } = await supabase.from("product_attributes").delete().eq("product_id", productId).in("name", names);
    if (deleteError) throw new Error(deleteError.message);
    const { error: insertError } = await supabase.from("product_attributes").insert(
      update.values.map((value, valueIndex) => ({
        id: crypto.randomUUID(),
        product_id: productId,
        name: update.key,
        value,
        sort_order: 100 + index * 10 + valueIndex,
      })),
    );
    if (insertError) throw new Error(insertError.message);
  }
}

async function replaceNamedAttributes(productId: string, attributes: { name: string; value: string; sortOrder: number }[]) {
  const supabase = getSupabaseAdminClient();
  for (const attribute of attributes.filter((item) => item.value.trim())) {
    const { error: deleteError } = await supabase.from("product_attributes").delete().eq("product_id", productId).eq("name", attribute.name);
    if (deleteError) throw new Error(deleteError.message);
    const { error: insertError } = await supabase.from("product_attributes").insert({
      id: crypto.randomUUID(),
      product_id: productId,
      name: attribute.name,
      value: attribute.value,
      sort_order: attribute.sortOrder,
    });
    if (insertError) throw new Error(insertError.message);
  }
}

function getPriceCells(sheet: SupportedProductSheet, row: Record<string, unknown>) {
  if (sheet === "Producto Perfumes") {
    return {
      price: getImportCell(row, ["Precio de venta"]),
      transfer: getImportCell(row, ["Precio final con descuento"]),
      cost: getImportCell(row, ["Costo unitario"]),
    };
  }
  if (sheet === "Termos y Mates") {
    return {
      price: getImportCell(row, ["Precio de venta"]),
      transfer: getImportCell(row, ["Precio final con descuento"]),
      cost: { present: false, nonBlank: false, value: null },
    };
  }
  return {
    price: getImportCell(row, ["PRECIO LISTA", "Precio lista"]),
    transfer: getImportCell(row, ["PRECIO CON DESCUENTO", "Precio con descuento"]),
    cost: getImportCell(row, ["Costo unitario"]),
  };
}

function result(rowNumber: number, slug: string | null, status: ProductSyncRowResult["status"], message: string): ProductSyncRowResult {
  return { rowNumber, slug, status, message };
}

export async function syncImportedProductRows(sheet: SupportedProductSheet, inputs: ProductSyncInputRow[]): Promise<ProductSyncBatchResult> {
  const summary: ProductSyncBatchResult = { created: 0, updated: 0, unchanged: 0, review: 0, blocked: 0, invalid: 0, errors: 0, results: [] };
  const inputSlugs = inputs.map((input) => {
    const name = String(getImportCell(input.row, ["Producto"]).value ?? "").trim();
    return { slug: name ? slugifyImportedProduct(name) : "" };
  });
  const duplicateSlugs = findDuplicateImportSlugs(inputSlugs);
  for (const input of inputs) {
    const productName = String(getImportCell(input.row, ["Producto"]).value ?? "").trim();
    const slug = productName ? slugifyImportedProduct(productName) : null;
    if (input.editedColumn && !isRelevantEditedColumn(sheet, input.editedColumn)) {
      summary.invalid += 1;
      summary.results.push(result(input.rowNumber, slug, "invalid", "La columna editada no forma parte de la sincronización."));
      continue;
    }
    if (!productName || !slug) {
      summary.invalid += 1;
      summary.results.push(result(input.rowNumber, slug, "invalid", "Producto faltante o inválido."));
      continue;
    }
    if (duplicateSlugs.has(slug)) {
      summary.invalid += 1;
      summary.results.push(result(input.rowNumber, slug, "invalid", "Slug duplicado dentro del batch."));
      continue;
    }
    if (isRestrictedImportedProduct(productName)) {
      summary.blocked += 1;
      summary.results.push(result(input.rowNumber, slug, "blocked", "Producto restringido: revisar manualmente."));
      continue;
    }
    try {
      const previousSlug = input.previousProductName ? slugifyImportedProduct(input.previousProductName) : undefined;
      const existing = await findExistingProduct(sheet, slug, previousSlug);
      const normalized = normalizeProductImportRow(sheet, input.row, input.rowNumber);
      if (!normalized) {
        summary.invalid += 1;
        summary.results.push(result(input.rowNumber, slug, "invalid", "No se pudo normalizar la fila."));
        continue;
      }
      if (sheet === "Precios Productos") {
        const decision = buildSafePriceImportDecision(getPriceImportSource(normalized), existing);
        if (decision.kind === "review") {
          summary.review += 1;
          summary.results.push(result(input.rowNumber, slug, "review", "Requiere revisión / posible nuevo producto."));
          continue;
        }
        if (decision.kind === "invalid") {
          summary.invalid += 1;
          summary.results.push(result(input.rowNumber, slug, "invalid", decision.errors.join(" ")));
          continue;
        }
        if (decision.kind === "unchanged") {
          summary.unchanged += 1;
          summary.results.push(result(input.rowNumber, slug, "unchanged", "Sin cambios comerciales."));
          continue;
        }
        if (!existing) throw new Error("El producto dejó de existir durante la sincronización.");
        const { error } = await getSupabaseAdminClient()
          .from("products")
          .update(decision.patch)
          .eq("id", existing.id);
        if (error) throw new Error(error.message);
        summary.updated += 1;
        summary.results.push(result(input.rowNumber, existing.slug, "updated", "Datos comerciales actualizados."));
        revalidatePath(`/producto/${existing.slug}`);
        continue;
      }
      const cells = getPriceCells(sheet, input.row);
      let price = normalized.price;
      let transferPrice = normalized.transferPrice;
      if (existing) {
        if (!cells.price.nonBlank) price = existing.price;
        if (!cells.transfer.nonBlank) transferPrice = existing.transfer_price;
      }
      if (cells.price.nonBlank && normalized.price === null) {
        summary.invalid += 1;
        summary.results.push(result(input.rowNumber, slug, "invalid", "Precio lista inválido."));
        continue;
      }
      if (cells.transfer.nonBlank && parseImportNumber(cells.transfer.value) === null) {
        summary.invalid += 1;
        summary.results.push(result(input.rowNumber, slug, "invalid", "Precio efectivo/transferencia inválido."));
        continue;
      }
      if (price === null || price <= 0) {
        summary.invalid += 1;
        summary.results.push(result(input.rowNumber, slug, "invalid", "Precio lista inválido o faltante."));
        continue;
      }
      if (transferPrice !== null && transferPrice >= price) {
        summary.invalid += 1;
        summary.results.push(result(input.rowNumber, slug, "invalid", "Precio efectivo/transferencia debe ser menor que precio lista."));
        continue;
      }
      const parsedCost = cells.cost.nonBlank ? parseImportNumber(cells.cost.value) : existing?.cost ?? normalized.cost;
      if (cells.cost.nonBlank && (parsedCost === null || parsedCost < 0)) {
        summary.invalid += 1;
        summary.results.push(result(input.rowNumber, slug, "invalid", "Costo inválido."));
        continue;
      }
      const categoryId = await getOrCreateCategory(normalized.categoryName, normalized.categorySlug);
      const productId = existing?.id ?? crypto.randomUUID();
      const payload = {
        category_id: categoryId,
        name: normalized.name,
        slug: normalized.slug,
        price,
        transfer_price: transferPrice,
        cost: parsedCost,
        ...(existing ? {} : {
          short_description: normalized.shortDescription,
          description: normalized.description,
          stock: 0,
          sku: null,
          compare_at_price: null,
          featured: false,
          status: "active",
        }),
      };
      const supabase = getSupabaseAdminClient();
      const { error } = existing
        ? await supabase.from("products").update(payload).eq("id", productId)
        : await supabase.from("products").insert({ id: productId, ...payload });
      if (error) throw new Error(error.message);
      await replaceNamedAttributes(productId, normalized.attributes);
      await replaceCatalogAttributes(productId, normalized.categorySlug, normalized.catalogAttributeUpdates);
      if (existing) summary.updated += 1;
      else summary.created += 1;
      summary.results.push(result(input.rowNumber, slug, existing ? "updated" : "created", existing ? "Producto actualizado." : "Producto creado."));
      revalidatePath(`/producto/${slug}`);
    } catch (error) {
      console.error("[Google Sheets sync] Failed to apply row", {
        rowNumber: input.rowNumber,
        slug,
        error: error instanceof Error ? error.message : "unknown",
      });
      summary.errors += 1;
      summary.results.push(result(input.rowNumber, slug, "error", "No se pudo sincronizar la fila."));
    }
  }
  revalidatePath("/admin/productos");
  revalidatePath("/admin/productos/importar");
  revalidatePath("/perfumes");
  revalidatePath("/mates");
  return summary;
}

export async function applyConfirmedProductImportRows(rows: NormalizedProductImportRow[]): Promise<ConfirmedImportResult> {
  const result: ConfirmedImportResult = { created: 0, updated: 0, unchanged: 0, review: 0, omittedErrors: 0, omittedDuplicates: 0 };
  const duplicateSlugs = findDuplicateImportSlugs(rows);
  for (const row of rows) {
    if (duplicateSlugs.has(row.slug)) {
      result.omittedDuplicates += 1;
      continue;
    }
    if (
      isRestrictedImportedProduct(row.name) ||
      !row.slug ||
      (row.sourceSheet !== "Precios Productos" &&
        (row.price === null || row.price <= 0 || (row.transferPrice !== null && row.transferPrice >= row.price)))
    ) {
      result.omittedErrors += 1;
      continue;
    }
    try {
      const existing = await findExistingProduct(row.sourceSheet, row.slug);
      if (row.sourceSheet === "Precios Productos") {
        const decision = buildSafePriceImportDecision(getPriceImportSource(row), existing);
        if (decision.kind === "review") {
          result.review += 1;
          continue;
        }
        if (decision.kind === "invalid") {
          result.omittedErrors += 1;
          continue;
        }
        if (decision.kind === "unchanged") {
          result.unchanged += 1;
          continue;
        }
        if (!existing) throw new Error("El producto dejó de existir durante la importación.");
        const { error } = await getSupabaseAdminClient()
          .from("products")
          .update(decision.patch)
          .eq("id", existing.id);
        if (error) throw new Error(error.message);
        result.updated += 1;
        revalidatePath(`/producto/${existing.slug}`);
        continue;
      }
      const categoryId = await getOrCreateCategory(row.categoryName, row.categorySlug);
      const productId = existing?.id ?? crypto.randomUUID();
      const payload = {
        category_id: categoryId,
        name: row.name,
        slug: row.slug,
        short_description: row.shortDescription,
        description: row.description,
        price: row.price,
        transfer_price: row.transferPrice,
        compare_at_price: null,
        cost: row.cost,
        stock: row.stock,
        sku: row.sku,
        featured: false,
        status: row.status,
      };
      const supabase = getSupabaseAdminClient();
      const { error } = existing
        ? await supabase.from("products").update(payload).eq("id", productId)
        : await supabase.from("products").insert({ id: productId, ...payload });
      if (error) throw new Error(error.message);
      await replaceNamedAttributes(productId, row.attributes);
      await replaceCatalogAttributes(productId, row.categorySlug, row.catalogAttributeUpdates);
      if (existing) result.updated += 1;
      else result.created += 1;
      revalidatePath(`/producto/${row.slug}`);
    } catch (error) {
      console.error("[Product import] Failed to apply row", { rowNumber: row.rowNumber, slug: row.slug, error: error instanceof Error ? error.message : "unknown" });
      result.omittedErrors += 1;
    }
  }
  revalidatePath("/admin/productos");
  revalidatePath("/admin/productos/importar");
  revalidatePath("/perfumes");
  revalidatePath("/mates");
  return result;
}
