import { getProductHistory } from "@/services/product-history";

const panel = "mt-8 rounded-3xl border border-[#8B5E3C]/15 bg-white/70 p-5";

export function ProductHistoryFallback() {
  return <section className={panel} aria-busy="true"><h2 className="text-xl font-semibold">Historial de cambios</h2><p className="mt-2 text-sm text-black/60">Cargando historial…</p></section>;
}

/** Price, status and visibility changes of one product, newest first. */
export async function ProductHistory({ productId }: { productId: string }) {
  let history: Awaited<ReturnType<typeof getProductHistory>>;
  try {
    history = await getProductHistory(productId);
  } catch {
    return <section className={panel}><h2 className="text-xl font-semibold">Historial de cambios</h2><p role="alert" className="mt-2 text-sm text-amber-900">No pudimos leer el historial de este producto.</p></section>;
  }
  return <section className={panel} aria-labelledby="product-history-title">
    <h2 id="product-history-title" className="text-xl font-semibold">Historial de cambios</h2>
    <p className="mt-1 text-xs text-black/60">Precios, estado y visibilidad. Los movimientos de stock están en «Ver movimientos».</p>
    {history.entries.length ? <ol className="mt-4 grid gap-3">
      {history.entries.map(entry => <li key={entry.key} className="rounded-xl bg-[#F7F4ED] p-3 text-sm">
        <p className="font-semibold">{entry.when} <span className="font-normal text-black/60">· {entry.source}</span></p>
        <ul className="mt-1 grid gap-1">{entry.changes.map(change => <li key={change.field} className="break-words">{change.label}: {change.from} → <strong>{change.to}</strong></li>)}</ul>
      </li>)}
    </ol> : <p className="mt-3 text-sm text-black/65">Todavía no hay cambios registrados.</p>}
    {history.truncated ? <p className="mt-2 text-xs text-black/60">Se muestran los últimos cambios registrados.</p> : null}
  </section>;
}
