import type { CommercialSnapshot, EvidencePolicy } from "./contracts.ts";
import { buildCommercialMonth } from "./model.ts";
import { validateMonth } from "./periods.ts";

/** Fixed whitelist, no contacts, free-text notes, payment references or auth rows. */
export const READ_TABLES = {
  orders: { target: "orders", columns: "id,channel,status,payment_status,historical_import,historical_occurred_on,affects_inventory,created_at,subtotal,discount,shipping_cost,total,cost_snapshot_policy:metadata->>cost_snapshot_policy" },
  saleLines: { target: "order_items", columns: "id,order_id,product_id,product_name,category_name,quantity,unit_price,subtotal,list_unit_price_snapshot,unit_cost_snapshot" },
  payments: { target: "order_payments", columns: "id,order_id,method,store_payment_method,status,amount,paid_at" },
  purchases: { target: "purchases", columns: "id,status,historical_import,historical_occurred_on,affects_inventory,purchase_date,total_cost,supplier_subtotal,shipping_cost" },
  purchaseLines: { target: "purchase_items", columns: "id,purchase_id,product_id,product_name_snapshot,quantity,unit_purchase_cost,supplier_line_total,effective_unit_cost,effective_line_total" },
  provenance: { target: "historical_import_records", columns: "id,batch_id,source_sheet,source_row,record_type,target_id" },
  products: { target: "products", columns: "id,category_id" },
  batches: { target: "historical_import_batches", columns: "id,source_sha256" },
} as const;
export type ReadTable = keyof typeof READ_TABLES;
export type ReadPage = <K extends ReadTable>(
  table: K, afterId: string | null, limit: number,
) => Promise<CommercialSnapshot[K]>;

/** Keyset pagination. An empty page, NOT a short page, terminates a read:
 * PostgREST can clamp a response below our requested page size. */
export async function readCompleteSnapshot(
  page: ReadPage, options: { pageSize?: number; maxPagesPerTable?: number; maxDurationMs?: number } = {},
): Promise<CommercialSnapshot> {
  const pageSize = options.pageSize ?? 200, maxPages = options.maxPagesPerTable ?? 10000;
  const maxDurationMs = options.maxDurationMs ?? 30000, started = Date.now();
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 1000 ||
      !Number.isSafeInteger(maxPages) || maxPages < 1 ||
      !Number.isSafeInteger(maxDurationMs) || maxDurationMs < 1 || maxDurationMs > 60000) throw new Error("COMMERCIAL_INVALID_PAGINATION");
  const result: CommercialSnapshot = { orders: [], saleLines: [], payments: [], purchases: [], purchaseLines: [], provenance: [], products: [], batches: [] };
  async function readTable<K extends ReadTable>(key: K): Promise<CommercialSnapshot[K]> {
    const rows: CommercialSnapshot[K][number][] = [];
    let after: string | null = null;
    for (let n = 0; n < maxPages; n++) {
      if (Date.now() - started >= maxDurationMs) throw new Error("COMMERCIAL_READ_TIMEOUT_NO_PARTIAL_REPORT");
      const next: CommercialSnapshot[K] = await page(key, after, pageSize);
      if (Date.now() - started >= maxDurationMs) throw new Error("COMMERCIAL_READ_TIMEOUT_NO_PARTIAL_REPORT");
      if (next.length === 0) return rows as CommercialSnapshot[K];
      for (const row of next) {
        if (!row.id || (after !== null && row.id <= after)) throw new Error("COMMERCIAL_NON_MONOTONIC_PAGE");
        rows.push(row); after = row.id;
      }
    }
    // Never return partial totals on safety/time budget exhaustion.
    throw new Error("COMMERCIAL_READ_LIMIT_EXCEEDED_NO_PARTIAL_REPORT");
  }
  for (const key of Object.keys(READ_TABLES) as ReadTable[]) {
    Object.assign(result, { [key]: await readTable(key) });
  }
  return result;
}
export async function readCommercialMonth(page: ReadPage, month: string, evidence: EvidencePolicy) {
  validateMonth(month); // Reject invalid requests before any read.
  const snapshot = await readCompleteSnapshot(page);
  return buildCommercialMonth(snapshot, month, evidence);
}
