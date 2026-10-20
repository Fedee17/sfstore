import "server-only";
import { getSupabaseClient } from "@/lib/supabase/client";
import { getProductBySlug } from "@/services/products";
import type { ComponentOffer } from "@/components/component-buy-together";
export async function getComponentOffers(headId: string): Promise<ComponentOffer[]> {
  const { data, error } = await getSupabaseClient().from("public_component_offers")
    .select("id,name,connector,head_slug,cable_slug,presentation_product,combo_list_price,combo_transfer_price,price_version").eq("head_product", headId).order("id").limit(101);
  if (error || (data?.length ?? 0) > 100) throw new Error("No se pudieron consultar los conjuntos disponibles.");
  // Reuse the public catalog filter and the very same server price mapping as checkout.
  const rows = data ?? [];
  const slugs = [...new Set(rows.flatMap(r => [r.head_slug, r.cable_slug]))] as string[];
  const products = new Map(await Promise.all(slugs.map(async slug => [slug, await getProductBySlug(slug)] as const)));
  return rows.flatMap(r => {
    const head = products.get(r.head_slug), cable = products.get(r.cable_slug);
    return head && cable && head.kind !== "family" && cable.kind !== "family" ? [{ id: r.id, name: r.name, connector: r.connector, head, cable, presentationId: r.presentation_product, listPrice: Number(r.combo_list_price), transferPrice: Number(r.combo_transfer_price), priceVersion: r.price_version }] : [];
  });
}
