"use server";

import { requireAdminActionSession } from "@/lib/admin-session";
import { fetchMepQuote, parseProfitPercent, parseUsdCost } from "@/lib/admin/internal-usd-cost";
import { getInternalInventory } from "@/services/internal-inventory";
import { setInternalUsdCost, type InternalUsdCost } from "@/services/internal-usd-cost";

type SaveResult = { error?: string; cost?: InternalUsdCost };

export async function refreshInternalMep() {
  await requireAdminActionSession();
  return fetchMepQuote();
}

export async function saveInternalUsdCost(
  slug: string,
  previous: SaveResult,
  form: FormData,
): Promise<SaveResult> {
  try {
    await requireAdminActionSession();
    const cost = {
      unit_cost_usd: parseUsdCost(String(form.get("cost") ?? "")),
      target_profit_percent: parseProfitPercent(String(form.get("profit") ?? "")),
    };
    const inventory = await getInternalInventory(slug);
    if (!inventory) throw new Error("La ficha histórica no existe.");
    await setInternalUsdCost(inventory.source.id, cost);
    return { cost };
  } catch (error) {
    return { cost: previous.cost, error: error instanceof Error ? error.message : "No se pudo guardar el costo en USD." };
  }
}
