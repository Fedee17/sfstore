"use server";
import { revalidatePath } from "next/cache";
import { requireAdminActionSession } from "@/lib/admin-session";
import { slugifyProductValue } from "@/lib/products/slug";
import { readVariantMoney, variantErrorMessage, type VariantActionState } from "@/lib/products/variants";
import { mutateProductFamily } from "@/services/product-families";
const text = (f: FormData,k:string) => String(f.get(k) ?? "").trim();
function uuid(f:FormData,k:string) { const v=text(f,k); if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) throw new Error("INVALID_ID");return v; }
async function run(f: FormData, build:()=>Promise<string>):Promise<VariantActionState> {
  await requireAdminActionSession();
  try {
    if([...f.entries()].length>40 || [...f.values()].some(v=>typeof v!=="string" || v.length>2000)) throw new Error("INVALID_FORM");
    const id=await build();
    for(const path of ["/admin/productos/familias",`/admin/productos/familias/${id}`,"/admin/productos","/","/mates","/perfumes","/buscar","/sitemap.xml"]) revalidatePath(path);
    return {ok:true,message:"Cambios guardados. No se modificó el stock.",familyId:id};
  } catch(error) { return {ok:false,message:variantErrorMessage(error)}; }
}
export async function saveFamily(_state:VariantActionState,f:FormData) {
  return run(f,async()=>{
    const id=uuid(f,"familyId"), revision=Number(text(f,"revision"));
    if(!Number.isSafeInteger(revision)||revision<0) throw new Error("INVALID_REVISION");
    await mutateProductFamily("save_product_family",{p_id:id,p_revision:revision,p_name:text(f,"name"),p_slug:slugifyProductValue(text(f,"slug")||text(f,"name")),p_category:uuid(f,"categoryId"),p_price:readVariantMoney(f.get("price"))});return id;
  });
}
export async function addOption(_state:VariantActionState,f:FormData) {
  return run(f,async()=>{ const id=uuid(f,"familyId");await mutateProductFamily("add_product_family_option",{p_family:id,p_name:text(f,"name"),p_values:text(f,"values").split("\n").map(v=>v.trim()).filter(Boolean)});return id; });
}
export async function addValue(_state:VariantActionState,f:FormData) {
  return run(f,async()=>{const id=uuid(f,"familyId");await mutateProductFamily("add_product_family_value",{p_option:uuid(f,"optionId"),p_label:text(f,"label")});return id;});
}
export async function saveVariant(_state:VariantActionState,f:FormData) {
  return run(f,async()=>{
    const id=uuid(f,"familyId"), choices:Record<string,string>={};
    for(const [k,v] of f) if(k.startsWith("option:")) choices[k.slice(7)]=String(v);
    const isNew=text(f,"new")==="yes";
    await mutateProductFamily("configure_product_variant",{p_product:uuid(f,"productId"),p_family:id,p_version:isNew?null:text(f,"version"),p_choices:choices,
      p_override:f.get("inherit")==="on"?null:readVariantMoney(f.get("override")),p_web_visible:f.get("webVisible")==="on",p_blocked:f.get("blocked")==="on",
      p_new:isNew?{name:text(f,"name"),slug:slugifyProductValue(text(f,"slug")||text(f,"name")),sku:text(f,"sku")}:null});return id;
  });
}
