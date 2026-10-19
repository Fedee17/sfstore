import Link from "next/link";
import { AdminNav } from "@/components/admin/admin-nav";
import { requireAdminSession } from "@/lib/admin-session";
import { commercialDate } from "@/lib/commercial-reporting/periods";
import type { CommercialAnalytics } from "@/lib/commercial-reporting/analytics";
import { getCommercialAnalytics } from "@/services/commercial-history";

const money = (cents: number) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 }).format(cents / 100);
const monthLabel = (month: string) => new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T12:00:00Z`));
const methods: Record<string, string> = { cash: "Efectivo", transfer: "Transferencia", debit: "Débito", credit: "Crédito", card: "Tarjeta (sin tipo documentado)", qr: "QR", other: "Otro", mercadopago: "Mercado Pago (histórico)" };
const panel = "min-w-0 rounded-3xl border border-[#8B5E3C]/15 bg-white/80 p-5 shadow-sm sm:p-6";

type Search = Promise<{ month?: string | string[] }>;
export default async function AdminAnalyticsPage({ searchParams }: { searchParams: Search }) {
  await requireAdminSession();
  const query = await searchParams;
  const requested = query.month;
  const month = requested === undefined ? commercialDate(new Date().toISOString()).slice(0, 7) : typeof requested === "string" ? requested : "";
  let analytics: CommercialAnalytics | null = null;
  let error: string | null = null;
  try { analytics = await getCommercialAnalytics(month); }
  catch (cause) {
    error = cause instanceof Error && cause.message === "COMMERCIAL_INVALID_MONTH"
      ? "Elegí un mes válido a partir de enero de 1900."
      : "No se pudo completar la lectura comercial. No se muestran totales parciales. Reintentá la consulta.";
  }
  return <main className="min-h-screen bg-[#F7F4ED] text-[#1F1F1F]">
    <AdminNav />
    <section className="mx-auto max-w-7xl px-4 py-8 sm:px-8">
      <header className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
        <div className="min-w-0"><p className="text-sm font-semibold uppercase tracking-widest text-[#8B5E3C]">Analytics</p>
          <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">Resumen comercial mensual</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-black/65">Historial y operaciones actuales · America/Argentina/Buenos_Aires. Importes originales en pesos argentinos.</p></div>
        <form action="/admin/analytics" method="get" className="flex flex-wrap items-end gap-3">
          <div><label htmlFor="commercial-month" className="mb-2 block text-sm font-semibold">Mes y año</label>
            <input id="commercial-month" name="month" type="month" min="1900-01" required defaultValue={/^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? month : ""} className="min-w-0 rounded-xl border border-[#8B5E3C]/30 bg-white p-3" /></div>
          <button type="submit" className="rounded-xl bg-[#1F1F1F] px-5 py-3 font-semibold text-white">Consultar</button>
        </form>
      </header>
      {error && <div role="alert" className="mt-8 rounded-2xl border border-red-300 bg-white p-5 text-red-900">{error}</div>}
      {analytics && <Dashboard data={analytics} />}
    </section>
  </main>;
}

function Dashboard({ data: a }: { data: CommercialAnalytics }) {
  const { report: r, counts, margin, comparison: c } = a;
  const t = r.totals;
  return <div className="mt-8 space-y-6" data-testid="commercial-analytics">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold capitalize">{monthLabel(r.month)}</h2>
      <p className="text-sm text-black/65">{r.provisional ? "Exclusión de ensayos conocidos aplicada" : "Exclusiones revisadas"}</p></div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Facturación comercial confirmada" value={money(t.confirmedSalesCents)} detail={`${counts.confirmed} registros confirmados · incluye envío registrado; no representa facturación fiscal.`} />
      <Metric label="Compras confirmadas" value={money(t.purchasesCents)} detail={`${counts.purchases} registros, incluidos históricos. No equivale a egresos de caja.`} />
      <Metric label="Ventas registradas" value={money(t.registeredSalesCents)} detail={`${counts.registered} registros no cancelados; incluye ventas aún pendientes.`} />
      <Metric label="Saldo pendiente de estas ventas" value={money(t.pendingForSalesCents)} detail="Importes aún sin pago aprobado. No se presentan como ingresos." />
    </div>
    {counts.registered === 0 && <p className={panel}>No hay ventas registradas en este mes.</p>}
    <div className="grid gap-6 lg:grid-cols-2">
      <Panel title="Cobros: dos lecturas diferentes">
        <Row label="Pagos aprobados de las ventas del mes" value={money(t.approvedPaymentsForSalesCents)} />
        <p className="my-3 text-sm text-black/65">Agrupados por la fecha de la venta. Pueden haberse cobrado en otro mes o no tener fecha de acreditación.</p>
        <Row label="Acreditaciones con fecha en este mes" value={money(t.datedReceiptsCents)} />
        <Row label="Sin fecha de acreditación, atribuidos a ventas del mes" value={money(t.undatedApprovedForSalesCents)} />
        <p className="mt-3 text-sm text-black/65">Los cobros sin fecha no se suman otra vez ni se convierten en caja del mes. Los importes aprobados no certifican el neto de devoluciones.</p>
      </Panel>
      <Panel title="Comparación con el mes anterior">
        <p className="mb-4 text-sm text-black/65">{c.previousMonth ? monthLabel(c.previousMonth) : "Sin mes anterior dentro del período soportado"}</p>
        <Comparison label="Facturación confirmada" value={c.sales} />
        <Comparison label="Compras confirmadas" value={c.purchases} />
        {(c.selectedMonthNotClosed || c.previousMonthNotClosed) && <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Período no cerrado: se compara lo registrado hasta ahora con el mes anterior completo. No es una comparación equivalente de días transcurridos.</p>}
      </Panel>
    </div>
    <Panel title="Evolución mensual">
      <p className="mb-4 text-sm text-black/65">Hasta seis meses. Los cobros con fecha y los históricos sin fecha se presentan separados.</p>
      <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><caption className="sr-only">Evolución comercial mensual en pesos argentinos</caption>
        <thead><tr>{["Mes", "Ventas confirmadas", "Compras confirmadas", "Cobros con fecha", "Sin fecha (mes de venta)"].map(h => <th key={h} scope="col" className="border-b border-black/15 p-3">{h}</th>)}</tr></thead>
        <tbody>{a.trend.map(row => <tr key={row.month} className={row.month === r.month ? "bg-[#F7F4ED] font-semibold" : ""}>
          <th scope="row" className="p-3 capitalize"><Link className="underline underline-offset-4" href={`?month=${row.month}`}>{monthLabel(row.month)}</Link></th>
          <td className="p-3">{money(row.confirmedSalesCents)}</td><td className="p-3">{money(row.purchasesCents)}</td><td className="p-3">{money(row.datedReceiptsCents)}</td><td className="p-3">{money(row.undatedApprovedForSalesCents)}</td>
        </tr>)}</tbody></table></div>
    </Panel>
    <div className="grid gap-6 lg:grid-cols-2">
      <Panel title="Ventas confirmadas por canal">
        {a.channels.map(row => <Row key={row.channel} label={row.channel === "physical" ? "Local físico (histórico + actual)" : row.channel === "online" ? "Online" : "Otros canales"} value={`${money(row.amountCents)} · ${row.orders} registros`} />)}
        <p className="mt-3 text-sm text-black/65">{counts.historical} registros históricos confirmados. Un registro importado no necesariamente equivale a un ticket original completo.</p>
      </Panel>
      <Panel title="Margen bruto sobre costos verificables">
        <p className="text-3xl font-semibold">{margin.grossMarginCents === null ? "No disponible" : money(margin.grossMarginCents)}</p>
        <p className="my-3 text-sm text-black/65">Margen parcial, sin envío ni gastos operativos. Sólo líneas conciliadas con una instantánea positiva de costo tomada al vender; no audita facturas de proveedores.</p>
        <Row label="Cobertura del ingreso por mercadería" value={margin.coveragePercent === null ? "Sin base" : `${margin.coveragePercent.toLocaleString("es-AR", { maximumFractionDigits: 1 })}%`} />
        <Row label="Ingreso con costo verificable" value={money(margin.coveredRevenueCents)} />
        <Row label="Costo documentado de esas líneas" value={money(margin.verifiedCostCents)} />
        <Row label="Ingreso sin cobertura suficiente" value={money(margin.unknownRevenueCents)} />
        {(margin.unknownCostLines > 0 || margin.unreconciledSales > 0) && <p className="mt-3 text-sm text-amber-900">Costo no disponible o no verificable: {margin.unknownCostLines} líneas. Ventas sin conciliación de líneas: {margin.unreconciledSales}. No se sustituyen por costos actuales ni por cero.</p>}
      </Panel>
      <PaymentPanel title="Medios: pagos de las ventas del mes" rows={r.paymentMethodsForSales} />
      <PaymentPanel title="Medios: acreditaciones fechadas en el mes" rows={r.paymentMethodsForDatedReceipts} />
      <RankingPanel title="Familias documentadas" rows={a.families} />
      <p className="text-sm">Las operaciones sin snapshot de familia permanecen sin clasificar. No se asignan por el catálogo actual.</p>
      <RankingPanel title="Productos más vendidos" rows={a.products} />
      <RankingPanel title="Categorías más vendidas" rows={a.categories} />
    </div>
    <Panel title="Calidad y alcance de los datos">
      <Row label="Compras con fecha imputada" value={`${counts.imputedPurchases} · ${money(t.imputedPurchasesCents)}`} />
      <Row label="Compras sin procedencia de fecha verificable" value={money(t.unknownDatePurchasesCents)} />
      <Row label="Operaciones con procedencia de fecha no verificada" value={String(counts.unverifiedDates)} />
      <Row label="Ventas que requieren revisión de conciliación" value={String(counts.reconciliationIssues)} />
      <Row label="Ensayos conocidos excluidos en este mes" value={`${r.exclusions.sales} ventas · ${r.exclusions.purchases} compras`} />
      <p className="mt-4 text-sm leading-6 text-black/65">Las fechas imputadas se conservan y no representan comprobantes fechados. Las exclusiones usan identificadores exactos de ensayos conocidos; no certifican que se hayan identificado todos los ensayos posibles. La lectura es paginada y completa dentro de su presupuesto, pero reúne varias consultas y no constituye un snapshot transaccional global. Ante un fallo no se publican cifras parciales.</p>
    </Panel>
  </div>;
}
function Panel({ title, children }: { title: string; children: React.ReactNode }) { return <section className={panel}><h2 className="text-xl font-semibold">{title}</h2><div className="mt-4 space-y-2">{children}</div></section>; }
function Metric({ label, value, detail }: { label: string; value: string; detail: string }) { return <section className={panel}><h3 className="text-sm font-semibold text-[#8B5E3C]">{label}</h3><p className="mt-3 break-words text-3xl font-semibold">{value}</p><p className="mt-3 text-sm leading-6 text-black/65">{detail}</p></section>; }
function Row({ label, value }: { label: string; value: string }) { return <div className="flex min-w-0 flex-col justify-between gap-1 rounded-xl bg-[#F7F4ED] p-3 text-sm sm:flex-row sm:gap-4"><span className="min-w-0 break-words">{label}</span><span className="break-words font-semibold sm:text-right">{value}</span></div>; }
function Comparison({ label, value }: { label: string; value: CommercialAnalytics["comparison"]["sales"] }) { return <Row label={label} value={value.differenceCents === null ? "Sin base anterior" : `${value.differenceCents > 0 ? "+" : ""}${money(value.differenceCents)} · ${value.percent === null ? "sin base porcentual" : `${value.percent.toLocaleString("es-AR", { maximumFractionDigits: 1 })}%`}`} />; }
function PaymentPanel({ title, rows }: { title: string; rows: CommercialAnalytics["report"]["paymentMethodsForSales"] }) { return <Panel title={title}>{rows.length ? rows.map(row => <Row key={row.method} label={methods[row.method] ?? row.method} value={`${money(row.amountCents)} · ${row.distinctOrders} registros`} />) : <p className="text-sm text-black/65">No hay pagos aprobados en este grupo.</p>}<p className="mt-3 text-sm text-black/65">Importes del registro de pagos. Una venta combinada puede aparecer en varios medios; no deben sumarse sus cantidades de registros.</p></Panel>; }
function RankingPanel({ title, rows }: { title: string; rows: CommercialAnalytics["products"] }) { return <Panel title={title}><p className="mb-3 text-sm text-black/65">Sólo ventas confirmadas. Nombres y categorías guardados al vender. Se muestran los primeros 10 por unidades; importes de líneas conciliadas, sin envío.</p>{rows.length ? rows.slice(0, 10).map(row => <div key={row.key}><Row label={row.name} value={`${row.quantity} unidades · ${money(row.revenueCents)}`} />{row.unpricedQuantity > 0 && <p className="my-2 text-xs text-amber-900">{row.unpricedQuantity} unidades sin importe conciliable; excluidas del importe mostrado.</p>}</div>) : <p className="text-sm text-black/65">No hay ventas confirmadas para este ranking.</p>}{rows.length > 10 && <p className="text-sm text-black/65">{rows.length} grupos en total. El resumen mensual incluye todos.</p>}</Panel>; }
