import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import XLSX from "xlsx";
import {
  assertHistoricalImportReady,
  buildHistoricalImportPlan,
  executeHistoricalImportPlan,
  parseCsv,
  type HistoricalImportGateway,
  type HistoricalPurchaseOperation,
  type HistoricalSaleOperation,
  type SaleEvidence,
} from "../lib/historical-import/import-plan.ts";

const root = process.cwd();
const sourcePath = join(root, "data", "SFSTORE_control_emprendimiento_.xlsx");
const dryRunPath = join(root, "reports", "historical-import-dry-run.csv");
const mappingPath = join(root, "reports", "historical-product-mapping-human-review.csv");
const apply = process.argv.includes("--apply");

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Falta ${name}.`);
  return value;
}

function normalize(value: unknown) {
  return String(value ?? "").trim().toLocaleLowerCase("es-AR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function paymentMethod(value: unknown) {
  const normalized = normalize(value);
  if (!normalized) return null;
  if (normalized.includes("efectivo")) return "cash";
  if (normalized.includes("transfer")) return "transfer";
  if (normalized.includes("credito") || normalized.includes("debito") || normalized.includes("tarjeta")) return "card";
  if (normalized.includes("mercado pago") || normalized.includes("mercadopago")) return "mercadopago";
  return null;
}

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(value);
}

const source = await readFile(sourcePath);
const sourceSha256 = createHash("sha256").update(source).digest("hex");
const sourceStats = await stat(sourcePath);
const dryRunRows = parseCsv(await readFile(dryRunPath, "utf8"));
const mappingRows = parseCsv(await readFile(mappingPath, "utf8"));
const resolvedMappingDecisions = new Set(["MATCH", "CREATE_HISTORICAL", "CREATE_CURRENT_PRODUCT_REQUIRED", "OMIT", "SPLIT_BY_SOURCE_ROW"]);
const mappingsPending = mappingRows.filter((row) => !resolvedMappingDecisions.has(row.final_decision?.trim().toUpperCase())).length;

const workbook = XLSX.read(source, { type: "buffer", cellDates: false, cellText: true, cellNF: true });
const salesMatrix = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets["Control de ventas"], { header: 1, raw: true, defval: null });
const saleEvidenceByRow = new Map<number, SaleEvidence>();
for (const row of dryRunRows.filter((candidate) => candidate.record_type === "sale" && candidate.decision === "INSERT")) {
  const sourceRow = Number(row.source_row);
  const sourceValues = salesMatrix[sourceRow - 1] ?? [];
  const method = paymentMethod(sourceValues[5]);
  const sourceDebt = String(sourceValues[7] ?? "").trim();
  const fullyPaidOverride = sourceRow === 24;
  const hasCompletePaymentEvidence = Boolean(method) && (!sourceDebt || fullyPaidOverride);
  const notes = [
    row.reason,
    sourceRow === 24 ? "Pago completo confirmado por decisión humana; no queda saldo pendiente." : "",
    sourceRow === 40 ? "Total fuente confirmado; cobro informado comercialmente como $74.788." : "",
  ].filter(Boolean).join(" ");
  saleEvidenceByRow.set(sourceRow, {
    paymentMethod: hasCompletePaymentEvidence ? method : null,
    paymentAmount: hasCompletePaymentEvidence ? money(Number(row.total)) : null,
    notes,
  });
}

const plan = buildHistoricalImportPlan(dryRunRows, saleEvidenceByRow);
assertHistoricalImportReady(plan, mappingsPending);

const supabase = createClient(
  requiredEnvironment("NEXT_PUBLIC_SUPABASE_URL"),
  requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const { data: existingBatch, error: existingBatchError } = await supabase
  .from("historical_import_batches")
  .select("id")
  .eq("source_sha256", sourceSha256)
  .maybeSingle();
if (existingBatchError) throw new Error(`historical_import_batches: ${existingBatchError.message}`);
let batchId: string | null = existingBatch?.id ?? null;
const importedKeys = new Set<string>();
for (let from = 0; ; from += 1000) {
  const { data, error } = await supabase
    .from("historical_import_records")
    .select("record_type,fingerprint")
    .order("id")
    .range(from, from + 999);
  if (error) throw new Error(`historical_import_records: ${error.message}`);
  for (const record of data ?? []) importedKeys.add(`${record.record_type}:${record.fingerprint}`);
  if ((data?.length ?? 0) < 1000) break;
}
const gateway: HistoricalImportGateway = {
  async alreadyImported(recordType, fingerprint) {
    return importedKeys.has(`${recordType}:${fingerprint}`);
  },
  async getOrCreateBatch() {
    if (batchId) return batchId;
    const { data, error } = await supabase.from("historical_import_batches").insert({
      source_file: basename(sourcePath),
      source_sha256: sourceSha256,
      notes: `Importación histórica revisada. ${plan.insertLines} líneas INSERT y ${plan.omitted.length} OMIT.`,
    }).select("id").single();
    if (error) throw new Error(`historical_import_batches INSERT: ${error.message}`);
    batchId = data.id;
    return data.id;
  },
  async importSale(currentBatchId: string, operation: HistoricalSaleOperation) {
    const { data, error } = await supabase.rpc("import_historical_sale", {
      p_batch_id: currentBatchId,
      p_source_sheet: operation.sourceSheet,
      p_source_row: operation.sourceRow,
      p_fingerprint: operation.fingerprint,
      p_occurred_on: operation.occurredOn,
      p_notes: operation.notes,
      p_items: operation.items,
      p_payment_method: operation.paymentMethod,
      p_payment_amount: operation.paymentAmount,
    });
    if (error) throw new Error(`import_historical_sale fila ${operation.sourceRow}: ${error.message}`);
    const result = data?.operation === "already_imported" ? "already_imported" : "imported";
    importedKeys.add(`sale:${operation.fingerprint}`);
    return result;
  },
  async importPurchase(currentBatchId: string, operation: HistoricalPurchaseOperation) {
    const { data, error } = await supabase.rpc("import_historical_purchase", {
      p_batch_id: currentBatchId,
      p_source_sheet: operation.sourceSheet,
      p_source_row: operation.sourceRow,
      p_fingerprint: operation.fingerprint,
      p_occurred_on: operation.occurredOn,
      p_supplier_id: null,
      p_supplier_name: null,
      p_notes: operation.notes,
      p_items: operation.items,
    });
    if (error) throw new Error(`import_historical_purchase fila ${operation.sourceRow}: ${error.message}`);
    const result = data?.operation === "already_imported" ? "already_imported" : "imported";
    importedKeys.add(`purchase:${operation.fingerprint}`);
    return result;
  },
};

const result = await executeHistoricalImportPlan(plan, gateway, apply);
console.log(`Fuente: ${basename(sourcePath)} (${sourceStats.size} bytes)`);
console.log(`SHA-256: ${sourceSha256}`);
console.log(`Líneas INSERT: ${plan.insertLines}`);
console.log(`Ventas a importar: ${plan.sales.length}`);
console.log(`Compras a importar: ${plan.purchases.length} (${plan.purchases.reduce((sum, purchase) => sum + purchase.items.length, 0)} ítems)`);
console.log(`OMIT: ${plan.omitted.length}`);
for (const omitted of plan.omitted) console.log(`OMIT ${omitted.sourceSheet} fila ${omitted.sourceRow}: ${omitted.productName} — ${omitted.reason}`);
console.log(`Total ventas: ${formatMoney(plan.salesTotal)}`);
console.log(`Total compras: ${formatMoney(plan.purchasesTotal)}`);
console.log(`Total general: ${formatMoney(money(plan.salesTotal + plan.purchasesTotal))}`);
console.log(`Batch: ${batchId ? `se reutilizaría ${batchId}` : `se crearía para ${basename(sourcePath)} con SHA-256 ${sourceSha256}`}.`);
for (const operation of result.pending) {
  console.log(`DRY-RUN ${operation.recordType.toUpperCase()} ${operation.sourceSheet} fila ${operation.sourceRow} ${operation.fingerprint}`);
}
console.log(`SKIP_ALREADY_IMPORTED: ${result.skipped}`);
console.log(`Escrituras ejecutadas: ${result.writes}`);
console.log(apply ? `Importadas: ${result.imported}.` : "Dry-run finalizado. Use --apply para escribir.");
