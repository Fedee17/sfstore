import {
  getCatalogAttributeValues,
  normalizeCatalogAttributeValue,
} from "@/lib/catalog/attribute-config";
import type { NormalizedProductImportRow } from "@/lib/product-import/types";

export type ProductImportDiffValue = string | number | boolean | null | string[];

export type ProductImportDiff = {
  field: string;
  label: string;
  currentValue: ProductImportDiffValue;
  nextValue: ProductImportDiffValue;
  format: "money" | "text" | "boolean" | "list";
};

export type ExistingPerfumeImportProduct = {
  id: string;
  name: string;
  slug: string;
  categories: { name: string; slug: string } | Array<{ name: string; slug: string }> | null;
  product_attributes: Array<{ name: string; value: string; sort_order: number }>;
};

export type PerfumeImportDecision =
  | { kind: "create"; diffs: [] }
  | { kind: "unchanged"; diffs: [] }
  | { kind: "update"; diffs: ProductImportDiff[] };

const NON_AUTHORITATIVE_COMMERCIAL_ERRORS = new Set([
  "Precio lista inválido o faltante",
  "Precio efectivo/transferencia debe ser menor que precio lista",
  "El costo no puede ser negativo.",
]);

export function getExistingPerfumeImportErrors(errors: string[]) {
  return errors.filter((error) => !NON_AUTHORITATIVE_COMMERCIAL_ERRORS.has(error));
}

function firstRelation<T>(relation: T | T[] | null | undefined) {
  return Array.isArray(relation) ? relation[0] ?? null : relation ?? null;
}

function sameValue(
  currentValue: ProductImportDiffValue,
  nextValue: ProductImportDiffValue,
) {
  if (Array.isArray(currentValue) && Array.isArray(nextValue)) {
    return (
      currentValue.length === nextValue.length &&
      currentValue.every((value, index) => value === nextValue[index])
    );
  }
  return currentValue === nextValue;
}

function normalizedValues(values: string[]) {
  return [...new Set(values.map(normalizeCatalogAttributeValue))].sort();
}

export function buildPerfumeImportDecision(
  row: NormalizedProductImportRow,
  existing: ExistingPerfumeImportProduct | null,
): PerfumeImportDecision {
  if (!existing) return { kind: "create", diffs: [] };

  const diffs: ProductImportDiff[] = [];
  const addDiff = (
    field: string,
    label: string,
    currentValue: ProductImportDiffValue,
    nextValue: ProductImportDiffValue,
    format: ProductImportDiff["format"] = "text",
  ) => {
    if (!sameValue(currentValue, nextValue)) {
      diffs.push({ field, label, currentValue, nextValue, format });
    }
  };

  const category = firstRelation(existing.categories);
  addDiff("category", "Categoría", category?.slug ?? null, row.categorySlug);
  addDiff("name", "Nombre", existing.name, row.name);
  addDiff("slug", "Slug", existing.slug, row.slug);

  for (const attribute of row.attributes.filter((item) => item.value.trim())) {
    const currentValues = existing.product_attributes
      .filter((item) => item.name === attribute.name)
      .map((item) => item.value)
      .sort();
    addDiff(
      `attribute:${attribute.name}`,
      attribute.name,
      currentValues,
      [attribute.value],
      "list",
    );
  }

  for (const update of row.catalogAttributeUpdates) {
    addDiff(
      `attribute:${update.key}`,
      update.label,
      normalizedValues(
        getCatalogAttributeValues(existing.product_attributes, update.key),
      ),
      normalizedValues(update.values),
      "list",
    );
  }

  return diffs.length > 0
    ? { kind: "update", diffs }
    : { kind: "unchanged", diffs: [] };
}

export function buildExistingPerfumeImportPatch(
  row: NormalizedProductImportRow,
  categoryId: string | null,
  diffs: ProductImportDiff[],
) {
  const changedFields = new Set(diffs.map((diff) => diff.field));
  return {
    ...(categoryId && changedFields.has("category")
      ? { category_id: categoryId }
      : {}),
    ...(changedFields.has("name") ? { name: row.name } : {}),
    ...(changedFields.has("slug") ? { slug: row.slug } : {}),
  };
}

export function buildPerfumeExistingPatch(
  row: NormalizedProductImportRow,
  categoryId: string,
) {
  return {
    category_id: categoryId,
    name: row.name,
    slug: row.slug,
  };
}
