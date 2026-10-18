import "server-only";
import { requireAdminActionSession } from "@/lib/admin-session";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import type { Family, FamilyOption, Variant } from "@/lib/products/variants";
const PAGE_SIZE = 25;
function pageNumber(value: number) { return Number.isSafeInteger(value) && value > 0 ? Math.min(value,100000) : 1; }
export async function getProductFamilies(page = 1) {
  await requireAdminActionSession();
  const current = pageNumber(page);
  const {data,error,count} = await getSupabaseAdminClient().from("product_families")
    .select("id,category_id,name,slug,base_price,revision",{count:"exact"}).order("name").order("id")
    .range((current-1)*PAGE_SIZE,current*PAGE_SIZE-1);
  if(error || count === null) throw new Error("No se pudieron consultar las familias. Verificá que el contrato SQL esté instalado en este entorno.");
  return { families: (data ?? []) as Family[], page: current, total: count, pageSize: PAGE_SIZE };
}
export async function getProductFamily(id: string, page = 1) {
  await requireAdminActionSession();
  const db = getSupabaseAdminClient(), current = pageNumber(page);
  const [family,options,variants,countResult] = await Promise.all([
    db.from("product_families").select("id,category_id,name,slug,base_price,revision").eq("id",id).maybeSingle(),
    db.from("product_family_options").select("id,name,product_family_option_values(id,label)").eq("family_id",id).order("name").limit(7),
    db.rpc("list_product_family_variants",{p_family:id,p_page:current}),
    db.from("products").select("id",{count:"exact",head:true}).eq("family_id",id),
  ]);
  if(family.error || options.error || variants.error || countResult.error || countResult.count === null || (options.data?.length ?? 0)>6) throw new Error("No se pudo cargar la familia completa.");
  if(!family.data) return null;
  const parsedOptions: FamilyOption[] = (options.data ?? []).map(o=>({id:o.id,name:o.name,values:o.product_family_option_values}));
  return { family: family.data as Family, options: parsedOptions, variants: (variants.data ?? []) as Variant[], page: current, total: countResult.count, pageSize: PAGE_SIZE };
}
export async function mutateProductFamily(rpc: string, args: Record<string,unknown>) {
  await requireAdminActionSession();
  if(!["save_product_family","add_product_family_option","add_product_family_value","configure_product_variant"].includes(rpc)) throw new Error("Acceso denegado.");
  const {data,error}=await getSupabaseAdminClient().rpc(rpc,args);
  if(error) throw new Error(`${error.code} ${error.message}`);
  return data as string;
}

export async function findSimpleFamilyProducts(categoryId: string, search: string) {
  await requireAdminActionSession();
  const term=search.trim().replace(/[%_,().\\]/g," ").slice(0,80).trim();
  if(term.length<2) return [];
  const {data,error}=await getSupabaseAdminClient().from("products").select("id,name,sku,price,stock")
    .is("family_id",null).eq("historical_identity",false).eq("category_id",categoryId).not("sku","is",null)
    .or(`name.ilike.%${term}%,sku.ilike.%${term}%`).order("name").order("id").limit(21);
  if(error) throw new Error("No se pudieron buscar los productos simples.");
  return data ?? [];
}
export async function getSimpleFamilyCandidate(id: string, categoryId: string): Promise<Variant | null> {
  await requireAdminActionSession();
  const {data,error}=await getSupabaseAdminClient().from("products")
    .select("id,name,sku,stock,cost,price,status,family_id,variant_choices,list_price_override,web_visible,commercial_blocked")
    .eq("id",id).eq("category_id",categoryId).eq("historical_identity",false).is("family_id",null).not("sku","is",null).maybeSingle();
  if(error) throw new Error("No se pudo consultar el producto simple.");
  if(!data) return null;
  const version=await getSupabaseAdminClient().rpc("get_product_save_version",{p_product_id:id});
  if(version.error||!version.data) throw new Error("No se pudo verificar el SKU.");
  // Re-read and compare version: do not pair an old display with a new token.
  const again=await getSupabaseAdminClient().from("products").select("price,stock,sku,name,updated_at").eq("id",id).maybeSingle();
  const after=await getSupabaseAdminClient().rpc("get_product_save_version",{p_product_id:id});
  if(again.error||!again.data||after.error||version.data!==after.data||Number(again.data.price)!==Number(data.price)||again.data.name!==data.name||again.data.sku!==data.sku) throw new Error("El SKU cambió. Repetí la búsqueda.");
  return {...data,version:version.data as string} as Variant;
}
