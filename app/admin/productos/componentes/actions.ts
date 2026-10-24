"use server";
import { requireAdminActionSession } from "@/lib/admin-session";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import {componentPublicationSlug} from "@/lib/products/component-combos";

export async function saveComponentOfferImages(_state:{message:string},form:FormData) {
 await requireAdminActionSession();
 const recipeId=String(form.get("recipeId")??"");
 const cc=String(form.get("cc")??"").trim(),lightning=String(form.get("lightning")??"").trim();
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 if(!uuid.test(recipeId)||[cc,lightning].some(id=>id&&!uuid.test(id))||form.get("approved")!=="yes")return {message:"Confirmá la correspondencia de las fotografías y revisá la selección."};
 if(cc&&cc===lightning)return {message:"Cada conector necesita una fotografía distinta."};
 const db=getSupabaseAdminClient();
 const {data:recipe,error:readError}=await db.from("component_recipes").select("presentation_product").eq("id",recipeId).single();
 if(readError||!recipe)return {message:"No se pudo verificar la presentación del conjunto."};
 const {error}=await db.rpc("set_component_offer_images",{p_recipe_id:recipeId,p_cc_image_id:cc||null,p_lightning_image_id:lightning||null});
 if(error)return {message:"No se guardó la asociación. Revisá que las fotos pertenezcan a esta presentación y no reutilicen el mismo archivo para ambos conectores."};
 for(const path of ["/","/accesorios","/buscar","/admin/productos/componentes",...(["cc","lightning"] as const).map(c=>`/producto/${componentPublicationSlug(recipe.presentation_product,c)}`)])revalidatePath(path);
 return {message:"Fotografías por conector guardadas. No se modificaron precios, receta ni inventario."};
}
export async function registerComponentRecipe(_state: { message: string }, form: FormData) {
  await requireAdminActionSession();
  const parameters = { p_name: String(form.get("name") ?? "").trim(), p_source: String(form.get("source") ?? ""), p_head: String(form.get("head") ?? ""), p_cc: String(form.get("cc") ?? ""), p_lightning: String(form.get("lightning") ?? ""), p_presentation: String(form.get("presentation") ?? ""), p_legacy: String(form.get("legacy") ?? "") };
  if (!parameters.p_name || new Set(Object.values(parameters).slice(1)).size !== 6) return { message: "Elegí seis SKU diferentes y un nombre para la composición." };
  const { error } = await getSupabaseAdminClient().rpc("register_component_recipe", parameters);
  if (error) return { message: "No se registró la composición. Revisá los SKU, las composiciones existentes y que presentación y cable histórico tengan stock cero." };
  revalidatePath("/admin/productos/componentes");
  return { message: "Composición registrada, con configuración de precios del conjunto pendiente. No se convirtió inventario ni se modificaron precios. Origen, presentación y cable histórico quedaron excluidos de venta directa." };
}
