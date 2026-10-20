import "server-only";
import { requireAdminSession } from "@/lib/admin-session";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import type { ComponentRecipe } from "@/lib/products/component-combos";

export async function listComponentRecipes(): Promise<ComponentRecipe[]> {
  await requireAdminSession();
  const { data, error } = await getSupabaseAdminClient().from("component_recipes")
    .select("id,name,source_product,head_product,cable_cc_product,cable_lightning_product,presentation_product,legacy_cable_product,prices_approved").order("id").limit(101);
  if (error) throw new Error("No se pudo consultar la composición de cargadores. Verificá el contrato de componentes.");
  if ((data?.length ?? 0) > 100) throw new Error("Hay más de 100 composiciones. Se requiere paginación antes de continuar.");
  const { data: prices, error: priceError } = await getSupabaseAdminClient().from("component_combo_pricing").select("recipe_id,list_price,transfer_target,version").eq("enabled", true).limit(101);
  if (priceError || (prices?.length ?? 0) > 100) throw new Error("No se pudieron consultar los precios de conjuntos.");
  return (data ?? []).map(r => {
    const price = prices?.find(p => p.recipe_id === r.id);
    return { ...r, combo_list_price: price ? Number(price.list_price) : undefined, combo_transfer_price: price ? Number(price.transfer_target) : undefined, combo_price_version: price?.version };
  }) as ComponentRecipe[];
}
export async function getPurchaseComposition(purchaseId: string) {
  await requireAdminSession();
  const { data, error } = await getSupabaseAdminClient().from("component_purchase_compositions")
    .select("recipe_id,cable_cc,cable_lightning").eq("purchase_id", purchaseId).maybeSingle();
  if (error) throw new Error("No se pudo consultar la recepción por componentes.");
  return data as { recipe_id: string; cable_cc: number; cable_lightning: number } | null;
}

export async function getComponentReceipt(purchaseId: string) {
  await requireAdminSession();
  const { data, error } = await getSupabaseAdminClient().from("component_inventory_operations")
    .select("operation_key,created_at,plan").eq("purchase_id", purchaseId).maybeSingle();
  if (error) throw new Error("No se pudo consultar la trazabilidad de los componentes.");
  return data as { operation_key: string; created_at: string; plan: { physical_pieces: number; allocations: { key: string; quantity: number; total_cents: number; residual_cents: number }[] } } | null;
}
