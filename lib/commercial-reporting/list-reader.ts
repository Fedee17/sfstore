import type { SupabaseClient } from "@supabase/supabase-js";
import type { CommercialSnapshot, EvidencePolicy } from "./contracts.ts";
import { READ_TABLES, type ReadTable } from "./reader.ts";
import { buildCommercialFacts } from "./model.ts";
import { sourceDate } from "./periods.ts";

export type HistoryFilter = "all" | "current" | "historical";
export type CommercialListOptions = {
  kind: "sales" | "purchases"; origin?: HistoryFilter; page?: number;
  channel?: "all" | "store" | "web" | "order"; paymentStatus?: string; date?: string;
  id?: string;
};
export type Scope = { offset: number; limit: number; ids?: readonly string[]; idColumn?: string; parent?: CommercialListOptions };
export type ScopedPage = <K extends ReadTable>(key: K, scope: Scope) => Promise<{ rows: CommercialSnapshot[K]; count: number }>;
const PAGE_SIZE = 20;
export function normalizeListOptions(input: CommercialListOptions): Required<Omit<CommercialListOptions,"id">> & { id?: string } {
  const page=input.page??1;
  if (!Number.isSafeInteger(page)||page<1||page>1000000) throw new Error("COMMERCIAL_INVALID_PAGE");
  if (input.id&&!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(input.id)) throw new Error("COMMERCIAL_INVALID_ID");
  const origin=input.origin??"all",channel=input.channel??"all";
  if (!["all","current","historical"].includes(origin)||!["all","store","web","order"].includes(channel)) throw new Error("COMMERCIAL_INVALID_FILTER");
  const paymentStatus=input.paymentStatus??"";
  if (!["","pending","partial","paid","approved","refunded","rejected"].includes(paymentStatus)) throw new Error("COMMERCIAL_INVALID_FILTER");
  const date=input.date?sourceDate(input.date):"";
  return {...input,page,origin,channel,paymentStatus,date};
}
/** Exact-count bounded ranges. Handles PostgREST clamps below the UI page size. */
async function bounded<K extends ReadTable>(read: ScopedPage,key:K,scope:Scope,maximum:number) {
  const rows: CommercialSnapshot[K][number][]=[],seen=new Set<string>();let count: number|null=null;
  const started=Date.now();
  while(rows.length<maximum) {
    if(Date.now()-started>15000)throw new Error("COMMERCIAL_LIST_TIMEOUT");
    const result=await read(key,{...scope,offset:scope.offset+rows.length,limit:Math.min(maximum-rows.length,200)});
    if(!Number.isSafeInteger(result.count)||result.count<0)throw new Error("COMMERCIAL_COUNT_REQUIRED");
    if(count!==null&&result.count!==count)throw new Error("COMMERCIAL_LIST_CHANGED_RETRY");count=result.count;
    const wanted=Math.min(maximum,Math.max(0,count-scope.offset));
    for(const row of result.rows){if(seen.has(row.id))throw new Error("COMMERCIAL_DUPLICATE_PAGE_ROW");seen.add(row.id);rows.push(row);}
    if(rows.length>wanted)throw new Error("COMMERCIAL_LIST_RANGE_MISMATCH");
    if(rows.length===wanted)return{rows:rows as CommercialSnapshot[K],count};
    if(!result.rows.length)throw new Error("COMMERCIAL_INCOMPLETE_PAGE");
  }
  return{rows:rows as CommercialSnapshot[K],count:count!};
}
async function children<K extends ReadTable>(read:ScopedPage,key:K,ids:readonly string[],idColumn:string) {
  if(!ids.length)return [] as unknown as CommercialSnapshot[K];
  const result=await bounded(read,key,{offset:0,limit:200,ids:[...new Set(ids)],idColumn},20000);
  if(result.rows.length!==result.count)throw new Error("COMMERCIAL_CHILD_LIMIT_NO_PARTIAL_RECORD");
  return result.rows;
}
export async function readCommercialList(read:ScopedPage,input:CommercialListOptions,policy:EvidencePolicy) {
  const options=normalizeListOptions(input),offset=options.id?0:(options.page-1)*PAGE_SIZE;
  const snapshot:CommercialSnapshot={orders:[],saleLines:[],payments:[],purchases:[],purchaseLines:[],provenance:[],products:[],batches:[]};
  let count:number;
  if(options.kind==="sales"){
    const parent=await bounded(read,"orders",{offset,limit:PAGE_SIZE,parent:options},options.id?1:PAGE_SIZE);
    snapshot.orders=parent.rows;count=parent.count;
    const ids=parent.rows.map(x=>x.id);
    [snapshot.saleLines,snapshot.payments,snapshot.provenance]=await Promise.all([
      children(read,"saleLines",ids,"order_id"),children(read,"payments",ids,"order_id"),children(read,"provenance",ids,"target_id"),
    ]);
  }else{
    const parent=await bounded(read,"purchases",{offset,limit:PAGE_SIZE,parent:options},options.id?1:PAGE_SIZE);
    snapshot.purchases=parent.rows;count=parent.count;
    const ids=parent.rows.map(x=>x.id);
    [snapshot.purchaseLines,snapshot.provenance]=await Promise.all([
      children(read,"purchaseLines",ids,"purchase_id"),children(read,"provenance",ids,"target_id"),
    ]);
  }
  const productIds=[...snapshot.saleLines,...snapshot.purchaseLines].flatMap(x=>x.product_id?[x.product_id]:[]);
  [snapshot.products,snapshot.batches]=await Promise.all([
    children(read,"products",productIds,"id"),children(read,"batches",snapshot.provenance.map(x=>x.batch_id),"id"),
  ]);
  return { ...buildCommercialFacts(snapshot,policy),page:options.page,pageSize:PAGE_SIZE,total:count,
    pages:Math.max(1,Math.ceil(count/PAGE_SIZE)),options };
}
export function createCommercialScopedReader(client:Pick<SupabaseClient,"from">):ScopedPage {
  return async <K extends ReadTable>(key:K,scope:Scope)=>{
    const def=READ_TABLES[key];
    const columns=def.columns+(key==="orders"?",order_number":key==="purchases"?",supplier_name_snapshot,total_units":"");
    let query=client.from(def.target).select(columns,{count:"exact"});
    if(scope.ids){
      if(!["id","order_id","purchase_id","target_id"].includes(scope.idColumn??""))throw new Error("COMMERCIAL_INVALID_SCOPE");
      query=query.in(scope.idColumn!,[...scope.ids]);
    }
    if(scope.parent){
      const p=normalizeListOptions(scope.parent);
      if(p.id)query=query.eq("id",p.id);
      if(p.origin!=="all")query=query.eq("historical_import",p.origin==="historical");
      if(key==="orders"){
        if(p.channel==="store")query=query.or("channel.eq.store,historical_import.eq.true");
        else if(p.channel!=="all")query=query.eq("channel",p.channel);
        if(p.paymentStatus)query=query.eq("payment_status",p.paymentStatus);
        if(p.date){
          // Shared IANA civil-day conversion; no dependence on server timezone.
          const {commercialDayBounds}=await import("./periods.ts");const range=commercialDayBounds(p.date);
          query=query.or(`and(historical_import.eq.true,historical_occurred_on.eq.${p.date}),and(historical_import.eq.false,created_at.gte.${range.startInclusive},created_at.lt.${range.endExclusive})`);
        }
        query=query.order("historical_import",{ascending:true}).order("historical_occurred_on",{ascending:false,nullsFirst:false}).order("created_at",{ascending:false});
      }else query=query.order("historical_import",{ascending:true}).order("purchase_date",{ascending:false});
    }
    const {data,error,count}=await query.order("id",{ascending:true}).range(scope.offset,scope.offset+scope.limit-1).abortSignal(AbortSignal.timeout(15000));
    if(error||data===null||count===null)throw new Error("COMMERCIAL_LIST_READ_FAILED");
    return{rows:data as unknown as CommercialSnapshot[K],count};
  };
}
