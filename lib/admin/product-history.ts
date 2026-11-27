import { adminMoney } from "./money.ts";
import { checkoutDate } from "./checkout-presentation.ts";
import { productStatusLabel } from "../products/product-availability.ts";

/** Same list as the trigger in 202611290001_product_change_history.sql. Stock has its own audited movements. */
export const PRODUCT_HISTORY_FIELDS = ["price", "transfer_price", "compare_at_price", "cost", "status", "web_visible", "commercial_blocked"] as const;
export const PRODUCT_HISTORY_LIMIT = 50;
export type ProductChangeEvent = { id: number | string; changed_at: string; field: string; old_value: string | null; new_value: string | null; source: string };
export type ProductHistoryEntry = { key: string; when: string; source: string; changes: { field: string; label: string; from: string; to: string }[] };

const money = (value: string | null) => value === null ? "Sin cargar" : adminMoney(value);
const yesNo = (value: string | null, yes: string, no: string) => value === "true" ? yes : value === "false" ? no : "Sin dato";
const FIELDS: Record<string, { label: string; value: (value: string | null) => string }> = {
  price: { label: "Precio lista", value: money },
  transfer_price: { label: "Precio especial transferencia/efectivo", value: money },
  compare_at_price: { label: "Precio anterior (tachado)", value: money },
  cost: { label: "Costo", value: money },
  status: { label: "Estado", value: value => value === null ? "Sin dato" : productStatusLabel(value) },
  web_visible: { label: "Visible en la web", value: value => yesNo(value, "Sí", "No") },
  commercial_blocked: { label: "Bloqueo comercial", value: value => yesNo(value, "Bloqueado", "Habilitado") },
};
const SOURCES: Record<string, string> = { app: "Desde el admin o la tienda", database: "Directo en la base de datos" };

/** One entry per save (same transaction time and origin), newest first, fields in the editor's order. */
export function buildProductHistory(events: ProductChangeEvent[]): ProductHistoryEntry[] {
  const entries = new Map<string, ProductHistoryEntry & { at: number }>();
  for (const event of events) {
    const key = `${event.changed_at}|${event.source}`;
    let entry = entries.get(key);
    if (!entry) entries.set(key, entry = { key, at: Date.parse(event.changed_at), when: checkoutDate(event.changed_at), source: SOURCES[event.source] ?? "Origen desconocido", changes: [] });
    const field = FIELDS[event.field];
    entry.changes.push(field
      ? { field: event.field, label: field.label, from: field.value(event.old_value), to: field.value(event.new_value) }
      : { field: event.field, label: event.field, from: event.old_value ?? "Sin dato", to: event.new_value ?? "Sin dato" });
  }
  const order = (field: string) => { const index = (PRODUCT_HISTORY_FIELDS as readonly string[]).indexOf(field); return index < 0 ? PRODUCT_HISTORY_FIELDS.length : index; };
  return [...entries.values()].sort((a, b) => b.at - a.at)
    .map(entry => ({ key: entry.key, when: entry.when, source: entry.source, changes: entry.changes.sort((a, b) => order(a.field) - order(b.field)) }));
}
