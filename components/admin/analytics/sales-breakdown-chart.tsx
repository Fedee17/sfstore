"use client";

import { useState } from "react";
import { adminMoneyFromCents } from "@/lib/admin/money";
import { CHART_SERIES, ChartTooltip, TooltipRow } from "./chart-parts";

export type BreakdownRow = { key: string; name: string; count: number; revenueCents: number; unpricedCount: number };
export type BreakdownView = { id: string; label: string; countName: [one: string, many: string]; note: string; rows: BreakdownRow[] };

const TOP = 10;
const share = (part: number, whole: number) => whole > 0 ? `${(part / whole * 100).toLocaleString("es-AR", { maximumFractionDigits: 1 })}%` : "—";
const counted = (n: number, [one, many]: [string, string]) => `${n.toLocaleString("es-AR")} ${n === 1 ? one : many}`;

/** What sold in the month, by product, category, family or channel, ranked by revenue or by units. */
export function SalesBreakdownChart({ views }: { views: BreakdownView[] }) {
  const [viewId, setViewId] = useState(views[0]?.id ?? "");
  const [metric, setMetric] = useState<"revenue" | "count">("revenue");
  const [active, setActive] = useState<number | null>(null);
  const view = views.find(v => v.id === viewId) ?? views[0];
  if (!view) return null;
  const value = (row: BreakdownRow) => metric === "revenue" ? row.revenueCents : row.count;
  const sorted = [...view.rows].sort((a, b) => value(b) - value(a) || a.name.localeCompare(b.name));
  const rows = sorted.slice(0, TOP);
  const max = Math.max(1, ...rows.map(value));
  const totalRevenue = view.rows.reduce((n, r) => n + r.revenueCents, 0), totalCount = view.rows.reduce((n, r) => n + r.count, 0);
  const shown = active === null ? null : rows[active];
  const tab = "min-h-10 rounded-full px-4 text-sm font-semibold";

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div role="tablist" aria-label="Agrupar por" className="flex flex-wrap gap-2">
        {views.map(v => <button key={v.id} type="button" role="tab" aria-selected={v.id === view.id} onClick={() => { setViewId(v.id); setActive(null); }}
          className={`${tab} ${v.id === view.id ? "bg-[#1F1F1F] text-white" : "border border-black/15 bg-white"}`}>{v.label}</button>)}
      </div>
      <div role="group" aria-label="Ordenar por" className="flex gap-1 rounded-full border border-black/15 bg-white p-1">
        {(["revenue", "count"] as const).map(m => <button key={m} type="button" aria-pressed={metric === m} onClick={() => setMetric(m)}
          className={`min-h-8 rounded-full px-3 text-sm ${metric === m ? "bg-[#E6EBD9] font-semibold text-[#465826]" : "text-black/70"}`}>{m === "revenue" ? "Facturación" : view.countName[1].charAt(0).toUpperCase() + view.countName[1].slice(1)}</button>)}
      </div>
    </div>
    {rows.length ? <div className="relative">
      <ol className="grid gap-2" aria-label={`${view.label} por ${metric === "revenue" ? "facturación" : view.countName[1]}`}>
        {rows.map((row, i) => <li key={row.key} tabIndex={0} className="grid cursor-default grid-cols-[minmax(0,14rem)_1fr] items-center gap-3 rounded-lg px-1 py-0.5 outline-none focus-visible:ring-2 focus-visible:ring-[#556B2F] max-sm:grid-cols-1 max-sm:gap-1"
          onPointerEnter={() => setActive(i)} onPointerLeave={() => setActive(null)} onFocus={() => setActive(i)} onBlur={() => setActive(null)}>
          <span className="truncate text-sm" title={row.name}>{row.name}</span>
          <span className="flex min-w-0 items-center gap-2">
            <span aria-hidden="true" className="h-4 rounded-r-md" style={{ width: `${Math.max(1, value(row) / max * 100)}%`, maxWidth: "calc(100% - 7.5rem)", backgroundColor: CHART_SERIES[0], opacity: active === null || active === i ? 1 : 0.45 }} />
            <span className="shrink-0 text-sm font-semibold tabular-nums">{metric === "revenue" ? adminMoneyFromCents(row.revenueCents) : counted(row.count, view.countName)}</span>
          </span>
        </li>)}
      </ol>
      {shown ? <ChartTooltip leftPercent={55} title={shown.name}>
        <TooltipRow name="Facturación" value={`${adminMoneyFromCents(shown.revenueCents)} · ${share(shown.revenueCents, totalRevenue)}`} />
        <TooltipRow name={view.countName[1].charAt(0).toUpperCase() + view.countName[1].slice(1)} value={`${counted(shown.count, view.countName)} · ${share(shown.count, totalCount)}`} />
        {shown.unpricedCount ? <TooltipRow name="Sin importe por producto" value={counted(shown.unpricedCount, view.countName)} /> : null}
      </ChartTooltip> : null}
    </div> : <p className="text-sm text-black/65">No hay ventas en este mes.</p>}
    <p className="text-xs text-black/60">{sorted.length > TOP ? `Se muestran ${TOP} de ${sorted.length}. ` : ""}{view.note} Pasá el mouse o tocá una fila para ver su parte del total.</p>
  </div>;
}
