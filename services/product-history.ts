import "server-only";

import { requireAdminSession } from "@/lib/admin-session";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { buildProductHistory, PRODUCT_HISTORY_LIMIT, type ProductChangeEvent } from "@/lib/admin/product-history";

/** Latest recorded changes of one product. Throws on any read error (including the migration not applied yet). */
export async function getProductHistory(productId: string) {
  await requireAdminSession();
  const client = getSupabaseAdminClient();
  const { data, error } = await client.from("product_change_events")
    .select("id,changed_at,field,old_value,new_value,source")
    .eq("product_id", productId)
    .order("changed_at", { ascending: false }).order("id", { ascending: true })
    .limit(PRODUCT_HISTORY_LIMIT);
  if (error) throw new Error("PRODUCT_HISTORY_READ_FAILED");
  const events = (data ?? []) as ProductChangeEvent[];
  return { entries: buildProductHistory(events), truncated: events.length === PRODUCT_HISTORY_LIMIT };
}
