import type { SaleFact } from '../commercial-reporting/contracts.ts';
import { sumCents } from '../commercial-reporting/money.ts';
import { commercialDate, sourceDate } from '../commercial-reporting/periods.ts';

export const HEATMAP_WINDOW_DAYS = 90;
export const WEEKDAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'] as const;
export type HeatmapCell = { sales: number; amountCents: number };

const clock = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Argentina/Buenos_Aires', weekday: 'short', hour: '2-digit', hourCycle: 'h23' });
const weekdayIndex: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

/** Paid sales by Argentine weekday and hour, over the last `windowDays` days or, with null, the whole history. Only
 * sales registered on the day they happened carry a real hour: historical imports and late store entries are left out
 * and counted apart. */
export function buildSalesHeatmap(sales: readonly SaleFact[], now = new Date(), windowDays: number | null = HEATMAP_WINDOW_DAYS) {
  const to = commercialDate(now.toISOString());
  let from: string;
  if (windowDays === null) {
    const dates = sales.filter(sale => !sale.excluded && sale.confirmed && sale.occurredOn <= to).map(sale => sale.occurredOn);
    from = dates.length ? dates.reduce((a, b) => a < b ? a : b) : to;
  } else {
    const start = new Date(sourceDate(to) + 'T12:00:00Z');
    start.setUTCDate(start.getUTCDate() + 1 - windowDays);
    from = start.toISOString().slice(0, 10);
  }
  const cells: HeatmapCell[][] = WEEKDAYS.map(() => Array.from({ length: 24 }, () => ({ sales: 0, amountCents: 0 })));
  let totalSales = 0, skippedLateEntry = 0, skippedHistorical = 0;
  for (const sale of sales) {
    if (sale.excluded || !sale.confirmed || sale.occurredOn < from || sale.occurredOn > to) continue;
    if (sale.original.historical_import) { skippedHistorical++; continue; }
    if (commercialDate(sale.original.created_at) !== sale.occurredOn) { skippedLateEntry++; continue; }
    const parts = Object.fromEntries(clock.formatToParts(new Date(sale.original.created_at)).map(part => [part.type, part.value]));
    const cell = cells[weekdayIndex[parts.weekday]][Number(parts.hour)];
    cell.sales++;
    cell.amountCents = sumCents([cell.amountCents, sale.totalCents]);
    totalSales++;
  }
  let peak: { weekday: number; hour: number; sales: number } | null = null;
  cells.forEach((row, weekday) => row.forEach((cell, hour) => {
    if (cell.sales && (!peak || cell.sales > peak.sales)) peak = { weekday, hour, sales: cell.sales };
  }));
  return { windowDays, from, to, cells, totalSales, peak: peak as { weekday: number; hour: number; sales: number } | null, skippedLateEntry, skippedHistorical };
}
export type SalesHeatmap = ReturnType<typeof buildSalesHeatmap>;
