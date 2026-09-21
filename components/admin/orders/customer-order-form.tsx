"use client";

import Link from "next/link";
import { useActionState, useMemo, useRef, useState } from "react";

import {
  saveCustomerOrderAction,
  type CustomerOrderActionState,
} from "@/app/admin/pedidos/actions";
import { PendingSubmitButton } from "@/components/admin/pending-submit-button";
import type {
  CustomerOrder,
  CustomerOrderProduct,
} from "@/services/customer-orders";

const currencyFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  minimumFractionDigits: 2,
});
const initialState: CustomerOrderActionState = { status: "idle", message: "" };

type OrderLine = {
  product: CustomerOrderProduct;
  quantity: number;
  unitPrice: string;
};

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function parseMoney(value: string) {
  return Number(value.replace(",", ".")) || 0;
}

function defaultPrice(product: CustomerOrderProduct) {
  return Number(product.transfer_price ?? product.price);
}

function initialLines(order: CustomerOrder | null, products: CustomerOrderProduct[]) {
  if (!order) return [];
  return order.order_items.map((item) => ({
    product: products.find((product) => product.id === item.product_id) ?? {
      id: item.product_id ?? item.id,
      name: item.product_name,
      slug: item.product_slug,
      sku: null,
      price: Number(item.unit_price),
      transfer_price: null,
      stock: 0,
      status: "active",
      categories: item.category_name ? { name: item.category_name } : null,
    },
    quantity: item.quantity,
    unitPrice: Number(item.unit_price).toFixed(2),
  }));
}

export function CustomerOrderForm({
  products,
  order = null,
}: {
  products: CustomerOrderProduct[];
  order?: CustomerOrder | null;
}) {
  const [state, action] = useActionState(saveCustomerOrderAction, initialState);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [lines, setLines] = useState<OrderLine[]>(() => initialLines(order, products));
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const quantityRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const completed = state.status === "success";

  const matches = useMemo(() => {
    const needle = normalize(query);
    if (!needle) return [];
    return products.filter((product) => normalize(`${product.name} ${product.sku ?? ""}`).includes(needle)).slice(0, 10);
  }, [products, query]);

  const total = lines.reduce(
    (sum, line) => sum + line.quantity * parseMoney(line.unitPrice),
    0,
  );

  function selectProduct(product: CustomerOrderProduct) {
    setSearchOpen(false);
    setQuery("");
    setLines((current) => {
      const existing = current.find((line) => line.product.id === product.id);
      if (existing) {
        return current.map((line) => line.product.id === product.id
          ? { ...line, quantity: line.quantity + 1 }
          : line);
      }
      return [...current, { product, quantity: 1, unitPrice: defaultPrice(product).toFixed(2) }];
    });
    requestAnimationFrame(() => quantityRefs.current[product.id]?.focus());
  }

  function updateLine(productId: string, patch: Partial<Pick<OrderLine, "quantity" | "unitPrice">>) {
    setLines((current) => current.map((line) => line.product.id === productId ? { ...line, ...patch } : line));
  }

  return (
    <form action={action} className="mt-8 grid gap-6">
      {order ? <input type="hidden" name="orderId" value={order.id} /> : null}
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />

      <section className="grid gap-4 rounded-[2rem] border border-[#8B5E3C]/15 bg-white/70 p-5 shadow-sm md:grid-cols-2">
        <label className="grid gap-2 text-sm font-semibold">
          Nombre del cliente
          <input name="customerName" required disabled={completed} defaultValue={order?.customer_name ?? ""} className="h-12 rounded-2xl border border-[#8B5E3C]/20 bg-[#F7F4ED] px-4 outline-none focus:border-[#556B2F]" />
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          Telefono / WhatsApp
          <input name="customerPhone" inputMode="tel" disabled={completed} defaultValue={order?.customer_phone ?? ""} className="h-12 rounded-2xl border border-[#8B5E3C]/20 bg-[#F7F4ED] px-4 outline-none focus:border-[#556B2F]" />
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          Fecha estimada
          <input type="date" name="estimatedDate" disabled={completed} defaultValue={order?.estimated_date ?? ""} className="h-12 rounded-2xl border border-[#8B5E3C]/20 bg-[#F7F4ED] px-4 outline-none focus:border-[#556B2F]" />
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          Notas
          <input name="notes" disabled={completed} defaultValue={order?.notes ?? ""} className="h-12 rounded-2xl border border-[#8B5E3C]/20 bg-[#F7F4ED] px-4 outline-none focus:border-[#556B2F]" />
        </label>
      </section>

      <section className="rounded-[2rem] border border-[#8B5E3C]/15 bg-white/70 p-5 shadow-sm">
        <h2 className="text-xl font-semibold">Productos y precio acordado</h2>
        <p className="mt-1 text-sm text-[#1F1F1F]/60">Puede incluir productos sin stock. El pedido no reserva ni descuenta inventario.</p>
        <div className="relative mt-5">
          <label className="grid gap-2 text-sm font-semibold">
            Buscar por nombre o SKU
            <input type="search" value={query} disabled={completed} onFocus={() => setSearchOpen(true)} onBlur={() => window.setTimeout(() => setSearchOpen(false), 120)} onChange={(event) => { setQuery(event.target.value); setSearchOpen(true); }} className="h-12 rounded-2xl border border-[#8B5E3C]/20 bg-[#F7F4ED] px-4 outline-none focus:border-[#556B2F]" />
          </label>
          {searchOpen && query.trim() ? (
            <div className="absolute z-20 mt-2 grid max-h-72 w-full gap-1 overflow-y-auto rounded-2xl border border-[#8B5E3C]/20 bg-white p-2 shadow-lg">
              {matches.length ? matches.map((product) => (
                <button key={product.id} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => selectProduct(product)} className="min-h-12 rounded-xl px-3 py-2 text-left hover:bg-[#556B2F]/10 focus-visible:outline-2 focus-visible:outline-[#556B2F]">
                  <span className="block font-semibold">{product.name}</span>
                  <span className="text-xs text-[#1F1F1F]/55">Stock {product.stock} · Precio sugerido {currencyFormatter.format(defaultPrice(product))}</span>
                </button>
              )) : <p className="px-3 py-3 text-sm text-[#1F1F1F]/60">No se encontraron productos. El alta rápida no está disponible en esta fase.</p>}
            </div>
          ) : null}
        </div>

        <div className="mt-5 grid gap-3">
          {lines.length === 0 ? <p className="rounded-2xl border border-dashed border-[#8B5E3C]/25 p-5 text-center text-sm text-[#1F1F1F]/55">Agrega al menos un producto.</p> : lines.map((line) => (
            <article key={line.product.id} className="grid gap-3 rounded-2xl border border-[#8B5E3C]/15 bg-[#F7F4ED] p-4 md:grid-cols-[minmax(0,1.7fr)_7rem_9rem_9rem_auto] md:items-end">
              <div className="min-w-0">
                <input type="hidden" name="productId" value={line.product.id} />
                <p className="break-words font-semibold">{line.product.name}</p>
                <p className="mt-1 text-xs text-[#1F1F1F]/55">Stock actual: {line.product.stock}. No se reserva.</p>
              </div>
              <label className="grid gap-2 text-sm font-semibold">Cantidad<input ref={(element) => { quantityRefs.current[line.product.id] = element; }} name="quantity" type="number" min="1" step="1" required value={line.quantity} disabled={completed} onChange={(event) => updateLine(line.product.id, { quantity: Math.max(1, Math.trunc(Number(event.target.value)) || 1) })} className="h-11 min-w-0 rounded-xl border border-[#8B5E3C]/20 bg-white px-3" /></label>
              <label className="grid gap-2 text-sm font-semibold">Precio acordado<input name="unitPrice" inputMode="decimal" required value={line.unitPrice} disabled={completed} onChange={(event) => updateLine(line.product.id, { unitPrice: event.target.value })} className="h-11 min-w-0 rounded-xl border border-[#8B5E3C]/20 bg-white px-3" /></label>
              <div className="text-sm"><span className="block text-xs text-[#1F1F1F]/55">Subtotal</span><strong>{currencyFormatter.format(line.quantity * parseMoney(line.unitPrice))}</strong></div>
              <button type="button" disabled={completed} onClick={() => setLines((current) => current.filter((item) => item.product.id !== line.product.id))} className="h-11 rounded-xl border border-[#8B5E3C]/30 px-4 text-sm font-semibold text-[#8B5E3C] hover:bg-[#8B5E3C]/10">Quitar</button>
            </article>
          ))}
        </div>
      </section>

      <section className="flex flex-wrap items-center justify-between gap-4 rounded-[2rem] border border-[#556B2F]/20 bg-[#556B2F]/5 p-5">
        <div><span className="text-xs uppercase text-[#1F1F1F]/55">Total pedido</span><strong className="mt-1 block text-2xl">{currencyFormatter.format(total)}</strong></div>
        <p className="max-w-xl text-sm text-[#1F1F1F]/65">Los pedidos no reservan stock aunque tengan pago. La salida física ocurre al entregar.</p>
      </section>

      {state.status !== "idle" ? <div role={state.status === "error" ? "alert" : "status"} className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${state.status === "error" ? "border-[#8B5E3C]/25 bg-[#8B5E3C]/10 text-[#8B5E3C]" : "border-[#556B2F]/25 bg-[#556B2F]/10 text-[#556B2F]"}`}>{state.message}{state.orderId ? <Link href={`/admin/pedidos/${state.orderId}`} className="ml-2 underline">Ver pedido</Link> : null}</div> : null}

      <div className="flex flex-wrap justify-end gap-3">
        <Link href={order ? `/admin/pedidos/${order.id}` : "/admin/pedidos"} className="rounded-full border border-[#8B5E3C]/30 px-6 py-3 text-sm font-semibold text-[#8B5E3C]">Cancelar</Link>
        <PendingSubmitButton pendingLabel="Guardando..." disabled={completed || lines.length === 0 || total <= 0} className="rounded-full bg-[#556B2F] px-7 py-3 text-sm font-semibold text-[#F7F4ED] disabled:cursor-not-allowed disabled:opacity-50">{order ? "Guardar pedido" : "Crear pedido"}</PendingSubmitButton>
      </div>
    </form>
  );
}
