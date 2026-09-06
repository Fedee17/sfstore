"use server";

import { redirect } from "next/navigation";
import * as XLSX from "xlsx";
import { requireAdminActionSession } from "@/lib/admin-session";
import {
  isSupportedProductSheet,
  normalizeProductImportRows,
} from "@/lib/product-import/core";
import type {
  ImportCatalogAttributeUpdate,
  NormalizedProductImportRow,
  SupportedProductSheet,
} from "@/lib/product-import/types";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { applyConfirmedProductImportRows } from "@/services/product-import";

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

type ImportAction = "create" | "update" | "blocked" | "error";
type ImportSource = "file" | "google";
type PreviewRowState = "valid" | "warning" | "blocked" | "error";

export type { ImportCatalogAttributeUpdate };

export type ProductImportPreviewRow = NormalizedProductImportRow & {
  key: string;
  action: ImportAction;
  rowState: PreviewRowState;
  canImport: boolean;
  excludedFromImport: boolean;
  existingProductId: string | null;
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

type ExistingProduct = { id: string; slug: string; sku: string | null };

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

async function readWorkbook(file: File) {
  if (file.size <= 0) throw new Error("Subí un archivo .xlsx o .csv para previsualizar.");
  if (file.size > MAX_FILE_SIZE) throw new Error("El archivo supera el límite de 5 MB.");
  const fileName = file.name.toLowerCase();
  if (!fileName.endsWith(".xlsx") && !fileName.endsWith(".xls") && !fileName.endsWith(".csv")) {
    throw new Error("Formato inválido. Usá .xlsx, .xls o .csv.");
  }
  if (!IMPORTABLE_MIME_TYPES.has(file.type)) throw new Error("Tipo de archivo inválido para importación.");
  return XLSX.read(Buffer.from(await file.arrayBuffer()), { type: "buffer", cellDates: false, raw: false });
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
  const spreadsheetId = url.pathname.match(/^\/spreadsheets\/d\/([A-Za-z0-9_-]+)(?:\/|$)/)?.[1] ?? "";
  if (!spreadsheetId || spreadsheetId.length < 20) throw new Error("No pude detectar el ID del Sheet.");
  const gid = (url.searchParams.get("gid") || url.hash.match(/gid=(\d+)/)?.[1] || manualGid).trim();
  if (!/^\d+$/.test(gid)) throw new Error("No pude detectar un gid numérico válido.");
  return { spreadsheetId, gid };
}

async function fetchGoogleSheetCsv(spreadsheetId: string, gid: string) {
  const response = await fetch(`https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`, {
    method: "GET",
    redirect: "follow",
    signal: AbortSignal.timeout(GOOGLE_SHEETS_TIMEOUT_MS),
  }).catch(() => {
    throw new Error("No pude acceder al Sheet. Revisá que esté compartido como cualquiera con el enlace puede ver.");
  });
  if (!response.ok) throw new Error("No pude acceder al Sheet. Revisá que esté compartido como cualquiera con el enlace puede ver.");
  const contentType = response.headers.get("content-type") ?? "";
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > MAX_GOOGLE_CSV_SIZE) throw new Error("La respuesta de Google Sheets es demasiado grande para importar.");
  const csvText = Buffer.from(buffer).toString("utf8").trim();
  if (!csvText || csvText.startsWith("<") || contentType.includes("text/html")) throw new Error("Google devolvió una respuesta vacía o no válida.");
  return csvText;
}

function parseCsvRows(csvText: string) {
  const workbook = XLSX.read(csvText, { type: "string", raw: false });
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!worksheet) throw new Error("Google devolvió una respuesta vacía o no válida.");
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: "", raw: false });
  if (rows.length === 0) throw new Error("La hoja no tiene columnas reconocidas.");
  return rows;
}

async function findExistingProducts(rows: NormalizedProductImportRow[]) {
  const slugs = [...new Set(rows.map((row) => row.slug).filter(Boolean))];
  if (slugs.length === 0) return [];
  const { data, error } = await getSupabaseAdminClient().from("products").select("id, slug, sku").in("slug", slugs);
  if (error) throw new Error(error.message);
  return (data ?? []) as ExistingProduct[];
}

function buildPreviewState(sheetName: SupportedProductSheet, rows: NormalizedProductImportRow[], existingProducts: ExistingProduct[], source: ImportSource = "file"): ProductImportPreviewState {
  const existingBySlug = new Map(existingProducts.map((product) => [product.slug, product]));
  const previewRows = rows.map((row) => {
    const existing = row.sku ? existingProducts.find((product) => product.sku === row.sku) : existingBySlug.get(row.slug);
    const blocked = row.errors.some((error) => error.toLowerCase().includes("producto restringido"));
    const hasErrors = row.errors.length > 0;
    const rowState: PreviewRowState = blocked ? "blocked" : hasErrors ? "error" : row.warnings.length > 0 ? "warning" : "valid";
    return {
      ...row,
      key: `${row.sourceSheet}-${row.rowNumber}-${row.slug}`,
      action: hasErrors ? (blocked ? "blocked" : "error") : existing ? "update" : "create",
      rowState,
      canImport: !hasErrors,
      excludedFromImport: hasErrors,
      existingProductId: existing?.id ?? null,
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
      blocked: previewRows.filter((row) => row.rowState === "blocked").length,
    },
    source,
  };
}

function parseConfirmedRows(value: FormDataEntryValue | null) {
  const raw = String(value ?? "");
  if (!raw) throw new Error("No hay una previsualización válida para importar.");
  const parsed = JSON.parse(raw) as ProductImportPreviewRow[];
  return {
    rows: parsed.filter((row) => row.canImport && !row.excludedFromImport && (row.rowState === "valid" || row.rowState === "warning")),
    skippedErrors: parsed.filter((row) => row.rowState === "error").length,
    skippedBlocked: parsed.filter((row) => row.rowState === "blocked").length,
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
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], { defval: "", raw: false });
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
    const manualGid = String(formData.get("gid") ?? "").trim();
    if (!isSupportedProductSheet(sheetName)) throw new Error("Seleccioná una hoja soportada para importar.");
    if (!sheetUrl) throw new Error("Pegá el link público del Google Sheet.");
    const { spreadsheetId, gid } = extractGoogleSheetConfig(sheetUrl, manualGid);
    const normalizedRows = normalizeProductImportRows(sheetName, parseCsvRows(await fetchGoogleSheetCsv(spreadsheetId, gid)));
    if (normalizedRows.length === 0) throw new Error("La hoja no tiene columnas reconocidas.");
    return buildPreviewState(sheetName, normalizedRows, await findExistingProducts(normalizedRows), "google");
  } catch (error) {
    return { ...emptyImportPreviewState, source: "google", sheetName: String(formData.get("sheetName") ?? "Producto Perfumes"), message: error instanceof Error ? error.message : "No se pudo traer el Google Sheet." };
  }
}

export async function confirmProductImport(formData: FormData) {
  await requireAdminActionSession();
  const { rows, skippedErrors, skippedBlocked } = parseConfirmedRows(formData.get("previewPayload"));
  if (rows.length === 0) throw new Error("No hay filas válidas para importar.");
  const result = await applyConfirmedProductImportRows(rows);
  redirect(`/admin/productos/importar?created=${result.created}&updated=${result.updated}&errors=${result.omittedErrors + skippedErrors}&blocked=${skippedBlocked}&duplicates=${result.omittedDuplicates}`);
}
