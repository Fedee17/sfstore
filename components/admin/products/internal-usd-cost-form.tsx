"use client";

import { useActionState, useEffect, useState } from "react";
import { suggestedCashPrice } from "@/components/admin/products/price-preview-model";
import { usdCostInArs, type MepQuote } from "@/lib/admin/internal-usd-cost";
import type { InternalUsdCost } from "@/services/internal-usd-cost";
import { refreshInternalMep, saveInternalUsdCost } from "@/app/admin/inventario/internal-usd-cost-actions";

const ars = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" });
const quoteDate = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "short", timeStyle: "short", timeZone: "America/Argentina/Buenos_Aires",
});
const inputStyle = "h-11 w-full min-w-0 rounded-xl border border-[#8B5E3C]/25 bg-white px-3";

function CostInPesos({ cost, quote }: { cost: InternalUsdCost; quote: MepQuote }) {
  const base = usdCostInArs(cost.unit_cost_usd, quote);
  let suggestion: bigint | undefined;
  let error = false;
  if (cost.target_profit_percent !== null) {
    try {
      suggestion = suggestedCashPrice(base, cost.target_profit_percent);
    } catch {
      error = true;
    }
  }

  return <div className="rounded-xl bg-[#F7F4ED] p-3 text-sm" aria-live="polite">
    <dl className="grid gap-1">
      <div className="flex flex-wrap justify-between gap-x-3"><dt>Costo de referencia en pesos</dt><dd>{ars.format(Number(base) / 100)}</dd></div>
      {suggestion !== undefined && <div className="flex flex-wrap justify-between gap-x-3 font-semibold">
        <dt>Precio de contado sugerido</dt><dd>{ars.format(Number(suggestion) / 100)}</dd>
      </div>}
    </dl>
    <p className="mt-2">Dólar MEP venta {ars.format(quote.rate)} · {quoteDate.format(new Date(quote.updatedAt))}</p>
    {error && <p>El precio sugerido supera el límite de la calculadora.</p>}
  </div>;
}

export function InternalUsdCostForm({ slug, initialCost }: { slug: string; initialCost: InternalUsdCost | null }) {
  const [result, submit, pending] = useActionState(saveInternalUsdCost.bind(null, slug), {});
  const [cost, setCost] = useState(String(initialCost?.unit_cost_usd ?? ""));
  const [profit, setProfit] = useState(String(initialCost?.target_profit_percent ?? ""));
  const [quote, setQuote] = useState<MepQuote | null>();
  const saved = result.cost ?? initialCost;
  const hasCost = saved !== null;

  useEffect(() => {
    if (!hasCost) return;
    let disposed = false;
    async function refresh() {
      const nextQuote = await refreshInternalMep().catch(() => null);
      if (!disposed) setQuote(nextQuote);
    }
    void refresh();
    const timer = window.setInterval(refreshWhenVisible, 5 * 60 * 1000);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    function refreshWhenVisible() {
      if (document.visibilityState === "visible") void refresh();
    }
    return () => {
      disposed = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [hasCost]);

  return <div className="grid gap-3">
    <form action={submit} className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1">Costo unitario en USD
          <input className={inputStyle} name="cost" inputMode="decimal" required value={cost} onChange={event => setCost(event.target.value)} />
        </label>
        <label className="grid gap-1">Ganancia sobre el costo (%)
          <input className={inputStyle} name="profit" inputMode="decimal" value={profit} onChange={event => setProfit(event.target.value)} />
        </label>
      </div>
      <button type="submit" disabled={pending} className="min-h-11 rounded-2xl bg-[#556B2F] px-4 font-semibold text-white disabled:opacity-60 sm:justify-self-start">
        {pending ? "Guardando…" : "Guardar costo en USD"}
      </button>
      {result.error ? <p role="alert" className="text-red-800">{result.error}</p> : result.cost && <p role="status">Costo guardado.</p>}
    </form>
    {saved && (quote ? <CostInPesos cost={saved} quote={quote} /> :
      <p role="status" className="text-sm">{quote === undefined ? "Consultando dólar MEP…" : "Cotización no disponible. El costo en USD sigue guardado."}</p>)}
  </div>;
}
