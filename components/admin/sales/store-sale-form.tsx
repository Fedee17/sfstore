"use client";

import Link from "next/link";
import { useActionState, useMemo, useRef, useState } from "react";

import {
  createStoreSaleAction,
  type StoreSaleActionState,
} from "@/app/admin/ventas/actions";
import { PendingSubmitButton } from "@/components/admin/pending-submit-button";
import {
  calculateEnteredPayments,
  calculateStoreSalePricing,
  type StoreSalePaymentMethod,
  matchesStoreSaleProduct,
} from "@/lib/store-sales";
import type { StoreSaleProduct } from "@/services/store-sales";
import { commercialLineKey, fitsComponentInventory, componentIds, componentPublicationName, type ComponentRecipe, type CableConnector } from "@/lib/products/component-combos";

const currencyFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  minimumFractionDigits: 2,
});

const initialState: StoreSaleActionState = { status: "idle", message: "" };

type SaleLine = {
  comboConnector?: CableConnector;
  components?: { productId: string; stock: number }[];
  product: StoreSaleProduct;
  quantity: number;
};

const saleLineKey = (line: SaleLine) => commercialLineKey(line.product.id, line.comboConnector);

type PaymentLine = {
  key: string;
  method: StoreSalePaymentMethod;
  amount: string;
};

function parseAmount(value: string) {
  return Number(value.replace(",", ".")) || 0;
}

function newPayment(): PaymentLine {
  return { key: crypto.randomUUID(), method: "cash", amount: "" };
}

export function StoreSaleForm({ products, recipes = [] }: { products: StoreSaleProduct[]; recipes?: ComponentRecipe[] }) {
  const [state, action] = useActionState(createStoreSaleAction, initialState);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [lines, setLines] = useState<SaleLine[]>([]);
  const [componentError, setComponentError] = useState("");
  const [payments, setPayments] = useState<PaymentLine[]>([newPayment()]);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const quantityRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const choices = useMemo(() => [...products, ...recipes.flatMap(recipe => (["cc", "lightning"] as const).map(connector => {
    const parts = componentIds(recipe, connector).map(id => products.find(p => p.id === id));
    if (parts.some(p => !p) || !recipe.prices_approved || !recipe.combo_price_version || !recipe.combo_list_price) return null;
    return { ...parts[0]!, id: `${recipe.presentation_product}:${connector}`, name: componentPublicationName(connector),
      sku: null, price: recipe.combo_list_price, stock: Math.min(...parts.map(p => p!.stock)), comboRecipe: recipe, comboConnector: connector };
  }).filter((p): p is NonNullable<typeof p> => p !== null))], [products, recipes]);
  const matches = useMemo(() => {
    return choices
      .filter((product) => matchesStoreSaleProduct(product, query))
      .slice(0, 10);
  }, [choices, query]);

  const pricing = calculateStoreSalePricing(
    lines.map((line) => ({ price: Number(line.product.price), quantity: line.quantity })),
    payments.map((payment) => payment.method),
  );
  const total = pricing.total;
  const paid = calculateEnteredPayments(
    payments.map((payment) => ({
      method: payment.method,
      amount: parseAmount(payment.amount),
    })),
  );
  const remaining = Math.max(Math.round((total - paid) * 100) / 100, 0);
  const overpayment = paid > total && total > 0;
  const completed = state.status === "success";

  function applyLines(next: SaleLine[]) {
    if (!fitsComponentInventory(next.map(line => ({ productId: line.product.id, stock: line.product.stock, quantity: line.quantity, components: line.components })))) {
      setComponentError("No hay stock compartido suficiente para esa selección. Revisá las cantidades."); return;
    }
    setLines(next); setComponentError("");
  }
  function selectProduct(product: StoreSaleProduct & { comboRecipe?: ComponentRecipe; comboConnector?: CableConnector }) {
    if (product.comboRecipe && product.comboConnector) {
      selectCombo(product.comboRecipe, product.comboConnector); setSearchOpen(false); setQuery(""); return;
    }
    setSearchOpen(false); setQuery("");
    const existing = lines.find(line => !line.comboConnector && line.product.id === product.id);
    applyLines(existing ? lines.map(line => !line.comboConnector && line.product.id === product.id ? { ...line, quantity: line.quantity + 1 } : line) : [...lines, { product, quantity: 1 }]);
    requestAnimationFrame(() => quantityRefs.current[product.id]?.focus());
  }
  function updateQuantity(key: string, quantity: number) {
    applyLines(lines.map(line => saleLineKey(line) === key ? { ...line, quantity: Math.max(1, Math.trunc(quantity) || 1) } : line));
  }

  function selectCombo(recipe: ComponentRecipe, connector: CableConnector) {
    try {
      const selection = componentIds(recipe, connector).map(id => products.find(p => p.id === id));
      if (selection.some(p => !p || Number(p.price) <= 0)) throw new Error("Falta aprobar un precio o habilitar un componente. No se agregó el conjunto.");
      if (!recipe.prices_approved || !recipe.combo_list_price || !recipe.combo_price_version) throw new Error("El conjunto no tiene precio aprobado.");
      const components = (selection as StoreSaleProduct[]).map(p => ({ productId: p.id, stock: p.stock }));
      const key = commercialLineKey(recipe.presentation_product, connector);
      const existing = lines.find(l => saleLineKey(l) === key);
      const line: SaleLine = { product: { ...selection[0]!, id: recipe.presentation_product, name: componentPublicationName(connector), price: recipe.combo_list_price, stock: Math.min(...components.map(p => p.stock)), sku: null }, quantity: (existing?.quantity ?? 0) + 1, comboConnector: connector, components };
      applyLines(existing ? lines.map(l => saleLineKey(l) === key ? line : l) : [...lines, line]);
    } catch (error) { setComponentError(error instanceof Error ? error.message : "No se pudo agregar el conjunto."); }
  }

  function updatePayment(key: string, patch: Partial<PaymentLine>) {
    setPayments((current) =>
      current.map((payment) =>
        payment.key === key ? { ...payment, ...patch } : payment,
      ),
    );
  }

  return (
    <form action={action} className="mt-8 grid gap-6">
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />

      <section className="rounded-[2rem] border border-[#8B5E3C]/15 bg-white/70 p-5 shadow-sm">
        <h2 className="text-xl font-semibold">Productos</h2>
        <p className="mt-1 text-sm text-[#1F1F1F]/60">
          25% de descuento si todos los pagos son en efectivo o transferencia. Con débito, crédito, QR u otro medio, toda la venta usa precio de lista. El servidor verifica los precios al confirmar.
        </p>

        {recipes.length ? <fieldset className="mt-5 grid gap-3 rounded-2xl border border-[#556B2F]/20 p-4" disabled={completed}>
          <legend className="px-2 font-semibold">Cargadores completos</legend>
          <p className="text-sm">Dos presentaciones con precio especial. Cada una consume un cabezal y el cable indicado; comparten stock con los artículos individuales. El descuento se aplica una sola vez.</p>
          {recipes.flatMap(recipe => (["cc", "lightning"] as const).map(connector => {
            const parts = componentIds(recipe, connector).map(id => products.find(p => p.id === id));
            const available = parts.every(Boolean) ? Math.min(...parts.map(p => p!.stock)) : 0;
            return <article key={`${recipe.id}:${connector}`} className="grid gap-2 rounded-xl border border-[#556B2F]/20 p-3">
              <h3 className="font-semibold">{componentPublicationName(connector)}</h3>
              <p className="text-sm">{recipe.combo_list_price ? currencyFormatter.format(calculateStoreSalePricing([{ price: recipe.combo_list_price, quantity: 1 }], payments.map(p => p.method)).total) : "Precio pendiente"} · Disponibles: {available}</p>
              <button type="button" disabled={!recipe.prices_approved || !recipe.combo_price_version || available < 1} onClick={() => selectCombo(recipe, connector)} className="min-h-11 rounded-xl border border-[#556B2F]/40 px-3 py-3 text-left font-semibold disabled:opacity-50">Agregar {componentPublicationName(connector)}</button>
            </article>;
          }))}
          <p role="alert" className="text-sm">{componentError}</p>
        </fieldset> : null}

        {!recipes.length && componentError ? <p role="alert" className="mt-3 text-sm">{componentError}</p> : null}
        <div className="relative mt-5">
          <label className="grid gap-2 text-sm font-semibold">
            Buscar por nombre o SKU
            <input
              type="search"
              value={query}
              disabled={completed}
              onFocus={() => setSearchOpen(true)}
              onChange={(event) => {
                setQuery(event.target.value);
                setSearchOpen(true);
              }}
              placeholder="Escribi para buscar"
              className="h-12 min-w-0 rounded-2xl border border-[#8B5E3C]/20 bg-[#F7F4ED] px-4 outline-none focus:border-[#556B2F] disabled:opacity-60"
            />
          </label>
          {searchOpen && query.trim() ? (
            <div className="absolute z-20 mt-2 grid max-h-72 w-full gap-1 overflow-y-auto rounded-2xl border border-[#8B5E3C]/20 bg-white p-2 shadow-lg">
              {matches.length ? (
                matches.map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    disabled={product.stock < 1}
                    onClick={() => selectProduct(product)}
                    className="min-h-12 rounded-xl px-3 py-2 text-left transition hover:bg-[#556B2F]/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#556B2F] disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <span className="block font-semibold">{product.name}</span>
                    <span className="text-xs text-[#1F1F1F]/55">
                      {product.sku ? `SKU ${product.sku} · ` : ""}
                      Stock {product.stock} · {currencyFormatter.format(calculateStoreSalePricing([{ price: Number(product.price), quantity: 1 }], payments.map((payment) => payment.method)).items[0].unitPrice)}
                    </span>
                  </button>
                ))
              ) : (
                <p className="px-3 py-3 text-sm text-[#1F1F1F]/60">
                  No se encontraron productos. En esta pantalla no se crean productos nuevos.
                </p>
              )}
            </div>
          ) : null}
        </div>

        <div className="mt-5 grid gap-3">
          {lines.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-[#8B5E3C]/25 p-5 text-center text-sm text-[#1F1F1F]/55">
              Agrega al menos un producto para registrar la venta.
            </p>
          ) : (
            lines.map((line, index) => {
              const unitPrice = pricing.items[index].unitPrice;
              return (
                <article
                  key={saleLineKey(line)}
                  className="grid min-w-0 gap-3 rounded-2xl border border-[#8B5E3C]/15 bg-[#F7F4ED] p-4 md:grid-cols-[minmax(0,1.7fr)_8rem_10rem_9rem_auto] md:items-end"
                >
                  <div className="min-w-0">
                    <input type="hidden" name="productId" value={line.product.id} /><input type="hidden" name="comboConnector" value={line.comboConnector ?? ""}/>
                    <p className="break-words font-semibold">{line.product.name}</p>
                    <p className="mt-1 text-xs text-[#1F1F1F]/55">
                      Stock disponible: {line.product.stock}
                      {line.product.sku ? ` · SKU ${line.product.sku}` : ""}
                    </p>
                  </div>
                  <label className="grid gap-2 text-sm font-semibold">
                    Cantidad
                    <input
                      ref={(element) => {
                        quantityRefs.current[saleLineKey(line)] = element;
                      }}
                      name="quantity"
                      type="number"
                      min="1"
                      max={line.product.stock}
                      step="1"
                      required
                      disabled={completed}
                      value={line.quantity}
                      onChange={(event) => updateQuantity(saleLineKey(line), Number(event.target.value))}
                      className="h-11 min-w-0 rounded-xl border border-[#8B5E3C]/20 bg-white px-3 outline-none focus:border-[#556B2F] disabled:opacity-60"
                    />
                  </label>
                  <label className="grid gap-2 text-sm font-semibold">
                    Precio unitario
                    <input type="hidden" name="unitPrice" value={unitPrice.toFixed(2)} />
                    <span className="flex h-12 items-center">{currencyFormatter.format(unitPrice)}</span>
                  </label>
                  <div className="text-sm">
                    <span className="block text-xs text-[#1F1F1F]/55">Subtotal</span>
                    <strong>{currencyFormatter.format(unitPrice * line.quantity)}</strong>
                  </div>
                  <button
                    type="button"
                    disabled={completed}
                    onClick={() =>
                      setLines((current) =>
                        current.filter((item) => saleLineKey(item) !== saleLineKey(line)),
                      )
                    }
                    className="h-11 rounded-xl border border-[#8B5E3C]/30 px-4 text-sm font-semibold text-[#8B5E3C] transition hover:bg-[#8B5E3C]/10 disabled:opacity-50"
                  >
                    Quitar
                  </button>
                </article>
              );
            })
          )}
        </div>
      </section>

      <section className="grid gap-4 rounded-[2rem] border border-[#8B5E3C]/15 bg-white/70 p-5 shadow-sm md:grid-cols-2">
        <label className="grid gap-2 text-sm font-semibold">
          Cliente opcional
          <input name="customerName" disabled={completed} className="h-12 rounded-2xl border border-[#8B5E3C]/20 bg-[#F7F4ED] px-4 outline-none focus:border-[#556B2F] disabled:opacity-60" />
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          Notas
          <input name="notes" disabled={completed} className="h-12 rounded-2xl border border-[#8B5E3C]/20 bg-[#F7F4ED] px-4 outline-none focus:border-[#556B2F] disabled:opacity-60" />
        </label>
      </section>

      <section className="rounded-[2rem] border border-[#8B5E3C]/15 bg-white/70 p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Pagos</h2>
            <p className="mt-1 text-sm text-[#1F1F1F]/60">Podés combinar medios. Debés cobrar exactamente el total para confirmar la venta.</p>
          </div>
          <button
            type="button"
            disabled={completed}
            onClick={() => setPayments((current) => [...current, newPayment()])}
            className="rounded-full border border-[#556B2F]/30 px-5 py-3 text-sm font-semibold text-[#556B2F] transition hover:bg-[#556B2F]/10 disabled:opacity-50"
          >
            Agregar otro medio
          </button>
        </div>

        <div className="mt-5 grid gap-3">
          {payments.map((payment) => (
            <div key={payment.key} className="grid gap-3 rounded-2xl bg-[#F7F4ED] p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
              <label className="grid gap-2 text-sm font-semibold">
                Medio
                <select
                  name="paymentMethod"
                  value={payment.method}
                  disabled={completed}
                  onChange={(event) => updatePayment(payment.key, { method: event.target.value as PaymentLine["method"] })}
                  className="h-12 rounded-2xl border border-[#8B5E3C]/20 bg-white px-4 outline-none focus:border-[#556B2F] disabled:opacity-60"
                >
                  <option value="cash">Efectivo</option>
                  <option value="transfer">Transferencia</option>
                  <option value="debit">Débito</option>
                  <option value="credit">Crédito</option>
                  <option value="qr">QR</option>
                  <option value="other">Otro</option>
                </select>
              </label>
              <label className="grid gap-2 text-sm font-semibold">
                Importe
                <input
                  name="paymentAmount"
                  required
                  inputMode="decimal"
                  value={payment.amount}
                  disabled={completed}
                  onChange={(event) => updatePayment(payment.key, { amount: event.target.value })}
                  placeholder="0,00"
                  className="h-12 rounded-2xl border border-[#8B5E3C]/20 bg-white px-4 outline-none focus:border-[#556B2F] disabled:opacity-60"
                />
              </label>
              <button
                type="button"
                disabled={completed || payments.length === 1}
                onClick={() => setPayments((current) => current.filter((item) => item.key !== payment.key))}
                className="h-12 rounded-2xl border border-[#8B5E3C]/30 px-4 text-sm font-semibold text-[#8B5E3C] transition hover:bg-[#8B5E3C]/10 disabled:opacity-40"
              >
                Quitar
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 rounded-[2rem] border border-[#556B2F]/20 bg-[#556B2F]/5 p-5 sm:grid-cols-3">
        <div><span className="text-xs uppercase text-[#1F1F1F]/55">Subtotal de lista</span><strong className="mt-1 block text-xl">{currencyFormatter.format(pricing.subtotal)}</strong></div>
        <div><span className="text-xs uppercase text-[#1F1F1F]/55">Descuento</span><strong className="mt-1 block text-xl">{currencyFormatter.format(pricing.discount)}</strong></div>
        <div><span className="text-xs uppercase text-[#1F1F1F]/55">Total</span><strong className="mt-1 block text-xl">{currencyFormatter.format(total)}</strong></div>
        <div><span className="text-xs uppercase text-[#1F1F1F]/55">Pagado</span><strong className="mt-1 block text-xl">{currencyFormatter.format(paid)}</strong></div>
        <div><span className="text-xs uppercase text-[#1F1F1F]/55">Saldo</span><strong className="mt-1 block text-xl">{currencyFormatter.format(remaining)}</strong></div>
        {paid > 0 && remaining > 0 ? <p className="text-sm font-semibold text-[#8B5E3C] sm:col-span-3">Falta completar el pago. No se registrará la venta ni se descontará stock.</p> : null}
        {overpayment ? <p role="alert" className="text-sm font-semibold text-[#8B5E3C] sm:col-span-3">Los pagos no pueden superar el total.</p> : null}
      </section>

      {state.status !== "idle" ? (
        <div role={state.status === "error" ? "alert" : "status"} className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${state.status === "error" ? "border-[#8B5E3C]/25 bg-[#8B5E3C]/10 text-[#8B5E3C]" : "border-[#556B2F]/25 bg-[#556B2F]/10 text-[#556B2F]"}`}>
          {state.message}
          {state.orderId ? <Link href={`/admin/ventas/${state.orderId}`} className="ml-2 underline">Ver venta</Link> : null}
        </div>
      ) : null}

      <div className="flex justify-end">
        <PendingSubmitButton
          pendingLabel="Registrando..."
          disabled={completed || lines.length === 0 || total <= 0 || overpayment || remaining > 0 || payments.some((payment) => parseAmount(payment.amount) <= 0)}
          className="rounded-full bg-[#556B2F] px-7 py-3 text-sm font-semibold text-[#F7F4ED] transition hover:bg-[#465826] disabled:cursor-not-allowed disabled:bg-[#1F1F1F]/20 disabled:text-[#1F1F1F]/60"
        >
          Registrar venta
        </PendingSubmitButton>
      </div>
    </form>
  );
}
