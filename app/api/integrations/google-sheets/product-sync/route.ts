import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { isSupportedProductSheet } from "@/lib/product-import/core";
import type { ProductSyncInputRow } from "@/lib/product-import/types";
import { syncImportedProductRows } from "@/services/product-import";

export const runtime = "nodejs";

const MAX_PAYLOAD_BYTES = 256 * 1024;
const MAX_ROWS_PER_REQUEST = 30;

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status });
}

function secretsMatch(received: string, expected: string) {
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  return receivedBuffer.length === expectedBuffer.length && timingSafeEqual(receivedBuffer, expectedBuffer);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseRows(value: unknown): ProductSyncInputRow[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_ROWS_PER_REQUEST) return null;
  const rows: ProductSyncInputRow[] = [];
  for (const valueRow of value) {
    if (!isRecord(valueRow) || !isRecord(valueRow.row)) return null;
    const rowNumber = Number(valueRow.rowNumber);
    if (!Number.isInteger(rowNumber) || rowNumber < 2) return null;
    rows.push({
      rowNumber,
      row: valueRow.row,
      editedColumn: typeof valueRow.editedColumn === "string" ? valueRow.editedColumn : undefined,
      previousProductName: typeof valueRow.previousProductName === "string" ? valueRow.previousProductName : undefined,
      timestamp: typeof valueRow.timestamp === "string" ? valueRow.timestamp : undefined,
    });
  }
  return rows;
}

export async function POST(request: Request) {
  const configuredSecret = process.env.GOOGLE_SHEETS_SYNC_SECRET;
  if (!configuredSecret) {
    console.error("[Google Sheets sync] GOOGLE_SHEETS_SYNC_SECRET is not configured.");
    return json({ ok: false, error: "Integración no configurada." }, 503);
  }
  const authorization = request.headers.get("authorization") ?? "";
  const receivedSecret = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!receivedSecret || !secretsMatch(receivedSecret, configuredSecret)) {
    return json({ ok: false, error: "No autorizado." }, 401);
  }
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    return json({ ok: false, error: "Content-Type debe ser application/json." }, 415);
  }
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_PAYLOAD_BYTES) {
    return json({ ok: false, error: "Payload demasiado grande." }, 413);
  }
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return json({ ok: false, error: "No se pudo leer el payload." }, 400);
  }
  if (Buffer.byteLength(rawBody, "utf8") > MAX_PAYLOAD_BYTES) {
    return json({ ok: false, error: "Payload demasiado grande." }, 413);
  }
  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return json({ ok: false, error: "JSON inválido." }, 400);
  }
  if (!isRecord(body) || typeof body.sheet !== "string" || !isSupportedProductSheet(body.sheet)) {
    return json({ ok: false, error: "Hoja no permitida." }, 422);
  }
  const rows = parseRows(body.rows);
  if (!rows) {
    return json({ ok: false, error: `rows debe contener entre 1 y ${MAX_ROWS_PER_REQUEST} filas válidas.` }, 422);
  }
  console.log("[Google Sheets sync] POST recibido", { sheet: body.sheet, rows: rows.length });
  let result;
  try {
    result = await syncImportedProductRows(body.sheet, rows);
  } catch (error) {
    console.error("[Google Sheets sync] Batch failed", error instanceof Error ? error.message : "unknown");
    return json({ ok: false, error: "No se pudo procesar la sincronización." }, 500);
  }
  const successful = result.created + result.updated + result.unchanged;
  const responseStatus = successful === 0 && result.errors > 0
    ? 500
    : successful === 0 && (result.invalid > 0 || result.review > 0)
      ? 422
      : 200;
  return json({
    ok: successful > 0 && result.errors === 0 && result.invalid === 0 && result.review === 0,
    partial: successful > 0 && (result.errors > 0 || result.invalid > 0 || result.review > 0 || result.blocked > 0),
    ...result,
  }, responseStatus);
}
