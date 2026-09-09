import {
  CATALOG_ATTRIBUTE_KEYS,
  getAttributeFieldsForCategory,
  normalizeCatalogAttributeValue,
  type CatalogAttributeField,
  type CatalogAttributeKey,
} from "@/lib/catalog/attribute-config";
import {
  SUPPORTED_PRODUCT_SHEETS,
  type ImportCatalogAttributeUpdate,
  type NormalizedProductImportRow,
  type SupportedProductSheet,
} from "@/lib/product-import/types";
import { isRestrictedPriceImportProduct } from "@/lib/product-import/price-import";

export const RELEVANT_COLUMNS: Record<SupportedProductSheet, readonly string[]> = {
  "Producto Perfumes": [
    "Producto",
    "Costo unitario",
    "Margen (%)",
    "Precio de venta",
    "Descuento",
    "Precio final con descuento",
    "Proveedor",
    "Categoría comercial",
    "Familia olfativa",
    "Intensidad",
    "Momento",
    "Género",
    "Disponible como decant",
  ],
  "Termos y Mates": [
    "Producto",
    "Precio de venta",
    "Descuento",
    "Precio final con descuento",
    "Tipo de mate",
    "Material",
    "Color",
    "Uso",
  ],
  "Precios Productos": [
    "Producto",
    "Costo unitario",
    "PORCENTAJE GANANCIA",
    "PRECIO CON DESCUENTO",
    "DESCUENTO",
    "PRECIO LISTA",
  ],
};

type AttributeColumn = {
  key: CatalogAttributeKey;
  label: string;
  categorySlug: "perfumes" | "mates";
  aliases: readonly string[];
};

const ATTRIBUTE_COLUMNS: readonly AttributeColumn[] = [
  { key: CATALOG_ATTRIBUTE_KEYS.commercialCategory, label: "Categoría comercial", categorySlug: "perfumes", aliases: ["Categoría comercial", "Categoria comercial", "Categorías", "Categorias"] },
  { key: CATALOG_ATTRIBUTE_KEYS.olfactoryFamily, label: "Familia olfativa", categorySlug: "perfumes", aliases: ["Familia olfativa", "Familia"] },
  { key: CATALOG_ATTRIBUTE_KEYS.intensity, label: "Intensidad", categorySlug: "perfumes", aliases: ["Intensidad"] },
  { key: CATALOG_ATTRIBUTE_KEYS.occasion, label: "Momento", categorySlug: "perfumes", aliases: ["Momento", "Ocasión", "Ocasion"] },
  { key: CATALOG_ATTRIBUTE_KEYS.gender, label: "Género", categorySlug: "perfumes", aliases: ["Género", "Genero"] },
  { key: CATALOG_ATTRIBUTE_KEYS.decantAvailable, label: "Disponible como decant", categorySlug: "perfumes", aliases: ["Disponible como decant", "Decant", "Decant disponible"] },
  { key: CATALOG_ATTRIBUTE_KEYS.mateType, label: "Tipo de mate", categorySlug: "mates", aliases: ["Tipo de mate", "Tipo Mate"] },
  { key: CATALOG_ATTRIBUTE_KEYS.material, label: "Material", categorySlug: "mates", aliases: ["Material"] },
  { key: CATALOG_ATTRIBUTE_KEYS.color, label: "Color", categorySlug: "mates", aliases: ["Color"] },
  { key: CATALOG_ATTRIBUTE_KEYS.useCase, label: "Uso", categorySlug: "mates", aliases: ["Uso"] },
];

export function normalizeImportText(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizeImportHeader(value: string) {
  return normalizeImportText(value)
    .replace(/[¿?()%.]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function slugifyImportedProduct(value: string) {
  return normalizeImportText(value).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function isSupportedProductSheet(value: string): value is SupportedProductSheet {
  return SUPPORTED_PRODUCT_SHEETS.includes(value as SupportedProductSheet);
}

export function isRelevantEditedColumn(sheet: SupportedProductSheet, column: string) {
  const normalized = normalizeImportHeader(column);
  return RELEVANT_COLUMNS[sheet].some((item) => normalizeImportHeader(item) === normalized);
}

export function isRestrictedImportedProduct(name: string) {
  return isRestrictedPriceImportProduct(name);
}

function findCell(row: Record<string, unknown>, aliases: readonly string[]) {
  const normalizedAliases = new Set(aliases.map(normalizeImportHeader));
  return Object.entries(row).find(([key]) => normalizedAliases.has(normalizeImportHeader(key)));
}

export function getImportCell(row: Record<string, unknown>, aliases: readonly string[]) {
  const entry = findCell(row, aliases);
  return {
    present: Boolean(entry),
    value: entry?.[1] ?? null,
    nonBlank: Boolean(entry && String(entry[1] ?? "").trim()),
  };
}

function readString(row: Record<string, unknown>, aliases: readonly string[]) {
  return String(findCell(row, aliases)?.[1] ?? "").trim();
}

export function parseImportNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const sanitized = String(value ?? "").trim().replace(/[^0-9,.-]/g, "");
  if (!sanitized) return null;
  const hasComma = sanitized.includes(",");
  const hasDot = sanitized.includes(".");
  let normalized = sanitized;
  if (hasComma && hasDot) normalized = sanitized.replace(/\./g, "").replace(",", ".");
  else if (hasComma) normalized = sanitized.replace(",", ".");
  else if (hasDot) {
    const parts = sanitized.split(".");
    if (parts.length > 1 && (parts.at(-1) ?? "").length === 3) normalized = sanitized.replace(/\./g, "");
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeAttributeValue(rawValue: string, field: CatalogAttributeField) {
  const normalized = normalizeCatalogAttributeValue(rawValue);
  if (field.input === "boolean") {
    if (["true", "si", "1"].includes(normalized)) return "true";
    if (["false", "no", "0"].includes(normalized)) return "false";
    return null;
  }
  return field.options.find((item) => item.value === normalized || normalizeCatalogAttributeValue(item.label) === normalized)?.value ?? null;
}

function parseAttributeUpdates(row: Record<string, unknown>, categorySlug: string) {
  const updates: ImportCatalogAttributeUpdate[] = [];
  const warnings: string[] = [];
  for (const column of ATTRIBUTE_COLUMNS) {
    const cell = findCell(row, column.aliases);
    if (!cell) continue;
    const rawValue = String(cell[1] ?? "").trim();
    if (!rawValue) continue;
    if (column.categorySlug !== categorySlug) continue;
    const field = getAttributeFieldsForCategory(categorySlug).find((item) => item.key === column.key);
    if (!field) continue;
    const sourceValues = field.multiple ? rawValue.split(/[,;]/).map((value) => value.trim()).filter(Boolean) : [rawValue];
    const values = sourceValues.map((value) => normalizeAttributeValue(value, field)).filter((value): value is string => Boolean(value));
    const uniqueValues = [...new Set(values)];
    if (uniqueValues.length === 0) {
      warnings.push(`${column.label} no tiene valores reconocidos; se ignoró.`);
      continue;
    }
    updates.push({ key: column.key, label: column.label, values: field.multiple ? uniqueValues : uniqueValues.slice(0, 1) });
  }
  return { updates, warnings };
}

function inferCategory(name: string, sheet: SupportedProductSheet) {
  const normalized = normalizeImportText(name);
  if (sheet === "Producto Perfumes") return { categoryName: "Perfumes", categorySlug: "perfumes", warnings: [] as string[] };
  if (normalized.includes("bombilla") || normalized.includes("bombillon")) return { categoryName: "Bombillas", categorySlug: "bombillas", warnings: [] as string[] };
  if (["termo", "stanley", "hoppy", "botella"].some((term) => normalized.includes(term))) return { categoryName: "Termos", categorySlug: "termos", warnings: [] as string[] };
  if (normalized.includes("mate")) return { categoryName: "Mates", categorySlug: "mates", warnings: [] as string[] };
  if (normalized.includes("box") || normalized.includes("combo")) return { categoryName: "Regalos", categorySlug: "regalos", warnings: [] as string[] };
  if (sheet === "Precios Productos" && ["auricular", "airpods", "jbl", "parlante", "cable", "cabezal", "battery"].some((term) => normalized.includes(term))) {
    return { categoryName: "Electrónica", categorySlug: "electronica", warnings: [] as string[] };
  }
  return { categoryName: "Accesorios", categorySlug: "accesorios", warnings: ["No se pudo inferir la categoría con seguridad; se usará Accesorios."] };
}

function descriptions(name: string, categoryName: string) {
  return {
    shortDescription: `${name} disponible en SFSTORE. Te ayudamos a elegir según tus gustos, ocasión y presupuesto.`,
    description: `${name} forma parte del catálogo de ${categoryName.toLowerCase()} de SFSTORE. Si tenés dudas, te acompañamos para elegir una opción útil, linda y adecuada para comprar o regalar.`,
  };
}

export function normalizeProductImportRow(sheet: SupportedProductSheet, row: Record<string, unknown>, rowNumber: number): NormalizedProductImportRow | null {
  const name = readString(row, ["Producto"]);
  if (!name) return null;
  const category = sheet === "Precios Productos"
    ? { categoryName: "Sin categoría fuente", categorySlug: "", warnings: [] as string[] }
    : inferCategory(name, sheet);
  const copy = descriptions(name, category.categoryName);
  const catalogAttributes = parseAttributeUpdates(row, category.categorySlug);
  let priceCell;
  let transferPriceCell;
  let costCell;
  let price: number | null;
  let transferPrice: number | null;
  let cost: number | null;
  if (sheet === "Producto Perfumes") {
    priceCell = getImportCell(row, ["Precio de venta"]);
    transferPriceCell = getImportCell(row, ["Precio final con descuento"]);
    costCell = getImportCell(row, ["Costo unitario"]);
    price = parseImportNumber(priceCell.value);
    transferPrice = parseImportNumber(transferPriceCell.value);
    cost = parseImportNumber(costCell.value);
  } else if (sheet === "Termos y Mates") {
    priceCell = getImportCell(row, ["Precio de venta"]);
    transferPriceCell = getImportCell(row, ["Precio final con descuento"]);
    costCell = { present: false, nonBlank: false, value: null };
    const salePrice = parseImportNumber(priceCell.value);
    const finalPrice = parseImportNumber(transferPriceCell.value);
    price = salePrice;
    transferPrice = null;
    if (finalPrice !== null && salePrice !== null && finalPrice > salePrice) {
      price = finalPrice;
      transferPrice = salePrice;
    }
    cost = null;
  } else {
    priceCell = getImportCell(row, ["PRECIO LISTA", "Precio lista"]);
    transferPriceCell = getImportCell(row, ["PRECIO CON DESCUENTO", "Precio con descuento"]);
    costCell = getImportCell(row, ["Costo unitario"]);
    price = parseImportNumber(priceCell.value);
    transferPrice = parseImportNumber(transferPriceCell.value);
    cost = parseImportNumber(costCell.value);
  }
  const errors: string[] = [];
  const warnings = [...category.warnings, ...catalogAttributes.warnings];
  if (sheet === "Producto Perfumes" && normalizeImportText(readString(row, ["¿Es rentable?", "Es rentable"])).includes("no")) {
    warnings.push("La planilla marca este producto como no rentable; revisar margen.");
  }
  if (isRestrictedImportedProduct(name)) errors.push("Producto restringido: revisar manualmente");
  if (sheet !== "Precios Productos" && (price === null || price <= 0)) errors.push("Precio lista inválido o faltante");
  if (sheet === "Precios Productos" && priceCell.nonBlank && (price === null || price <= 0)) errors.push("Precio lista inválido");
  if (sheet === "Precios Productos" && transferPriceCell.nonBlank && (transferPrice === null || transferPrice <= 0)) errors.push("Precio efectivo/transferencia inválido");
  if (transferPrice !== null && price !== null && transferPrice >= price) errors.push("Precio efectivo/transferencia debe ser menor que precio lista");
  if (costCell.nonBlank && (cost === null || cost < 0)) errors.push("El costo no puede ser negativo.");
  return {
    rowNumber,
    sourceSheet: sheet,
    name,
    slug: slugifyImportedProduct(name),
    categoryName: category.categoryName,
    categorySlug: category.categorySlug,
    price,
    transferPrice,
    cost,
    commercialFields: {
      priceProvided: priceCell.nonBlank,
      transferPriceProvided: transferPriceCell.nonBlank,
      costProvided: costCell.nonBlank,
    },
    stock: 0,
    status: sheet !== "Precios Productos" && errors.length === 0 ? "active" : "draft",
    sku: null,
    shortDescription: copy.shortDescription,
    description: copy.description,
    attributes: sheet === "Precios Productos" ? [] : [
      sheet === "Producto Perfumes" && readString(row, ["Proveedor"]) ? { name: "Proveedor", value: readString(row, ["Proveedor"]), sortOrder: 10 } : null,
      { name: "Tipo", value: category.categoryName, sortOrder: 20 },
    ].filter((item): item is NonNullable<typeof item> => Boolean(item)),
    catalogAttributeUpdates: catalogAttributes.updates,
    warnings,
    errors,
  };
}

export function normalizeProductImportRows(sheet: SupportedProductSheet, rows: Record<string, unknown>[]) {
  return rows.map((row, index) => normalizeProductImportRow(sheet, row, index + 2)).filter((row): row is NormalizedProductImportRow => Boolean(row));
}
