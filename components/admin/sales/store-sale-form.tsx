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
  calculateStoreSaleTotal,
  getStoreSaleUnitPrice,
  matchesStoreSaleProduct,
} from "@/lib/store-sales";
import type { StoreSaleProduct } from "@/services/store-sales";

const currencyFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  minimumFractionDigits: 2,
});

const initialState: StoreSaleActionState = { status: "idle", message: "" };

type SaleLine = {
  product: StoreSaleProduct;
  quantity: number;
  unitPrice: string;
};

type PaymentLine = {
  key: string;
  method: "cash" | "transfer" | "card" | "other";
  amount: string;
};

function parseAmount(value: string) {
  return Number(value.replace(",", ".")) || 0;
}

function newPayment(): PaymentLine {
  return { key: crypto.randomUUID(), method: "cash", amount: "" };
}

export function StoreSaleForm({ products }: { products: StoreSaleProduct[] }) {
  const [state, action] = useActionState(createStoreSaleAction, initialState);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [lines, setLines] = useState<SaleLine[]>([]);
  const [payments, setPayments] = useState<PaymentLine[]>([newPayment()]);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const quantityRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const matches = useMemo(() => {
    return products
      .filter((product) => matchesStoreSaleProduct(product, query))
      .slice(0, 10);
  }, [products, query]);

  const total = calculateStoreSaleTotal(
    lines.map((line) => ({
      quantity: line.quantity,
      unitPrice: parseAmount(line.unitPrice),
    })),
  );
  const paid = calculateEnteredPayments(
    payments.map((payment) => ({
      method: payment.method,
      amount: parseAmount(payment.amount),
    })),
  );
  const remaining = Math.max(Math.round((total - paid) * 100) / 100, 0);
  const overpayment = paid > total && total > 0;
  const completed = state.status === "success";

  function selectProduct(product: StoreSaleProduct) {
    setSearchOpen(false);
    setQuery("");
    setLines((current) => {
      const existing = current.find((line) => line.product.id === product.id);
      if (existing) {
        return current.map((line) =>
          line.product.id === product.id
            ? { ...line, quantity: Math.min(line.quantity + 1, product.stock) }
            : line,
        );
      }
      return [
        ...current,
        {
          product,
          quantity: 1,
          unitPrice: getStoreSaleUnitPrice(product).toFixed(2),
        },
      ];
    });
    requestAnimationFrame(() => quantityRefs.current[product.id]?.focus());
  }

  function updateQuantity(productId: string, quantity: number) {
    setLines((current) =>
      current.map((line) =>
        line.product.id === productId
          ? {
              ...line,
              quantity: Math.max(1, Math.min(Math.trunc(quantity) || 1, line.product.stock)),
            }
          : line,
      ),
    );
  }

  function updateUnitPrice(productId: string, unitPrice: string) {
    setLines((current) =>
      current.map((line) =>
        line.product.id === productId ? { ...line, unitPrice } : line,
      ),
    );
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
          El precio se fija al registrar la venta: transferencia si existe, o precio de lista.
        </p>

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
                      Stock {product.stock} · {currencyFormatter.format(getStoreSaleUnitPrice(product))}
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
            lines.map((line) => {
              const unitPrice = parseAmount(line.unitPrice);
              return (
                <article
                  key={line.product.id}
                  className="grid min-w-0 gap-3 rounded-2xl border border-[#8B5E3C]/15 bg-[#F7F4ED] p-4 md:grid-cols-[minmax(0,1.7fr)_8rem_10rem_9rem_auto] md:items-end"
                >
                  <div className="min-w-0">
                    <input type="hidden" name="productId" value={line.product.id} />
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
                        quantityRefs.current[line.product.id] = element;
                      }}
                      name="quantity"
                      type="number"
                      min="1"
                      max={line.product.stock}
                      step="1"
                      required
                      disabled={completed}
                      value={line.quantity}
                      onChange={(event) => updateQuantity(line.product.id, Number(event.target.value))}
                      className="h-11 min-w-0 rounded-xl border border-[#8B5E3C]/20 bg-white px-3 outline-none focus:border-[#556B2F] disabled:opacity-60"
                    />
                  </label>
                  <label className="grid gap-2 text-sm font-semibold">
                    Precio unitario
                    <input
                      name="unitPrice"
                      inputMode="decimal"
                      required
                      disabled={completed}
                      value={line.unitPrice}
                      onChange={(event) =>
                        updateUnitPrice(line.product.id, event.target.value)
                      }
                      className="h-11 min-w-0 rounded-xl border border-[#8B5E3C]/20 bg-white px-3 outline-none focus:border-[#556B2F] disabled:opacity-60"
                    />
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
                        current.filter((item) => item.product.id !== line.product.id),
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
            <p className="mt-1 text-sm text-[#1F1F1F]/60">Podes registrar uno o varios medios.</p>
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
                  <option value="card">Tarjeta</option>
                  <option value="other">Otro</option>
                </select>
              </label>
              <label className="grid gap-2 text-sm font-semibold">
                Importe
                <input
                  name="paymentAmount"
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
        <div><span className="text-xs uppercase text-[#1F1F1F]/55">Total</span><strong className="mt-1 block text-xl">{currencyFormatter.format(total)}</strong></div>
        <div><span className="text-xs uppercase text-[#1F1F1F]/55">Pagado</span><strong className="mt-1 block text-xl">{currencyFormatter.format(paid)}</strong></div>
        <div><span className="text-xs uppercase text-[#1F1F1F]/55">Saldo</span><strong className="mt-1 block text-xl">{currencyFormatter.format(remaining)}</strong></div>
        {paid > 0 && remaining > 0 ? <p className="text-sm font-semibold text-[#8B5E3C] sm:col-span-3">Pago parcial: el stock no se descuenta ni se reserva.</p> : null}
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
          disabled={completed || lines.length === 0 || total <= 0 || overpayment}
          className="rounded-full bg-[#556B2F] px-7 py-3 text-sm font-semibold text-[#F7F4ED] transition hover:bg-[#465826] disabled:cursor-not-allowed disabled:bg-[#1F1F1F]/20 disabled:text-[#1F1F1F]/60"
        >
          Registrar venta
        </PendingSubmitButton>
      </div>
    </form>
  );
}
