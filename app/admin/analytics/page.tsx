import Link from "next/link";
import { Suspense } from "react";
import { SearchDemand, SearchDemandFallback } from "@/components/admin/search-demand";
import { adminMoneyFromCents } from "@/lib/admin/money";
import { AdminNav } from "@/components/admin/admin-nav";
import { requireAdminSession } from "@/lib/admin-session";
import { commercialDate } from "@/lib/commercial-reporting/periods";
import type { CommercialAnalytics } from "@/lib/commercial-reporting/analytics";
import { ABC_A_SHARE, ABC_B_SHARE, ABC_WINDOW_DAYS, type AbcClass, type CatalogAbc } from "@/lib/admin/catalog-abc";
import { HEATMAP_WINDOW_DAYS, WEEKDAYS, type SalesHeatmap } from "@/lib/admin/sales-heatmap";
import { getCommercialAnalytics } from "@/services/commercial-history";

// One vocabulary on the whole screen: ventas confirmadas (paid sales), por cobrar, cobrado, compras, margen bruto.
const monthName = (month: string) => new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T12:00:00Z`));
const monthTitle = (month: string) => { const name = monthName(month); return name.charAt(0).toUpperCase() + name.slice(1); };
const monthOnly = (month: string) => new Intl.DateTimeFormat("es-AR", { month: "long", timeZone: "UTC" }).format(new Date(`${month}-01T12:00:00Z`));
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
          <p className="mt-3 max-w-2xl text-sm leading-6 text-black/65">Ventas, cobros, compras y margen del mes que elijas. Importes en pesos, con fechas de Argentina.</p></div>
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
        <p className="mt-2 max-w-3xl text-sm leading-6 text-black/65">Estos bloques miran los últimos {ABC_WINDOW_DAYS} días (las búsquedas, los últimos 30) hasta hoy. No cambian con el mes elegido arriba.</p>
        {analytics && <Rotation data={analytics.rotation} error={analytics.rotationError} />}
        {analytics && <Heatmap data={analytics.heatmap} />}
        <Suspense fallback={<SearchDemandFallback />}><SearchDemand /></Suspense>
      </section>
    </section>
  </main>;
}

function Dashboard({ data: a }: { data: CommercialAnalytics }) {
  const { report: r, counts, margin, comparison: c, cashIn } = a;
  const t = r.totals;
  const unpaid = counts.registered - counts.confirmed;
  const today = commercialDate(new Date().toISOString());
  const open = c.throughDay !== null;
  const future = r.month > today.slice(0, 7);
  const families = a.families.filter(row => row.key.startsWith("family:"));
  const channels = a.channels.filter(row => row.orders > 0);
  const notes = [
    counts.reconciliationIssues ? `${plural(counts.reconciliationIssues, "venta tiene", "ventas tienen")} productos que no coinciden con el total cobrado; sus unidades cuentan, pero no su importe por producto.` : null,
    counts.unverifiedDates ? `${plural(counts.unverifiedDates, "operación no tiene", "operaciones no tienen")} una fecha comprobada.` : null,
    counts.imputedPurchases ? `${plural(counts.imputedPurchases, "compra importada tiene", "compras importadas tienen")} una fecha estimada (${adminMoneyFromCents(t.imputedPurchasesCents)}).` : null,
    t.unknownDatePurchasesCents ? `Compras sin fecha comprobada: ${adminMoneyFromCents(t.unknownDatePurchasesCents)}.` : null,
    r.exclusions.sales || r.exclusions.purchases ? `Se excluyeron ${plural(r.exclusions.sales, "venta", "ventas")} y ${plural(r.exclusions.purchases, "compra", "compras")} de prueba.` : null,
  ].filter((note): note is string => note !== null);

  return <div className="mt-8 space-y-6" data-testid="commercial-analytics">
    <div className="flex flex-wrap items-center gap-3">
      <h2 className="text-2xl font-semibold">{monthTitle(r.month)}</h2>
      {open ? <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-900">{`Mes en curso · hasta el ${today.slice(8, 10)}/${today.slice(5, 7)}`}</span>
        : future ? <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-900">Mes futuro</span> : null}
    </div>

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <Metric label="Ventas confirmadas" value={adminMoneyFromCents(t.confirmedSalesCents)}
        detail={`${plural(counts.confirmed, "venta pagada", "ventas pagadas")} en el mes. Incluye el envío cobrado.`} />
      <Metric label="Por cobrar" value={adminMoneyFromCents(t.pendingForSalesCents)}
        detail={unpaid ? `De ${plural(unpaid, "venta del mes que todavía no está pagada", "ventas del mes que todavía no están pagadas")}.` : "Todas las ventas del mes están pagadas."} />
      <Metric label="Cobrado en el mes" value={adminMoneyFromCents(cashIn.totalCents)}
        detail={cashIn.fromOtherSalesCents ? `${adminMoneyFromCents(cashIn.fromMonthSalesCents)} de ventas de ${monthOnly(r.month)} y ${adminMoneyFromCents(cashIn.fromOtherSalesCents)} de ventas de otros meses.` : `Todo corresponde a ventas de ${monthOnly(r.month)}.`} />
      <Metric label="Margen bruto" value={margin.grossMarginCents === null ? "Sin datos" : adminMoneyFromCents(margin.grossMarginCents)}
        detail={margin.coveragePercent === null ? "No hay ventas con costo cargado." : margin.coveragePercent >= 99.95 ? "Todo lo vendido tiene costo cargado. No descuenta envío, comisiones ni gastos." : `Calculado sobre el ${percentText(margin.coveragePercent)} de lo vendido; el resto no tiene costo cargado.`} />
      <Metric label="Compras" value={adminMoneyFromCents(t.purchasesCents)} detail={`${plural(counts.purchases, "compra registrada", "compras registradas")} en el mes.`} />
    </div>
    {t.undatedApprovedForSalesCents > 0 && <p className="text-sm text-black/65">{`Además, ${adminMoneyFromCents(t.undatedApprovedForSalesCents)} de ventas de este mes se cobraron sin fecha registrada (ventas históricas importadas): no figuran en «Cobrado en el mes».`}</p>}
    {counts.registered === 0 && <p className={panel}>No hay ventas registradas en este mes.</p>}

    <div className="grid gap-6 lg:grid-cols-2">
      <Panel title="Cómo se cobró">
        {a.paymentMethods.length ? <div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="sr-only">Cobros por medio de pago</caption>
          <thead><tr><th scope="col" className="border-b border-black/15 p-2">Medio</th><th scope="col" className="border-b border-black/15 p-2 text-right">Ventas del mes</th><th scope="col" className="border-b border-black/15 p-2 text-right">Cobrado en el mes</th></tr></thead>
          <tbody>{a.paymentMethods.map(row => <tr key={row.method} className="border-b border-black/5"><th scope="row" className="p-2 font-normal">{methods[row.method] ?? row.method}</th>
            <td className="p-2 text-right tabular-nums">{adminMoneyFromCents(row.forSalesCents)}</td><td className="p-2 text-right font-semibold tabular-nums">{adminMoneyFromCents(row.receivedCents)}</td></tr>)}</tbody></table></div>
          : <p className="text-sm text-black/65">No hay cobros en este mes.</p>}
        <p className="mt-3 text-sm text-black/65">«Ventas del mes» es lo pagado por las ventas de {monthOnly(r.month)}, se haya cobrado cuando sea. «Cobrado en el mes» es lo que entró en {monthOnly(r.month)}, sea de la venta que sea. Una venta pagada con dos medios aparece en los dos.</p>
      </Panel>
      <Panel title={c.previousMonth ? `Comparado con ${monthOnly(c.previousMonth)}` : "Comparado con el mes anterior"}>
        {c.previousMonth ? <>
          <p className="text-sm text-black/65">{open ? `Del 1 al ${c.throughDay} de cada mes, para comparar los mismos días.` : `Meses completos.`}</p>
          <div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="sr-only">Comparación con el mes anterior</caption>
            <thead><tr><th scope="col" className="border-b border-black/15 p-2"> </th><th scope="col" className="border-b border-black/15 p-2 text-right">{monthOnly(r.month)}</th><th scope="col" className="border-b border-black/15 p-2 text-right">{monthOnly(c.previousMonth)}</th><th scope="col" className="border-b border-black/15 p-2 text-right">Diferencia</th></tr></thead>
            <tbody><Comparison label="Ventas confirmadas" current={t.confirmedSalesCents} value={c.sales} /><Comparison label="Compras" current={t.purchasesCents} value={c.purchases} /></tbody></table></div>
        </> : <p className="text-sm text-black/65">No hay un mes anterior para comparar.</p>}
      </Panel>
    </div>

    <Panel title="Últimos seis meses">
      <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><caption className="sr-only">Ventas confirmadas, cobros y compras de los últimos seis meses</caption>
        <thead><tr>{["Mes", "Ventas confirmadas", "Cobrado en el mes", "Compras"].map((h, i) => <th key={h} scope="col" className={`border-b border-black/15 p-3 ${i ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
        <tbody>{a.trend.map(row => <tr key={row.month} className={row.month === r.month ? "bg-[#F7F4ED] font-semibold" : "border-b border-black/5"}>
          <th scope="row" className="p-3">{row.month === r.month ? monthTitle(row.month) : <Link className="text-[#465826] underline underline-offset-4" href={`?month=${row.month}`}>{monthTitle(row.month)}</Link>}</th>
          <td className="p-3 text-right tabular-nums">{adminMoneyFromCents(row.confirmedSalesCents)}</td><td className="p-3 text-right tabular-nums">{adminMoneyFromCents(row.datedReceiptsCents)}</td><td className="p-3 text-right tabular-nums">{adminMoneyFromCents(row.purchasesCents)}</td>
        </tr>)}</tbody></table></div>
      {a.trend.some(row => row.undatedApprovedForSalesCents > 0) ? <p className="mt-3 text-sm text-black/65">{`Las ventas históricas importadas no tienen fecha de cobro: ${adminMoneyFromCents(a.trend.reduce((sum, row) => sum + row.undatedApprovedForSalesCents, 0))} cobrados en estos meses no figuran en «Cobrado en el mes».`}</p> : null}
      <p className="mt-2 text-xs text-black/60">Tocá un mes para verlo completo.</p>
    </Panel>

    <h2 className="pt-2 text-xl font-semibold">Qué se vendió en {monthOnly(r.month)}</h2>
    <div className="grid gap-6 lg:grid-cols-2">
      <RankingPanel title="Productos más vendidos" rows={a.products} />
      <RankingPanel title="Categorías" rows={a.categories} />
      {families.length ? <RankingPanel title="Familias" rows={families} /> : null}
      <Panel title="Canales">
        {channels.length ? channels.map(row => <Row key={row.channel} label={channelNames[row.channel] ?? row.channel} value={`${adminMoneyFromCents(row.amountCents)} · ${plural(row.orders, "venta", "ventas")}`} />)
          : <p className="text-sm text-black/65">No hay ventas confirmadas en este mes.</p>}
        {counts.historical ? <p className="mt-3 text-sm text-black/65">{`Incluye ${plural(counts.historical, "venta histórica importada", "ventas históricas importadas")} en el local.`}</p> : null}
      </Panel>
      <Panel title="Detalle del margen bruto">
        <Row label="Vendido con costo cargado" value={adminMoneyFromCents(margin.coveredRevenueCents)} />
        <Row label="Costo de esa mercadería" value={adminMoneyFromCents(margin.verifiedCostCents)} />
        <Row label="Margen bruto" value={margin.grossMarginCents === null ? "Sin datos" : adminMoneyFromCents(margin.grossMarginCents)} />
        <Row label="Vendido sin costo cargado (fuera del margen)" value={adminMoneyFromCents(margin.unknownRevenueCents)} />
        <p className="mt-3 text-sm text-black/65">Usa el costo guardado al momento de cada venta. No descuenta envío, comisiones de cobro ni gastos.{margin.unknownCostLines ? ` ${plural(margin.unknownCostLines, "producto vendido no tiene", "productos vendidos no tienen")} costo cargado.` : ""}</p>
      </Panel>
    </div>

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
const classLabel: Record<AbcClass, string> = { A: "A · concentran la facturación", B: "B · regulares", C: "C · baja rotación" };
const classTone: Record<AbcClass, string> = { A: "bg-[#556B2F] text-white", B: "bg-[#E6EBD9] text-[#465826]", C: "bg-amber-100 text-amber-900" };
const percent = (share: number) => `${(share * 100).toLocaleString("es-AR", { maximumFractionDigits: 1 })}%`;
const day = (value: string) => value.split("-").reverse().join("/");
const salesCount = (count: number) => `${count} ${count === 1 ? "venta" : "ventas"}`;
const hourLabel = (hour: number) => `${String(hour).padStart(2, "0")} h`;
function Heatmap({ data }: { data: SalesHeatmap | null }) {
  const title = <h3 className="text-xl font-semibold">Días y horarios de venta · últimos {HEATMAP_WINDOW_DAYS} días</h3>;
  if (!data) return <section className={`${panel} mt-6`}>{title}<p role="alert" className="mt-4 text-sm text-amber-900">No pudimos armar el mapa de horarios. El resumen mensual no se ve afectado.</p></section>;
  const active = data.cells.flatMap(row => row.flatMap((cell, hour) => cell.sales ? [hour] : []));
  const hours = active.length ? Array.from({ length: Math.max(...active) - Math.min(...active) + 1 }, (_, i) => Math.min(...active) + i) : [];
  const max = Math.max(1, ...data.cells.flat().map(cell => cell.sales));
  return <section className={`${panel} mt-6 space-y-4`} aria-label="Días y horarios de venta">
    <div>{title}<p className="mt-2 max-w-3xl text-sm leading-6 text-black/65">Ventas confirmadas del {day(data.from)} al {day(data.to)} por día y hora. {data.peak ? `El momento con más ventas es el ${WEEKDAYS[data.peak.weekday].toLowerCase()} de ${hourLabel(data.peak.hour)} a ${hourLabel(data.peak.hour + 1)} (${salesCount(data.peak.sales)}).` : ""} Sirve para elegir horarios de atención y de publicación.</p></div>
    {data.totalSales ? <div className="overflow-x-auto"><table className="border-separate border-spacing-1 text-center text-xs"><caption className="sr-only">Ventas confirmadas por día de la semana y hora, últimos {HEATMAP_WINDOW_DAYS} días</caption>
      <thead><tr><th scope="col" className="p-1 text-left">Día</th>{hours.map(hour => <th key={hour} scope="col" className="p-1 font-normal text-black/60">{String(hour).padStart(2, "0")}</th>)}</tr></thead>
      <tbody>{data.cells.map((row, weekday) => <tr key={weekday}><th scope="row" className="p-1 pr-2 text-left font-semibold">{WEEKDAYS[weekday]}</th>{hours.map(hour => {
        const cell = row[hour], ratio = cell.sales / max;
        return <td key={hour} title={`${WEEKDAYS[weekday]} ${hourLabel(hour)}: ${salesCount(cell.sales)} · ${adminMoneyFromCents(cell.amountCents)}`} className={`size-8 min-w-8 rounded-md tabular-nums ${ratio > 0.5 ? "text-white" : "text-[#1F1F1F]"}`} style={{ backgroundColor: cell.sales ? `rgba(85,107,47,${(0.15 + 0.85 * ratio).toFixed(2)})` : "#F7F4ED" }}>{cell.sales || ""}</td>;
      })}</tr>)}</tbody></table></div> : <p className="text-sm text-black/65">No hay ventas confirmadas con hora confiable en este período.</p>}
    <p className="text-sm text-black/65">{salesCount(data.totalSales)} con hora registrada.{data.skippedLateEntry ? ` ${data.skippedLateEntry === 1 ? "1 venta cargada otro día queda fuera, porque su hora no es" : `${data.skippedLateEntry} ventas cargadas otro día quedan fuera, porque su hora no es`} la de la venta.` : ""}{data.skippedHistorical ? ` ${data.skippedHistorical === 1 ? "1 venta histórica importada no tiene" : `${data.skippedHistorical} ventas históricas importadas no tienen`} hora.` : ""}</p>
  </section>;
}
function Rotation({ data, error }: { data: CatalogAbc | null; error: string | null }) {
  const title = <h3 className="text-xl font-semibold">Rotación del catálogo · últimos {ABC_WINDOW_DAYS} días</h3>;
  if (!data) return <section className={`${panel} mt-6`}>{title}<p role="alert" className="mt-4 text-sm text-amber-900">No pudimos calcular la rotación del catálogo. El resumen mensual no se ve afectado; recargá para reintentar.{error ? <span className="block text-xs">Código: {error}</span> : null}</p></section>;
  const withoutCost = data.idle.filter(row => row.retainedCents === null).length;
  return <section className={`${panel} mt-6 space-y-5`} aria-label="Rotación del catálogo">
    <div>{title}<p className="mt-2 max-w-3xl text-sm leading-6 text-black/65">Del {day(data.from)} al {day(data.to)}. Los productos se ordenan por lo que facturaron (sin envío): los A juntan el {percent(ABC_A_SHARE)} de la facturación, los B hasta el {percent(ABC_B_SHARE)} y los C el resto.</p></div>
    <div className="flex flex-wrap gap-2">{(["A", "B", "C"] as const).map(k => <span key={k} className={`rounded-full px-3 py-1 text-sm font-semibold ${classTone[k]}`}>{data.counts[k]} {classLabel[k]}</span>)}<span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-900">{data.idle.length} con stock y sin ventas</span></div>
    {data.rows.length ? <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><caption className="sr-only">Clasificación ABC de productos por facturación de los últimos {ABC_WINDOW_DAYS} días</caption>
      <thead><tr>{["Clase", "Producto", "Unidades", "Facturación", "% acumulado", "Margen bruto", "Stock"].map(h => <th key={h} scope="col" className="border-b border-black/15 p-3">{h}</th>)}</tr></thead>
      <tbody>{data.rows.map(row => <tr key={row.id} className="border-b border-black/5">
        <td className="p-3"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${classTone[row.abcClass]}`}>{row.abcClass}</span></td>
        <th scope="row" className="p-3 font-normal"><Link className="font-semibold underline-offset-4 hover:underline" href={`/admin/productos/${row.id}/editar`}>{row.name}</Link>{row.variant_label ? <span className="block text-xs text-black/60">{row.variant_label}</span> : null}</th>
        <td className="p-3 tabular-nums">{row.units}</td><td className="p-3 tabular-nums">{adminMoneyFromCents(row.revenueCents)}</td><td className="p-3 tabular-nums">{percent(row.cumulativeShare)}</td>
        <td className="p-3 tabular-nums">{row.marginCents === null ? <span className="text-black/60">Sin costo cargado</span> : adminMoneyFromCents(row.marginCents)}</td><td className="p-3 tabular-nums">{row.available}</td>
      </tr>)}</tbody></table></div> : <p className="text-sm text-black/65">No hay ventas confirmadas con producto identificado en este período.</p>}
    <div><h4 className="font-semibold">Clase C con stock y sin ventas en {ABC_WINDOW_DAYS} días</h4>
      <p className="mt-1 text-sm text-black/65">Candidatos a liquidar, armar un combo o dejar de reponer. Mercadería inmovilizada, a costo actual: {adminMoneyFromCents(data.idleRetainedCents)}{withoutCost ? ` (${plural(withoutCost, "producto sin costo cargado queda", "productos sin costo cargado quedan")} fuera del total)` : ""}.{data.recentExcluded ? ` No incluye ${plural(data.recentExcluded, "producto cargado", "productos cargados")} en los últimos ${ABC_WINDOW_DAYS} días.` : ""}</p>
      {data.idle.length ? <details className="mt-3"><summary className="cursor-pointer text-sm font-semibold text-[#465826]">Ver los {data.idle.length} productos</summary><ul className="mt-3 grid gap-2">{data.idle.map(row => <li key={row.id}><Row label={`${row.name}${row.variant_label ? ` · ${row.variant_label}` : ""}`} value={`${plural(row.available, "unidad", "unidades")} · ${row.retainedCents === null ? "Sin costo" : adminMoneyFromCents(row.retainedCents)}`} /></li>)}</ul></details> : <p className="mt-3 text-sm text-black/65">Todos los productos con stock tuvieron ventas en el período.</p>}
    </div>
    {data.uncertainSales || data.unidentifiedLines ? <p className="text-sm text-black/65">{`Quedan fuera de esta tabla ${plural(data.uncertainSales, "venta", "ventas")} con datos incompletos y ${plural(data.unidentifiedLines, "producto vendido que ya no existe", "productos vendidos que ya no existen")} en el catálogo.`}</p> : null}
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
function RankingPanel({ title, rows }: { title: string; rows: CommercialAnalytics["products"] }) {
  return <Panel title={title}>
    {rows.length ? rows.slice(0, 10).map(row => <div key={row.key}><Row label={row.name} value={`${plural(row.quantity, "unidad", "unidades")} · ${adminMoneyFromCents(row.revenueCents)}`} />{row.unpricedQuantity > 0 && <p className="my-2 text-xs text-amber-900">{`${plural(row.unpricedQuantity, "unidad no tiene", "unidades no tienen")} importe por producto y no ${row.unpricedQuantity === 1 ? "suma" : "suman"} al total mostrado.`}</p>}</div>) : <p className="text-sm text-black/65">No hay ventas confirmadas en este mes.</p>}
    {rows.length > 10 ? <p className="text-sm text-black/65">{`Se muestran 10 de ${rows.length}, por unidades vendidas.`}</p> : null}
    <p className="text-xs text-black/60">Ventas confirmadas, sin envío.</p>
  </Panel>;
}
