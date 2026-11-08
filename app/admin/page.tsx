import Link from "next/link";
import { AdminNav } from "@/components/admin/admin-nav";
import { requireAdminSession } from "@/lib/admin-session";
import { getAdminDashboardData } from "@/services/admin";

const money = (cents: number) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 }).format(cents / 100);
const methods: Record<string,string> = { cash:"Efectivo", transfer:"Transferencia", debit:"Débito", credit:"Crédito", card:"Tarjeta", qr:"QR", other:"Otro" };
const primary = "rounded-full bg-[#556B2F] px-5 py-3 text-center font-semibold text-white hover:bg-[#465826] focus-visible:outline-2 focus-visible:outline-offset-2";
const panel = "min-w-0 rounded-3xl border border-[#8B5E3C]/15 bg-white/80 p-5 shadow-sm";

export default async function AdminPage() {
  await requireAdminSession();
  let data: Awaited<ReturnType<typeof getAdminDashboardData>> | null = null;
  try { data = await getAdminDashboardData(); } catch { /* Keep operational shortcuts available when the report cannot be read. */ }
  return <main className="min-h-screen bg-[#F7F4ED] text-[#1F1F1F]">
    <AdminNav />
    <section className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
      <h1 className="text-3xl font-semibold sm:text-4xl">Tu negocio hoy</h1>
      {data && <p className="mt-2 text-sm text-black/65">{new Intl.DateTimeFormat("es-AR",{dateStyle:"long",timeZone:"UTC"}).format(new Date(data.day+"T12:00:00Z"))} · horario de Argentina</p>}
      <nav aria-label="Acciones frecuentes" className="mt-6 flex flex-wrap gap-3">
        <Link href="/admin/ventas/nueva" className={primary}>Registrar venta</Link>
        <Link href="/admin/consulta" className={primary}>Consultar producto</Link>
        <Link href="/admin/compras/nueva" className={primary}>Cargar compra</Link>
      </nav>
      {!data ? <p role="alert" className={panel+" mt-6 text-red-800"}>No se pudo completar el resumen. Los importes no están disponibles; podés seguir usando los accesos y reintentar la consulta.</p> : <>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <Metric label="Ventas confirmadas hoy" value={money(data.confirmedCents)} detail={data.confirmedCount+" operaciones confirmadas"} />
          <Metric label="Cobros acreditados hoy" value={money(data.receiptsCents)} detail="Pagos aprobados con fecha de hoy, aunque la venta sea anterior." />
          <Metric label="Pendiente de ventas del mes" value={money(data.pendingMonthCents)} detail={data.pendingMonthCount+" ventas con saldo · "+data.month} />
        </div>
        <section className={panel+" mt-6"}>
          <h2 className="text-xl font-semibold">Cobros de hoy por medio</h2>
          {data.methods.length ? <dl className="mt-4 grid gap-3 sm:grid-cols-2">{data.methods.map(row=><div key={row.method} className="flex flex-wrap justify-between gap-2 rounded-xl bg-[#F7F4ED] p-3"><dt>{methods[row.method] ?? row.method}</dt><dd className="font-semibold">{money(row.amountCents)}</dd></div>)}</dl> : <p className="mt-3 text-sm text-black/65">No hay acreditaciones fechadas hoy.</p>}
          <p className="mt-4 text-xs text-black/65">Cobros registrados, sin certificar el neto de devoluciones. No representa caja disponible ni ganancia neta.</p>
          {data.undatedMonthCents>0 && <p role="note" className="mt-3 text-sm font-semibold text-[#8B5E3C]">Hay {money(data.undatedMonthCents)} aprobados sin fecha en ventas del mes. No se suman a los cobros de hoy.</p>}
          {data.reviewCount>0 && <p className="mt-3 text-sm">{data.reviewCount} ventas de hoy requieren revisar su conciliación.</p>}
          {data.provisional && <p className="mt-2 text-xs text-black/60">Exclusiones de pruebas conocidas aplicadas; cobertura de exclusiones no certificada como completa.</p>}
          <Link className="mt-4 inline-block font-semibold text-[#556B2F] underline" href={"/admin/analytics?month="+data.month}>Ver informe mensual</Link>
        </section>
      </>}
      <section className="mt-8">
        <h2 className="text-xl font-semibold">Para revisar</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Task href="/admin/checkout?view=payments" title="Pagos de la web" detail="Revisar avisos y acreditaciones." />
          <Task href="/admin/checkout?view=quotes" title="Cotizaciones de envío" detail="Resolver solicitudes pendientes." />
          <Task href="/admin/pedidos" title="Encargos y entregas" detail="Consultar saldos y próximas entregas." />
        </div>
      </section>
    </section>
  </main>;
}
function Metric({label,value,detail}:{label:string;value:string;detail:string}) {
  return <section className={panel}><h2 className="text-sm font-semibold text-[#8B5E3C]">{label}</h2><p className="mt-3 break-words text-2xl font-semibold">{value}</p><p className="mt-2 text-xs text-black/65">{detail}</p></section>;
}
function Task({href,title,detail}:{href:string;title:string;detail:string}) {
  return <Link href={href} className={panel+" block hover:border-[#556B2F] focus-visible:outline-2 focus-visible:outline-offset-2"}><h3 className="font-semibold">{title}</h3><p className="mt-2 text-sm text-black/65">{detail}</p></Link>;
}
