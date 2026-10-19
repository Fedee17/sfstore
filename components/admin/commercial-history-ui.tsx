import Link from "next/link";
import { AdminNav } from "@/components/admin/admin-nav";
import type { DateQuality, Money, PurchaseFact, SaleFact } from "@/lib/commercial-reporting/contracts";
import type { CommercialListOptions } from "@/lib/commercial-reporting/list-reader";

const currency=new Intl.NumberFormat("es-AR",{style:"currency",currency:"ARS",minimumFractionDigits:2});
export const displayMoney=(value:Money|null|undefined)=>value==null?"Costo no disponible":currency.format(Number(value));
export const displayCents=(value:number)=>currency.format(value/100);
export function displayDate(value:string){return new Intl.DateTimeFormat("es-AR",{timeZone:"UTC"}).format(new Date(value+"T00:00:00Z"));}
export const paymentLabels:Record<string,string>={pending:"Pendiente",partial:"Pago parcial",paid:"Pagada",approved:"Aprobado",refunded:"Reintegrada",rejected:"Rechazado"};
const methodLabels:Record<string,string>={cash:"Efectivo",transfer:"Transferencia",card:"Tarjeta (sin especificar)",debit:"Débito",credit:"Crédito",qr:"QR",other:"Otro",mercadopago:"Mercado Pago"};
export function DateQualityLabel({quality}:{quality:DateQuality}){
  return quality==="imputed"?<span className="font-semibold text-[#8B5E3C]">Fecha imputada</span>:quality==="unknown"?<span>Procedencia de fecha no verificada</span>:null;
}
export function OriginLabel({historical,excluded=false}:{historical:boolean;excluded?:boolean}){
 return <span className="rounded-full bg-[#556B2F]/10 px-3 py-1 text-xs font-semibold text-[#556B2F]">{historical?"Histórico · Excel":"Actual"}{excluded?" · Prueba excluida de métricas":""}</span>;
}
export type HistoryParams={searchParams?:Promise<Record<string,string|string[]|undefined>>};
export function scalar(value:string|string[]|undefined){return typeof value==="string"?value:"";}
export function listOptions(kind:"sales"|"purchases",params:Record<string,string|string[]|undefined>):CommercialListOptions{
 const origin=scalar(params.origin),channel=scalar(params.channel),page=Number(scalar(params.page)||1);
 return{kind,origin:origin==="current"||origin==="historical"?origin:"all",page,
  channel:channel==="store"||channel==="web"||channel==="order"?channel:"all",paymentStatus:scalar(params.paymentStatus),date:scalar(params.date)};
}
export function HistoryFilters({options}:{options:CommercialListOptions}){
 const field="grid gap-2 text-sm font-semibold",input="h-11 min-w-0 rounded-xl border border-[#8B5E3C]/20 bg-[#F7F4ED] px-3";
 return <form className="mt-8 grid gap-3 rounded-[2rem] border border-[#8B5E3C]/15 bg-white/70 p-5 shadow-sm sm:grid-cols-2 lg:grid-cols-5 sm:items-end">
  <label className={field}>Origen<select className={input} name="origin" defaultValue={options.origin??"all"}><option value="all">Todos</option><option value="current">Actuales</option><option value="historical">Históricos</option></select></label>
  {options.kind==="sales"?<>
   <label className={field}>Canal<select className={input} name="channel" defaultValue={options.channel??"all"}><option value="all">Todos</option><option value="store">Local (actual e histórico)</option><option value="web">Web</option><option value="order">Pedido</option></select></label>
   <label className={field}>Pago<select className={input} name="paymentStatus" defaultValue={options.paymentStatus??""}><option value="">Todos</option><option value="pending">Pendiente</option><option value="partial">Parcial</option><option value="paid">Pagada</option><option value="refunded">Reintegrada</option></select></label>
   <label className={field}>Fecha comercial<input type="date" name="date" defaultValue={options.date??""} className={input}/></label>
  </>:null}
  <button className="h-11 rounded-xl border border-[#556B2F]/30 px-5 text-sm font-semibold text-[#556B2F]">Filtrar</button>
 </form>;
}
export function HistoryPagination({page,pages,total,options}:{page:number;pages:number;total:number;options:CommercialListOptions}){
 function href(next:number){const params=new URLSearchParams({origin:options.origin??"all",page:String(next)});for(const key of ["channel","paymentStatus","date"] as const)if(options[key])params.set(key,options[key]!);return`/admin/${options.kind==="sales"?"ventas":"compras"}?${params}`;}
 return <nav aria-label="Paginación del historial" className="mt-6 flex flex-wrap items-center justify-between gap-4 text-sm">
  <p>{total} registros · Página {page} de {pages}</p><div className="flex gap-3">{page>1?<Link className="rounded-full border border-[#8B5E3C]/30 px-4 py-3" href={href(page-1)}>Anterior</Link>:null}{page<pages?<Link className="rounded-full border border-[#8B5E3C]/30 px-4 py-3" href={href(page+1)}>Siguiente</Link>:null}</div>
 </nav>;
}
export function HistoricalDetail({sale,purchase}:{sale?:SaleFact;purchase?:PurchaseFact}){
 const fact=sale??purchase!;const kind=sale?"ventas":"compras";
 const title=sale?`Venta histórica ${sale.original.order_number??""}`:purchase!.original.supplier_name_snapshot??"Compra histórica";
 const provenance=fact.provenance;
 return <main className="min-h-screen bg-[#F7F4ED] text-[#1F1F1F]"><AdminNav/><section className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
  <Link href={`/admin/${kind}?origin=historical`} className="text-sm font-semibold text-[#8B5E3C]">Volver a {kind}</Link>
  <div className="mt-4"><OriginLabel historical excluded={fact.excluded}/><h1 className="mt-3 break-words text-3xl font-semibold sm:text-4xl">{title}</h1><p className="mt-3">Fecha: {displayDate(fact.occurredOn)} <DateQualityLabel quality={fact.dateQuality}/></p>
  {provenance?<p className="mt-2 text-sm text-[#1F1F1F]/60">Procedencia: {provenance.source_sheet} · fila {provenance.source_row}</p>:null}</div>
  <p role="note" className="mt-6 rounded-2xl border border-[#556B2F]/20 bg-[#556B2F]/5 p-5 text-sm font-semibold">Registro histórico de solo lectura. No permite modificar pagos ni generar movimientos de inventario. Los importes originales no se recalculan.</p>
  <section className="mt-6 grid gap-4" aria-label="Productos históricos">
   {sale?sale.lines.map(item=><article key={item.id} className="grid min-w-0 gap-3 rounded-[2rem] border border-[#8B5E3C]/15 bg-white/70 p-5 sm:grid-cols-[minmax(0,1fr)_auto]"><div className="min-w-0"><h2 className="break-words text-lg font-semibold">{item.product_name}</h2><p>{item.quantity} unidades · {item.category_name??"Categoría no registrada"}</p></div><div className="text-sm sm:text-right"><p>Precio unitario registrado: <strong>{displayMoney(item.unit_price)}</strong></p><p>Importe de línea: <strong>{displayMoney(item.subtotal)}</strong></p><p>Costo histórico: <strong>{displayMoney(item.unit_cost_snapshot)}</strong></p></div></article>):purchase!.lines.map(item=><article key={item.id} className="grid min-w-0 gap-3 rounded-[2rem] border border-[#8B5E3C]/15 bg-white/70 p-5 sm:grid-cols-[minmax(0,1fr)_auto]"><div className="min-w-0"><h2 className="break-words text-lg font-semibold">{item.product_name_snapshot}</h2><p>{item.quantity} unidades</p></div><div className="text-sm sm:text-right"><p>Costo proveedor unitario: <strong>{displayMoney(item.unit_purchase_cost)}</strong></p><p>Subtotal proveedor: <strong>{displayMoney(item.supplier_line_total)}</strong></p><p>Costo efectivo unitario: <strong>{displayMoney(item.effective_unit_cost)}</strong></p><p>Total efectivo: <strong>{displayMoney(item.effective_line_total)}</strong></p></div></article>)}
  </section>
  <section className="mt-6 rounded-[2rem] border border-[#556B2F]/20 bg-[#556B2F]/5 p-5"><h2 className="text-xl font-semibold">Importes registrados</h2><p className="mt-3 text-lg">Total: <strong>{displayCents(fact.totalCents)}</strong></p>
   {sale?<><p>Pagos aprobados registrados: <strong>{displayCents(sale.approvedCents)}</strong></p><p>Saldo según registros: <strong>{displayCents(sale.pendingCents)}</strong></p><p className="mt-2 text-sm">No hay evidencia suficiente para reconstruir el precio de lista y descuento originales.</p></>:<><p>Subtotal proveedor: {displayMoney(purchase!.original.supplier_subtotal)}</p><p>Envío registrado: {displayMoney(purchase!.original.shipping_cost)}</p></>}
  </section>
  {sale?<section className="mt-6 rounded-[2rem] border border-[#8B5E3C]/15 bg-white/70 p-5"><h2 className="text-xl font-semibold">Pagos originales</h2>{sale.payments.length?sale.payments.map(payment=><article key={payment.id} className="mt-3 rounded-xl bg-[#F7F4ED] p-4 text-sm"><p>{methodLabels[payment.store_payment_method??payment.method]??payment.method} · {paymentLabels[payment.status]??payment.status} · <strong>{displayMoney(payment.amount)}</strong></p><p>{payment.paid_at?`Acreditación: ${new Intl.DateTimeFormat("es-AR",{timeZone:"America/Argentina/Buenos_Aires",dateStyle:"short",timeStyle:"short"}).format(new Date(payment.paid_at))}`:"Fecha de acreditación no disponible"}</p></article>):<p className="mt-3">Sin pagos registrados. El importe no se presenta como cobrado.</p>}</section>:null}
 </section></main>;
}
