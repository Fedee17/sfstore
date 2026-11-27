import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { planBulkPrice, type BulkPriceRow } from "@/lib/admin/bulk-price";
import { presentationIdsAmong } from "@/services/bulk-status";

const PRICE_COLUMNS = "id,name,sku,slug,status,historical_identity,family_id,price,transfer_price,cash_price_approved_at,compare_at_price";

/** Fresh pricing columns of the given products (callers are already behind the admin guard). */
export async function readPriceRows(client: SupabaseClient, ids: readonly string[]): Promise<BulkPriceRow[]> {
  if (!ids.length) return [];
  const { data, error } = await client.from("products").select(PRICE_COLUMNS).in("id", [...ids]);
  if (error) throw new Error("BULK_PRICE_READ_FAILED");
  const byId = new Map(((data ?? []) as BulkPriceRow[]).map(row => [row.id, row]));
  return ids.flatMap(id => byId.get(id) ?? []);
}

export async function planPriceFromRows(client: SupabaseClient, rows: BulkPriceRow[], bp: number) {
  return planBulkPrice(rows, bp, await presentationIdsAmong(client, rows.map(row => row.id)));
}

/** What the preview showed for one product; the write is refused if the database no longer matches it. */
export function priceFingerprint(row: Pick<BulkPriceRow, "price" | "transfer_price" | "cash_price_approved_at">) {
  return JSON.stringify([String(row.price), row.transfer_price === null ? null : String(row.transfer_price), row.cash_price_approved_at]);
}
