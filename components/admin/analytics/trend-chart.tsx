"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { adminMoneyFromCents } from "@/lib/admin/money";
import { CHART_SERIES, compactMoney, ChartLegend, ChartTooltip, TooltipRow } from "./chart-parts";

export type TrendPoint = { month: string; label: string; salesCents: number; purchasesCents: number; marginCents: number | null };

const W = 720, H = 260, PAD = { top: 12, right: 8, bottom: 30, left: 64 };
const SERIES = [
  { key: "salesCents", name: "Ventas", color: CHART_SERIES[0] },
  { key: "purchasesCents", name: "Compras", color: CHART_SERIES[1] },
  { key: "marginCents", name: "Margen bruto", color: CHART_SERIES[2] },
] as const;

function niceMax(value: number) {
  if (value <= 0) return 100;
  const step = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / step) * step;
}

/** Paid sales, purchases and gross margin of the last six months: hover or focus a month for its values, click to open it. */
export function TrendChart({ points, selected }: { points: TrendPoint[]; selected: string }) {
  const router = useRouter();
  const [active, setActive] = useState<number | null>(null);
  const values = points.flatMap(p => [p.salesCents, p.purchasesCents, p.marginCents ?? 0]);
  const top = niceMax(Math.max(...values, 0)), bottom = Math.min(0, ...values);
  const span = top - bottom || 1;
  const plotW = W - PAD.left - PAD.right, plotH = H - PAD.top - PAD.bottom;
  const y = (cents: number) => PAD.top + (top - cents) / span * plotH;
  const group = plotW / points.length, bar = Math.min(22, (group - 24) / 3);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(t => bottom + span * t);
  const open = (month: string) => router.push(`?month=${month}`);
  const shown = active === null ? null : points[active];

  return <div className="relative">
    <ChartLegend items={SERIES.map(s => ({ name: s.name, color: s.color }))} />
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 h-auto w-full" role="group" aria-label="Ventas, compras y margen bruto por mes">
      {ticks.map(t => <g key={t}>
        <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="currentColor" strokeOpacity={t === 0 ? 0.35 : 0.1} />
        <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-black/60 text-[11px] tabular-nums">{compactMoney(t)}</text>
      </g>)}
      {points.map((p, i) => {
        const x0 = PAD.left + i * group + (group - bar * 3 - 4) / 2;
        const label = `${p.label}: ventas ${adminMoneyFromCents(p.salesCents)}, compras ${adminMoneyFromCents(p.purchasesCents)}, margen bruto ${p.marginCents === null ? "sin datos" : adminMoneyFromCents(p.marginCents)}`;
        return <g key={p.month} tabIndex={0} role="link" aria-label={`${label}. Abrir el mes.`} className="cursor-pointer outline-none"
          onPointerEnter={() => setActive(i)} onPointerLeave={() => setActive(null)} onFocus={() => setActive(i)} onBlur={() => setActive(null)}
          onClick={() => open(p.month)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open(p.month); } }}>
          <rect x={PAD.left + i * group} y={PAD.top} width={group} height={plotH} fill={active === i ? "#556B2F" : "transparent"} fillOpacity={active === i ? 0.06 : 0} />
          {SERIES.map((s, k) => {
            const value = p[s.key] ?? 0, yv = y(value), y0 = y(0);
            return <rect key={s.key} x={x0 + k * (bar + 2)} y={Math.min(yv, y0)} width={bar} height={Math.max(1, Math.abs(y0 - yv))} rx={3} fill={s.color} />;
          })}
          <text x={PAD.left + i * group + group / 2} y={H - 10} textAnchor="middle" className={`text-[12px] ${p.month === selected ? "fill-black font-semibold" : "fill-black/65"}`}>{p.label}</text>
        </g>;
      })}
    </svg>
    {shown ? <ChartTooltip leftPercent={((PAD.left + (active! + 0.5) * group) / W) * 100} title={shown.label}>
      <TooltipRow color={SERIES[0].color} name="Ventas" value={adminMoneyFromCents(shown.salesCents)} />
      <TooltipRow color={SERIES[1].color} name="Compras" value={adminMoneyFromCents(shown.purchasesCents)} />
      <TooltipRow color={SERIES[2].color} name="Margen bruto" value={shown.marginCents === null ? "Sin datos" : adminMoneyFromCents(shown.marginCents)} />
    </ChartTooltip> : null}
  </div>;
}
