import Link from "next/link";
import { Suspense } from "react";
import { SearchDemand, SearchDemandFallback } from "@/components/admin/search-demand";
import { SalesBreakdownChart, type BreakdownView } from "@/components/admin/analytics/sales-breakdown-chart";
import { SalesHeatmapView } from "@/components/admin/analytics/sales-heatmap-view";
import { TrendChart } from "@/components/admin/analytics/trend-chart";
import { adminMoneyFromCents } from "@/lib/admin/money";
import { AdminNav } from "@/components/admin/admin-nav";
import { requireAdminSession } from "@/lib/admin-session";
import { commercialDate } from "@/lib/commercial-reporting/periods";
import type { CommercialAnalytics } from "@/lib/commercial-reporting/analytics";
import { ABC_A_SHARE, ABC_WINDOW_DAYS, type AbcRow, type CatalogAbc } from "@/lib/admin/catalog-abc";
import type { SalesHeatmap } from "@/lib/admin/sales-heatmap";
import { getCommercialAnalytics } from "@/services/commercial-history";

// One vocabulary on the whole screen. Owner decision 27/11/2026: a sale is a sale only once it is paid; an unpaid
// order is a «pedido sin pagar», never a sale. Ventas, compras and margen bruto; no money-in-the-month mixing.
const monthName = (month: string) => new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T12:00:00Z`));
const monthTitle = (month: string) => { const name = monthName(month); return name.charAt(0).toUpperCase() + name.slice(1); };
const monthOnly = (month: string) => new Intl.DateTimeFormat("es-AR", { month: "long", timeZone: "UTC" }).format(new Date(`${month}-01T12:00:00Z`));
const monthShort = (month: string) => { const name = new Intl.DateTimeFormat("es-AR", { month: "short", timeZone: "UTC" }).format(new Date(`${month}-01T12:00:00Z`)).replace(".", ""); return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${month.slice(2, 4)}`; };
const methods: Record<string, string> = { cash: "Efectivo", transfer: "Transferencia", debit: "Débito", credit: "Crédito", card: "Tarjeta", qr: "QR", other: "Otro", mercadopago: "Mercado Pago" };
const channelNames: Record<string, string> = { physical: "Local", online: "Web", other: "Otros canales" };
const panel = "min-w-0 rounded-3xl border border-[#8B5E3C]/15 bg-white/80 p-5 shadow-sm sm:p-6";
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
const percentText = (value: number) => `${value.toLocaleString("es-AR", { maximumFractionDigits: 1 })}%`;

type Search = Promise<{ month?: string | string[] }>;
export default async function AdminAnalyticsPage({ searchParams }: { searchParams: Search }) {
  await requireAdminSession();
  const query = await searchParams;
  const requested = query.month;
  const month = requested === undefined ? commercialDate(new Date().toISOString()).slice(0, 7) : typeof requested === "string" ? requested : "";
  let analytics: Awaited<ReturnType<typeof getCommercialAnalytics>> | null = null;
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
        <div className="min-w-0"><p className="text-sm font-semibold uppercase tracking-widest text-[#8B5E3C]">Informes</p>
          <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">Resumen del mes</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-black/65">Ventas, compras y margen del mes que elijas. Una venta cuenta cuando está pagada. Importes en pesos, con fechas de Argentina.</p></div>
        <form action="/admin/analytics" method="get" className="flex flex-wrap items-end gap-3">
          <div><label htmlFor="commercial-month" className="mb-2 block text-sm font-semibold">Mes</label>
            <input id="commercial-month" name="month" type="month" min="1900-01" required defaultValue={/^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? month : ""} className="min-w-0 rounded-xl border border-[#8B5E3C]/30 bg-white p-3" /></div>
          <button type="submit" className="min-h-12 rounded-xl bg-[#1F1F1F] px-5 font-semibold text-white">Ver mes</button>
        </form>
      </header>
      {error && <div role="alert" className="mt-8 rounded-2xl border border-red-300 bg-white p-5 text-red-900">{error}</div>}
      {analytics && <Dashboard data={analytics} />}
      <section className="mt-12 border-t border-[#8B5E3C]/20 pt-8" aria-labelledby="recent-title">
        <h2 id="recent-title" className="text-2xl font-semibold">Últimos días</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-black/65">La rotación mira los últimos {ABC_WINDOW_DAYS} días y las búsquedas los últimos 30, hasta hoy. Los horarios se pueden ver de los últimos {ABC_WINDOW_DAYS} días o de todo el historial. No cambian con el mes elegido arriba.</p>
        {analytics && <Rotation data={analytics.rotation} error={analytics.rotationError} />}
        {analytics && <Heatmap data={analytics.heatmap} />}
        <Suspense fallback={<SearchDemandFallback />}><SearchDemand /></Suspense>
      </section>
    </section>
  </main>;
}

function Dashboard({ data: a }: { data: CommercialAnalytics }) {
  const { report: r, counts, margin, comparison: c, unpaidOrders } = a;
  const t = r.totals;
  const today = commercialDate(new Date().toISOString());
  const open = c.throughDay !== null;
  const future = r.month > today.slice(0, 7);
  const families = a.families.filter(row => row.key.startsWith("family:"));
  const paidByMethod = a.paymentMethods.reduce((n, row) => n + row.amountCents, 0);
  const notes = [
    counts.reconciliationIssues ? `${plural(counts.reconciliationIssues, "venta tiene", "ventas tienen")} productos que no coinciden con el total cobrado; sus unidades cuentan, pero no su importe por producto.` : null,
    counts.unverifiedDates ? `${plural(counts.unverifiedDates, "operación no tiene", "operaciones no tienen")} una fecha comprobada.` : null,
    counts.imputedPurchases ? `${plural(counts.imputedPurchases, "compra importada tiene", "compras importadas tienen")} una fecha estimada (${adminMoneyFromCents(t.imputedPurchasesCents)}).` : null,
    t.unknownDatePurchasesCents ? `Compras sin fecha comprobada: ${adminMoneyFromCents(t.unknownDatePurchasesCents)}.` : null,
    r.exclusions.sales || r.exclusions.purchases ? `Se excluyeron ${plural(r.exclusions.sales, "venta", "ventas")} y ${plural(r.exclusions.purchases, "compra", "compras")} de prueba.` : null,
  ].filter((note): note is string => note !== null);
  const productRow = (row: CommercialAnalytics["products"][number]) => ({ key: row.key, name: row.name, count: row.quantity, revenueCents: row.revenueCents, unpricedCount: row.unpricedQuantity });
  const views: BreakdownView[] = [
    { id: "products", label: "Productos", countName: ["unidad", "unidades"], note: "Ventas pagadas del mes, sin envío.", rows: a.products.map(productRow) },
    { id: "categories", label: "Categorías", countName: ["unidad", "unidades"], note: "Ventas pagadas del mes, sin envío.", rows: a.categories.map(productRow) },
    ...(families.length ? [{ id: "families", label: "Familias", countName: ["unidad", "unidades"] as [string, string], note: "Ventas pagadas del mes, sin envío. Solo productos con variantes.", rows: families.map(productRow) }] : []),
    { id: "channels", label: "Canales", countName: ["venta", "ventas"], note: `Ventas pagadas del mes, con el envío cobrado.${counts.historical ? ` Incluye ${plural(counts.historical, "venta histórica importada", "ventas históricas importadas")} en el local.` : ""}`,
      rows: a.channels.filter(row => row.orders > 0).map(row => ({ key: row.channel, name: channelNames[row.channel] ?? row.channel, count: row.orders, revenueCents: row.amountCents, unpricedCount: 0 })) },
  ];

  return <div className="mt-8 space-y-6" data-testid="commercial-analytics">
    <div className="flex flex-wrap items-center gap-3">
      <h2 className="text-2xl font-semibold">{monthTitle(r.month)}</h2>
      {open ? <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-900">{`Mes en curso · hasta el ${today.slice(8, 10)}/${today.slice(5, 7)}`}</span>
        : future ? <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-900">Mes futuro</span> : null}
    </div>

    <div className="grid gap-4 sm:grid-cols-3">
      <Metric label="Ventas" value={adminMoneyFromCents(t.confirmedSalesCents)} detail={`${plural(counts.confirmed, "venta pagada", "ventas pagadas")} en el mes. Incluye el envío cobrado.`} />
      <Metric label="Margen bruto" value={margin.grossMarginCents === null ? "Sin datos" : adminMoneyFromCents(margin.grossMarginCents)}
        detail={margin.coveragePercent === null ? "No hay ventas con costo cargado." : margin.coveragePercent >= 99.95 ? "Ventas sin envío menos el costo de la mercadería. No descuenta comisiones ni gastos." : `Calculado sobre el ${percentText(margin.coveragePercent)} de lo vendido; el resto no tiene costo cargado.`} />
      <Metric label="Compras" value={adminMoneyFromCents(t.purchasesCents)} detail={`${plural(counts.purchases, "compra registrada", "compras registradas")} en el mes.`} />
    </div>
    {unpaidOrders.count ? <p className="text-sm text-black/70">{`Además hay ${plural(unpaidOrders.count, "pedido sin pagar", "pedidos sin pagar")} por ${adminMoneyFromCents(unpaidOrders.amountCents)}. No cuentan como venta hasta que se paguen.`}</p> : null}
    {counts.confirmed === 0 && <p className={panel}>No hay ventas pagadas en este mes.</p>}

    <div className="grid items-start gap-6 lg:grid-cols-2">
      <Panel title="Cómo se pagaron las ventas">
        {a.paymentMethods.length ? <div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="sr-only">Ventas del mes por medio de pago</caption>
          <thead><tr><th scope="col" className="border-b border-black/15 p-2">Medio</th><th scope="col" className="border-b border-black/15 p-2 text-right">Importe</th><th scope="col" className="border-b border-black/15 p-2 text-right">Parte</th></tr></thead>
          <tbody>{a.paymentMethods.map(row => <tr key={row.method} className="border-b border-black/5"><th scope="row" className="p-2 font-normal">{methods[row.method] ?? row.method}</th>
            <td className="p-2 text-right font-semibold tabular-nums">{adminMoneyFromCents(row.amountCents)}</td><td className="p-2 text-right tabular-nums">{paidByMethod ? percentText(row.amountCents / paidByMethod * 100) : "—"}</td></tr>)}</tbody></table></div>
          : <p className="text-sm text-black/65">No hay ventas pagadas en este mes.</p>}
        <p className="mt-3 text-sm text-black/65">Con qué medio se pagaron las ventas de {monthOnly(r.month)}. Una venta pagada con dos medios aparece en los dos.</p>
      </Panel>
      <Panel title={c.previousMonth ? `Comparado con ${monthOnly(c.previousMonth)}` : "Comparado con el mes anterior"}>
        {c.previousMonth ? <>
          <p className="text-sm text-black/65">{open ? `Del 1 al ${c.throughDay} de cada mes, para comparar los mismos días.` : `Meses completos.`}</p>
          <div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="sr-only">Comparación con el mes anterior</caption>
            <thead><tr><th scope="col" className="border-b border-black/15 p-2"> </th><th scope="col" className="border-b border-black/15 p-2 text-right">{monthOnly(r.month)}</th><th scope="col" className="border-b border-black/15 p-2 text-right">{monthOnly(c.previousMonth)}</th><th scope="col" className="border-b border-black/15 p-2 text-right">Diferencia</th></tr></thead>
            <tbody><Comparison label="Ventas" current={t.confirmedSalesCents} value={c.sales} /><Comparison label="Compras" current={t.purchasesCents} value={c.purchases} /></tbody></table></div>
        </> : <p className="text-sm text-black/65">No hay un mes anterior para comparar.</p>}
      </Panel>
    </div>

    <Panel title="Últimos seis meses">
      <TrendChart selected={r.month} points={a.trend.map(row => ({ month: row.month, label: monthShort(row.month), salesCents: row.confirmedSalesCents, purchasesCents: row.purchasesCents, marginCents: row.grossMarginCents }))} />
      <p className="text-xs text-black/60">Pasá el mouse por un mes para ver los importes; tocalo para abrirlo.</p>
      <details className="mt-2"><summary className="cursor-pointer text-sm font-semibold text-[#465826]">Ver como tabla</summary>
        <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[520px] text-left text-sm"><caption className="sr-only">Ventas, compras y margen bruto de los últimos seis meses</caption>
          <thead><tr>{["Mes", "Ventas", "Compras", "Margen bruto"].map((h, i) => <th key={h} scope="col" className={`border-b border-black/15 p-3 ${i ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
          <tbody>{a.trend.map(row => <tr key={row.month} className={row.month === r.month ? "bg-[#F7F4ED] font-semibold" : "border-b border-black/5"}>
            <th scope="row" className="p-3">{row.month === r.month ? monthTitle(row.month) : <Link className="text-[#465826] underline underline-offset-4" href={`?month=${row.month}`}>{monthTitle(row.month)}</Link>}</th>
            <td className="p-3 text-right tabular-nums">{adminMoneyFromCents(row.confirmedSalesCents)}</td><td className="p-3 text-right tabular-nums">{adminMoneyFromCents(row.purchasesCents)}</td><td className="p-3 text-right tabular-nums">{row.grossMarginCents === null ? "Sin datos" : adminMoneyFromCents(row.grossMarginCents)}</td>
          </tr>)}</tbody></table></div></details>
    </Panel>

    <Panel title={`Qué se vendió en ${monthOnly(r.month)}`}><SalesBreakdownChart views={views} /></Panel>

    <Panel title="Detalle del margen bruto">
      <Row label="Vendido con costo cargado (sin envío)" value={adminMoneyFromCents(margin.coveredRevenueCents)} />
      <Row label="Costo de esa mercadería" value={adminMoneyFromCents(margin.verifiedCostCents)} />
      <Row label="Margen bruto" value={margin.grossMarginCents === null ? "Sin datos" : `${adminMoneyFromCents(margin.grossMarginCents)}${margin.coveredRevenueCents ? ` · ${percentText(margin.grossMarginCents / margin.coveredRevenueCents * 100)} de lo vendido` : ""}`} />
      {margin.unknownRevenueCents ? <Row label="Vendido sin costo cargado (fuera del margen)" value={adminMoneyFromCents(margin.unknownRevenueCents)} /> : null}
      <p className="mt-3 text-sm text-black/65">Usa el costo guardado al momento de cada venta. No descuenta envío, comisiones de cobro ni gastos.{margin.unknownCostLines ? ` ${plural(margin.unknownCostLines, "producto vendido no tiene", "productos vendidos no tienen")} costo cargado.` : ""}</p>
    </Panel>

    <details className={panel}>
      <summary className="cursor-pointer font-semibold">{notes.length ? `Notas sobre los datos (${notes.length})` : "Notas sobre los datos"}</summary>
      <ul className="mt-3 grid list-disc gap-2 pl-5 text-sm text-black/70">
        {notes.map(note => <li key={note}>{note}</li>)}
        <li>Las ventas de prueba conocidas no se cuentan.</li>
        <li>Si una lectura falla, no se muestran totales parciales.</li>
      </ul>
    </details>
  </div>;
}

const percent = (share: number) => `${(share * 100).toLocaleString("es-AR", { maximumFractionDigits: 1 })}%`;
const day = (value: string) => value.split("-").reverse().join("/");
function Heatmap({ data }: { data: { recent: SalesHeatmap; all: SalesHeatmap } | null }) {
  const title = <h3 className="text-xl font-semibold">Días y horarios de venta</h3>;
  if (!data) return <section className={`${panel} mt-6`}>{title}<p role="alert" className="mt-4 text-sm text-amber-900">No pudimos armar el mapa de horarios. El resumen mensual no se ve afectado.</p></section>;
  return <section className={`${panel} mt-6 space-y-4`} aria-label="Días y horarios de venta">{title}<SalesHeatmapView recent={data.recent} all={data.all} /></section>;
}

function RotationTable({ rows, total }: { rows: AbcRow[]; total: number }) {
  return <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm">
    <thead><tr>{["Producto", "Unidades", "Facturación", "Parte del total", "Margen bruto", "Stock hoy"].map((h, i) => <th key={h} scope="col" className={`border-b border-black/15 p-3 ${i ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
    <tbody>{rows.map(row => <tr key={row.id} className="border-b border-black/5">
      <th scope="row" className="p-3 font-normal"><Link className="font-semibold underline-offset-4 hover:underline" href={`/admin/productos/${row.id}/editar`}>{row.name}</Link>{row.variant_label ? <span className="block text-xs text-black/60">{row.variant_label}</span> : null}</th>
      <td className="p-3 text-right tabular-nums">{row.units}</td><td className="p-3 text-right tabular-nums">{adminMoneyFromCents(row.revenueCents)}</td><td className="p-3 text-right tabular-nums">{total ? percent(row.revenueCents / total) : "—"}</td>
      <td className="p-3 text-right tabular-nums">{row.marginCents === null ? <span className="text-black/60">Sin costo guardado</span> : adminMoneyFromCents(row.marginCents)}</td><td className={`p-3 text-right tabular-nums ${row.available === 0 ? "font-semibold text-amber-900" : ""}`}>{row.available === 0 ? "Sin stock" : row.available}</td>
    </tr>)}</tbody></table></div>;
}

function Rotation({ data, error }: { data: CatalogAbc | null; error: string | null }) {
  const title = <h3 className="text-xl font-semibold">Rotación del catálogo · últimos {ABC_WINDOW_DAYS} días</h3>;
  if (!data) return <section className={`${panel} mt-6`}>{title}<p role="alert" className="mt-4 text-sm text-amber-900">No pudimos calcular la rotación del catálogo. El resumen mensual no se ve afectado; recargá para reintentar.{error ? <span className="block text-xs">Código: {error}</span> : null}</p></section>;
  const best = data.rows.filter(row => row.abcClass === "A"), slow = data.rows.filter(row => row.abcClass !== "A");
  const sum = (rows: AbcRow[]) => rows.reduce((n, row) => n + row.revenueCents, 0);
  const withoutCost = data.idle.filter(row => row.retainedCents === null).length;
  const card = "rounded-2xl bg-[#F7F4ED] p-4";
  return <section className={`${panel} mt-6 space-y-6`} aria-label="Rotación del catálogo">
    <div>{title}<p className="mt-2 max-w-3xl text-sm leading-6 text-black/65">Del {day(data.from)} al {day(data.to)}, ventas pagadas sin envío. Los productos se separan en tres grupos para decidir qué reponer, qué revisar y qué liquidar.</p></div>
    <div className="grid gap-3 sm:grid-cols-3">
      <div className={card}><p className="text-sm font-semibold text-[#465826]">Los que más venden</p><p className="mt-1 text-2xl font-semibold">{best.length}</p><p className="text-sm text-black/65">{`Juntan ${adminMoneyFromCents(sum(best))}, el ${data.totalRevenueCents ? percent(sum(best) / data.totalRevenueCents) : "—"} de lo facturado.`}</p></div>
      <div className={card}><p className="text-sm font-semibold text-[#8B5E3C]">Venden poco</p><p className="mt-1 text-2xl font-semibold">{slow.length}</p><p className="text-sm text-black/65">{`Juntan ${adminMoneyFromCents(sum(slow))}, el ${data.totalRevenueCents ? percent(sum(slow) / data.totalRevenueCents) : "—"} restante.`}</p></div>
      <div className={card}><p className="text-sm font-semibold text-amber-900">Con stock y sin ventas</p><p className="mt-1 text-2xl font-semibold">{data.idle.length}</p><p className="text-sm text-black/65">{`${adminMoneyFromCents(data.idleRetainedCents)} de mercadería parada, a costo actual.`}</p></div>
    </div>

    <div className="space-y-2"><h4 className="font-semibold">Los que más venden</h4>
      <p className="text-sm text-black/65">{`Los productos que, ordenados de mayor a menor, suman el ${percent(ABC_A_SHARE)} de lo facturado. Que no falten: reponelos antes de quedarte sin stock.`}</p>
      {best.length ? <RotationTable rows={best} total={data.totalRevenueCents} /> : <p className="text-sm text-black/65">No hay ventas pagadas con producto identificado en este período.</p>}</div>

    <div className="space-y-2"><h4 className="font-semibold">Venden poco</h4>
      <p className="text-sm text-black/65">{`Se vendieron, pero entre todos suman solo el ${percent(1 - ABC_A_SHARE)} restante. Revisá precio, fotos y exhibición, o si conviene seguir trayéndolos.`}</p>
      {slow.length ? <RotationTable rows={slow} total={data.totalRevenueCents} /> : <p className="text-sm text-black/65">Ninguno en este período.</p>}</div>
    {data.rows.some(row => row.marginCents === null) ? <p className="text-sm text-black/65">«Sin costo guardado»: esas ventas no guardaron el costo del producto al venderse, así que su margen no se puede calcular.</p> : null}

    <div className="space-y-2"><h4 className="font-semibold">Con stock y sin ventas</h4>
      <p className="text-sm text-black/65">{`No se vendieron en ${ABC_WINDOW_DAYS} días. Candidatos a liquidar, armar un combo o dejar de reponer.`}{withoutCost ? ` ${plural(withoutCost, "producto sin costo cargado no suma", "productos sin costo cargado no suman")} al total parado.` : ""}{data.recentExcluded ? ` No incluye ${plural(data.recentExcluded, "producto cargado", "productos cargados")} en los últimos ${ABC_WINDOW_DAYS} días.` : ""}</p>
      {data.idle.length ? <details><summary className="cursor-pointer text-sm font-semibold text-[#465826]">Ver los {data.idle.length} productos</summary>
        <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[480px] text-left text-sm">
          <thead><tr>{["Producto", "Stock", "Mercadería parada (a costo)"].map((h, i) => <th key={h} scope="col" className={`border-b border-black/15 p-3 ${i ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
          <tbody>{data.idle.map(row => <tr key={row.id} className="border-b border-black/5">
            <th scope="row" className="p-3 font-normal"><Link className="font-semibold underline-offset-4 hover:underline" href={`/admin/productos/${row.id}/editar`}>{row.name}</Link>{row.variant_label ? <span className="block text-xs text-black/60">{row.variant_label}</span> : null}</th>
            <td className="p-3 text-right tabular-nums">{row.available}</td><td className="p-3 text-right tabular-nums">{row.retainedCents === null ? <span className="text-black/60">Sin costo cargado</span> : adminMoneyFromCents(row.retainedCents)}</td>
          </tr>)}</tbody></table></div></details> : <p className="text-sm text-black/65">Todos los productos con stock tuvieron ventas en el período.</p>}</div>
    {data.uncertainSales || data.unidentifiedLines ? <p className="text-sm text-black/65">{`Quedan fuera ${plural(data.uncertainSales, "venta", "ventas")} con datos incompletos y ${plural(data.unidentifiedLines, "producto vendido que ya no existe", "productos vendidos que ya no existen")} en el catálogo.`}</p> : null}
  </section>;
}
function Panel({ title, children }: { title: string; children: React.ReactNode }) { return <section className={panel}><h3 className="text-xl font-semibold">{title}</h3><div className="mt-4 space-y-2">{children}</div></section>; }
function Metric({ label, value, detail }: { label: string; value: string; detail: string }) { return <section className={panel}><h3 className="text-sm font-semibold text-[#8B5E3C]">{label}</h3><p className="mt-3 break-words text-2xl font-semibold tabular-nums sm:text-3xl">{value}</p><p className="mt-3 text-sm leading-6 text-black/65">{detail}</p></section>; }
function Row({ label, value }: { label: string; value: string }) { return <div className="flex min-w-0 flex-col justify-between gap-1 rounded-xl bg-[#F7F4ED] p-3 text-sm sm:flex-row sm:gap-4"><span className="min-w-0 break-words">{label}</span><span className="break-words font-semibold tabular-nums sm:text-right">{value}</span></div>; }
function Comparison({ label, current, value }: { label: string; current: number; value: CommercialAnalytics["comparison"]["sales"] }) {
  const difference = value.differenceCents === null ? "—" : value.differenceCents === 0 ? "Igual"
    : `${value.differenceCents > 0 ? "+" : "−"}${adminMoneyFromCents(Math.abs(value.differenceCents))}${value.percent === null ? "" : ` (${value.percent > 0 ? "+" : "−"}${percentText(Math.abs(value.percent))})`}`;
  return <tr className="border-b border-black/5"><th scope="row" className="p-2 font-normal">{label}</th>
    <td className="p-2 text-right tabular-nums">{adminMoneyFromCents(current)}</td><td className="p-2 text-right tabular-nums">{value.previousCents === null ? "—" : adminMoneyFromCents(value.previousCents)}</td>
    <td className={`p-2 text-right font-semibold tabular-nums ${value.differenceCents && value.differenceCents < 0 ? "text-amber-900" : ""}`}>{difference}</td></tr>;
}
