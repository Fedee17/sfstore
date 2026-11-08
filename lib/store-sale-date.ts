import { commercialDate, sourceDate } from "./commercial-reporting/periods.ts";
export { commercialDayBounds } from "./commercial-reporting/periods.ts";

export function validateStoreSaleDate(value: string, now = new Date()): string {
  let date: string;
  try { date = sourceDate(value); } catch { throw new Error("Elegí una fecha de venta válida."); }
  if (date < "1900-01-01" || date > commercialDate(now.toISOString())) throw new Error("La fecha de venta debe ser hoy o un día anterior.");
  return date;
}
