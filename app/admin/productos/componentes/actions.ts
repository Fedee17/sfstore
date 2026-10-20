"use server";
import { requireAdminActionSession } from "@/lib/admin-session";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
export async function registerComponentRecipe(_state: { message: string }, form: FormData) {
  await requireAdminActionSession();
  const parameters = { p_name: String(form.get("name") ?? "").trim(), p_source: String(form.get("source") ?? ""), p_head: String(form.get("head") ?? ""), p_cc: String(form.get("cc") ?? ""), p_lightning: String(form.get("lightning") ?? ""), p_presentation: String(form.get("presentation") ?? ""), p_legacy: String(form.get("legacy") ?? "") };
  if (!parameters.p_name || new Set(Object.values(parameters).slice(1)).size !== 6) return { message: "Elegí seis SKU diferentes y un nombre para la composición." };
  const { error } = await getSupabaseAdminClient().rpc("register_component_recipe", parameters);
  if (error) return { message: "No se registró la composición. Revisá los SKU, las composiciones existentes y que presentación y cable histórico tengan stock cero." };
  revalidatePath("/admin/productos/componentes");
  return { message: "Composición registrada, con configuración de precios del conjunto pendiente. No se convirtió inventario ni se modificaron precios. Origen, presentación y cable histórico quedaron excluidos de venta directa." };
}
