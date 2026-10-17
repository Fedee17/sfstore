import Link from "next/link";
import { AdminNav } from "@/components/admin/admin-nav";
import { requireAdminSession } from "@/lib/admin-session";
import { getCommercialList } from "@/services/commercial-history";
import { getStoreSaleDisplayName } from "@/lib/store-sales";
import { HistoryFilters,HistoryPagination,OriginLabel,DateQualityLabel,displayDate,displayCents,paymentLabels,listOptions,type HistoryParams } from "@/components/admin/commercial-history-ui";

export default async function AdminSalesPage({searchParams}:HistoryParams){
 await requireAdminSession();const options=listOptions("sales",searchParams?await searchParams:{});
 let result;try{result=await getCommercialList(options);}catch{return <main className="min-h-screen bg-[#F7F4ED]"><AdminNav/><section className="mx-auto max-w-6xl p-8"><h1 className="text-4xl">Ventas</h1><HistoryFilters options={options}/><p role="alert" className="mt-6">No se pudo completar la consulta. Revisá los filtros y reintentá; no se muestran resultados parciales.</p></section></main>;}
 return <main className="min-h-screen bg-[#F7F4ED] text-[#1F1F1F]"><AdminNav/><section className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
  <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#8B5E3C]">Admin</p><h1 className="mt-3 text-4xl font-semibold">Ventas</h1><p className="mt-2 text-sm text-[#1F1F1F]/60">Ventas actuales e históricas con sus pagos registrados.</p></div><Link href="/admin/ventas/nueva" className="rounded-full bg-[#556B2F] px-6 py-3 text-center text-sm font-semibold text-[#F7F4ED]">Nueva venta</Link></div>
  <HistoryFilters options={result.options}/><p className="mt-3 text-xs text-[#1F1F1F]/60">Actuales primero; históricos por fecha original. Los importes no se recalculan.</p>
  {!result.sales.length?<p className="mt-8 rounded-[2rem] bg-white/70 p-8 text-center">No hay ventas para este filtro.</p>:<div className="mt-8 grid gap-4">{result.sales.map(fact=>{
   const url=fact.original.historical_import||fact.original.channel==="store"?`/admin/ventas/${fact.id}`:`/admin/pedidos/${fact.id}`;
   return <article key={fact.id} data-record-id={fact.id} className="grid min-w-0 gap-4 rounded-[2rem] border border-[#8B5E3C]/15 bg-white/70 p-5 shadow-sm md:grid-cols-[minmax(0,1fr)_auto] md:items-center"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><OriginLabel historical={fact.original.historical_import} excluded={fact.excluded}/><span className="text-xs">{paymentLabels[fact.original.payment_status]??fact.original.payment_status} · {fact.original.historical_import?"Local histórico":fact.original.channel==="store"?"Local":"Web / pedido"} · {displayDate(fact.occurredOn)}</span><DateQualityLabel quality={fact.dateQuality}/></div><h2 className="mt-2 break-words text-xl font-semibold">{getStoreSaleDisplayName(fact.original.order_number??fact.id,fact.lines)}</h2><p className="mt-1 break-words text-xs text-[#1F1F1F]/50">Venta {fact.original.order_number}</p><p className="mt-2 text-sm">{fact.lines.length} productos · Total {displayCents(fact.totalCents)} · Pagos aprobados {displayCents(fact.approvedCents)} · Saldo {displayCents(fact.pendingCents)}</p></div><Link href={url} className="rounded-full border border-[#8B5E3C]/30 px-5 py-3 text-center text-sm font-semibold text-[#8B5E3C]">Ver detalle</Link></article>;
  })}</div>}
  <HistoryPagination {...result} options={result.options}/>
 </section></main>;
}
