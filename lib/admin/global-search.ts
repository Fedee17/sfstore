import { adminMoney, adminMoneyFromCents } from "./money.ts";
import { productStatusLabel } from "../products/product-availability.ts";
import { CUSTOMER_ORDER_STATUS_LABELS, type CustomerOrderStatus } from "../orders/workflow.ts";

export const SEARCH_GROUP_LIMIT = 5;
export type SearchItem = { id: string; title: string; detail: string; href: string };
export type SearchGroup = { key: string; label: string; items: SearchItem[]; more: number; allHref: string; error?: string };

type Settled<T> = PromiseSettledResult<T>;
type ProductHit = { id: string; name: string; sku?: string | null; stock: number; status: string };
type OrderHit = { id: string; order_number: string; customer_name: string; displayName: string; status: string; remainingAmount: number };
type SaleHit = { id: string; occurredOn: string; totalCents: number; original: { order_number?: string | null; channel: string; historical_import: boolean }; lines: { product_name: string }[] };
type PurchaseHit = { id: string; occurredOn: string; original: { supplier_name_snapshot?: string | null; total_cost: string | number } };
type SupplierHit = { id: string; name: string; phone?: string | null; is_active: boolean };

export function normalizeSearchTerm(value: unknown): string | null {
  const term = typeof value === "string" ? value.trim() : "";
  return term.length >= 2 && term.length <= 80 ? term : null;
}
const day = (value: string) => value.split("-").reverse().join("/");

/** One result list per module, each failing on its own. Detail links are the same ones each list already uses. */
export function buildGlobalSearch(term: string, input: {
  products: Settled<ProductHit[]>; orders: Settled<OrderHit[]>; sales: Settled<SaleHit[]>;
  purchases: Settled<PurchaseHit[]>; suppliers: Settled<SupplierHit[]>;
}) {
  const q = encodeURIComponent(term);
  const groups: SearchGroup[] = [];
  function add<T>(key: string, label: string, allHref: string, result: Settled<T[]>, map: (row: T) => SearchItem, broadMessage?: string) {
    if (result.status === "rejected") {
      const broad = result.reason instanceof Error && result.reason.message === "COMMERCIAL_SEARCH_TOO_BROAD";
      groups.push({ key, label, items: [], more: 0, allHref, error: broad && broadMessage ? broadMessage : `No pudimos buscar en ${label}.` });
      return;
    }
    if (!result.value.length) return;
    groups.push({ key, label, allHref, items: result.value.slice(0, SEARCH_GROUP_LIMIT).map(map), more: Math.max(0, result.value.length - SEARCH_GROUP_LIMIT) });
  }
  add("products", "Productos", `/admin/productos?search=${q}`, input.products, p => ({ id: p.id, title: p.name, href: `/admin/productos/${p.id}/editar`,
    detail: `${p.sku || "Sin SKU"} · ${productStatusLabel(p.status)} · ${p.stock > 0 ? `${p.stock} disponibles` : "Sin stock"}` }));
  add("orders", "Encargos", `/admin/pedidos?search=${q}`, input.orders, o => ({ id: o.id, title: `${o.customer_name} · ${o.displayName}`, href: `/admin/pedidos/${o.id}`,
    detail: `Encargo ${o.order_number} · ${CUSTOMER_ORDER_STATUS_LABELS[o.status as CustomerOrderStatus] ?? o.status} · Saldo ${adminMoney(o.remainingAmount)}` }));
  // Encargos already have their own group; the sales group keeps store, web and historical sales.
  const sales: Settled<SaleHit[]> = input.sales.status === "fulfilled" ? { status: "fulfilled", value: input.sales.value.filter(s => s.original.historical_import || s.original.channel !== "order") } : input.sales;
  add("sales", "Ventas", `/admin/ventas?search=${q}`, sales, s => ({ id: s.id, title: s.lines[0]?.product_name || `Venta ${s.original.order_number ?? ""}`.trim(),
    href: s.original.historical_import || s.original.channel === "store" ? `/admin/ventas/${s.id}` : `/admin/pedidos/${s.id}`,
    detail: `${s.original.historical_import ? "Histórica" : s.original.channel === "store" ? "Local" : "Web"} · ${day(s.occurredOn)} · ${adminMoneyFromCents(s.totalCents)}${s.lines.length > 1 ? ` · ${s.lines.length} productos` : ""}` }),
    "Hay demasiadas ventas con ese texto. Probá con algo más específico.");
  add("purchases", "Compras", `/admin/compras?search=${q}`, input.purchases, c => ({ id: c.id, title: c.original.supplier_name_snapshot || "Compra sin proveedor", href: `/admin/compras/${c.id}`,
    detail: `${day(c.occurredOn)} · ${adminMoney(c.original.total_cost)}` }), "Hay demasiadas compras con ese texto. Probá con algo más específico.");
  add("suppliers", "Proveedores", `/admin/proveedores?q=${q}`, input.suppliers, s => ({ id: s.id, title: s.name, href: `/admin/proveedores/${s.id}`,
    detail: `${s.is_active ? "Activo" : "Inactivo"}${s.phone ? ` · ${s.phone}` : ""}` }));
  return { term, groups, total: groups.reduce((sum, group) => sum + group.items.length + group.more, 0) };
}
