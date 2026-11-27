import { FUNNEL_WINDOW_DAYS } from "@/lib/catalog/purchase-funnel";
import { getPurchaseFunnel } from "@/services/purchase-funnel";

const panel = "mt-6 min-w-0 rounded-3xl border border-[#8B5E3C]/15 bg-white/80 p-5 shadow-sm sm:p-6";
const title = <h3 className="text-xl font-semibold">Embudo de compra web</h3>;
const number = new Intl.NumberFormat("es-AR");
const pct = (value: number) => `${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 }).format(value)} %`;

export function PurchaseFunnelFallback() {
  return <section className={panel} aria-busy="true">{title}<p className="mt-3 text-sm text-black/60">Cargando embudo…</p></section>;
}

/** How far store visits got in the last days: own anonymous counts per step, then web orders and payments. */
export async function PurchaseFunnel() {
  let funnel: Awaited<ReturnType<typeof getPurchaseFunnel>>;
  try { funnel = await getPurchaseFunnel(); }
  catch { return <section className={panel}>{title}<p role="alert" className="mt-3 text-sm text-amber-900">No pudimos leer el embudo de compra. El resto del informe no se ve afectado.</p></section>; }
  const max = Math.max(1, ...funnel.steps.map(step => step.count));
  return <section className={panel + " space-y-4"} aria-label="Embudo de compra web">
    {title}
    <p className="text-sm text-black/65">{`Últimos ${FUNNEL_WINDOW_DAYS} días. Los tres primeros pasos cuentan pestañas del navegador (una vez por pestaña, sin cookies ni datos de quien visita; no incluye bots), no personas. Pedidos y pagos salen de las ventas web.`}</p>
    {funnel.days < FUNNEL_WINDOW_DAYS ? <p className="text-sm text-black/65">{funnel.days === 0 ? "Todavía no hay visitas medidas: la medición empieza cuando se activa." : `Hay visitas medidas en ${funnel.days} ${funnel.days === 1 ? "día" : "días"}; los pedidos cubren todo el período.`}</p> : null}
    <ol className="grid gap-3">{funnel.steps.map(step => <li key={step.key} className="min-w-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <span className="font-semibold">{step.label}</span>
        <span className="text-black/70">{number.format(step.count)}{step.fromPrevious === null ? "" : ` · ${pct(step.fromPrevious)} del paso anterior`}</span>
      </div>
      <div className="mt-1 h-3 rounded-full bg-[#F7F4ED]" aria-hidden="true"><div className="h-3 rounded-full bg-[#8B5E3C]" style={{ width: `${(step.count / max) * 100}%` }} /></div>
    </li>)}</ol>
    <p className="text-sm font-semibold">{funnel.overall === null ? "Sin visitas a productos en el período." : `De cada 100 pestañas que vieron un producto, pagaron ${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 }).format(funnel.overall)}.`}</p>
  </section>;
}
