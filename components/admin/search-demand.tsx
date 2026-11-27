import { SEARCH_DEMAND_WINDOW_DAYS, type SearchDemandItem } from "@/lib/catalog/search-demand";
import { getSearchDemand } from "@/services/search-demand";

const panel = "mt-6 min-w-0 rounded-3xl border border-[#8B5E3C]/15 bg-white/80 p-5 shadow-sm sm:p-6";
const title = <h2 className="text-xl font-semibold">Búsquedas sin resultado</h2>;
const times = (n: number) => `${n} ${n === 1 ? "vez" : "veces"}`;

export function SearchDemandFallback() {
  return <section className={panel} aria-busy="true">{title}<p className="mt-3 text-sm text-black/60">Cargando búsquedas…</p></section>;
}

function List({ heading, detail, items }: { heading: string; detail: string; items: SearchDemandItem[] }) {
  return <div className="min-w-0">
    <h3 className="font-semibold">{heading}</h3>
    <p className="text-xs text-black/60">{detail}</p>
    {items.length ? <ol className="mt-2 grid gap-1 text-sm">{items.map(item => <li key={item.term} className="flex flex-wrap justify-between gap-2 rounded-xl bg-[#F7F4ED] px-3 py-2">
      <span className="min-w-0 break-words font-semibold">«{item.term}»</span>
      <span className="text-black/65">{times(item.searches)}{item.days > 1 ? ` · ${item.days} días` : ""}</span>
    </li>)}</ol> : <p className="mt-2 text-sm text-black/65">Ninguna en el período.</p>}
  </div>;
}

/** What shoppers looked for in the store and did not find (last days, store searches only). */
export async function SearchDemand() {
  let demand: Awaited<ReturnType<typeof getSearchDemand>>;
  try { demand = await getSearchDemand(); }
  catch { return <section className={panel}>{title}<p role="alert" className="mt-3 text-sm text-amber-900">No pudimos leer las búsquedas de la tienda. El resto del informe no se ve afectado.</p></section>; }
  return <section className={panel + " space-y-4"} aria-label="Búsquedas sin resultado">
    {title}
    <p className="text-sm text-black/65">{`Lo que se buscó en la tienda en los últimos ${SEARCH_DEMAND_WINDOW_DAYS} días y no tuvo coincidencias exactas. Se guarda sólo el texto normalizado, sin datos de quien buscó; no incluye bots.`}</p>
    <div className="grid gap-5 md:grid-cols-2">
      <List heading="Sin ningún resultado" detail="La tienda mostró sólo sugerencias generales." items={demand.none} />
      <List heading="Con resultados aproximados" detail="Se mostraron productos parecidos, no exactos." items={demand.approximate} />
    </div>
  </section>;
}
