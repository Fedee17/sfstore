import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { FamilyPriceRow, FamilyVariantRow } from "@/lib/admin/bulk-family-price";

const READ_LIMIT = 200;
const VARIANT_COLUMNS = "id,name,sku,price,list_price_override,transfer_price,cash_price_approved_at,compare_at_price,historical_identity,family_id";

/** Families (and all their variants) by filter or by id; callers are already behind the admin guard. */
export async function readFamilyPriceRows(client: SupabaseClient, filter: { ids: readonly string[] } | { search: string; category: string }): Promise<FamilyPriceRow[]> {
  let query = client.from("product_families").select("id,name,slug,base_price,revision", { count: "exact" }).order("name").limit(READ_LIMIT);
  if ("ids" in filter) {
    if (!filter.ids.length) return [];
    query = query.in("id", [...filter.ids]);
  } else {
    if (filter.search) query = query.ilike("name", `%${filter.search.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`);
    if (filter.category) query = query.eq("category_id", filter.category);
  }
  const { data, error, count } = await query;
  if (error) throw new Error("BULK_FAMILY_READ_FAILED");
  if (count === null || count > READ_LIMIT) throw new Error("BULK_FAMILY_TOO_BROAD");
  const families = (data ?? []) as Omit<FamilyPriceRow, "variants">[];
  if (!families.length) return [];
  const { data: variants, error: variantError } = await client.from("products").select(VARIANT_COLUMNS).in("family_id", families.map(f => f.id)).order("id");
  if (variantError) throw new Error("BULK_FAMILY_READ_FAILED");
  const byFamily = new Map<string, FamilyVariantRow[]>();
  for (const row of (variants ?? []) as (FamilyVariantRow & { family_id: string })[]) byFamily.set(row.family_id, [...(byFamily.get(row.family_id) ?? []), row]);
  return families.map(f => ({ ...f, variants: byFamily.get(f.id) ?? [] }));
}
