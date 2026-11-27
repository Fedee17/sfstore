import { getSupabaseAdminClient } from "@/lib/supabase/server";

export type InternalUsdCost = { unit_cost_usd: number; target_profit_percent: number | null };

export async function getInternalUsdCost(productId: string) {
  const { data, error } = await getSupabaseAdminClient().from("internal_product_usd_costs")
    .select("unit_cost_usd, target_profit_percent").eq("product_id", productId).maybeSingle();
  if (error) throw new Error("No se pudo consultar el costo en USD.");
  return data as InternalUsdCost | null;
}

export async function setInternalUsdCost(productId: string, cost: InternalUsdCost) {
  const { error } = await getSupabaseAdminClient().from("internal_product_usd_costs")
    .upsert({ product_id: productId, ...cost }, { onConflict: "product_id" });
  if (error) throw new Error("No se pudo guardar el costo en USD.");
}
