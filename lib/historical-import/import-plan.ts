import { createHash } from "node:crypto";

export type CsvRow = Record<string, string>;

export type SaleEvidence = {
  paymentMethod: string | null;
  paymentAmount: number | null;
  notes: string;
};

export type HistoricalSaleOperation = {
  recordType: "sale";
  sourceSheet: string;
  sourceRow: number;
  fingerprint: string;
  occurredOn: string;
  notes: string;
  items: Array<{ product_id: string; quantity: number; unit_price: number; source_total: number }>;
  paymentMethod: string | null;
  paymentAmount: number | null;
};

export type HistoricalPurchaseOperation = {
  recordType: "purchase";
  sourceSheet: string;
  sourceRow: number;
  fingerprint: string;
  occurredOn: string;
  notes: string;
  items: Array<{ product_id: string; quantity: number; unit_cost: number; source_total: number }>;
};

export type HistoricalOperation = HistoricalSaleOperation | HistoricalPurchaseOperation;

export type HistoricalImportPlan = {
  insertLines: number;
  omitted: Array<{ sourceSheet: string; sourceRow: number; productName: string; reason: string }>;
  blockers: Array<{ sourceSheet: string; sourceRow: number; decision: string; reason: string }>;
  sales: HistoricalSaleOperation[];
  purchases: HistoricalPurchaseOperation[];
  salesTotal: number;
  purchasesTotal: number;
};

export type HistoricalImportGateway = {
  alreadyImported(recordType: "sale" | "purchase", fingerprint: string): Promise<boolean>;
  getOrCreateBatch(): Promise<string>;
  importSale(batchId: string, operation: HistoricalSaleOperation): Promise<"imported" | "already_imported">;
  importPurchase(batchId: string, operation: HistoricalPurchaseOperation): Promise<"imported" | "already_imported">;
};

function requiredText(row: CsvRow, field: string) {
  const value = row[field]?.trim();
  if (!value) throw new Error(`Falta ${field} en ${row.source_sheet || "fila"} ${row.source_row || "?"}.`);
  return value;
}

function requiredNumber(row: CsvRow, field: string) {
  const value = Number(requiredText(row, field));
  if (!Number.isFinite(value)) throw new Error(`${field} inválido en ${row.source_sheet} ${row.source_row}.`);
  return value;
}

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function validateMoney(value: number, field: string, row: CsvRow) {
  if (value < 0 || money(value) !== value) {
    throw new Error(`${field} no es compatible con numeric(12,2) en ${row.source_sheet} ${row.source_row}.`);
  }
}

function aggregateFingerprint(recordType: string, sourceSheet: string, sourceRow: number, fingerprints: string[]) {
  if (fingerprints.length === 1) return fingerprints[0];
  return createHash("sha256")
    .update(JSON.stringify([recordType, sourceSheet, sourceRow, [...fingerprints].sort()]))
    .digest("hex");
}

export function parseCsv(content: string): CsvRow[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    if (quoted) {
      if (character === '"' && content[index + 1] === '"') { value += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else value += character;
    } else if (character === '"') quoted = true;
    else if (character === ",") { row.push(value); value = ""; }
    else if (character === "\n") { row.push(value.replace(/\r$/, "")); rows.push(row); row = []; value = ""; }
    else value += character;
  }
  if (value || row.length) { row.push(value.replace(/\r$/, "")); rows.push(row); }
  const headers = rows.shift()?.map((header) => header.replace(/^\uFEFF/, "")) ?? [];
  return rows.filter((values) => values.some(Boolean))
    .map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

export function buildHistoricalImportPlan(
  rows: CsvRow[],
  saleEvidenceByRow: Map<number, SaleEvidence>,
): HistoricalImportPlan {
  const blockers = rows
    .filter((row) => !["INSERT", "OMIT"].includes(row.decision?.trim().toUpperCase()))
    .map((row) => ({
      sourceSheet: row.source_sheet,
      sourceRow: Number(row.source_row),
      decision: row.decision,
      reason: row.reason,
    }));
  const omitted = rows
    .filter((row) => row.decision?.trim().toUpperCase() === "OMIT")
    .map((row) => ({
      sourceSheet: row.source_sheet,
      sourceRow: Number(row.source_row),
      productName: row.source_product_name,
      reason: row.reason,
    }));
  const insertRows = rows.filter((row) => row.decision?.trim().toUpperCase() === "INSERT");

  const sales: HistoricalSaleOperation[] = [];
  const purchaseGroups = new Map<string, CsvRow[]>();
  for (const row of insertRows) {
    const sourceSheet = requiredText(row, "source_sheet");
    const sourceRow = requiredNumber(row, "source_row");
    const productId = requiredText(row, "matched_product_id");
    const occurredOn = requiredText(row, "date");
    const quantity = requiredNumber(row, "quantity");
    const unitAmount = requiredNumber(row, "unit_amount");
    const total = requiredNumber(row, "total");
    const fingerprint = requiredText(row, "fingerprint");
    if (!Number.isInteger(quantity) || quantity <= 0) throw new Error(`Cantidad inválida en ${sourceSheet} ${sourceRow}.`);
    validateMoney(unitAmount, "unit_amount", row);
    validateMoney(total, "total", row);
    if (!/^[0-9a-f]{64}$/.test(fingerprint)) throw new Error(`Fingerprint inválido en ${sourceSheet} ${sourceRow}.`);

    if (row.record_type === "sale") {
      const evidence = saleEvidenceByRow.get(sourceRow) ?? { paymentMethod: null, paymentAmount: null, notes: "" };
      sales.push({
        recordType: "sale",
        sourceSheet,
        sourceRow,
        fingerprint,
        occurredOn,
        notes: evidence.notes || row.reason,
        items: [{ product_id: productId, quantity, unit_price: unitAmount, source_total: total }],
        paymentMethod: evidence.paymentMethod,
        paymentAmount: evidence.paymentAmount,
      });
      continue;
    }
    if (row.record_type !== "purchase") throw new Error(`record_type inválido en ${sourceSheet} ${sourceRow}.`);
    const key = `${sourceSheet}:${sourceRow}`;
    purchaseGroups.set(key, [...(purchaseGroups.get(key) ?? []), row]);
  }

  const purchases: HistoricalPurchaseOperation[] = [];
  for (const groupRows of purchaseGroups.values()) {
    const first = groupRows[0];
    const sourceSheet = requiredText(first, "source_sheet");
    const sourceRow = requiredNumber(first, "source_row");
    const occurredOn = requiredText(first, "date");
    if (groupRows.some((row) => row.date !== occurredOn)) throw new Error(`Fechas incompatibles en split ${sourceSheet} ${sourceRow}.`);
    const fingerprints = groupRows.map((row) => requiredText(row, "fingerprint"));
    const artificialDate = sourceRow >= 154 && sourceRow <= 159;
    purchases.push({
      recordType: "purchase",
      sourceSheet,
      sourceRow,
      fingerprint: aggregateFingerprint("purchase", sourceSheet, sourceRow, fingerprints),
      occurredOn,
      notes: artificialDate
        ? "Fecha artificial aprobada: la fecha no existía en la fuente."
        : groupRows.length > 1 ? "Split humano aprobado y reconciliado con la fila fuente." : first.reason,
      items: groupRows.map((row) => ({
        product_id: requiredText(row, "matched_product_id"),
        quantity: requiredNumber(row, "quantity"),
        unit_cost: requiredNumber(row, "unit_amount"),
        source_total: requiredNumber(row, "total"),
      })),
    });
  }

  return {
    insertLines: insertRows.length,
    omitted,
    blockers,
    sales,
    purchases,
    salesTotal: money(sales.reduce((sum, operation) => sum + operation.items.reduce((itemSum, item) => itemSum + item.source_total, 0), 0)),
    purchasesTotal: money(purchases.reduce((sum, operation) => sum + operation.items.reduce((itemSum, item) => itemSum + item.source_total, 0), 0)),
  };
}

export function assertHistoricalImportReady(plan: HistoricalImportPlan, mappingsPending: number) {
  if (mappingsPending !== 0) throw new Error(`Hay ${mappingsPending} mappings pendientes.`);
  if (plan.blockers.length !== 0) {
    const counts = plan.blockers.reduce<Record<string, number>>((result, blocker) => {
      result[blocker.decision] = (result[blocker.decision] ?? 0) + 1;
      return result;
    }, {});
    throw new Error(`El plan contiene bloqueos: ${JSON.stringify(counts)}.`);
  }
}

export async function executeHistoricalImportPlan(
  plan: HistoricalImportPlan,
  gateway: HistoricalImportGateway,
  apply: boolean,
) {
  const operations: HistoricalOperation[] = [...plan.sales, ...plan.purchases];
  const pending: HistoricalOperation[] = [];
  const skipped: HistoricalOperation[] = [];
  for (const operation of operations) {
    if (await gateway.alreadyImported(operation.recordType, operation.fingerprint)) skipped.push(operation);
    else pending.push(operation);
  }
  if (!apply) return { imported: 0, skipped: skipped.length, pending, writes: 0 };
  if (pending.length === 0) return { imported: 0, skipped: skipped.length, pending: [], writes: 0 };

  const batchId = await gateway.getOrCreateBatch();
  let imported = 0;
  for (const operation of pending) {
    const result = operation.recordType === "sale"
      ? await gateway.importSale(batchId, operation)
      : await gateway.importPurchase(batchId, operation);
    if (result === "imported") imported += 1;
    else skipped.push(operation);
  }
  return { imported, skipped: skipped.length, pending: [], writes: imported + 1 };
}
