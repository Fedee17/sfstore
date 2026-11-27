import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { planBulkStatus, type BulkStatusRow } from "@/lib/admin/bulk-status";
import type { ProductStatus } from "@/lib/products/admin-product-policy";

/** Products that are charger-combo presentations; their status follows Cargadores, never a bulk change. */
export async function presentationIdsAmong(client: SupabaseClient, ids: readonly string[]) {
  if (!ids.length) return new Set<string>();
  const { data, error } = await client.from("component_recipes").select("presentation_product").in("presentation_product", [...ids]);
  if (error) throw new Error("BULK_STATUS_PRESENTATIONS_READ_FAILED");
  return new Set((data ?? []).map(row => String(row.presentation_product)));
}

/** Plan from rows read by the caller (already behind the admin guard). */
export async function planFromRows(client: SupabaseClient, rows: BulkStatusRow[], target: ProductStatus) {
  return planBulkStatus(rows, target, await presentationIdsAmong(client, rows.map(row => row.id)));
}
