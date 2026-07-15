"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as XLSX from "xlsx";
import { requireAdminActionSession } from "@/lib/admin-session";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

const SUPPORTED_SHEETS = [
  "Producto Perfumes",
  "Termos y Mates",
  "Precios Productos",
] as const;

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_GOOGLE_CSV_SIZE = 2 * 1024 * 1024;
const GOOGLE_SHEETS_TIMEOUT_MS = 12000;
const IMPORTABLE_MIME_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/csv",
  "application/csv",
  "text/plain",
  "",
]);

type SupportedSheet = (typeof SUPPORTED_SHEETS)[number];
type ProductStatus = "draft" | "active";
type ImportAction = "create" | "update" | "blocked" | "error";
type ImportSource = "file" | "google";
type PreviewRowState = "valid" | "warning" | "blocked" | "error";

type ImportAttribute = {
  name: string;
  value: string;
  sortOrder: number;
};

export type ProductImportPreviewRow = {
  key: string;
  rowNumber: number;
  sourceSheet: SupportedSheet;
  action: ImportAction;
  rowState: PreviewRowState;
  canImport: boolean;
  excludedFromImport: boolean;
  existingProductId: string | null;
  name: string;
  slug: string;
  categoryName: string;
  categorySlug: string;
  price: number | null;
  transferPrice: number | null;
  cost: number | null;
  stock: number;
  status: ProductStatus;
  sku: string | null;
  shortDescription: string;
  description: string;
  attributes: ImportAttribute[];
  warnings: string[];
  errors: string[];
};

export type ProductImportPreviewState = {
  ok: boolean;
  message: string | null;
  sheetName: string;
  rows: ProductImportPreviewRow[];
  counts: {
    valid: number;
    warnings: number;
    errors: number;
    create: number;
    update: number;
    blocked: number;
  };
  source: ImportSource;
};

type ExistingProduct = {
  id: string;
  slug: string;
  sku: string | null;
};

type CategoryRecord = {
  id: string;
  name: string;
  slug: string;
};

type ParsedRowBase = Omit<
  ProductImportPreviewRow,
  "key" | "action" | "rowState" | "canImport" | "excludedFromImport" | "existingProductId"
>;

type ConfirmRow = ProductImportPreviewRow & {
  canImport: true;
  excludedFromImport: false;
  rowState: "valid" | "warning";
};

const initialCounts = {
  valid: 0,
  warnings: 0,
  errors: 0,
  create: 0,
  update: 0,
  blocked: 0,
};

const emptyImportPreviewState: ProductImportPreviewState = {
  ok: false,
  message: null,
  sheetName: "Producto Perfumes",
  rows: [],
  counts: initialCounts,
  source: "file",
};

function normalizeText(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeHeader(value: string) {
  return normalizeText(value)
    .replace(/[¿?()%.]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isSupportedSheet(sheetName: string): sheetName is SupportedSheet {
  return SUPPORTED_SHEETS.includes(sheetName as SupportedSheet);
}

function getCell(row: Record<string, unknown>, aliases: string[]) {
  const normalizedAliases = aliases.map(normalizeHeader);

  for (const [key, value] of Object.entries(row)) {
    if (normalizedAliases.includes(normalizeHeader(key))) {
      return value;
    }
  }

  return "";
}

function readString(row: Record<string, unknown>, aliases: string[]) {
  return String(getCell(row, aliases) ?? "").trim();
}

function parseNumberValue(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const raw = String(value ?? "").trim();

  if (!raw) {
    return null;
  }

  const sanitized = raw.replace(/[^0-9,.-]/g, "");

  if (!sanitized) {
    return null;
  }

  const hasComma = sanitized.includes(",");
  const hasDot = sanitized.includes(".");
  let normalized = sanitized;

  if (hasComma && hasDot) {
    normalized = sanitized.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    normalized = sanitized.replace(",", ".");
  } else if (hasDot) {
    const parts = sanitized.split(".");
    const last = parts.at(-1) ?? "";

    if (parts.length > 1 && last.length === 3) {
      normalized = sanitized.replace(/\./g, "");
    }
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function readNumber(row: Record<string, unknown>, aliases: string[]) {
  return parseNumberValue(getCell(row, aliases));
}

function isBlankSpreadsheetRow(row: Record<string, unknown>) {
  return Object.values(row).every((value) => String(value ?? "").trim() === "");
}

function inferCategoryFromName(name: string, sheetName: SupportedSheet) {
  const normalized = normalizeText(name);
  const warnings: string[] = [];
  const restrictedTerms = ["vape", "elfbar", "ignite", "ignate"];

  if (
    sheetName === "Precios Productos" &&
    restrictedTerms.some((term) => normalized.includes(term))
  ) {
    return {
      categoryName: "Accesorios",
      categorySlug: "accesorios",
      warnings,
      restricted: true,
    };
  }

  if (sheetName === "Producto Perfumes") {
    return {
      categoryName: "Perfumes",
      categorySlug: "perfumes",
      warnings,
      restricted: false,
    };
  }

  if (normalized.includes("bombilla") || normalized.includes("bombillon")) {
    return {
      categoryName: "Bombillas",
      categorySlug: "bombillas",
      warnings,
      restricted: false,
    };
  }

  if (
    normalized.includes("termo") ||
    normalized.includes("stanley") ||
    normalized.includes("hoppy") ||
    normalized.includes("botella")
  ) {
    return {
      categoryName: "Termos",
      categorySlug: "termos",
      warnings,
      restricted: false,
    };
  }

  if (normalized.includes("mate")) {
    return {
      categoryName: "Mates",
      categorySlug: "mates",
      warnings,
      restricted: false,
    };
  }

  if (normalized.includes("box") || normalized.includes("combo")) {
    return {
      categoryName: "Regalos",
      categorySlug: "regalos",
      warnings,
      restricted: false,
    };
  }

  if (
    sheetName === "Precios Productos" &&
    [
      "auricular",
      "airpods",
      "jbl",
      "parlante",
      "cable",
      "cabezal",
      "battery",
    ].some((term) => normalized.includes(term))
  ) {
    return {
      categoryName: "Electrónica",
      categorySlug: "electronica",
      warnings,
      restricted: false,
    };
  }

  warnings.push("No se pudo inferir la categoría con seguridad; se usará Accesorios.");

  return {
    categoryName: "Accesorios",
    categorySlug: "accesorios",
    warnings,
    restricted: false,
  };
}

function buildFallbackDescriptions(name: string, categoryName: string) {
  return {
    shortDescription: `${name} disponible en SFSTORE. Te ayudamos a elegir según tus gustos, ocasión y presupuesto.`,
    description: `${name} forma parte del catálogo de ${categoryName.toLowerCase()} de SFSTORE. Si tenés dudas, te acompañamos para elegir una opción útil, linda y adecuada para comprar o regalar.`,
  };
}

function mapPerfumeRow(
  row: Record<string, unknown>,
  rowNumber: number,
): ParsedRowBase | null {
  const name = readString(row, ["Producto"]);

  if (!name) {
    return null;
  }

  const price = readNumber(row, ["Precio de venta"]);
  const transferPrice = readNumber(row, ["Precio final con descuento"]);
  const cost = readNumber(row, ["Costo unitario"]);
  const provider = readString(row, ["Proveedor"]);
  const profitable = readString(row, ["¿Es rentable?", "Es rentable"]);
  const warnings: string[] = [];
  const errors: string[] = [];
  const category = inferCategoryFromName(name, "Producto Perfumes");
  const descriptions = buildFallbackDescriptions(name, category.categoryName);

  if (profitable && normalizeText(profitable).includes("no")) {
    warnings.push("La planilla marca este producto como no rentable; revisar margen.");
  }

  return {
    rowNumber,
    sourceSheet: "Producto Perfumes",
    name,
    slug: slugify(name),
    categoryName: category.categoryName,
    categorySlug: category.categorySlug,
    price,
    transferPrice,
    cost,
    stock: 0,
    status: price && price > 0 ? "active" : "draft",
    sku: null,
    shortDescription: descriptions.shortDescription,
    description: descriptions.description,
    attributes: [
      provider
        ? { name: "Proveedor", value: provider, sortOrder: 10 }
        : null,
      { name: "Tipo", value: "Perfume", sortOrder: 20 },
    ].filter((attribute): attribute is ImportAttribute => Boolean(attribute)),
    warnings: [...category.warnings, ...warnings],
    errors,
  };
}

function mapTermosMatesRow(
  row: Record<string, unknown>,
  rowNumber: number,
): ParsedRowBase | null {
  const name = readString(row, ["Producto"]);

  if (!name) {
    return null;
  }

  const salePrice = readNumber(row, ["Precio de venta"]);
  const finalPrice = readNumber(row, ["Precio final con descuento"]);
  const category = inferCategoryFromName(name, "Termos y Mates");
  const descriptions = buildFallbackDescriptions(name, category.categoryName);
  let price = salePrice;
  let transferPrice: number | null = null;

  if (finalPrice !== null && salePrice !== null && finalPrice > salePrice) {
    price = finalPrice;
    transferPrice = salePrice;
  }

  return {
    rowNumber,
    sourceSheet: "Termos y Mates",
    name,
    slug: slugify(name),
    categoryName: category.categoryName,
    categorySlug: category.categorySlug,
    price,
    transferPrice,
    cost: null,
    stock: 0,
    status: price && price > 0 ? "active" : "draft",
    sku: null,
    shortDescription: descriptions.shortDescription,
    description: descriptions.description,
    attributes: [{ name: "Tipo", value: category.categoryName, sortOrder: 20 }],
    warnings: category.warnings,
    errors: [],
  };
}

function mapPreciosProductosRow(
  row: Record<string, unknown>,
  rowNumber: number,
): ParsedRowBase | null {
  const name = readString(row, ["Producto"]);

  if (!name) {
    return null;
  }

  const category = inferCategoryFromName(name, "Precios Productos");
  const descriptions = buildFallbackDescriptions(name, category.categoryName);
  const warnings = [...category.warnings];
  const errors: string[] = [];

  if (category.restricted) {
    errors.push("Producto restringido: revisar manualmente");
  }

  return {
    rowNumber,
    sourceSheet: "Precios Productos",
    name,
    slug: slugify(name),
    categoryName: category.categoryName,
    categorySlug: category.categorySlug,
    price: readNumber(row, ["PRECIO LISTA", "Precio lista"]),
    transferPrice: readNumber(row, ["PRECIO CON DESCUENTO", "Precio con descuento"]),
    cost: readNumber(row, ["Costo unitario"]),
    stock: 0,
    status: "draft",
    sku: null,
    shortDescription: descriptions.shortDescription,
    description: descriptions.description,
    attributes: [{ name: "Tipo", value: category.categoryName, sortOrder: 20 }],
    warnings,
    errors,
  };
}

function validateParsedRow(row: ParsedRowBase) {
  const warnings = [...row.warnings];
  const errors = [...row.errors];

  if (!row.slug) {
    errors.push("No se pudo generar un slug válido desde el nombre.");
  }

  if (row.price === null || row.price <= 0) {
    errors.push("Precio lista inválido o faltante");
  }

  if (row.transferPrice !== null && row.price !== null && row.transferPrice >= row.price) {
    errors.push("Precio efectivo/transferencia debe ser menor que precio lista");
  }

  if (row.cost !== null && row.cost < 0) {
    errors.push("El costo no puede ser negativo.");
  }

  return {
    ...row,
    status: row.price !== null && row.price > 0 && errors.length === 0 ? row.status : "draft",
    warnings,
    errors,
  } satisfies ParsedRowBase;
}

function mapRows(sheetName: SupportedSheet, rows: Record<string, unknown>[]) {
  return rows
    .map((row, index) => {
      if (isBlankSpreadsheetRow(row)) {
        return null;
      }

      const rowNumber = index + 2;

      if (sheetName === "Producto Perfumes") {
        return mapPerfumeRow(row, rowNumber);
      }

      if (sheetName === "Termos y Mates") {
        return mapTermosMatesRow(row, rowNumber);
      }

      return mapPreciosProductosRow(row, rowNumber);
    })
    .filter((row): row is ParsedRowBase => Boolean(row))
    .map(validateParsedRow);
}

async function readWorkbook(file: File) {
  if (file.size <= 0) {
    throw new Error("Subí un archivo .xlsx o .csv para previsualizar.");
  }

  if (file.size > MAX_FILE_SIZE) {
    throw new Error("El archivo supera el límite de 5 MB.");
  }

  const fileName = file.name.toLowerCase();
  const isSpreadsheet = fileName.endsWith(".xlsx") || fileName.endsWith(".xls");
  const isCsv = fileName.endsWith(".csv");

  if (!isSpreadsheet && !isCsv) {
    throw new Error("Formato inválido. Usá .xlsx, .xls o .csv.");
  }

  if (!IMPORTABLE_MIME_TYPES.has(file.type)) {
    throw new Error("Tipo de archivo inválido para importación.");
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  return XLSX.read(buffer, {
    type: "buffer",
    cellDates: false,
    raw: false,
  });
}

function extractGoogleSheetConfig(sheetUrl: string, manualGid: string) {
  let url: URL;

  try {
    url = new URL(sheetUrl.trim());
  } catch {
    throw new Error("El link de Google Sheets no es válido.");
  }

  if (url.protocol !== "https:" || url.hostname !== "docs.google.com") {
    throw new Error("Solo se aceptan links públicos de docs.google.com/spreadsheets.");
  }

  const match = url.pathname.match(/^\/spreadsheets\/d\/([A-Za-z0-9_-]+)(?:\/|$)/);
  const spreadsheetId = match?.[1] ?? "";

  if (!spreadsheetId || spreadsheetId.length < 20) {
    throw new Error("No pude detectar el ID del Sheet.");
  }

  const gidFromHash = url.hash.match(/gid=(\d+)/)?.[1] ?? "";
  const gidFromQuery = url.searchParams.get("gid") ?? "";
  const gid = (gidFromQuery || gidFromHash || manualGid).trim();

  if (!gid) {
    throw new Error("No pude detectar el gid. Pegá el gid manualmente.");
  }

  if (!/^\d+$/.test(gid)) {
    throw new Error("El gid debe ser numérico.");
  }

  return { spreadsheetId, gid };
}

async function fetchGoogleSheetCsv(spreadsheetId: string, gid: string) {
  const csvUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`;
  const response = await fetch(csvUrl, {
    method: "GET",
    redirect: "follow",
    signal: AbortSignal.timeout(GOOGLE_SHEETS_TIMEOUT_MS),
  }).catch(() => {
    throw new Error(
      "No pude acceder al Sheet. Revisá que esté compartido como cualquiera con el enlace puede ver.",
    );
  });

  if (!response.ok) {
    throw new Error(
      "No pude acceder al Sheet. Revisá que esté compartido como cualquiera con el enlace puede ver.",
    );
  }

  const contentType = response.headers.get("content-type") ?? "";
  const buffer = await response.arrayBuffer();

  if (buffer.byteLength > MAX_GOOGLE_CSV_SIZE) {
    throw new Error("La respuesta de Google Sheets es demasiado grande para importar.");
  }

  const csvText = Buffer.from(buffer).toString("utf8").trim();

  if (!csvText || csvText.startsWith("<") || contentType.includes("text/html")) {
    throw new Error("Google devolvió una respuesta vacía o no válida.");
  }

  return csvText;
}

function parseCsvRows(csvText: string) {
  const workbook = XLSX.read(csvText, {
    type: "string",
    raw: false,
  });
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];

  if (!worksheet) {
    throw new Error("Google devolvió una respuesta vacía o no válida.");
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
    defval: "",
    raw: false,
  });

  if (rows.length === 0) {
    throw new Error("La hoja no tiene columnas reconocidas.");
  }

  return rows;
}
async function findExistingProducts(rows: ParsedRowBase[]) {
  const supabase = getSupabaseAdminClient();
  const slugs = Array.from(new Set(rows.map((row) => row.slug).filter(Boolean)));

  if (slugs.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("products")
    .select("id, slug, sku")
    .in("slug", slugs);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as ExistingProduct[];
}

function buildPreviewState({
  sheetName,
  parsedRows,
  existingProducts,
  source = "file",
}: {
  sheetName: SupportedSheet;
  parsedRows: ParsedRowBase[];
  existingProducts: ExistingProduct[];
  source?: ImportSource;
}): ProductImportPreviewState {
  const existingBySlug = new Map(existingProducts.map((product) => [product.slug, product]));
  const rows = parsedRows.map((row) => {
    const existingProduct = row.sku
      ? existingProducts.find((product) => product.sku === row.sku)
      : existingBySlug.get(row.slug);
    const isBlocked = row.errors.some((error) =>
      error.toLowerCase().includes("producto restringido"),
    );
    const hasErrors = row.errors.length > 0;
    const canImport = !hasErrors;
    const rowState: PreviewRowState = isBlocked
      ? "blocked"
      : hasErrors
        ? "error"
        : row.warnings.length > 0
          ? "warning"
          : "valid";

    return {
      ...row,
      key: `${row.sourceSheet}-${row.rowNumber}-${row.slug}`,
      action: canImport ? (existingProduct ? "update" : "create") : isBlocked ? "blocked" : "error",
      rowState,
      canImport,
      excludedFromImport: !canImport,
      existingProductId: existingProduct?.id ?? null,
    } satisfies ProductImportPreviewRow;
  });

  return {
    ok: true,
    sheetName,
    message: `Se previsualizaron ${rows.length} filas de ${sheetName}.`,
    rows,
    counts: {
      valid: rows.filter((row) => row.canImport).length,
      warnings: rows.filter((row) => row.rowState === "warning").length,
      errors: rows.filter((row) => row.rowState === "error").length,
      create: rows.filter((row) => row.action === "create").length,
      update: rows.filter((row) => row.action === "update").length,
      blocked: rows.filter((row) => row.rowState === "blocked").length,
    },
    source,
  };
}

function safeParsePreviewPayload(value: FormDataEntryValue | null) {
  const raw = String(value ?? "");

  if (!raw) {
    throw new Error("No hay una previsualización válida para importar.");
  }

  const parsed = JSON.parse(raw) as ProductImportPreviewRow[];
  const skippedErrors = parsed.filter((row) => row.rowState === "error").length;
  const skippedBlocked = parsed.filter((row) => row.rowState === "blocked").length;
  const rows = parsed.filter(
    (row): row is ConfirmRow =>
      row.canImport === true &&
      row.excludedFromImport === false &&
      (row.rowState === "valid" || row.rowState === "warning"),
  );

  return { rows, skippedErrors, skippedBlocked };
}

async function getOrCreateCategory(categoryName: string, categorySlug: string) {
  const supabase = getSupabaseAdminClient();
  const { data: existing, error: readError } = await supabase
    .from("categories")
    .select("id, name, slug")
    .eq("slug", categorySlug)
    .maybeSingle();

  if (readError) {
    throw new Error(readError.message);
  }

  if (existing) {
    return existing as CategoryRecord;
  }

  const category = {
    id: crypto.randomUUID(),
    name: categoryName,
    slug: categorySlug,
    description: null,
    is_active: true,
    sort_order: 100,
  };

  const { error: insertError } = await supabase.from("categories").insert(category);

  if (insertError) {
    throw new Error(insertError.message);
  }

  return category;
}

async function replaceImportAttributes(productId: string, attributes: ImportAttribute[]) {
  const supabase = getSupabaseAdminClient();
  const importAttributeNames = ["Proveedor", "Tipo"];

  const { error: deleteError } = await supabase
    .from("product_attributes")
    .delete()
    .eq("product_id", productId)
    .in("name", importAttributeNames);

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  const rows = attributes
    .filter((attribute) => attribute.value.trim())
    .map((attribute) => ({
      id: crypto.randomUUID(),
      product_id: productId,
      name: attribute.name,
      value: attribute.value,
      sort_order: attribute.sortOrder,
    }));

  if (rows.length === 0) {
    return;
  }

  const { error: insertError } = await supabase.from("product_attributes").insert(rows);

  if (insertError) {
    throw new Error(insertError.message);
  }
}

function revalidateConfirmRow(row: ConfirmRow) {
  const normalizedName = normalizeText(row.name);
  const restrictedTerms = ["vape", "elfbar", "ignite", "ignate"];

  if (restrictedTerms.some((term) => normalizedName.includes(term))) {
    return "Producto restringido: revisar manualmente";
  }

  if (!row.slug) {
    return "Slug inválido";
  }

  if (row.price === null || row.price <= 0) {
    return "Precio lista inválido o faltante";
  }

  if (row.transferPrice !== null && row.transferPrice >= row.price) {
    return "Precio efectivo/transferencia debe ser menor que precio lista";
  }

  return null;
}

async function getExistingProductIdsBySlug(slugs: string[]) {
  const uniqueSlugs = Array.from(new Set(slugs.filter(Boolean)));

  if (uniqueSlugs.length === 0) {
    return new Map<string, string>();
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("products")
    .select("id, slug")
    .in("slug", uniqueSlugs);

  if (error) {
    throw new Error(`No se pudieron verificar productos existentes: ${error.message}`);
  }

  return new Map(
    ((data ?? []) as { id: string; slug: string }[]).map((product) => [
      product.slug,
      product.id,
    ]),
  );
}
function getProductPayload(row: ConfirmRow, categoryId: string) {
  return {
    category_id: categoryId,
    name: row.name,
    slug: row.slug,
    short_description: row.shortDescription,
    description: row.description,
    price: row.price ?? 0,
    transfer_price: row.transferPrice,
    compare_at_price: null,
    cost: row.cost,
    stock: row.stock,
    sku: row.sku,
    featured: false,
    status: row.price && row.price > 0 ? row.status : "draft",
  };
}

export async function previewProductImport(
  _previousState: ProductImportPreviewState,
  formData: FormData,
): Promise<ProductImportPreviewState> {
  await requireAdminActionSession();

  try {
    const sheetName = String(formData.get("sheetName") ?? "");
    const file = formData.get("file");

    if (!isSupportedSheet(sheetName)) {
      throw new Error("Seleccioná una hoja soportada para importar.");
    }

    if (!(file instanceof File)) {
      throw new Error("Subí un archivo .xlsx o .csv para previsualizar.");
    }

    const workbook = await readWorkbook(file);

    if (!workbook.SheetNames.includes(sheetName)) {
      throw new Error(`El archivo no contiene la hoja '${sheetName}'.`);
    }

    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
      defval: "",
      raw: false,
    });
    const parsedRows = mapRows(sheetName, rows);
    const existingProducts = await findExistingProducts(parsedRows);

    return buildPreviewState({ sheetName, parsedRows, existingProducts });
  } catch (error) {
    return {
      ...emptyImportPreviewState,
      sheetName: String(formData.get("sheetName") ?? "Producto Perfumes"),
      message:
        error instanceof Error
          ? error.message
          : "No se pudo previsualizar la importación.",
    };
  }
}

export async function previewGoogleSheetImport(
  _previousState: ProductImportPreviewState,
  formData: FormData,
): Promise<ProductImportPreviewState> {
  await requireAdminActionSession();

  try {
    const sheetName = String(formData.get("sheetName") ?? "");
    const sheetUrl = String(formData.get("sheetUrl") ?? "").trim();
    const manualGid = String(formData.get("gid") ?? "").trim();

    if (!isSupportedSheet(sheetName)) {
      throw new Error("Seleccioná una hoja soportada para importar.");
    }

    if (!sheetUrl) {
      throw new Error("Pegá el link público del Google Sheet.");
    }

    const { spreadsheetId, gid } = extractGoogleSheetConfig(sheetUrl, manualGid);
    const csvText = await fetchGoogleSheetCsv(spreadsheetId, gid);
    const rows = parseCsvRows(csvText);
    const parsedRows = mapRows(sheetName, rows);

    if (parsedRows.length === 0) {
      throw new Error("La hoja no tiene columnas reconocidas.");
    }

    const existingProducts = await findExistingProducts(parsedRows);

    return buildPreviewState({
      sheetName,
      parsedRows,
      existingProducts,
      source: "google",
    });
  } catch (error) {
    return {
      ...emptyImportPreviewState,
      source: "google",
      sheetName: String(formData.get("sheetName") ?? "Producto Perfumes"),
      message:
        error instanceof Error
          ? error.message
          : "No se pudo traer el Google Sheet.",
    };
  }
}
export async function confirmProductImport(formData: FormData) {
  await requireAdminActionSession();

  const { rows, skippedErrors, skippedBlocked } = safeParsePreviewPayload(formData.get("previewPayload"));

  if (rows.length === 0) {
    throw new Error("No hay filas válidas para importar.");
  }

  const supabase = getSupabaseAdminClient();
  const existingBySlug = await getExistingProductIdsBySlug(
    rows.map((row) => row.slug),
  );
  const processedSlugs = new Set<string>();
  let created = 0;
  let updated = 0;
  let omittedErrors = skippedErrors;
  let omittedDuplicates = 0;

  for (const row of rows) {
    const validationError = revalidateConfirmRow(row);

    if (validationError) {
      omittedErrors += 1;
      continue;
    }

    if (processedSlugs.has(row.slug)) {
      omittedDuplicates += 1;
      continue;
    }

    processedSlugs.add(row.slug);

    try {
      const category = await getOrCreateCategory(row.categoryName, row.categorySlug);
      const payload = getProductPayload(row, category.id);
      const existingProductId = existingBySlug.get(row.slug);
      const productId = existingProductId ?? crypto.randomUUID();

      if (existingProductId) {
        const { error } = await supabase
          .from("products")
          .update(payload)
          .eq("id", existingProductId);

        if (error) {
          omittedErrors += 1;
          continue;
        }

        updated += 1;
      } else {
        const { error } = await supabase.from("products").insert({
          id: productId,
          ...payload,
        });

        if (error) {
          omittedErrors += 1;
          continue;
        }

        created += 1;
      }

      await replaceImportAttributes(productId, row.attributes);
      revalidatePath(`/producto/${row.slug}`);
    } catch {
      omittedErrors += 1;
    }
  }

  revalidatePath("/admin/productos");
  revalidatePath("/admin/productos/importar");
  revalidatePath("/perfumes");
  revalidatePath("/mates");
  redirect(`/admin/productos/importar?created=${created}&updated=${updated}&errors=${omittedErrors}&blocked=${skippedBlocked}&duplicates=${omittedDuplicates}`);
}














