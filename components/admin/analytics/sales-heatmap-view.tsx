"use client";

import { useState } from "react";
import { adminMoneyFromCents } from "@/lib/admin/money";
import { HEATMAP_WINDOW_DAYS, WEEKDAYS, type SalesHeatmap } from "@/lib/admin/sales-heatmap";

const day = (value: string) => value.split("-").reverse().join("/");
const salesCount = (count: number) => `${count} ${count === 1 ? "venta" : "ventas"}`;
const hourLabel = (hour: number) => `${String(hour).padStart(2, "0")} h`;

/** Paid sales by weekday and hour; the owner switches between the last 90 days and the whole history. */
export function SalesHeatmapView({ recent, all }: { recent: SalesHeatmap; all: SalesHeatmap }) {
  const [range, setRange] = useState<"recent" | "all">("recent");
  const data = range === "recent" ? recent : all;
  const active = data.cells.flatMap(row => row.flatMap((cell, hour) => cell.sales ? [hour] : []));
  const hours = active.length ? Array.from({ length: Math.max(...active) - Math.min(...active) + 1 }, (_, i) => Math.min(...active) + i) : [];
  const max = Math.max(1, ...data.cells.flat().map(cell => cell.sales));
  const scope = range === "recent" ? `últimos ${HEATMAP_WINDOW_DAYS} días` : "todo el historial";
  return <div className="space-y-4">
    <div role="group" aria-label="Período" className="flex w-fit gap-1 rounded-full border border-black/15 bg-white p-1">
      {(["recent", "all"] as const).map(r => <button key={r} type="button" aria-pressed={range === r} onClick={() => setRange(r)}
        className={`min-h-8 rounded-full px-3 text-sm ${range === r ? "bg-[#E6EBD9] font-semibold text-[#465826]" : "text-black/70"}`}>{r === "recent" ? `Últimos ${HEATMAP_WINDOW_DAYS} días` : "Todo el historial"}</button>)}
    </div>
    <p className="max-w-3xl text-sm leading-6 text-black/65">Ventas pagadas del {day(data.from)} al {day(data.to)} por día y hora. {data.peak ? `El momento con más ventas es el ${WEEKDAYS[data.peak.weekday].toLowerCase()} de ${hourLabel(data.peak.hour)} a ${hourLabel(data.peak.hour + 1)} (${salesCount(data.peak.sales)}).` : ""} Sirve para elegir horarios de atención y de publicación.</p>
    {data.totalSales ? <div className="overflow-x-auto"><table className="border-separate border-spacing-1 text-center text-xs"><caption className="sr-only">Ventas pagadas por día de la semana y hora, {scope}</caption>
      <thead><tr><th scope="col" className="p-1 text-left">Día</th>{hours.map(hour => <th key={hour} scope="col" className="p-1 font-normal text-black/60">{String(hour).padStart(2, "0")}</th>)}</tr></thead>
      <tbody>{data.cells.map((row, weekday) => <tr key={weekday}><th scope="row" className="p-1 pr-2 text-left font-semibold">{WEEKDAYS[weekday]}</th>{hours.map(hour => {
        const cell = row[hour], ratio = cell.sales / max;
        return <td key={hour} title={`${WEEKDAYS[weekday]} ${hourLabel(hour)}: ${salesCount(cell.sales)} · ${adminMoneyFromCents(cell.amountCents)}`} className={`size-8 min-w-8 rounded-md tabular-nums ${ratio > 0.5 ? "text-white" : "text-[#1F1F1F]"}`} style={{ backgroundColor: cell.sales ? `rgba(85,107,47,${(0.15 + 0.85 * ratio).toFixed(2)})` : "#F7F4ED" }}>{cell.sales || ""}</td>;
      })}</tr>)}</tbody></table></div> : <p className="text-sm text-black/65">No hay ventas pagadas con hora registrada en este período.</p>}
    <p className="text-sm text-black/65">{salesCount(data.totalSales)} con hora registrada.{data.skippedLateEntry ? ` ${data.skippedLateEntry === 1 ? "1 venta cargada otro día queda fuera, porque su hora no es" : `${data.skippedLateEntry} ventas cargadas otro día quedan fuera, porque su hora no es`} la de la venta.` : ""}{data.skippedHistorical ? ` ${data.skippedHistorical === 1 ? "1 venta histórica importada no tiene" : `${data.skippedHistorical} ventas históricas importadas no tienen`} hora, así que no aparece${data.skippedHistorical === 1 ? "" : "n"}.` : ""}</p>
  </div>;
}
