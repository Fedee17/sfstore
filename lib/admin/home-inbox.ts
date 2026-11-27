import type { AdminProduct } from "../../services/admin.ts";
import { catalogIssues } from "./catalog-review.ts";
import type { StockCoverage } from "./stock-health.ts";

export type InboxTone = "critical" | "warning" | "info";
export type InboxItem = { key: string; tone: InboxTone; count: number; title: string; detail: string; href: string };
type InboxOrder = { id: string; status: string; estimated_date: string | null };
const OPEN_ORDER = new Set(["pending", "ordered", "ready"]);
const rank: Record<InboxTone, number> = { critical: 0, warning: 1, info: 2 };
const plural = (count: number, one: string, many: string) => count === 1 ? one : many;

/** Today's to-do list for the home screen. A null source failed to load: it is reported, never shown as zero. */
export function buildHomeInbox(input: {
  today: string;
  orders: readonly InboxOrder[] | null;
  coverage: ReadonlyMap<string, Pick<StockCoverage, "risk">> | null;
  products: readonly AdminProduct[] | null;
}) {
  const items: InboxItem[] = [], unavailable: string[] = [];
  if (input.orders) {
    const open = input.orders.filter(order => OPEN_ORDER.has(order.status));
    const overdue = open.filter(order => order.estimated_date !== null && order.estimated_date < input.today).length;
    const ready = open.filter(order => order.status === "ready").length;
    if (overdue) items.push({ key: "overdue-orders", tone: "critical", count: overdue, href: "/admin/pedidos",
      title: `${overdue} ${plural(overdue, "encargo con fecha vencida", "encargos con fecha vencida")}`, detail: "La fecha estimada ya pasó y todavía no se entregaron." });
    if (ready) items.push({ key: "ready-orders", tone: "warning", count: ready, href: "/admin/pedidos?status=ready",
      title: `${ready} ${plural(ready, "encargo listo para entregar", "encargos listos para entregar")}`, detail: "Avisale al cliente y coordiná la entrega." });
  } else unavailable.push("encargos");
  if (input.coverage) {
    const risk = [...input.coverage.values()].filter(row => row.risk).length;
    if (risk) items.push({ key: "stock-risk", tone: "warning", count: risk, href: "/admin/inventario?stock=risk",
      title: `${risk} ${plural(risk, "producto por agotarse", "productos por agotarse")}`, detail: "Al ritmo de los últimos 30 días se acaban en menos de 10 días." });
  } else unavailable.push("stock");
  if (input.products) {
    const incomplete = input.products.filter(product => product.status === "active" && catalogIssues(product).length > 0).length;
    if (incomplete) items.push({ key: "incomplete-products", tone: "info", count: incomplete, href: "/admin/productos?review=incomplete&status=active",
      title: `${incomplete} ${plural(incomplete, "ficha activa incompleta", "fichas activas incompletas")}`, detail: "Les falta foto, precio o costo." });
  } else unavailable.push("fichas");
  items.sort((a, b) => rank[a.tone] - rank[b.tone] || b.count - a.count);
  return { items, unavailable };
}
