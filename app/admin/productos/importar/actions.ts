"use server";

import * as XLSX from "xlsx";
import { requireAdminActionSession } from "@/lib/admin-session";
import {
  isSupportedProductSheet,
  normalizeProductImportRows,
} from "@/lib/product-import/core";
import {
  getProductImportLookupSlugs,
  selectExistingProductForImport,
} from "@/lib/product-import/aliases";
import { parseGoogleVisualizationRows } from "@/lib/product-import/google-visualization";
import {
  runProductImportConfirmation,
  type ProductImportConfirmationState,
} from "@/lib/product-import/confirmation";
import {
  classifyPriceImportPreview,
  findDuplicateImportSlugs,
  getPriceImportSource,
  type PriceImportDiff,
} from "@/lib/product-import/price-import";
import {
  buildPerfumeImportDecision,
  type ExistingPerfumeImportProduct,
  type ProductImportDiff,
} from "@/lib/product-import/perfume-import";
import type {
  NormalizedProductImportRow,
  SupportedProductSheet,
} from "@/lib/product-import/types";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { applyConfirmedProductImportRows } from "@/services/product-import";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_GOOGLE_RESPONSE_SIZE = 2 * 1024 * 1024;
const GOOGLE_SHEETS_TIMEOUT_MS = 12000;
const IMPORTABLE_MIME_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/csv",
  "application/csv",
  "text/plain",
  "",
]);

type ImportAction = "create" | "update" | "unchanged" | "review" | "blocked" | "duplicate" | "error";
type ImportSource = "file" | "google";
type PreviewRowState = "valid" | "warning" | "unchanged" | "review" | "blocked" | "duplicate" | "error";

export type ProductImportPreviewRow = NormalizedProductImportRow & {
  key: string;
  action: ImportAction;
  rowState: PreviewRowState;
  canImport: boolean;
  excludedFromImport: boolean;
  existingProductId: string | null;
  diffs: ProductImportDiff[];
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
    unchanged: number;
    review: number;
    duplicate: number;
    blocked: number;
  };
  source: ImportSource;
};

type ExistingProduct = ExistingPerfumeImportProduct & {
  sku: string | null;
};

const initialCounts = {
  valid: 0,
  warnings: 0,
  errors: 0,
  create: 0,
  update: 0,
  unchanged: 0,
  review: 0,
  duplicate: 0,
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

async function readWorkbook(file: File) {
  if (file.size <= 0) throw new Error("Subí un archivo .xlsx o .csv para previsualizar.");
  if (file.size > MAX_FILE_SIZE) throw new Error("El archivo supera el límite de 5 MB.");
  const fileName = file.name.toLowerCase();
  if (!fileName.endsWith(".xlsx") && !fileName.endsWith(".xls") && !fileName.endsWith(".csv")) {
    throw new Error("Formato inválido. Usá .xlsx, .xls o .csv.");
  }
  if (!IMPORTABLE_MIME_TYPES.has(file.type)) throw new Error("Tipo de archivo inválido para importación.");
  return XLSX.read(Buffer.from(await file.arrayBuffer()), { type: "buffer", cellDates: false, raw: true });
}

function extractGoogleSheetConfig(sheetUrl: string) {
  let url: URL;
  try {
    url = new URL(sheetUrl.trim());
  } catch {
    throw new Error("El link de Google Sheets no es válido.");
  }
  if (url.protocol !== "https:" || url.hostname !== "docs.google.com") {
    throw new Error("Solo se aceptan links públicos de docs.google.com/spreadsheets.");
  }
  const spreadsheetId = url.pathname.match(/^\/spreadsheets\/d\/([A-Za-z0-9_-]+)(?:\/|$)/)?.[1] ?? "";
  if (!spreadsheetId || spreadsheetId.length < 20) throw new Error("No pude detectar el ID del Sheet.");
  return { spreadsheetId };
}

async function fetchGoogleSheetRows(spreadsheetId: string, sheetName: string) {
  const query = new URLSearchParams({ tqx: "out:json", sheet: sheetName, headers: "1" });
  const response = await fetch(`https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?${query}`, {
    method: "GET",
    redirect: "follow",
    signal: AbortSignal.timeout(GOOGLE_SHEETS_TIMEOUT_MS),
  }).catch(() => {
    throw new Error("No pude acceder al Sheet. Revisá que esté compartido como cualquiera con el enlace puede ver.");
  });
  if (!response.ok) throw new Error("No pude acceder al Sheet. Revisá que esté compartido como cualquiera con el enlace puede ver.");
  const responseText = await response.text();
  if (Buffer.byteLength(responseText, "utf8") > MAX_GOOGLE_RESPONSE_SIZE) throw new Error("La respuesta de Google Sheets es demasiado grande para importar.");
  return parseGoogleVisualizationRows(responseText);
}

async function findExistingProducts(rows: NormalizedProductImportRow[]) {
  const slugs = [
    ...new Set(
      rows.flatMap((row) =>
        getProductImportLookupSlugs(row.sourceSheet, row.slug),
      ),
    ),
  ];
  if (slugs.length === 0) return [];
  const { data, error } = await getSupabaseAdminClient()
    .from("products")
    .select(`
      id,
      category_id,
      name,
      slug,
      short_description,
      description,
      status,
      price,
      transfer_price,
      compare_at_price,
      cost,
      stock,
      sku,
      featured,
      categories(name, slug),
      product_attributes(name, value, sort_order)
    `)
    .in("slug", slugs);
  if (error) throw new Error(error.message);
  return (data ?? []) as ExistingProduct[];
}

function buildPreviewState(sheetName: SupportedProductSheet, rows: NormalizedProductImportRow[], existingProducts: ExistingProduct[], source: ImportSource = "file"): ProductImportPreviewState {
  const duplicateSlugs = findDuplicateImportSlugs(rows);
  const previewRows = rows.map((row) => {
    const existing = row.sku
      ? existingProducts.find((product) => product.sku === row.sku) ?? null
      : selectExistingProductForImport(existingProducts, sheetName, row.slug);
    const blocked = row.errors.some((error) => error.toLowerCase().includes("producto restringido"));
    const hasErrors = row.errors.length > 0;
    if (sheetName === "Precios Productos") {
      const category = Array.isArray(existing?.categories) ? existing.categories[0] : existing?.categories;
      const classification = classifyPriceImportPreview({
        source: getPriceImportSource(row),
        existing: existing ?? null,
        duplicate: duplicateSlugs.has(row.slug),
        restricted: blocked,
        errors: hasErrors ? row.errors : [],
      });
      return {
        ...row,
        categoryName: category?.name ?? row.categoryName,
        categorySlug: category?.slug ?? row.categorySlug,
        key: `${row.sourceSheet}-${row.rowNumber}-${row.slug}`,
        action: classification.action,
        rowState: classification.rowState,
        canImport: classification.canImport,
        excludedFromImport: !classification.canImport,
        existingProductId: existing?.id ?? null,
        diffs: classification.diffs.map((diff: PriceImportDiff) => ({
          ...diff,
          label: diff.field,
          format: "money" as const,
        })),
        errors: classification.errors,
      } satisfies ProductImportPreviewRow;
    }
    const perfumeDecision = sheetName === "Producto Perfumes" && !hasErrors
      ? buildPerfumeImportDecision(row, existing)
      : null;
    const action: ImportAction = hasErrors
      ? blocked ? "blocked" : "error"
      : perfumeDecision?.kind ?? (existing ? "update" : "create");
    const rowState: PreviewRowState = blocked
      ? "blocked"
      : hasErrors
        ? "error"
        : action === "unchanged"
          ? "unchanged"
          : row.warnings.length > 0
            ? "warning"
            : "valid";
    const canImport = !hasErrors && action !== "unchanged";
    return {
      ...row,
      key: `${row.sourceSheet}-${row.rowNumber}-${row.slug}`,
      action,
      rowState,
      canImport,
      excludedFromImport: !canImport,
      existingProductId: existing?.id ?? null,
      diffs: perfumeDecision?.diffs ?? [],
    } satisfies ProductImportPreviewRow;
  });
  return {
    ok: true,
    sheetName,
    message: `Se previsualizaron ${previewRows.length} filas de ${sheetName}.`,
    rows: previewRows,
    counts: {
      valid: previewRows.filter((row) => row.canImport).length,
      warnings: previewRows.filter((row) => row.rowState === "warning").length,
      errors: previewRows.filter((row) => row.rowState === "error").length,
      create: previewRows.filter((row) => row.action === "create").length,
      update: previewRows.filter((row) => row.action === "update").length,
      unchanged: previewRows.filter((row) => row.action === "unchanged").length,
      review: previewRows.filter((row) => row.action === "review").length,
      duplicate: previewRows.filter((row) => row.action === "duplicate").length,
      blocked: previewRows.filter((row) => row.rowState === "blocked").length,
    },
    source,
  };
}

export async function previewProductImport(_previousState: ProductImportPreviewState, formData: FormData): Promise<ProductImportPreviewState> {
  await requireAdminActionSession();
  try {
    const sheetName = String(formData.get("sheetName") ?? "");
    const file = formData.get("file");
    if (!isSupportedProductSheet(sheetName)) throw new Error("Seleccioná una hoja soportada para importar.");
    if (!(file instanceof File)) throw new Error("Subí un archivo .xlsx o .csv para previsualizar.");
    const workbook = await readWorkbook(file);
    if (!workbook.SheetNames.includes(sheetName)) throw new Error(`El archivo no contiene la hoja '${sheetName}'.`);
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], { defval: "", raw: true });
    const normalizedRows = normalizeProductImportRows(sheetName, rows);
    return buildPreviewState(sheetName, normalizedRows, await findExistingProducts(normalizedRows));
  } catch (error) {
    return { ...emptyImportPreviewState, sheetName: String(formData.get("sheetName") ?? "Producto Perfumes"), message: error instanceof Error ? error.message : "No se pudo previsualizar la importación." };
  }
}

export async function previewGoogleSheetImport(_previousState: ProductImportPreviewState, formData: FormData): Promise<ProductImportPreviewState> {
  await requireAdminActionSession();
  try {
    const sheetName = String(formData.get("sheetName") ?? "");
    const sheetUrl = String(formData.get("sheetUrl") ?? "").trim();
    if (!isSupportedProductSheet(sheetName)) throw new Error("Seleccioná una hoja soportada para importar.");
    if (!sheetUrl) throw new Error("Pegá el link público del Google Sheet.");
    const { spreadsheetId } = extractGoogleSheetConfig(sheetUrl);
    const rows = await fetchGoogleSheetRows(spreadsheetId, sheetName);
    const normalizedRows = normalizeProductImportRows(sheetName, rows);
    if (normalizedRows.length === 0) throw new Error("La hoja no tiene columnas reconocidas.");
    return buildPreviewState(sheetName, normalizedRows, await findExistingProducts(normalizedRows), "google");
  } catch (error) {
    return { ...emptyImportPreviewState, source: "google", sheetName: String(formData.get("sheetName") ?? "Producto Perfumes"), message: error instanceof Error ? error.message : "No se pudo traer el Google Sheet." };
  }
}

export async function confirmProductImport(
  _previousState: ProductImportConfirmationState,
  formData: FormData,
): Promise<ProductImportConfirmationState> {
  try {
    await requireAdminActionSession();
    const mode = formData.get("confirmationMode") === "google" ? "google" : "file";
    return await runProductImportConfirmation(
      formData.get("previewPayload"),
      mode,
      applyConfirmedProductImportRows,
    );
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "No se pudo completar la confirmación.",
    };
  }
}
