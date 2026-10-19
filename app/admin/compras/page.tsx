import Link from "next/link";
import { AdminNav } from "@/components/admin/admin-nav";
import { requireAdminSession } from "@/lib/admin-session";
import { getCommercialList } from "@/services/commercial-history";
import { HistoryFilters,HistoryPagination,OriginLabel,DateQualityLabel,displayDate,displayCents,listOptions,type HistoryParams } from "@/components/admin/commercial-history-ui";

export default async function AdminPurchasesPage({searchParams}:HistoryParams){
 await requireAdminSession();const options=listOptions("purchases",searchParams?await searchParams:{});
 let result;try{result=await getCommercialList(options);}catch{return <main className="min-h-screen bg-[#F7F4ED]"><AdminNav/><section className="mx-auto max-w-6xl p-8"><h1 className="text-4xl">Compras</h1><HistoryFilters options={options}/><p role="alert" className="mt-6">No se pudo completar la consulta. Revisá los filtros y reintentá; no se muestran resultados parciales.</p></section></main>;}
 const labels:Record<string,string>={draft:"Borrador",confirmed:"Confirmada",cancelled:"Cancelada",historical:"Histórica"};
 return <main className="min-h-screen bg-[#F7F4ED] text-[#1F1F1F]"><AdminNav/><section className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
  <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#8B5E3C]">Admin</p><h1 className="mt-3 text-4xl font-semibold">Compras</h1><p className="mt-2 text-sm text-[#1F1F1F]/60">Compras actuales y registros históricos. Las operaciones históricas son de solo lectura.</p></div><Link href="/admin/compras/nueva" className="rounded-full bg-[#556B2F] px-6 py-3 text-center text-sm font-semibold text-[#F7F4ED]">Nueva compra</Link></div>
  <HistoryFilters options={result.options}/><p className="mt-3 text-xs text-[#1F1F1F]/60">Actuales primero; históricos por fecha original. Las fechas imputadas se identifican.</p>
  {!result.purchases.length?<p className="mt-8 rounded-[2rem] bg-white/70 p-8 text-center">No hay compras para este filtro.</p>:<div className="mt-8 grid gap-4">{result.purchases.map(fact=><article key={fact.id} data-record-id={fact.id} className="grid min-w-0 gap-4 rounded-[2rem] border border-[#8B5E3C]/15 bg-white/70 p-5 shadow-sm md:grid-cols-[minmax(0,1fr)_auto] md:items-center"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><OriginLabel historical={fact.original.historical_import} excluded={fact.excluded}/><span className="text-xs">{labels[fact.original.status]??fact.original.status} · {displayDate(fact.occurredOn)}</span><DateQualityLabel quality={fact.dateQuality}/></div><h2 className="mt-2 break-words text-xl font-semibold">{fact.original.supplier_name_snapshot}</h2><p className="mt-2 text-sm">{fact.lines.length} productos · {fact.original.total_units??fact.lines.reduce((n,l)=>n+l.quantity,0)} unidades · Total {displayCents(fact.totalCents)}</p></div><Link href={`/admin/compras/${fact.id}`} className="rounded-full border border-[#8B5E3C]/30 px-5 py-3 text-center text-sm font-semibold text-[#8B5E3C]">Ver detalle</Link></article>)}</div>}
  <HistoryPagination {...result} options={result.options}/>
 </section></main>;
}
