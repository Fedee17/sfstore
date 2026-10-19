import "server-only";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
/** Additional application guard; database historical protections remain authoritative. */
export async function assertCurrentCommercialOperation(table:"orders"|"purchases",id:string){
 const {data,error}=await getSupabaseAdminClient().from(table).select("id,historical_import").eq("id",id).maybeSingle();
 if(error||!data)throw new Error("No se pudo verificar la operación.");
 if(data.historical_import)throw new Error("Los registros históricos son de solo lectura.");
}
