import {
  getCatalogAttributeValues,
  normalizeCatalogAttributeValue,
} from "@/lib/catalog/attribute-config";
import { normalizePriceImportMoney } from "@/lib/product-import/price-import";
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
  category_id: string;
  name: string;
  slug: string;
  short_description: string;
  description: string | null;
  status: "draft" | "active" | "archived";
  price: number;
  transfer_price: number | null;
  compare_at_price: number | null;
  cost: number | null;
  stock: number;
  sku: string | null;
  featured: boolean;
  categories: { name: string; slug: string } | Array<{ name: string; slug: string }> | null;
  product_attributes: Array<{ name: string; value: string; sort_order: number }>;
};

type PerfumeImportComparisonMode = "confirmation" | "automatic";

export type PerfumeImportDecision =
  | { kind: "create"; diffs: [] }
  | { kind: "unchanged"; diffs: [] }
  | { kind: "update"; diffs: ProductImportDiff[] };

function firstRelation<T>(relation: T | T[] | null | undefined) {
  return Array.isArray(relation) ? relation[0] ?? null : relation ?? null;
}

function sameValue(
  currentValue: ProductImportDiffValue,
  nextValue: ProductImportDiffValue,
) {
  if (Array.isArray(currentValue) && Array.isArray(nextValue)) {
    return currentValue.length === nextValue.length &&
      currentValue.every((value, index) => value === nextValue[index]);
  }
  return currentValue === nextValue;
}

function normalizedValues(values: string[]) {
  return [...new Set(values.map(normalizeCatalogAttributeValue))].sort();
}

export function buildPerfumeImportDecision(
  row: NormalizedProductImportRow,
  existing: ExistingPerfumeImportProduct | null,
  mode: PerfumeImportComparisonMode = "confirmation",
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
  addDiff(
    "price",
    "Precio lista",
    normalizePriceImportMoney(existing.price),
    normalizePriceImportMoney(row.price),
    "money",
  );
  addDiff(
    "transfer_price",
    "Efectivo/transferencia",
    normalizePriceImportMoney(existing.transfer_price),
    normalizePriceImportMoney(row.transferPrice),
    "money",
  );
  addDiff(
    "cost",
    "Costo",
    normalizePriceImportMoney(existing.cost),
    normalizePriceImportMoney(row.cost),
    "money",
  );

  if (mode === "confirmation") {
    addDiff("short_description", "Descripción corta", existing.short_description, row.shortDescription);
    addDiff("description", "Descripción", existing.description, row.description);
    addDiff("compare_at_price", "Precio anterior", existing.compare_at_price, null, "money");
    addDiff("stock", "Stock", existing.stock, row.stock);
    addDiff("sku", "SKU", existing.sku, row.sku);
    addDiff("featured", "Destacado", existing.featured, false, "boolean");
    addDiff("status", "Estado", existing.status, row.status);
  }

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
      normalizedValues(getCatalogAttributeValues(existing.product_attributes, update.key)),
      normalizedValues(update.values),
      "list",
    );
  }

  return diffs.length > 0
    ? { kind: "update", diffs }
    : { kind: "unchanged", diffs: [] };
}
